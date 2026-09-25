import { readFile, writeFile, mkdir, rename, lstat, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Transaction, ZeroAddress, parseEther } from 'ethers';

/** Sequential operator writes only. Persist a signed intent before sending; never re-sign a retry. */
export async function journaledTransaction({ rpc, signer, directory, name, request, confirmations = 2 }) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(name)) throw new Error('Invalid journal name');
  if ((await rpc.getNetwork()).chainId !== 11155111n) throw new Error('Expected Sepolia');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const dir = await lstat(directory);
  if (!dir.isDirectory() || dir.isSymbolicLink() || dir.uid !== process.getuid() || (dir.mode & 0o777) !== 0o700 || await realpath(directory) !== resolve(directory)) throw new Error('Unsafe transaction journal directory');
  const path = join(directory, name + '.json');
  let signed;
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o777) !== 0o600) throw new Error('Unsafe transaction journal');
    signed = JSON.parse(await readFile(path, 'utf8')).signed;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const gas = await rpc.estimateGas({ ...request, from: signer.address });
    const fees = await rpc.getFeeData();
    const gasLimit = gas * 12n / 10n;
    if (!fees.maxFeePerGas || gasLimit * fees.maxFeePerGas > parseEther('0.025')) throw new Error('Transaction fee ceiling exceeded');
    if (BigInt(request.value ?? 0) > parseEther('0.01')) throw new Error('Transaction value ceiling exceeded');
    signed = await signer.signTransaction({ ...request, chainId: 11155111, type: 2, nonce: await rpc.getTransactionCount(signer.address, 'pending'), gasLimit, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas });
    await writeFile(path + '.tmp', JSON.stringify({ signed }), { mode: 0o600, flag: 'wx' });
    await rename(path + '.tmp', path);
  }
  const transaction = Transaction.from(signed);
  const same = (a, b) => a.toLowerCase() === b.toLowerCase();
  if (!same(transaction.from, signer.address) || transaction.chainId !== 11155111n || transaction.value !== BigInt(request.value ?? 0) ||
      transaction.data !== (request.data ?? '0x') || !same(transaction.to ?? ZeroAddress, request.to ?? ZeroAddress)) throw new Error('Journal differs from intended transaction');
  if (!await rpc.getTransaction(transaction.hash)) await rpc.broadcastTransaction(signed);
  console.log(JSON.stringify({ action: name, transactionHash: transaction.hash }));
  const receipt = await rpc.waitForTransaction(transaction.hash, confirmations, 180000);
  if (!receipt || receipt.status !== 1) throw new Error('Transaction not confirmed');
  return { receipt, transaction };
}
