import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';

export type WorkerFiles = Readonly<{
  workerId: string;
  workspace: string;
  keyFile: string;
  runtimeRoot: string;
  image: string;
  model: string;
  brokerUrl: string;
  brokerToken: string;
  mcpToken: string;
}>;

function inside(root: string, path: string): boolean {
  return isAbsolute(path) && resolve(path).startsWith(resolve(root) + sep);
}

/** Only the companion supplies WorkerFiles. Never merge model-supplied Docker args or env. */
export async function workerDockerArgs(files: WorkerFiles): Promise<string[]> {
  if (!/^[\w-]+$/.test(files.workerId)) throw new Error('invalid worker ID');
  const workerRoot = resolve(files.runtimeRoot, 'workers', files.workerId);
  if (!inside(workerRoot, files.workspace) || !inside(workerRoot, files.keyFile)) throw new Error('worker files outside private root');
  const [root, workspace, key, workspaceInfo, keyInfo] = await Promise.all([
    realpath(workerRoot), realpath(files.workspace), realpath(files.keyFile), lstat(files.workspace), lstat(files.keyFile)
  ]);
  if (!inside(root, workspace) || !inside(root, key) || !workspaceInfo.isDirectory() || !keyInfo.isFile() ||
    workspaceInfo.isSymbolicLink() || keyInfo.isSymbolicLink()) throw new Error('invalid worker mounts');
  if ([files.workspace, files.keyFile].some(path => /[,\r\n]/.test(path))) throw new Error('invalid mount path');
  if (!/^https?:\/\/[\w.:-]+\/v1$/.test(files.brokerUrl)) throw new Error('invalid broker URL');
  if (!/^[\w./:-]+@sha256:[a-fA-F0-9]{64}$/.test(files.image)) throw new Error('image must be pinned by digest');
  if (!/^[\w.-]+$/.test(files.model)) throw new Error('invalid model');
  const provider = `model_provider="local_broker"`;
  const base = `model_providers.local_broker.base_url="${files.brokerUrl}"`;
  return [
    'run', '--rm', '-i', '--read-only', '--network', 'act-workers', '--cap-drop=ALL', '--security-opt=no-new-privileges',
    '--pids-limit=128', '--memory=1g', '--cpus=1', '--user=10001:10001',
    '--tmpfs=/tmp:rw,nosuid,nodev,size=64m', '--tmpfs=/home/worker:rw,nosuid,nodev,size=64m',
    '--mount', `type=bind,src=${workspace},dst=/workspace`,
    '--mount', `type=bind,src=${key},dst=/run/worker/key,readonly`,
    '--env', 'HOME=/home/worker', '--env', 'CODEX_HOME=/home/worker/.codex',
    '--env', `ACT_INFERENCE_TOKEN=${files.brokerToken}`, '--env', `ACT_MCP_TOKEN=${files.mcpToken}`,
    files.image, 'codex', 'exec', '--json', '--ephemeral', '--ignore-user-config', '--sandbox', 'workspace-write',
    '-C', '/workspace', '-m', files.model, '-c', provider, '-c', base,
    '-c', 'model_providers.local_broker.env_key="ACT_INFERENCE_TOKEN"', '-c', 'model_providers.local_broker.wire_api="responses"', '-'
  ];
}
