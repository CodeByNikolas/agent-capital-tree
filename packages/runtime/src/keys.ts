import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, lstat, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Wallet } from 'ethers';
import { privateKeyToAccount } from 'viem/accounts';
import { nonceManager, type Hex, type LocalAccount } from 'viem';

/** Trusted companion storage, outside Git. Encryption does not protect a compromised host. */
export class WorkerKeyStore {
  #wallets = new Map<string, Wallet>();
  #pending = new Map<string, Promise<Wallet>>();
  constructor(readonly directory: string) {}

  async #checkDirectory() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const info = await lstat(this.directory);
    if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o700 ||
      await realpath(this.directory) !== resolve(this.directory)) throw new Error('Invalid private key directory');
  }

  #path(id: string) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error('Invalid key identifier');
    return join(this.directory, `${id}.keystore.json`);
  }

  async #readPrivate(path: string) {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o600) {
      throw new Error('Invalid private key file');
    }
    return readFile(path, 'utf8');
  }

  async #password() {
    const path = join(this.directory, 'master.password');
    try { return await this.#readPrivate(path); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    try { await writeFile(path, randomBytes(32).toString('base64url'), { mode: 0o600, flag: 'wx' }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    return this.#readPrivate(path);
  }

  async wallet(id: string, create = false): Promise<Wallet> {
    this.#path(id);
    const cached = this.#wallets.get(id);
    if (cached) return cached;
    const pending = this.#pending.get(id);
    if (pending) return pending;
    const work = this.#load(id, create);
    this.#pending.set(id, work);
    try { const wallet = await work; this.#wallets.set(id, wallet); return wallet; }
    finally { this.#pending.delete(id); }
  }

  async #load(id: string, create: boolean) {
    await this.#checkDirectory();
    const path = this.#path(id);
    const password = await this.#password();
    let encrypted: string;
    try { encrypted = await this.#readPrivate(path); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !create) throw new Error('Worker key is unavailable; do not create a replacement mandate automatically');
      const wallet = Wallet.createRandom();
      encrypted = await wallet.encrypt(password);
      try { await writeFile(path, encrypted, { mode: 0o600, flag: 'wx' }); }
      catch (writeError) {
        if ((writeError as NodeJS.ErrnoException).code !== 'EEXIST') throw writeError;
        encrypted = await this.#readPrivate(path);
      }
    }
    try {
      const restored = await Wallet.fromEncryptedJson(encrypted, password);
      return new Wallet(restored.privateKey);
    } catch { throw new Error('Unable to decrypt worker key'); }
  }

  async account(id: string, create = false): Promise<LocalAccount> {
    const wallet = await this.wallet(id, create);
    return privateKeyToAccount(wallet.privateKey as Hex, { nonceManager });
  }
}
