// Project-provisioned host settings only. Root identity and financial authority always come from the saved session.
import { lstat, readFile } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { NativeCodexLauncher } from './dist/index.js';

export const workerHostSchema = z.object({
  imageId:z.string().regex(/^sha256:[a-f0-9]{64}$/),
  models:z.array(z.string().regex(/^[\w.-]+$/)).min(1),
  codexBinary:z.string().refine(isAbsolute),codexHome:z.string().refine(isAbsolute),
  openaiApiKeyFile:z.string().refine(isAbsolute).optional(),
  reasoningEffort:z.literal('high').optional(),
  childGasWei:z.string().regex(/^(0|[1-9]\d*)$/).refine(value=>BigInt(value)<=10000000000000000n)
}).strict();

export async function loadWorkerHost(base) {
  const file=join(base,'worker-host.json');
  let info;
  try {info=await lstat(file);}catch(error){if(error.code==='ENOENT')return null;throw error;}
  if(!info.isFile()||info.isSymbolicLink()||info.uid!==process.getuid()||(info.mode&0o777)!==0o600)throw new Error('WORKER_HOST_INVALID: worker-host.json must be an owner-only private file.');
  const parsed=workerHostSchema.safeParse(JSON.parse(await readFile(file,'utf8')));
  if(!parsed.success)throw new Error('WORKER_HOST_INVALID: Project worker settings are invalid. No capital will be allocated to a worker.');
  return {...parsed.data,mode:'workers',inference:'codex',childGasWei:BigInt(parsed.data.childGasWei),workerUid:process.getuid(),workerGid:process.getgid()};
}

export async function checkWorkerHost(config, model=config?.models[0]) {
  if(!config) return {status:'unavailable',workerReady:false,workerStarted:false,next:'Project operator must provision the private worker-host.json, pinned Docker image and dedicated native Codex authentication. Users should not configure this per vault. No worker allocation was requested.'};
  if(!config.models.includes(model))return {status:'blocked',workerReady:false,workerStarted:false,next:'Requested model is not approved in the project worker configuration.'};
  const launcher=new NativeCodexLauncher(config);
  try {
    const image=await promisify(execFile)('docker',['image','inspect',config.imageId,'--format','{{.Id}}'],{timeout:20000});
    if(image.stdout.trim()!==config.imageId)throw new Error('Worker image mismatch');
    await launcher.ensureAvailable(model);
    return {status:'ready',workerReady:true,workerStarted:false,model,models:config.models,childGasWei:config.childGasWei,next:'Worker prerequisites checked. spawnChild uses the saved root signer and its shared capital limit; no additional owner signature is needed per child.'};
  }catch{return {status:'unavailable',workerReady:false,workerStarted:false,next:'Worker preflight failed: check the pinned Docker image, dedicated Codex binary/login or API key and approved model access. No child capital was allocated.'};}
  finally {await launcher.close();}
}
