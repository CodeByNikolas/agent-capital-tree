import { createHash } from 'node:crypto';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { capitalClient, capitalControllerAbi, narrowPolicy, tokenAmounts, type Restrictions } from '@agent-capital-tree/sdk';
import { createWalletClient, encodeAbiParameters, http, keccak256, type Address, type Hex } from 'viem';
import { sepolia } from 'viem/chains';
import type { WorkerKeyStore } from './keys.js';
import type { WorkerContext } from './context.js';
import type { SpawnChain, SpawnReceipt, SpawnRequest } from './spawn.js';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, part]) => `${JSON.stringify(key)}:${canonical(part)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const policyType = { type: 'tuple', components: [
  { name: 'capabilities', type: 'uint256' }, { name: 'maxAmounts', type: 'uint256[2]' },
  { name: 'expiry', type: 'uint64' }, { name: 'tokenMask', type: 'uint8' }, { name: 'poolId', type: 'bytes32' }
] } as const;
const paramTypes = [
  { type: 'string' }, { type: 'address' }, policyType, { type: 'uint256[2]' }, { type: 'address' }
] as const;

/** Stable scope survives lost journals. Never derive a wallet from model text. */
export function childKeyId(parent: WorkerContext, operationKey: Hex, controller: Address): string {
  if (!/^0x[a-fA-F0-9]{64}$/.test(operationKey)) throw new Error('invalid operation key');
  if (!/^0x[a-fA-F0-9]{40}$/.test(controller)) throw new Error('invalid controller address');
  const scope = `11155111:${controller.toLowerCase()}:${parent.rootId}:${parent.nodeId}:${parent.authorityGeneration}:${operationKey.toLowerCase()}`;
  return `child-${createHash('sha256').update(scope).digest('hex')}`;
}

export type SpawnChainConfig = Readonly<{
  rpcUrl: string; controller: Address; keys: WorkerKeyStore;
  keyIdFor: (context: WorkerContext) => Promise<string>;
  serialize: <T>(address: Address, action: () => Promise<T>) => Promise<T>;
}>;

export class OnchainSpawnChain implements SpawnChain {
  readonly client;
  #sent = new Map<string, Hex>();
  async #intent(keyId: string, request: SpawnRequest, allocated: boolean): Promise<void> {
    const path = join(this.config.keys.directory, `${keyId}.intent.json`);
    const value = createHash('sha256').update(canonical(request)).digest('hex');
    try {
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o600 ||
        await readFile(path, 'utf8') !== value) throw new Error('spawn intent conflicts with durable key');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      if (allocated) throw new Error('allocated child has no durable spawn intent');
      try { await writeFile(path, value, { flag: 'wx', mode: 0o600 }); }
      catch (writeError) {
        if ((writeError as NodeJS.ErrnoException).code !== 'EEXIST') throw writeError;
        return this.#intent(keyId, request, allocated);
      }
    }
  }
  constructor(readonly config: SpawnChainConfig) { this.client = capitalClient(config.rpcUrl, config.controller); }

  async #parameters(parent: WorkerContext, request: SpawnRequest) {
    await this.client.verifyDeployment();
    const rootId = BigInt(parent.rootId), parentId = BigInt(parent.nodeId), generation = BigInt(parent.authorityGeneration);
    const [node, currentGeneration, operator, token0, token1, operation, account] = await Promise.all([
      this.client.controller.read.getNode([parentId]), this.client.controller.read.rootGeneration([rootId]),
      this.client.controller.read.rootOperator([rootId]), this.client.controller.read.TOKEN0(), this.client.controller.read.TOKEN1(),
      this.client.controller.read.getOperation([rootId, parentId, generation, request.operationKey]),
      this.config.keys.account(await this.config.keyIdFor(parent))
    ]);
    if (node.id !== parentId || node.rootId !== rootId || node.generation !== generation || currentGeneration !== generation ||
      node.revoked || node.agent.toLowerCase() !== account.address.toLowerCase() || operator === '0x0000000000000000000000000000000000000000') {
      throw new Error('parent authority is stale or mismatched');
    }
    const keyId = childKeyId(parent, request.operationKey, this.config.controller);
    // An existing allocation can only use its original durable key. Missing key fails closed.
    const childAccount = await this.config.keys.account(keyId, operation.nodeId === 0n);
    await this.#intent(keyId, request, operation.nodeId !== 0n);
    const label = `a${keyId.slice(6, 21)}`;
    const tokens = [token0, token1] as const;
    const amounts = tokenAmounts(tokens, request.token, request.amount);
    const policy = operation.nodeId === 0n
      ? narrowPolicy(await this.client.controller.read.getEffectivePolicy([parentId]), request.restrictions as Restrictions, tokens)
      : (await this.client.controller.read.getNode([operation.nodeId])).policy;
    if (operation.nodeId !== 0n) {
      // If policy later changed, an old request cannot be reconstructed safely without the original intent.
      const reconstructed = narrowPolicy(policy, request.restrictions as Restrictions, tokens);
      if (JSON.stringify(reconstructed, (_k, v) => typeof v === 'bigint' ? v.toString() : v) !==
          JSON.stringify(policy, (_k, v) => typeof v === 'bigint' ? v.toString() : v)) {
        throw new Error('child policy changed; original spawn cannot be reconciled from current state');
      }
    }
    const paramsHash = keccak256(encodeAbiParameters(paramTypes, [label, childAccount.address, policy, amounts, account.address]));
    if (operation.nodeId !== 0n && operation.paramsHash !== paramsHash) throw new Error('onchain operation conflicts with requested parameters');
    return { rootId, parentId, generation, node, operation, account, childAccount, keyId, label, policy, amounts, paramsHash };
  }

  async reconcile(parent: WorkerContext, request: SpawnRequest): Promise<SpawnReceipt | undefined> {
    const prepared = await this.#parameters(parent, request);
    if (prepared.operation.nodeId === 0n) return undefined;
    const child = await this.client.controller.read.getNode([prepared.operation.nodeId]);
    if (child.parentId !== prepared.parentId || child.rootId !== prepared.rootId || child.generation !== prepared.generation ||
      child.agent.toLowerCase() !== prepared.childAccount.address.toLowerCase() || child.label !== prepared.label) {
      throw new Error('onchain child does not match durable key and scope');
    }
    const head = await this.client.rpc.getBlock();
    if (head.number === 0n) throw new Error('spawn is awaiting confirmation');
    const confirmedBlock = await this.client.rpc.getBlock({ blockNumber: head.number - 1n });
    const atConfirmation = await this.client.controller.read.getOperation([
      prepared.rootId, prepared.parentId, prepared.generation, request.operationKey
    ], { blockNumber: confirmedBlock.number });
    if (atConfirmation.nodeId !== prepared.operation.nodeId || atConfirmation.paramsHash !== prepared.paramsHash) {
      throw new Error('spawn is awaiting confirmation');
    }
    const txHash = this.#sent.get(prepared.keyId);
    return { childId: child.id.toString(), ...(txHash ? { txHash } : {}), blockHash: confirmedBlock.hash, blockNumber: confirmedBlock.number.toString() };
  }

  async submit(parent: WorkerContext, request: SpawnRequest): Promise<void> {
    const prepared = await this.#parameters(parent, request);
    if (prepared.operation.nodeId !== 0n) return;
    await this.config.serialize(prepared.account.address, async () => {
      // Recheck inside the signer queue so sibling tool writes cannot race this nonce.
      const current = await this.#parameters(parent, request);
      if (current.operation.nodeId !== 0n) return;
      const common = { address: this.config.controller, abi: capitalControllerAbi, account: current.account };
      const args = [current.parentId, current.label, current.childAccount.address, current.policy, current.amounts, request.operationKey] as const;
      const simulation = await this.client.rpc.simulateContract({ ...common, functionName: 'spawnChild', args });
      const wallet = createWalletClient({ account: current.account, chain: sepolia, transport: http(this.config.rpcUrl) });
      const hash = await wallet.writeContract(simulation.request);
      this.#sent.set(current.keyId, hash);
      const receipt = await this.client.rpc.waitForTransactionReceipt({ hash, confirmations: 2, timeout: 120_000 });
      if (receipt.status !== 'success') throw new Error('spawn transaction reverted');
    });
  }

  async confirmed(receipt: SpawnReceipt): Promise<boolean> {
    if (!receipt.blockNumber) return false;
    const [block, head] = await Promise.all([
      this.client.rpc.getBlock({ blockNumber: BigInt(receipt.blockNumber) }), this.client.rpc.getBlock()
    ]);
    return block.hash === receipt.blockHash && head.number >= block.number + 1n;
  }
}
