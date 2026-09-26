import { encodeEventTopics, encodeAbiParameters } from 'viem';
import { capitalControllerAbi } from '@agent-capital-tree/sdk';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCapitalActivityQuery,
  createMultiBaasHistoryClient,
  MultiBaasRequestError,
  MultiBaasResponseError,
  mergeActivityPages,
  reconcileCapitalActivity,
} from '../dist/index.js';

const controllerAddress = '0x1111111111111111111111111111111111111111';
const tokenA = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const tokenB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const txA = `0x${'a'.repeat(64)}`;
const txB = `0x${'b'.repeat(64)}`;
const blockHash = `0x${'c'.repeat(64)}`;
const rootFundedSignature = 'RootFunded(uint256,address,uint256)';
const nodeRevokedSignature = 'NodeRevoked(uint256,uint256)';

const event = ({ name, signature, inputs, logIndex, txHash, txIndexInBlock = 0, blockNumber = 200 }) => ({
  triggeredAt: '2026-09-25T12:00:00Z',
  event: {
    name,
    signature,
    inputs: Object.entries(inputs).map(([field, value]) => ({ name: field, value, hashed: false, type: 'uint256' })),
    indexInLog: logIndex,
    contract: { address: controllerAddress, addressAlias: '', name: 'CapitalController', label: 'capital-controller' },
  },
  transaction: {
    from: controllerAddress,
    txData: '0x',
    txHash,
    txIndexInBlock,
    blockHash,
    blockNumber,
    // A smart wallet may call the controller internally; only the log emitter is authoritative.
    contract: { address: tokenA, addressAlias: '', name: 'SmartWallet', label: 'smart-wallet' },
    method: { name: 'test', signature: 'test()' },
  },
});

const rootFunded = (logIndex, token, amount) => event({
  name: 'RootFunded',
  signature: rootFundedSignature,
  inputs: { rootId: '7', token, amount },
  logIndex,
  txHash: txA,
});

function queryRow(rootId, transactionHash, eventSignature, blockNumber = 200) {
  return { rootId, transactionHash, eventSignature, blockNumber, blockHash };
}

function envelope(result) {
  return { status: 200, message: 'OK', result };
}

function receiptEnvelope(events) {
  const tx = events[0].transaction;
  const hex = value => '0x' + BigInt(value).toString(16);
  const data = { status: '0x1', transactionHash: tx.txHash, blockNumber: hex(tx.blockNumber),
    transactionIndex: hex(tx.txIndexInBlock), blockHash: tx.blockHash,
    logs: events.map(({event, transaction}) => {
      const abi = capitalControllerAbi.find(item => item.type === 'event' && item.name === event.name);
      const values = Object.fromEntries(event.inputs.map(({name,value}) => [name,value]));
      const args = Object.fromEntries(abi.inputs.map(input => [input.name, input.type.startsWith('uint') ? BigInt(values[input.name]) : values[input.name]]));
      const plain = abi.inputs.filter(input => !input.indexed);
      return { address: event.contract.address, transactionHash: transaction.txHash,
        blockNumber: hex(transaction.blockNumber), transactionIndex: hex(transaction.txIndexInBlock),
        blockHash: transaction.blockHash, logIndex: hex(event.indexInLog), removed: false,
        topics: encodeEventTopics({abi: capitalControllerAbi, eventName: event.name, args}),
        data: encodeAbiParameters(plain, plain.map(input => args[input.name])) };
    }) };
  return envelope({data});
}

function indexingResponse() {
  return envelope({
    isProcessingPastLogs: false,
    latestBlockNumber: 200,
    latestBlockHash: blockHash,
    startBlockNumber: 20,
    startBlockHash: blockHash,
    updatedAt: '2026-09-25T12:00:00Z',
  });
}

function chainResponse() {
  return envelope({ blockNumber: 201, chainID: 11155111, networkID: 11155111, version: 'test' });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function client(fetcher, pageSize = 2) {
  return createMultiBaasHistoryClient({
    deploymentUrl: 'https://d7zveyyfkvdbxdbd7n3rk6o3ee.multibaas.com',
    apiKey: 'test-server-key',
    controllerAddress,
    controllerLabel: 'capital-controller',
    pageSize,
    fetcher,
  });
}

test('credentials can only target an explicit MultiBaas HTTPS origin', () => {
  for (const deploymentUrl of ['http://demo.multibaas.com', 'https://evil.example', 'https://demo.multibaas.com.evil.example', 'https://user:password@demo.multibaas.com', 'https://demo.multibaas.com/path']) {
    assert.throws(() => createMultiBaasHistoryClient({ deploymentUrl, apiKey: 'test', controllerAddress, controllerLabel: 'capital' }));
  }
});

test('builds a root-filtered Event Query from the canonical event names', () => {
  const query = buildCapitalActivityQuery('7', controllerAddress);
  assert.deepEqual(query.events.map(({ eventName }) => eventName), [
    'NodeCreated',
    'RootFunded',
    'CapitalAllocated',
    'CapitalReclaimed',
    'EmergencyRecovered',
    'PolicyTightened',
    'OperatorChanged',
    'NodeRevoked',
    'SwapExecuted',
    'PositionOpened',
    'PositionIncreased',
    'FeesCollected',
    'PositionClosed',
  ]);
  assert.ok(query.events.every(({ filter }) =>
    filter.rule === 'and' && filter.children[0].value === '7' && filter.children[1].fieldType === 'contract_address' && filter.children[1].value === controllerAddress));
  assert.equal(query.orderBy, 'blockNumber');
  assert.ok(query.events.every(event => event.select.some(field => field.alias === query.orderBy)));
  assert.equal(query.order, 'ASC');
});

test('queries one bounded page, filters to its root, enriches log indexes, sorts, and deduplicates', async () => {
  const requests = [];
  const fetcher = async (input, init = {}) => {
    const url = new URL(String(input));
    requests.push({ url, init });
    assert.equal(url.origin, 'https://d7zveyyfkvdbxdbd7n3rk6o3ee.multibaas.com');
    assert.equal(init.headers.Authorization, 'Bearer test-server-key');
    assert.equal(init.redirect, 'error');
    if (url.pathname.endsWith('/queries')) {
      assert.equal(init.method, 'POST');
      assert.equal(url.searchParams.get('limit'), '2');
      assert.equal(url.searchParams.get('offset'), '0');
      const query = JSON.parse(init.body);
      assert.ok(query.events.every(({ filter }) => filter.children[0].value === '7'));
      return jsonResponse(envelope({
        rows: [
          queryRow('7', txA, rootFundedSignature),
          queryRow('7', txA, rootFundedSignature),
        ],
      }));
    }
    if (url.pathname.includes('/transactions/receipt/')) {
      assert.equal(url.pathname.split('/').at(-1), txA);
      return jsonResponse(receiptEnvelope([
        rootFunded(3, tokenB, '11'),
        rootFunded(2, tokenA, '42'),
        rootFunded(2, tokenA, '42'),
        event({
          name: 'CapitalAllocated',
          signature: 'CapitalAllocated(uint256,uint256,uint256,address,uint256)',
          inputs: { rootId: '8', parentId: '7', childId: '9', token: tokenA, amount: '5' },
          logIndex: 4,
          txHash: txA,
        }),
      ]));
    }
    if (url.pathname.endsWith('/status') && url.pathname.includes('/contracts/')) return jsonResponse(indexingResponse());
    if (url.pathname.endsWith('/chains/ethereum/status')) return jsonResponse(chainResponse());
    throw new Error(`Unexpected URL ${url}`);
  };

  const page = await client(fetcher).getCapitalActivity('7');
  assert.equal(requests.filter(({ url }) => url.pathname.includes('/transactions/receipt/')).length, 1);
  assert.equal(page.items.length, 2);
  assert.deepEqual(page.items.map(({ provenance }) => provenance.logIndex), [2, 3]);
  assert.deepEqual(page.items.map(({ id }) => id), [`11155111:${txA}:2`, `11155111:${txA}:3`]);
  assert.deepEqual(page.items.map(({ amount }) => amount), ['42', '11']);
  assert.equal(page.items[0].rootId, '7');
  assert.equal(page.items[0].provenance.finality, 'not_verified');
  assert.equal(page.indexing.state, 'lagging');
  assert.equal(page.indexing.indexGapBlocks, 1);
  assert.equal(page.hasMore, true);
  assert.equal(page.nextCursor, 'v1.7.2');
  assert.equal(page.source.chainId, 11155111);
});

test('cursor pages are root-bound and continue at the bounded query offset', async () => {
  let queryOffset = null;
  const fetcher = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/queries')) {
      queryOffset = url.searchParams.get('offset');
      assert.equal(url.searchParams.get('limit'), '2');
      return jsonResponse(envelope({ rows: [queryRow('7', txB, nodeRevokedSignature, 199)] }));
    }
    if (url.pathname.includes('/transactions/receipt/')) {
      return jsonResponse(receiptEnvelope([event({
        name: 'NodeRevoked',
        signature: nodeRevokedSignature,
        inputs: { rootId: '7', nodeId: '9' },
        logIndex: 1,
        txHash: txB,
        blockNumber: 199,
      })]));
    }
    if (url.pathname.endsWith('/status') && url.pathname.includes('/contracts/')) return jsonResponse(indexingResponse());
    if (url.pathname.endsWith('/chains/ethereum/status')) return jsonResponse(chainResponse());
    throw new Error(`Unexpected URL ${url}`);
  };

  const page = await client(fetcher).getCapitalActivity('7', 'v1.7.2');
  assert.equal(queryOffset, '2');
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].kind, 'node_revoked');
  assert.equal(page.hasMore, false);
  assert.equal(page.nextCursor, null);
  await assert.rejects(client(fetcher).getCapitalActivity('8', 'v1.7.2'), /cursor/);
});

test('malformed MultiBaas query responses fail explicitly', async () => {
  const fetcher = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/queries')) return jsonResponse(envelope({ rows: 'bad' }));
    if (url.pathname.endsWith('/status') && url.pathname.includes('/contracts/')) return jsonResponse(indexingResponse());
    if (url.pathname.endsWith('/chains/ethereum/status')) return jsonResponse(chainResponse());
    throw new Error(`Unexpected URL ${url}`);
  };
  await assert.rejects(client(fetcher).getCapitalActivity('7'), MultiBaasResponseError);
});

test('accepts decimal-string query blocks but rejects lossy or malformed integers', async () => {
  let block = '200';
  const fetcher = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/queries')) return jsonResponse(envelope({ rows: [queryRow('7', txA, rootFundedSignature, block)] }));
    if (url.pathname.includes('/transactions/receipt/')) return jsonResponse(receiptEnvelope([rootFunded(2, tokenA, '90071992547409930')]));
    return jsonResponse(url.pathname.includes('/contracts/') ? indexingResponse() : chainResponse());
  };
  assert.equal((await client(fetcher).getCapitalActivity('7')).items[0].amount, '90071992547409930');
  for (block of ['9007199254740992', '2e2', '-1', '1.5', '', ' 200', '0200', 1.5, -1]) {
    await assert.rejects(client(fetcher).getCapitalActivity('7'), /safe integer/);
  }
});

test('upstream failures surface without an RPC or other-provider fallback', async () => {
  const paths = [];
  const fetcher = async (input) => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    if (url.pathname.endsWith('/queries')) return jsonResponse({}, 503);
    if (url.pathname.endsWith('/status') && url.pathname.includes('/contracts/')) return jsonResponse(indexingResponse());
    if (url.pathname.endsWith('/chains/ethereum/status')) return jsonResponse(chainResponse());
    throw new Error(`Unexpected URL ${url}`);
  };
  await assert.rejects(client(fetcher).getCapitalActivity('7'), MultiBaasRequestError);
  assert.deepEqual(paths.sort(), [
    '/api/v0/chains/ethereum/addresses/0x1111111111111111111111111111111111111111/contracts/capital-controller/status',
    '/api/v0/chains/ethereum/status',
    '/api/v0/queries',
  ].sort());
});

test('same-signature logs split by a page boundary are all retained and overlap is deduplicated', async () => {
  const fetcher = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/queries')) return jsonResponse(envelope({ rows: [queryRow('7', txA, rootFundedSignature)] }));
    if (url.pathname.includes('/transactions/receipt/')) return jsonResponse(receiptEnvelope([rootFunded(2, tokenA, '42'), rootFunded(3, tokenB, '11')]));
    if (url.pathname.includes('/contracts/')) return jsonResponse(indexingResponse());
    return jsonResponse(chainResponse());
  };
  const api = client(fetcher, 1);
  const first = await api.getCapitalActivity('7');
  const second = await api.getCapitalActivity('7', first.nextCursor);
  assert.deepEqual(first.items.map(item => item.provenance.logIndex), [2, 3]);
  assert.deepEqual(mergeActivityPages([first, second]).map(item => item.provenance.logIndex), [2, 3]);
  const reorg = { ...first, items: [] };
  assert.deepEqual(mergeActivityPages([reorg]), []); // Refresh replaces the window, removing orphan logs.
  assert.throws(() => mergeActivityPages([first, { ...second, rootId: '8' }]), /different/);
});


test('canonical receipts verify amounts/finality and remove orphaned indexer entries', async () => {
  const fetcher = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/queries')) return jsonResponse(envelope({ rows: [queryRow('7', txA, rootFundedSignature)] }));
    if (url.pathname.includes('/transactions/receipt/')) return jsonResponse(receiptEnvelope([rootFunded(2, tokenA, '42')]));
    return jsonResponse(url.pathname.includes('/contracts/') ? indexingResponse() : chainResponse());
  };
  const page = await client(fetcher).getCapitalActivity('7');
  const topics = encodeEventTopics({ abi: capitalControllerAbi, eventName: 'RootFunded', args: { rootId: 7n, token: tokenA } });
  const receipt = {
    transactionHash: txA, transactionIndex: 0, blockHash, blockNumber: 200n, status: 'success',
    logs: [{ address: controllerAddress, logIndex: 2, topics, data: encodeAbiParameters([{ type: 'uint256' }], [42n]) }],
  };
  let canonical = blockHash;
  let finalizedNumber = 190n;
  const rpc = {
    getChainId: async () => 11155111,
    getBlock: async args => ({ number: args.blockTag === 'latest' ? 201n : args.blockTag === 'finalized' ? finalizedNumber : args.blockNumber, hash: canonical }),
    getTransactionReceipt: async () => receipt,
  };
  let checked = await reconcileCapitalActivity(page, rpc);
  assert.equal(checked.items[0].provenance.finality, 'confirmed');
  assert.equal(checked.source.provider, 'multibaas');
  finalizedNumber = 200n;
  checked = await reconcileCapitalActivity(page, rpc);
  assert.equal(checked.items[0].provenance.finality, 'finalized');
  const forged = structuredClone(page);
  forged.items[0].amount = '42000';
  await assert.rejects(reconcileCapitalActivity(forged, rpc), /values differ/);
  canonical = '0x' + 'd'.repeat(64);
  checked = await reconcileCapitalActivity(page, rpc);
  assert.equal(checked.items.length, 0);
  assert.equal(checked.verification.orphanedItems, 1);
  await assert.rejects(reconcileCapitalActivity(page, { ...rpc, getChainId: async () => 1 }), /Sepolia/);
  await assert.rejects(reconcileCapitalActivity(page, { ...rpc, getTransactionReceipt: async () => { throw new Error('network unavailable'); } }), /Unable to verify/);
  checked = await reconcileCapitalActivity(page, { ...rpc, getTransactionReceipt: async () => { const e = new Error(); e.name = 'TransactionReceiptNotFoundError'; throw e; } });
  assert.equal(checked.items.length, 0);
});


test('strategy history preserves raw swap/LP amounts and NFT identity', async () => {
  const definitions = [
    ['SwapExecuted', 'SwapExecuted(uint256,uint256,address,address,uint256,uint256)', {rootId:'7',nodeId:'8',inputToken:tokenA,outputToken:tokenB,amountIn:'100',amountOut:'99'}],
    ['PositionOpened', 'PositionOpened(uint256,uint256,uint256,uint128,uint256,uint256)', {rootId:'7',nodeId:'8',tokenId:'912',liquidity:'90071992547409930',amount0:'80',amount1:'80'}],
    ['PositionIncreased', 'PositionIncreased(uint256,uint256,uint256,uint128,uint256,uint256)', {rootId:'7',nodeId:'8',tokenId:'912',liquidity:'12',amount0:'1',amount1:'0'}],
    ['FeesCollected', 'FeesCollected(uint256,uint256,uint256,uint256,uint256)', {rootId:'7',nodeId:'8',tokenId:'912',amount0:'1',amount1:'2'}],
    ['PositionClosed', 'PositionClosed(uint256,uint256,uint256,uint128,uint256,uint256)', {rootId:'7',nodeId:'8',tokenId:'912',liquidity:'90071992547409942',amount0:'82',amount1:'82'}],
  ];
  const fetcher = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/queries')) return jsonResponse(envelope({rows:definitions.map(([,signature]) => queryRow('7',txA,signature))}));
    if (url.pathname.includes('/transactions/receipt/')) return jsonResponse(receiptEnvelope(definitions.map(([name,signature,inputs],index) => event({name,signature,inputs,logIndex:index,txHash:txA}))));
    return jsonResponse(url.pathname.includes('/contracts/') ? indexingResponse() : chainResponse());
  };
  const page = await client(fetcher,10).getCapitalActivity('7');
  assert.deepEqual(page.items.map(item => item.kind), ['swap_executed','position_opened','position_increased','fees_collected','position_closed']);
  assert.equal(page.items[1].liquidity,'90071992547409930');
  assert.equal(page.items[4].tokenId,'912');
  assert.equal(page.items[0].amountOut,'99');
  assert.equal(page.source.activityCoverage,'capital_and_strategy_events');
});

test('receipt enrichment rejects identity mismatches and never discovers unindexed transactions', async () => {
  let rows = [];
  let mutate = () => {};
  let receipts = 0;
  const fetcher = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/queries')) return jsonResponse(envelope({rows}));
    if (url.pathname.includes('/transactions/receipt/')) {
      receipts++;
      const body = receiptEnvelope([rootFunded(2, tokenA, '42')]);
      mutate(body.result.data);
      return jsonResponse(body);
    }
    return jsonResponse(url.pathname.includes('/contracts/') ? indexingResponse() : chainResponse());
  };
  assert.deepEqual((await client(fetcher).getCapitalActivity('7')).items, []);
  assert.equal(receipts, 0);
  rows = [queryRow('7', txA, rootFundedSignature)];
  for (mutate of [
    receipt => { receipt.transactionHash = txB; },
    receipt => { receipt.status = '0x0'; },
    receipt => { receipt.logs[0].removed = true; },
    receipt => { receipt.logs[0].transactionHash = txB; },
    receipt => { receipt.logs[0].logIndex = '0x20000000000000'; },
    receipt => { receipt.logs[0].address = tokenB; },
    receipt => { receipt.blockHash = txB; receipt.logs[0].blockHash = txB; },
  ]) await assert.rejects(client(fetcher).getCapitalActivity('7'));
});
