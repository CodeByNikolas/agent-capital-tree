import { randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { createPublicClient, http, keccak256, nonceManager, parseTransaction, recoverTransactionAddress, type Address, type Hex, type LocalAccount, type PublicClient, type HttpTransport } from 'viem';
import { sepolia } from 'viem/chains';

export const MAX_CHILD_GAS_WEI = 25_000_000_000_000_000n; // 0.025 Sepolia ETH, once per child scope.
const MAX_FEE_PER_GAS_WEI = 20_000_000_000n;
/** A depth-2 agent keeps most of its grant to pay for its own spawn transaction. */
export function childGasGrant(base: bigint, parentDepth: number): bigint {
  if (base < 0n || base > MAX_CHILD_GAS_WEI) throw new Error('invalid child gas budget');
  if (parentDepth === 1) return base;
  if (parentDepth === 2) return base / 4n;
  throw new Error('maximum worker depth reached');
}

type GasRecord = { from: Address; to: Address; value: string; raw: Hex; hash: Hex };

/** Persist the signed transaction before broadcast; retries only rebroadcast the exact same bytes. */
export class ChildGasFunding {
  readonly rpc: PublicClient<HttpTransport, typeof sepolia>;
  constructor(readonly rpcUrl: string, readonly directory: string) {
    this.rpc = createPublicClient({ chain: sepolia, transport: http(rpcUrl, { timeout: 15_000 }) });
  }


  async recoverPending(): Promise<void> {
    try { await lstat(this.directory); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    if (await this.rpc.getChainId() !== sepolia.id) throw new Error('expected Sepolia chain ID');
    const directoryInfo = await lstat(this.directory);
    if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink() || directoryInfo.uid !== process.getuid?.() ||
      (directoryInfo.mode & 0o777) !== 0o700) throw new Error('invalid private gas journal');
    for (const entry of await readdir(this.directory)) {
      if (!/^child-[a-f0-9]{64}\.json$/.test(entry)) continue;
      const path = join(this.directory, entry);
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o600) {
        throw new Error('invalid gas record');
      }
      const record = JSON.parse(await readFile(path, 'utf8')) as GasRecord;
      if (keccak256(record.raw) !== record.hash || BigInt(record.value) > MAX_CHILD_GAS_WEI) throw new Error('invalid gas record');
      await this.#broadcast(record);
    }
  }

  async #broadcast(record: GasRecord): Promise<void> {
    if (!record.raw.startsWith('0x02')) throw new Error('invalid gas transaction type');
    const transaction = parseTransaction(record.raw);
    const sender = await recoverTransactionAddress({ serializedTransaction: record.raw as `0x02${string}` });
    if (transaction.chainId !== sepolia.id || transaction.to?.toLowerCase() !== record.to.toLowerCase() ||
      transaction.value?.toString() !== record.value || sender.toLowerCase() !== record.from.toLowerCase()) {
      throw new Error('gas record does not match signed transaction');
    }
    let receipt = await this.rpc.getTransactionReceipt({ hash: record.hash }).catch(() => undefined);
    if (!receipt) {
      try { await this.rpc.sendRawTransaction({ serializedTransaction: record.raw }); }
      catch {
        receipt = await this.rpc.getTransactionReceipt({ hash: record.hash }).catch(() => undefined);
        if (!receipt) throw new Error('gas broadcast outcome is uncertain');
      }
    }
    if (!receipt || (await this.rpc.getBlockNumber()) < receipt.blockNumber + 1n) {
      receipt = await this.rpc.waitForTransactionReceipt({ hash: record.hash, confirmations: 2, timeout: 120_000 });
    }
    if (receipt.status !== 'success') throw new Error('child gas transfer failed');
    nonceManager.reset({ address: record.from, chainId: sepolia.id });
  }

  async fund(scope: string, account: LocalAccount, child: Address, value: bigint): Promise<Hex | undefined> {
    if (value === 0n) return undefined;
    if (value < 0n || value > MAX_CHILD_GAS_WEI || !/^child-[a-f0-9]{64}$/.test(scope)) throw new Error('invalid child gas grant');
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const directoryInfo = await lstat(this.directory);
    if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink() || directoryInfo.uid !== process.getuid?.() ||
      (directoryInfo.mode & 0o777) !== 0o700) throw new Error('invalid private gas journal');
    const path = join(this.directory, `${scope}.json`);
    let record: GasRecord;
    try {
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o600) {
        throw new Error('invalid gas record');
      }
      record = JSON.parse(await readFile(path, 'utf8')) as GasRecord;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      if (await this.rpc.getChainId() !== sepolia.id) throw new Error('expected Sepolia chain ID');
      const fees = await this.rpc.estimateFeesPerGas();
      if (fees.maxFeePerGas > MAX_FEE_PER_GAS_WEI) throw new Error('gas price exceeds configured ceiling');
      const nonce = await nonceManager.consume({ address: account.address, chainId: sepolia.id, client: this.rpc });
      let raw: Hex;
      try { raw = await account.signTransaction({ type: 'eip1559', chainId: sepolia.id, nonce, to: child,
        value, gas: 21_000n, maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas }); }
      catch (error) { nonceManager.reset({ address: account.address, chainId: sepolia.id }); throw error; }
      record = { from: account.address, to: child, value: value.toString(), raw, hash: keccak256(raw) };
      const temp = `${path}.${randomBytes(8).toString('hex')}.tmp`;
      await writeFile(temp, JSON.stringify(record), { mode: 0o600, flag: 'wx' });
      // One companion process owns the journal; atomic rename makes restart recovery unambiguous.
      await rename(temp, path);
    }
    if (record.from.toLowerCase() !== account.address.toLowerCase() || record.to.toLowerCase() !== child.toLowerCase() ||
      record.value !== value.toString() || keccak256(record.raw) !== record.hash) throw new Error('gas grant scope conflict');
    await this.#broadcast(record);
    return record.hash;
  }
}
