import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Wallet } from 'ethers';

// This utility never prints a private key, seed, password, or encrypted payload.
const name = process.argv[2] ?? 'deployer';
if (!/^[a-z][a-z0-9-]{0,31}$/.test(name)) throw new Error('Invalid wallet name');
const directory = join(homedir(), '.agent-capital-tree/keys');
await mkdir(directory, { recursive: true, mode: 0o700 });
if (((await stat(directory)).mode & 0o077) !== 0) {
  throw new Error('Wallet directory must be accessible only to its owner');
}
const keyPath = join(directory, `${name}.keystore.json`);
const passwordPath = join(directory, `${name}.password`);
let wallet;
try {
  const encrypted = await readFile(keyPath, 'utf8');
  const password = await readFile(passwordPath, 'utf8');
  wallet = await Wallet.fromEncryptedJson(encrypted, password);
} catch (error) {
  if (error.code !== 'ENOENT') throw new Error('Existing wallet could not be opened');
  // Exclusive creation prevents silently replacing a partially created wallet.
  const password = randomBytes(32).toString('hex');
  const created = Wallet.createRandom();
  const encrypted = await created.encrypt(password);
  await writeFile(passwordPath, password, { mode: 0o600, flag: 'wx' });
  await writeFile(keyPath, encrypted, { mode: 0o600, flag: 'wx' });
  wallet = await Wallet.fromEncryptedJson(await readFile(keyPath, 'utf8'), password);
  if (wallet.address !== created.address) throw new Error('Wallet round-trip failed');
}
for (const file of [keyPath, passwordPath]) {
  if (((await stat(file)).mode & 0o077) !== 0) throw new Error('Unsafe wallet permissions');
}
console.log(JSON.stringify({ name, chainId: 11155111, network: 'Ethereum Sepolia', address: wallet.address }));
