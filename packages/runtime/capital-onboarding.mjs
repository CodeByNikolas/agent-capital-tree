// Private, restart-safe enrollment. Only public addresses enter the wallet URL.
import { mkdir, readFile, writeFile, lstat, realpath, copyFile, constants } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { WorkerKeyStore } from './dist/index.js';
import { openWalletBrowser } from '../../scripts/open-wallet-browser.mjs';

async function privateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700 || await realpath(path) !== resolve(path)) throw new Error('Unsafe onboarding directory');
}
async function privateJson(path) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600) throw new Error('Unsafe onboarding file');
  return JSON.parse(await readFile(path, 'utf8'));
}
export class CapitalOnboarding {
  constructor(session) {
    this.session = session;
    this.directory = join(session.base, `onboarding-${session.controller.toLowerCase()}`);
    this.file = join(this.directory, 'setup.json');
  }
  async read() {
    try {
      const state = await privateJson(this.file);
      if (state.controller !== this.session.controller.toLowerCase() || state.chainId !== 11155111 || !/^[a-z][a-z0-9-]{0,30}$/.test(state.label)) throw new Error('Invalid onboarding domain');
      return state;
    } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  async prepare({ label, budgetRaw = '100000', openBrowser = true }) {
    await privateDirectory(this.directory);
    let state = await this.read();
    if (state && ((label && label !== state.label) || budgetRaw !== state.budgetRaw)) throw new Error('An onboarding already exists. Resume the existing setup; do not replace its key or budget.');
    if (!state) {
      label ??= `kanoki-${randomBytes(8).toString('hex')}`;
      const operator = (await new WorkerKeyStore(join(this.directory, 'keys')).account('setup', true)).address;
      state = { chainId: 11155111, controller: this.session.controller.toLowerCase(), label, budgetRaw, operator };
      try { await writeFile(this.file, JSON.stringify(state), { mode: 0o600, flag: 'wx' }); }
      catch (error) { if (error.code !== 'EEXIST') throw error; state = await this.read(); }
    }
    const url = new URL('/setup', this.session.walletOrigin);
    for (const [key, value] of Object.entries({ action: 'create-root', label: state.label, budget: state.budgetRaw, operator: state.operator })) url.searchParams.set(key, value);
    const browser = openBrowser ? await openWalletBrowser(url.href) : { opened: false, method: 'not-requested' };
    return { chainId: 11155111, ensName: `${state.label}.${this.session.namespace}`, budgetRaw: state.budgetRaw,
      localOperator: state.operator, url: url.href, browser, transactionSubmitted: false,
      next: 'Open this setup once and confirm the displayed wallet transactions. Creation, authorization, shared USDC funding and native gas are guided together. Kanoki automatically recognizes your vault; no ENS copying, root selection or config change is needed. Then call getCapitalSetup.' };
  }
  async resume() {
    const state = await this.read();
    if (!state) return false;
    let resolved;
    try { resolved = await this.session.client.resolveTree(`${state.label}.${this.session.namespace}`); }
    catch (error) {
      if (/^No vault in this Sepolia deployment|^Root not found/.test(error.message)) return false;
      throw error;
    }
    const tree = resolved.tree;
    if (resolved.selectedNodeId !== tree.rootId) throw new Error('Onboarding did not resolve to a root');
    const root = tree.nodes.find(node => node.id === tree.rootId);
    if (root.revoked) throw new Error('ROOT_REVOKED: Your saved vault is permanently revoked. No replacement or funding was requested.');
    if (tree.operator.toLowerCase() !== state.operator.toLowerCase()) return false; // Wallet setup has not authorized this signer yet.
    await privateDirectory(this.directory);
    const keys = new WorkerKeyStore(join(this.directory, 'keys'));
    if ((await keys.account('setup', false)).address.toLowerCase() !== state.operator.toLowerCase()) throw new Error('Onboarding signer mismatch');
    const rootId = String(tree.rootId);
    const keyFile = join(this.directory, 'keys', `root-${rootId}.keystore.json`);
    try { await copyFile(join(this.directory, 'keys', 'setup.keystore.json'), keyFile, constants.COPYFILE_EXCL); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    if ((await keys.account(`root-${rootId}`, false)).address.toLowerCase() !== state.operator.toLowerCase()) throw new Error('Existing root key differs; no replacement allowed');
    const domain = { chainId: 11155111, rootId, controller: state.controller };
    const domainFile = join(this.directory, 'domain.json');
    try { await writeFile(domainFile, JSON.stringify(domain), { mode: 0o600, flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; if (JSON.stringify(await privateJson(domainFile)) !== JSON.stringify(domain)) throw new Error('Onboarding profile domain mismatch'); }
    Object.assign(this.session, { rootId, runtimeRoot: this.directory, query: `${state.label}.${this.session.namespace}` });
    return true;
  }
}
