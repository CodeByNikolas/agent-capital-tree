import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { lstat, mkdir, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { JsonRpcProvider, Wallet, getAddress, keccak256 } from 'ethers';
import { capitalClient } from '../packages/sdk/dist/index.js';
import { journaledTransaction } from './lib/sepolia-transactions.mjs';
import { startX402DemoService } from './lib/x402-demo-service.mjs';

const PORT = 43827;
const USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const require = createRequire(new URL('../packages/runtime/package.json', import.meta.url));
const { createWalletClient, http, publicActions, encodeFunctionData, parseAbi } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { sepolia } = require('viem/chains');
const { ExactEvmScheme } = require('@x402/evm/exact/facilitator');
const { toFacilitatorEvmSigner } = require('@x402/evm');
const transferAbi = parseAbi(['function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,bytes signature)']);

if (process.argv[2] === '--help') {
  console.log('Usage: node scripts/start-x402-demo-seller.mjs /absolute/private/seller-config.json');
  process.exit(0);
}
if (process.argv.length !== 3 || !isAbsolute(process.argv[2])) throw new Error('Expected one absolute private config path; use --help');

async function privateFile(path) {
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('Private file path must be absolute');
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o777) !== 0o600) throw new Error('Private file must be an owned regular file with mode 0600');
  return readFile(path, 'utf8');
}

async function privateDirectory(path) {
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('Private directory path must be absolute');
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o777) !== 0o700 || await realpath(path) !== resolve(path)) throw new Error('Private directory must be owned, non-symlinked and mode 0700');
}

const config = JSON.parse(await privateFile(process.argv[2]));
assert.deepEqual(Object.keys(config).sort(), ['allowedPayers', 'childLabel', 'controller', 'journalDirectory', 'keystoreFile', 'passwordFile', 'rootId', 'rootVault', 'rpcUrl', 'sellerDirectory']);
const rpcUrl = new URL(config.rpcUrl);
if ((rpcUrl.protocol !== 'https:' && !(rpcUrl.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(rpcUrl.hostname))) ||
    rpcUrl.username || rpcUrl.password || rpcUrl.hash) throw new Error('Expected an HTTPS or loopback Sepolia RPC URL without embedded credentials');
if (!Array.isArray(config.allowedPayers) || config.allowedPayers.length > 1) throw new Error('Expected zero or one pinned child vault');
const pinnedPayer = config.allowedPayers.length ? getAddress(config.allowedPayers[0]) : undefined;
const controller = getAddress(config.controller);
const rootVault = getAddress(config.rootVault);
if (typeof config.rootId !== 'string' || !/^[1-9]\d*$/.test(config.rootId) ||
    typeof config.childLabel !== 'string' || !/^[a-z][a-z0-9-]{0,30}$/.test(config.childLabel)) throw new Error('Invalid selected root or child label');
const rootId = BigInt(config.rootId);
const allowedPayers = [];
if (resolve(config.journalDirectory) === resolve(config.sellerDirectory)) throw new Error('Use separate journal and seller directories');
await privateDirectory(config.journalDirectory);
await privateDirectory(config.sellerDirectory);
const rpc = new JsonRpcProvider(rpcUrl.href);
let seller, poll;
try {
  if ((await rpc.getNetwork()).chainId !== 11155111n) throw new Error('Seller supports Sepolia only');
  const treeClient = capitalClient(rpcUrl.href, controller);
  const refreshPayer = async () => {
    const tree = await treeClient.getTree(rootId);
    const root = tree.nodes.find(node => node.id === rootId && node.parentId === 0n);
    if (!root || root.vault.toLowerCase() !== rootVault.toLowerCase() || tree.tokens[0].toLowerCase() !== USDC.toLowerCase()) {
      throw new Error('Configured root vault or USDC asset does not match controller state');
    }
    const matches = tree.nodes.filter(node => node.parentId === rootId && node.label === config.childLabel &&
      !node.revoked && node.authorizedActions.includes('pay') && (!pinnedPayer || node.vault.toLowerCase() === pinnedPayer.toLowerCase()));
    if (matches.length > 1) throw new Error('Ambiguous allowed child');
    allowedPayers.splice(0, allowedPayers.length, ...matches.map(node => node.vault));
  };
  await refreshPayer();
  let refreshing = false;
  poll = setInterval(() => {
    if (refreshing) return;
    refreshing = true;
    void refreshPayer().catch(() => { allowedPayers.splice(0); }).finally(() => { refreshing = false; });
  }, 2000);
  const signer = (await Wallet.fromEncryptedJson(await privateFile(config.keystoreFile), await privateFile(config.passwordFile))).connect(rpc);
  const combined = createWalletClient({ account: privateKeyToAccount(signer.privateKey), chain: sepolia, transport: http(rpcUrl.href) }).extend(publicActions);
  const facilitator = new ExactEvmScheme(toFacilitatorEvmSigner({ ...combined, address: signer.address,
    writeContract: async args => {
      if (args.address?.toLowerCase() !== USDC.toLowerCase() || args.functionName !== 'transferWithAuthorization' ||
          !Array.isArray(args.args) || args.args.length !== 7 ||
          !allowedPayers.some(vault => vault.toLowerCase() === args.args[0]?.toLowerCase()) ||
          args.args[1]?.toLowerCase() !== signer.address.toLowerCase() || BigInt(args.args[2]) !== 10000n) {
        throw new Error('Settlement is outside the fixed 0.01-USDC demo scope');
      }
      const data = encodeFunctionData({ abi: transferAbi, functionName: 'transferWithAuthorization', args: args.args });
      const { transaction } = await journaledTransaction({ rpc, signer, directory: config.journalDirectory,
        name: `settle-${keccak256(data).slice(2, 50)}`, request: { to: USDC, data }, maxGasCostWei: 1_000_000_000_000_000n });
      return transaction.hash;
    },
    sendTransaction: async () => { throw new Error('Generic seller transfers are disabled'); }
  }), { simulateInSettle: true });
  seller = await startX402DemoService({ facilitator, payTo: signer.address, allowedPayers, directory: config.sellerDirectory, port: PORT });
  console.log(JSON.stringify({ url: seller.url, payTo: signer.address, asset: USDC, amountRaw: '10000', network: 'eip155:11155111' }));
  await new Promise((done, fail) => {
    process.once('SIGINT', done);
    process.once('SIGTERM', done);
    seller.server.once('error', fail);
  });
} finally {
  if (poll) clearInterval(poll);
  if (seller) await seller.close();
  rpc.destroy();
}
