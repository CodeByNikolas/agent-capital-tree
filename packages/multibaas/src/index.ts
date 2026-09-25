const CHAIN_ID = 11155111;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;
const MAX_TX_EVENTS = 250;
const REQUEST_TIMEOUT_MS = 10_000;
const INPUT_EVENTS = [
  'NodeCreated',
  'RootFunded',
  'CapitalAllocated',
  'CapitalReclaimed',
  'EmergencyRecovered',
  'PolicyTightened',
  'OperatorChanged',
  'NodeRevoked',
] as const;

type RecordValue = Record<string, unknown>;

/**
 * MultiBaas EventQuery subset. Field names and wire values follow the official
 * TypeScript SDK's EventQuery, EventQueryEvent, EventQueryField and FieldType.
 */
export type MultiBaasEventQuery = {
  events: Array<{
    eventName: (typeof INPUT_EVENTS)[number];
    select: Array<{
      type: 'input' | 'tx_hash' | 'event_signature' | 'block_number';
      inputIndex?: number;
      alias: string;
    }>;
    filter: { rule: 'and'; children: Array<{ fieldType: 'input' | 'contract_address'; inputIndex?: 0; operator: 'equal'; value: string }> };
  }>;
  orderBy: 'block_number';
  order: 'ASC';
};

export type CapitalActivityKind =
  | 'node_created'
  | 'root_funded'
  | 'capital_allocated'
  | 'capital_reclaimed'
  | 'emergency_recovered'
  | 'policy_tightened'
  | 'operator_changed'
  | 'node_revoked';

export interface ActivityProvenance {
  chainId: typeof CHAIN_ID;
  transactionHash: string;
  logIndex: number;
  blockNumber: number;
  transactionIndex: number;
  blockHash: string;
  source: 'multibaas';
  indexed: true;
  finality: 'not_verified';
}

interface ActivityBase {
  id: string;
  rootId: string;
  eventName: (typeof INPUT_EVENTS)[number];
  provenance: ActivityProvenance;
}

export type CapitalActivity =
  | (ActivityBase & { kind: 'node_created'; nodeId: string; parentId: string; agent: string; vault: string })
  | (ActivityBase & { kind: 'root_funded'; token: string; amount: string })
  | (ActivityBase & { kind: 'capital_allocated' | 'capital_reclaimed'; parentId: string; childId: string; token: string; amount: string })
  | (ActivityBase & { kind: 'emergency_recovered'; nodeId: string; token: string; amount: string; recipient: string })
  | (ActivityBase & { kind: 'policy_tightened'; nodeId: string })
  | (ActivityBase & { kind: 'operator_changed'; operator: string; generation: string })
  | (ActivityBase & { kind: 'node_revoked'; nodeId: string });

export interface CapitalActivityPage {
  rootId: string;
  items: CapitalActivity[];
  nextCursor: string | null;
  hasMore: boolean;
  indexing: {
    state: 'historical_indexing' | 'lagging' | 'caught_up' | 'indexer_ahead';
    isProcessingPastLogs: boolean;
    latestIndexedBlock: number;
    latestIndexedBlockHash: string;
    indexingStartBlock: number;
    indexingStartBlockHash: string;
    chainHeadBlock: number;
    indexGapBlocks: number;
    updatedAt: string;
  };
  source: {
    provider: 'multibaas';
    chainId: typeof CHAIN_ID;
    controllerAddress: string;
    ordering: 'block_number_ascending_then_transaction_then_log';
    activityCoverage: 'capital_core_events_only';
  };
}

export interface MultiBaasHistoryConfig {
  /** The user's own MultiBaas deployment origin; credentials never follow redirects. */
  deploymentUrl: string;
  /** Inject from a server-only secret source; never expose this value to clients. */
  apiKey: string;
  controllerAddress: string;
  /** MultiBaas contract label used by its event-indexing status endpoint. */
  controllerLabel: string;
  /** Server-side tuning only. Each call is capped at 50 query rows. */
  pageSize?: number;
  /** Injectable solely to support deterministic tests. */
  fetcher?: typeof fetch;
}

export class MultiBaasRequestError extends Error {
  constructor(endpoint: string, status?: number) {
    super(status === undefined ? `MultiBaas request failed: ${endpoint}` : `MultiBaas returned HTTP ${status}: ${endpoint}`);
    this.name = 'MultiBaasRequestError';
  }
}

export class MultiBaasResponseError extends Error {
  constructor(endpoint: string, detail: string) {
    super(`Invalid MultiBaas response (${endpoint}): ${detail}`);
    this.name = 'MultiBaasResponseError';
  }
}

export class UnsupportedMultiBaasEventError extends Error {
  constructor(eventName: string) {
    super(`MultiBaas returned unsupported controller event ${eventName}`);
    this.name = 'UnsupportedMultiBaasEventError';
  }
}

export function buildCapitalActivityQuery(rootId: string, controllerAddress: string): MultiBaasEventQuery {
  const canonicalRootId = parseUint(rootId, 'rootId');
  return {
    events: INPUT_EVENTS.map((eventName) => ({
      eventName,
      select: [
        { type: 'input', inputIndex: 0, alias: 'rootId' },
        { type: 'tx_hash', alias: 'transactionHash' },
        { type: 'event_signature', alias: 'eventSignature' },
        { type: 'block_number', alias: 'blockNumber' },
      ],
      filter: { rule: 'and', children: [
        { fieldType: 'input', inputIndex: 0, operator: 'equal', value: canonicalRootId },
        { fieldType: 'contract_address', operator: 'equal', value: normalizeAddress(controllerAddress, 'controllerAddress') },
      ] },
    })),
    orderBy: 'block_number',
    order: 'ASC',
  };
}

export function createMultiBaasHistoryClient(config: MultiBaasHistoryConfig) {
  if ('window' in globalThis) throw new Error('MultiBaas history client can only be created in a server runtime');
  const deployment = new URL(config.deploymentUrl);
  if (deployment.protocol !== 'https:' || !/^[a-z0-9-]+\.multibaas\.com$/.test(deployment.hostname) ||
      deployment.username || deployment.password || deployment.port || deployment.search || deployment.hash || deployment.pathname !== '/') {
    throw new Error('Expected an HTTPS MultiBaas deployment origin');
  }
  const apiBase = `${deployment.origin}/api/v0`;
  const apiKey = config.apiKey.trim();
  const controllerAddress = normalizeAddress(config.controllerAddress, 'controllerAddress');
  const controllerLabel = config.controllerLabel.trim();
  const pageSize = config.pageSize ?? DEFAULT_PAGE_SIZE;
  const fetcher = config.fetcher ?? globalThis.fetch;

  if (!apiKey || /\s/.test(apiKey)) throw new Error('A server-side MultiBaas API key is required');
  if (!controllerLabel) throw new Error('A MultiBaas controller contract label is required');
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new Error(`pageSize must be between 1 and ${MAX_PAGE_SIZE}`);
  }
  if (typeof fetcher !== 'function') throw new Error('A server-side fetch implementation is required');

  async function getCapitalActivity(rootIdInput: string, cursor?: string): Promise<CapitalActivityPage> {
    const rootId = parseUint(rootIdInput, 'rootId');
    const offset = decodeCursor(cursor, rootId);
    const endpoint = '/queries';
    const queryUrl = new URL(`${apiBase}${endpoint}`);
    queryUrl.searchParams.set('offset', String(offset));
    queryUrl.searchParams.set('limit', String(pageSize));

    const query = buildCapitalActivityQuery(rootId, controllerAddress);
    const [queryBody, indexingBody, chainBody] = await Promise.all([
      requestJson(queryUrl, 'POST', endpoint, apiKey, fetcher, query),
      requestJson(
        new URL(`${apiBase}/chains/ethereum/addresses/${encodeURIComponent(controllerAddress)}/contracts/${encodeURIComponent(controllerLabel)}/status`),
        'GET',
        '/event-indexing-status',
        apiKey,
        fetcher,
      ),
      requestJson(new URL(`${apiBase}/chains/ethereum/status`), 'GET', '/chain-status', apiKey, fetcher),
    ]);

    const rows = readQueryRows(queryBody, endpoint);
    const rowCounts = countQueryRows(rows, rootId);
    const chainStatus = readChainStatus(chainBody);
    const indexing = readIndexingStatus(indexingBody, chainStatus.blockNumber);
    const transactions = [...new Set([...rowCounts.keys()].map((key) => key.slice(0, key.indexOf('|'))))];
    const eventPages = await Promise.all(
      transactions.map((txHash) => readTransactionEvents(apiBase, txHash, controllerAddress, apiKey, fetcher)),
    );
    const items = matchAndMapEvents(eventPages.flat(), rowCounts, rootId, controllerAddress);
    const hasMore = rows.length === pageSize;

    return {
      rootId,
      items: items.sort(compareActivity),
      nextCursor: hasMore ? encodeCursor(rootId, offset + rows.length) : null,
      hasMore,
      indexing,
      source: {
        provider: 'multibaas',
        chainId: CHAIN_ID,
        controllerAddress,
        ordering: 'block_number_ascending_then_transaction_then_log',
        activityCoverage: 'capital_core_events_only',
      },
    };
  }

  return { getCapitalActivity };
}

function countQueryRows(rows: unknown[], rootId: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of rows) {
    const row = requireRecord(value, '/queries', 'row');
    if (parseUint(row.rootId, 'query row rootId') !== rootId) {
      throw new MultiBaasResponseError('/queries', 'root-filtered row has the wrong rootId');
    }
    const txHash = requireHash(row.transactionHash, 32, 'query row transactionHash');
    const signature = requireString(row.eventSignature, 'query row eventSignature');
    requireSafeInteger(row.blockNumber, 'query row blockNumber');
    const key = `${txHash.toLowerCase()}|${signature}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

async function readTransactionEvents(
  apiBase: string,
  txHash: string,
  controllerAddress: string,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<unknown[]> {
  const url = new URL(`${apiBase}/events`);
  url.searchParams.set('tx_hash', txHash);
  url.searchParams.set('contract_address', controllerAddress);
  url.searchParams.set('limit', String(MAX_TX_EVENTS));
  url.searchParams.set('offset', '0');
  const body = await requestJson(url, 'GET', '/events', apiKey, fetcher);
  const result = readArrayEnvelope(body, '/events');
  if (result.length === MAX_TX_EVENTS) {
    throw new MultiBaasResponseError('/events', `transaction event count reached the ${MAX_TX_EVENTS} row safety bound`);
  }
  return result;
}

function matchAndMapEvents(
  rawEvents: unknown[],
  expected: Map<string, number>,
  rootId: string,
  controllerAddress: string,
): CapitalActivity[] {
  const byIdentity = new Map<string, ParsedEvent>();
  for (const raw of rawEvents) {
    const event = parseRawEvent(raw);
    if (event.eventContractAddress !== controllerAddress) {
      throw new MultiBaasResponseError('/events', 'event came from an unexpected contract address');
    }
    const identity = `${event.txHash.toLowerCase()}:${event.logIndex}`;
    const existing = byIdentity.get(identity);
    if (existing && !sameParsedEvent(existing, event)) {
      throw new MultiBaasResponseError('/events', 'duplicate event identity has conflicting data');
    }
    byIdentity.set(identity, event);
  }
  const candidates = [...byIdentity.values()];
  candidates.sort((a, b) =>
    a.blockNumber - b.blockNumber || a.transactionIndex - b.transactionIndex || a.logIndex - b.logIndex,
  );

  const result: CapitalActivity[] = [];
  const selectedSignatures = new Set(expected.keys());
  for (const candidate of candidates) {
    const candidateRoot = eventRootId(candidate.inputs, candidate.eventName);
    if (candidateRoot !== rootId) continue;
    const key = `${candidate.txHash.toLowerCase()}|${candidate.signature}`;
    const count = expected.get(key) ?? 0;
    if (!selectedSignatures.has(key)) continue;
    // A query page can split two identical event signatures in the same transaction.
    // Include all its matching logs, even beyond the query row boundary. Adjacent
    // pages intentionally overlap and consumers merge by the canonical event ID.
    if (count > 0) expected.set(key, count - 1);
    result.push(mapActivity(candidate, rootId, controllerAddress));
  }

  for (const [key, count] of expected) {
    if (count !== 0) throw new MultiBaasResponseError('/events', `event query and event log disagree for ${key}`);
  }
  return result;
}

interface ParsedEvent {
  eventName: string;
  signature: string;
  inputs: Map<string, unknown>;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  transactionIndex: number;
  blockHash: string;
  eventContractAddress: string;
}

function parseRawEvent(value: unknown): ParsedEvent {
  const eventRecord = requireRecord(value, '/events', 'event');
  const event = requireRecord(eventRecord.event, '/events', 'event details');
  const tx = requireRecord(eventRecord.transaction, '/events', 'transaction');
  const eventContract = requireRecord(event.contract, '/events', 'event contract');
  if (!Array.isArray(event.inputs)) throw new MultiBaasResponseError('/events', 'event inputs must be an array');
  const inputs = new Map<string, unknown>();
  for (const inputValue of event.inputs) {
    const input = requireRecord(inputValue, '/events', 'event input');
    const name = requireString(input.name, 'event input name');
    if (inputs.has(name)) throw new MultiBaasResponseError('/events', `duplicate event input ${name}`);
    inputs.set(name, input.value);
  }
  return {
    eventName: requireString(event.name, 'event name'),
    signature: requireString(event.signature, 'event signature'),
    inputs,
    txHash: requireHash(tx.txHash, 32, 'transaction hash'),
    logIndex: requireSafeInteger(event.indexInLog, 'log index'),
    blockNumber: requireSafeInteger(tx.blockNumber, 'block number'),
    transactionIndex: requireSafeInteger(tx.txIndexInBlock, 'transaction index'),
    blockHash: requireHash(tx.blockHash, 32, 'block hash'),
    eventContractAddress: normalizeAddress(eventContract.address, 'event contract address'),
  };
}

function mapActivity(event: ParsedEvent, rootId: string, controllerAddress: string): CapitalActivity {
  if (event.eventContractAddress !== controllerAddress) {
    throw new MultiBaasResponseError('/events', 'event came from an unexpected contract address');
  }
  const common: ActivityBase = {
    id: `${CHAIN_ID}:${event.txHash.toLowerCase()}:${event.logIndex}`,
    rootId,
    eventName: event.eventName as (typeof INPUT_EVENTS)[number],
    provenance: {
      chainId: CHAIN_ID,
      transactionHash: event.txHash.toLowerCase(),
      logIndex: event.logIndex,
      blockNumber: event.blockNumber,
      transactionIndex: event.transactionIndex,
      blockHash: event.blockHash.toLowerCase(),
      source: 'multibaas',
      indexed: true,
      finality: 'not_verified',
    },
  };

  switch (event.eventName) {
    case 'NodeCreated':
      return { ...common, kind: 'node_created', nodeId: inputUint(event, 'nodeId'), parentId: inputUint(event, 'parentId'), agent: inputAddress(event, 'agent'), vault: inputAddress(event, 'vault') };
    case 'RootFunded':
      return { ...common, kind: 'root_funded', token: inputAddress(event, 'token'), amount: inputUint(event, 'amount') };
    case 'CapitalAllocated':
      return { ...common, kind: 'capital_allocated', parentId: inputUint(event, 'parentId'), childId: inputUint(event, 'childId'), token: inputAddress(event, 'token'), amount: inputUint(event, 'amount') };
    case 'CapitalReclaimed':
      return { ...common, kind: 'capital_reclaimed', parentId: inputUint(event, 'parentId'), childId: inputUint(event, 'childId'), token: inputAddress(event, 'token'), amount: inputUint(event, 'amount') };
    case 'EmergencyRecovered':
      return { ...common, kind: 'emergency_recovered', nodeId: inputUint(event, 'nodeId'), token: inputAddress(event, 'token'), amount: inputUint(event, 'amount'), recipient: inputAddress(event, 'recipient') };
    case 'PolicyTightened':
      return { ...common, kind: 'policy_tightened', nodeId: inputUint(event, 'nodeId') };
    case 'OperatorChanged':
      return { ...common, kind: 'operator_changed', operator: inputAddress(event, 'operator'), generation: inputUint(event, 'generation') };
    case 'NodeRevoked':
      return { ...common, kind: 'node_revoked', nodeId: inputUint(event, 'nodeId') };
    default:
      throw new UnsupportedMultiBaasEventError(event.eventName);
  }
}

function eventRootId(inputs: Map<string, unknown>, eventName: string): string {
  const value = inputs.get('rootId');
  if (value === undefined) {
    if ((INPUT_EVENTS as readonly string[]).includes(eventName)) {
      throw new MultiBaasResponseError('/events', `${eventName} is missing rootId`);
    }
    return '';
  }
  return parseUint(value, `${eventName}.rootId`);
}

function inputUint(event: ParsedEvent, name: string): string {
  return parseUint(event.inputs.get(name), `${event.eventName}.${name}`);
}

function inputAddress(event: ParsedEvent, name: string): string {
  return normalizeAddress(event.inputs.get(name), `${event.eventName}.${name}`);
}

function readQueryRows(body: unknown, endpoint: string): unknown[] {
  const envelope = requireRecord(body, endpoint, 'response');
  requireHttpEnvelope(envelope, endpoint);
  const result = requireRecord(envelope.result, endpoint, 'result');
  if (!Array.isArray(result.rows)) throw new MultiBaasResponseError(endpoint, 'result.rows must be an array');
  return result.rows;
}

function readArrayEnvelope(body: unknown, endpoint: string): unknown[] {
  const envelope = requireRecord(body, endpoint, 'response');
  requireHttpEnvelope(envelope, endpoint);
  if (!Array.isArray(envelope.result)) throw new MultiBaasResponseError(endpoint, 'result must be an array');
  return envelope.result;
}

function readChainStatus(body: unknown): { blockNumber: number } {
  const envelope = requireRecord(body, '/chain-status', 'response');
  requireHttpEnvelope(envelope, '/chain-status');
  const result = requireRecord(envelope.result, '/chain-status', 'result');
  if (result.chainID !== CHAIN_ID) throw new MultiBaasResponseError('/chain-status', `expected Sepolia chain ${CHAIN_ID}`);
  return { blockNumber: requireSafeInteger(result.blockNumber, 'chain blockNumber') };
}

function readIndexingStatus(
  body: unknown,
  chainHeadBlock: number,
): CapitalActivityPage['indexing'] {
  const endpoint = '/event-indexing-status';
  const envelope = requireRecord(body, endpoint, 'response');
  requireHttpEnvelope(envelope, endpoint);
  const result = requireRecord(envelope.result, endpoint, 'result');
  if (typeof result.isProcessingPastLogs !== 'boolean') {
    throw new MultiBaasResponseError(endpoint, 'isProcessingPastLogs must be a boolean');
  }
  const latestIndexedBlock = requireSafeInteger(result.latestBlockNumber, 'latest indexed block');
  const indexingStartBlock = requireSafeInteger(result.startBlockNumber, 'indexing start block');
  const latestIndexedBlockHash = requireHash(result.latestBlockHash, 32, 'latest indexed block hash');
  const indexingStartBlockHash = requireHash(result.startBlockHash, 32, 'indexing start block hash');
  const updatedAt = requireString(result.updatedAt, 'indexing updatedAt');
  if (!Number.isFinite(Date.parse(updatedAt))) throw new MultiBaasResponseError(endpoint, 'updatedAt must be a timestamp');
  const indexGapBlocks = chainHeadBlock - latestIndexedBlock;
  const state = result.isProcessingPastLogs
    ? 'historical_indexing'
    : indexGapBlocks > 0
      ? 'lagging'
      : indexGapBlocks < 0
        ? 'indexer_ahead'
        : 'caught_up';
  return {
    state,
    isProcessingPastLogs: result.isProcessingPastLogs,
    latestIndexedBlock,
    latestIndexedBlockHash,
    indexingStartBlock,
    indexingStartBlockHash,
    chainHeadBlock,
    indexGapBlocks,
    updatedAt,
  };
}

async function requestJson(
  url: URL,
  method: 'GET' | 'POST',
  endpoint: string,
  apiKey: string,
  fetcher: typeof fetch,
  body?: unknown,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'error',
    });
  } catch {
    throw new MultiBaasRequestError(endpoint);
  }
  if (!response.ok) throw new MultiBaasRequestError(endpoint, response.status);
  try {
    return await response.json();
  } catch {
    throw new MultiBaasResponseError(endpoint, 'body is not valid JSON');
  }
}

function requireHttpEnvelope(value: RecordValue, endpoint: string): void {
  if (typeof value.status !== 'number' || value.status < 200 || value.status >= 300) {
    throw new MultiBaasResponseError(endpoint, 'status must be a successful HTTP status');
  }
}

function requireRecord(value: unknown, endpoint: string, label: string): RecordValue {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new MultiBaasResponseError(endpoint, `${label} must be an object`);
  }
  return value as RecordValue;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new MultiBaasResponseError('/multibaas', `${label} must be a non-empty string`);
  }
  return value;
}

function requireSafeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new MultiBaasResponseError('/multibaas', `${label} must be a non-negative safe integer`);
  }
  return value;
}

function parseUint(value: unknown, label: string): string {
  try {
    if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) throw new Error();
    if (typeof value !== 'string' && typeof value !== 'bigint' && typeof value !== 'number') throw new Error();
    if (typeof value === 'string' && !/^(0|[1-9]\d*)$/.test(value)) throw new Error();
    const parsed = BigInt(value);
    if (parsed < 0n || parsed >= (1n << 256n)) throw new Error();
    return parsed.toString(10);
  } catch {
    throw new MultiBaasResponseError('/multibaas', `${label} must be an unsigned integer`);
  }
}

function normalizeAddress(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{40}$/i.test(value)) {
    throw new MultiBaasResponseError('/multibaas', `${label} must be a 20-byte address`);
  }
  return value.toLowerCase();
}

function requireHash(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string' || !new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`, 'i').test(value)) {
    throw new MultiBaasResponseError('/multibaas', `${label} must be a ${bytes}-byte hex value`);
  }
  return value;
}

function decodeCursor(cursor: string | undefined, rootId: string): number {
  if (cursor === undefined) return 0;
  const match = /^v1\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.exec(cursor);
  if (!match || match[1] !== rootId) throw new Error('Invalid or mismatched MultiBaas activity cursor');
  const offset = Number(match[2]);
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid MultiBaas activity cursor offset');
  return offset;
}

function encodeCursor(rootId: string, offset: number): string {
  return `v1.${rootId}.${offset}`;
}

function compareActivity(a: CapitalActivity, b: CapitalActivity): number {
  return a.provenance.blockNumber - b.provenance.blockNumber
    || a.provenance.transactionIndex - b.provenance.transactionIndex
    || a.provenance.logIndex - b.provenance.logIndex;
}

/** Merge overlapping pages; a fresh poll must start a new window, not append to stale events. */
export function mergeActivityPages(pages: readonly CapitalActivityPage[]): CapitalActivity[] {
  const entries = new Map<string, CapitalActivity>();
  const first = pages[0];
  for (const page of pages) {
    if (first && (page.rootId !== first.rootId || page.source.controllerAddress !== first.source.controllerAddress)) {
      throw new Error('Cannot merge different capital trees');
    }
    for (const activity of page.items) entries.set(activity.id, activity);
  }
  return [...entries.values()].sort(compareActivity);
}

function sameParsedEvent(a: ParsedEvent, b: ParsedEvent): boolean {
  return a.eventName === b.eventName
    && a.signature === b.signature
    && a.txHash.toLowerCase() === b.txHash.toLowerCase()
    && a.blockNumber === b.blockNumber
    && a.transactionIndex === b.transactionIndex
    && a.blockHash.toLowerCase() === b.blockHash.toLowerCase()
    && JSON.stringify([...a.inputs.entries()].sort(([left], [right]) => left.localeCompare(right)))
      === JSON.stringify([...b.inputs.entries()].sort(([left], [right]) => left.localeCompare(right)));
}
