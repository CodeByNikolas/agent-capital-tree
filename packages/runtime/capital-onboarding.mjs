// Private, restart-safe enrollment. Only public addresses enter the wallet URL.
import { mkdir, readFile, writeFile, rename, lstat, realpath, copyFile, constants } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { WorkerKeyStore } from './dist/index.js';
import { openWalletBrowser } from '../../scripts/open-wallet-browser.mjs';
import { demoBudgetSchema } from '../plugin/demo-budget.mjs';

const TOKEN = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const limitAbi = [{type:'function',name:'rootCapitalLimit',stateMutability:'view',inputs:[{name:'rootId',type:'uint256'}],outputs:[{name:'limit',type:'uint256'}]}];

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
  async save(state) {
    const temporary = `${this.file}.${randomBytes(8).toString('hex')}.tmp`;
    await writeFile(temporary, JSON.stringify(state), {mode:0o600,flag:'wx'});
    await rename(temporary,this.file);
  }
  async prepare({ label, budgetRaw, fundingRaw, userConfirmedLimit, test, openBrowser = true }) {
    await privateDirectory(this.directory);
    let state = await this.read();
    if (!state && (!userConfirmedLimit || !budgetRaw || fundingRaw === undefined)) throw new Error('LIMIT_REQUIRED: Ask the user for the shared Test-USDC capital limit and authorized funding amount. No default is allowed.');
    if (state && !state.limitConfirmed && !userConfirmedLimit) throw new Error('LIMIT_REQUIRED: This older setup has no recorded user-confirmed limit. Ask for confirmation while preserving its signer and name.');
    budgetRaw ??= state?.budgetRaw;
    fundingRaw ??= state?.fundingRaw;
    demoBudgetSchema.parse(budgetRaw);
    if (test && (test.asset.toLowerCase() !== TOKEN.toLowerCase() || BigInt(test.amount) > BigInt(fundingRaw ?? '0'))) throw new Error('SETUP_CONFLICT: Test allocation must fit explicitly authorized Test-USDC funding.');
    if (state?.test && test && JSON.stringify(state.test) !== JSON.stringify(test)) throw new Error('SETUP_CONFLICT: The saved child test cannot change on retry.');
    if (fundingRaw === undefined || !/^(0|[1-9]\d{0,77})$/.test(fundingRaw) || BigInt(fundingRaw) > BigInt(budgetRaw)) throw new Error('FUNDING_REQUIRED: Explicit funding must be between zero and the confirmed shared limit.');
    if (state && ((label && label !== state.label) || (state.limitConfirmed && (budgetRaw !== state.budgetRaw || fundingRaw !== state.fundingRaw)))) throw new Error('SETUP_CONFLICT: Resume the existing setup; repeated calls cannot replace its key, funding or confirmed limit.');
    if (!state) {
      label ??= `kanoki-${randomBytes(8).toString('hex')}`;
      const operator = (await new WorkerKeyStore(join(this.directory, 'keys')).account('setup', true)).address;
      state = { setupId: randomBytes(16).toString('hex'), chainId: 11155111, token: TOKEN, decimals: 6, controller: this.session.controller.toLowerCase(), label, budgetRaw, fundingRaw, limitConfirmed: true, operator, test };
      try { await writeFile(this.file, JSON.stringify(state), { mode: 0o600, flag: 'wx' }); }
      catch (error) { if (error.code !== 'EEXIST') throw error; state = await this.read(); }
    }
    if (!state.limitConfirmed) {
      state = {...state, setupId: state.setupId ?? randomBytes(16).toString('hex'), token:TOKEN, decimals:6, budgetRaw, fundingRaw, limitConfirmed:true};
      await this.save(state);
    }
    if (test && !state.test) { state.test = test; await this.save(state); }
    // Never claim a local amount is enforced by an older immutable controller.
    try { await this.session.client.rpc.readContract({address:this.session.controller,abi:limitAbi,functionName:'rootCapitalLimit',args:[0n]}); }
    catch { return {...await this.status(), status:'blocked', transactionSubmitted:false, next:'CAPITAL_LIMIT_UNSUPPORTED: The configured controller could not prove shared-limit support. Deploy and verify the limited controller before wallet creation or funding. Saved signer and existing gas are preserved.'}; }
    const rpc = this.session.client.rpc;
    const decimals = await rpc.readContract({address:TOKEN,abi:[{type:'function',name:'decimals',stateMutability:'view',inputs:[],outputs:[{type:'uint8'}]}],functionName:'decimals'});
    const token0 = await rpc.readContract({address:this.session.controller,abi:[{type:'function',name:'TOKEN0',stateMutability:'view',inputs:[],outputs:[{type:'address'}]}],functionName:'TOKEN0'});
    if (await rpc.getChainId() !== 11155111 || decimals !== 6 || token0.toLowerCase() !== TOKEN.toLowerCase()) throw new Error('WRONG_CHAIN: Setup token/network/decimal configuration does not match Sepolia USDC. No wallet link created.');
    const url = new URL('/setup', this.session.walletOrigin);
    for (const [key, value] of Object.entries({ action: 'create-root', label: state.label, budget: state.budgetRaw, funding:state.fundingRaw, setup:state.setupId, operator: state.operator })) url.searchParams.set(key, value);
    const browser = openBrowser ? await openWalletBrowser(url.href) : { opened: false, method: 'not-requested' };
    return { chainId: 11155111, setupId:state.setupId, token:TOKEN, decimals:6, ensName: `${state.label}.${this.session.namespace}`, budgetRaw: state.budgetRaw, fundingRaw:state.fundingRaw,
      localOperator: state.operator, url: url.href, browser, transactionSubmitted: false,
      next: 'Keep calling continueCapitalSetup while the owner signs. Do not end the task or request done, a hash or ENS selection. The saved authorized test continues with its original operation key when ready. Wallet signatures remain with the owner.' };
  }
  async status() {
    const state = await this.read();
    if (!state) return {status:'unavailable',localOperator:null,missing:['userConfirmedLimit'],next:'Ask the user for the shared Test-USDC capital limit and authorized funding before prepareRootSetup. No default.'};
    const rpc = this.session.client.rpc;
    const block = await rpc.getBlock();
    const gas = await rpc.getBalance({address:state.operator,blockNumber:block.number});
    let tree;
    try { tree = (await this.session.client.resolveTree(`${state.label}.${this.session.namespace}`)).tree; }
    catch(error) { if (!/^No vault in this Sepolia deployment|^Root not found/.test(error.message)) throw error; }
    const matched = Boolean(tree && tree.operator.toLowerCase() === state.operator.toLowerCase());
    const total = tree?.totalBalances[0] ?? 0n;
    let limit = null;
    if (tree) { try { limit = await rpc.readContract({address:this.session.controller,abi:limitAbi,functionName:'rootCapitalLimit',args:[tree.rootId],blockNumber:tree.source.blockNumber}); } catch {} }
    let funded = 0n;
    if (tree && limit !== null) funded = await rpc.readContract({address:this.session.controller,abi:[{...limitAbi[0],name:'rootCapitalFunded'}],functionName:'rootCapitalFunded',args:[tree.rootId],blockNumber:tree.source.blockNumber});
    const steps = {limit:state.limitConfirmed && limit !== null && limit === BigInt(state.budgetRaw) ? 'confirmed' : 'required',root:tree?'confirmed':'required',authorization:matched?'confirmed':'required',funding:tree && (funded > total ? funded : total) >= BigInt(state.fundingRaw ?? state.budgetRaw)?'confirmed':'required',gas:gas>0n?'confirmed':'required'};
    return {status:'awaiting_wallet',setupId:state.setupId ?? null,chainId:11155111,token:TOKEN,decimals:6,ensName:`${state.label}.${this.session.namespace}`,localOperator:state.operator,operatorGasAddress:state.operator,operatorGasWei:gas,viewedRootId:tree?.rootId ?? null,budgetRaw:state.budgetRaw,fundingRaw:state.fundingRaw ?? null,onchainCapitalLimitRaw:limit,cumulativeFundedRaw:funded,treeSource:tree?.source ?? null,totalUsdcBalanceRaw:total,steps,missing:Object.entries(steps).filter(([,v])=>v!=='confirmed').map(([k])=>k),source:{chainId:11155111,blockNumber:block.number,timestamp:block.timestamp,observedAt:new Date().toISOString()},next:`${gas>0n?'Gas confirmed; ':''}${!tree?'root creation is not confirmed. ':'Continue the remaining wallet steps. '}Keep checking this saved setup automatically; no new user command or transaction hash is required.`};
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
