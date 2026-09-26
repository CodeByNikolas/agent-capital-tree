import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { AbiCoder, keccak256 } from 'ethers';

const contracts = fileURLToPath(new URL('../../contracts/', import.meta.url));

export async function etherscanKey() {
  const key = (process.env.ETHERSCAN_API_KEY ?? await readFile(join(homedir(), '.agent-capital-tree/etherscan-api-key'), 'utf8')).trim();
  if (!key) throw Error('An Etherscan API key is required before deployment.');
  return key;
}

async function api(key, parameters, method = 'GET') {
  await delay(400);
  const body = new URLSearchParams({ apikey: key, module: 'contract', ...parameters });
  const url = 'https://api.etherscan.io/v2/api?chainid=11155111';
  try {
    const response = await fetch(method === 'GET' ? `${url}&${body}` : url, {
      method, ...(method === 'POST' ? { body } : {}), signal: AbortSignal.timeout(30000), redirect: 'error',
    });
    if (!response.ok) throw Error(`Etherscan HTTP ${response.status}`);
    return await response.json();
  } catch (error) { throw Error(String(error.message).replaceAll(key, '[redacted]')); }
}

export async function verifySource(address, contract, types = [], values = []) {
  const key = await etherscanKey();
  console.log(`Verify ${contract} at ${address}`);
  const existing = await api(key, { action: 'getsourcecode', address });
  if (existing.status !== '1') throw Error(`Etherscan: ${String(existing.result).replaceAll(key, '[redacted]')}`);
  if (!existing.result?.[0]?.SourceCode) {
    const [sourcePath, name] = contract.split(':');
    const artifact = JSON.parse(await readFile(join(contracts, 'out', `${name}.sol`, `${name}.json`), 'utf8'));
    const metadata = artifact.metadata;
    if (metadata.settings.compilationTarget[sourcePath] !== name) throw Error('Artifact compilation target mismatch');
    const sources = {};
    for (const [path, info] of Object.entries(metadata.sources)) {
      const file = resolve(contracts, path);
      if (!file.startsWith(resolve(contracts) + sep)) throw Error('Source path is outside contracts');
      const content = await readFile(file, 'utf8');
      if (keccak256(Buffer.from(content)) !== info.keccak256) throw Error(`Rebuild before verification: ${path} differs from its artifact`);
      sources[path] = { content };
    }
    const { compilationTarget, ...settings } = metadata.settings;
    settings.outputSelection = { '*': { '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'] } };
    const submitted = await api(key, {
      action: 'verifysourcecode', contractaddress: address, contractname: contract,
      codeformat: 'solidity-standard-json-input', compilerversion: `v${metadata.compiler.version}`,
      sourceCode: JSON.stringify({ language: metadata.language, sources, settings }),
      constructorArguements: AbiCoder.defaultAbiCoder().encode(types, values).slice(2),
    }, 'POST');
    if (submitted.status !== '1') throw Error(`Etherscan source submission: ${String(submitted.result).replaceAll(key, '[redacted]')}`);
    let done = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      await delay(3000);
      const result = await api(key, { action: 'checkverifystatus', guid: submitted.result });
      if (result.status === '1') { done = true; break; }
      if (!/pending|queue/i.test(String(result.result))) throw Error(`Etherscan source verification: ${String(result.result).replaceAll(key, '[redacted]')}`);
    }
    if (!done) throw Error(`Source verification remains pending for ${address}; rerun verification only.`);
  }
  const result = await api(key, { action: 'getsourcecode', address });
  if (result.status !== '1' || !result.result?.[0]?.SourceCode) throw Error(`Etherscan source not yet available for ${address}`);
  return { address, contract, status: 'source-verified', explorer: `https://sepolia.etherscan.io/address/${address}#code` };
}

export async function verifyProxy(address, implementation, rpc) {
  const code = (await rpc.getCode(address)).toLowerCase();
  if (code !== `0x363d3d373d3d3d363d73${implementation.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3`) throw Error(`Unexpected proxy code at ${address}`);
  const key = await etherscanKey();
  const existing = await api(key, { action: 'getsourcecode', address });
  const entry = existing.result?.[0];
  if (entry?.Implementation?.toLowerCase() !== implementation.toLowerCase()) {
    const submitted = await api(key, { action: 'verifyproxycontract', address, expectedimplementation: implementation }, 'POST');
    if (submitted.status !== '1') throw Error(`Etherscan proxy verification: ${String(submitted.result).replaceAll(key, '[redacted]')}`);
    let done = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      await delay(3000);
      const result = await api(key, { action: 'checkproxyverification', guid: submitted.result });
      if (result.status === '1') { done = true; break; }
      if (!/pending|queue/i.test(String(result.result))) throw Error(`Etherscan proxy verification: ${String(result.result).replaceAll(key, '[redacted]')}`);
    }
    if (!done) throw Error(`Proxy verification remains pending for ${address}; rerun verification only.`);
  }
  console.log(`Verified EIP-1167 proxy ${address}`);
  return { address, implementation, status: 'proxy-verified', runtimeBytes: 45, explorer: `https://sepolia.etherscan.io/address/${address}#code` };
}
