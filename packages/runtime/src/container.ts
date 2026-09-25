import { lstat, realpath, stat } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';

export type WorkerFiles = Readonly<{
  workerId: string;
  uid: number;
  gid: number;
  workspace: string;
  keyFile: string;
  gatewaySocket: string;
  runtimeRoot: string;
  imageId: string;
  model: string;
}>;

function inside(root: string, path: string): boolean {
  return isAbsolute(path) && resolve(path).startsWith(resolve(root) + sep);
}

export function workerContainerName(workerId: string): string {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(workerId)) throw new Error('invalid worker ID');
  return `act-worker-${workerId}`;
}

/** Only trusted companion values enter this fixed Docker invocation. */
export async function workerDockerArgs(files: WorkerFiles): Promise<string[]> {
  const name = workerContainerName(files.workerId);
  if (!Number.isSafeInteger(files.uid) || files.uid < 1 || !Number.isSafeInteger(files.gid) || files.gid < 1) throw new Error('invalid worker user');
  const workerRoot = resolve(files.runtimeRoot, 'workers', files.workerId);
  if (![files.workspace, files.keyFile, files.gatewaySocket].every(path => inside(workerRoot, path))) throw new Error('worker files outside private root');
  const [root, workspace, key, socket, rootInfo, workspaceInfo, keyInfo, socketInfo] = await Promise.all([
    realpath(workerRoot), realpath(files.workspace), realpath(files.keyFile), realpath(files.gatewaySocket),
    stat(workerRoot), lstat(files.workspace), lstat(files.keyFile), lstat(files.gatewaySocket)
  ]);
  if (![workspace, key, socket].every(path => inside(root, path)) || !workspaceInfo.isDirectory() ||
    !keyInfo.isFile() || !socketInfo.isSocket() || workspaceInfo.isSymbolicLink() ||
    keyInfo.isSymbolicLink() || socketInfo.isSymbolicLink()) throw new Error('invalid worker mounts');
  if ([rootInfo, workspaceInfo, keyInfo, socketInfo].some(info => info.uid !== files.uid) ||
    (rootInfo.mode & 0o777) !== 0o700 || (workspaceInfo.mode & 0o777) !== 0o700 ||
    ![0o400, 0o600].includes(keyInfo.mode & 0o777) || (socketInfo.mode & 0o777) !== 0o600) {
    throw new Error('worker mount permissions do not match container UID');
  }
  if ([files.workspace, files.keyFile, files.gatewaySocket].some(path => /[,\r\n]/.test(path))) throw new Error('invalid mount path');
  if (!/^sha256:[a-f0-9]{64}$/.test(files.imageId)) throw new Error('image must be pinned by local image ID');
  if (!/^[\w.-]+$/.test(files.model)) throw new Error('invalid model');
  return [
    'run', '--name', name, '--rm', '-i', '--read-only', '--network', 'none', '--cap-drop=ALL',
    '--security-opt=no-new-privileges', '--pids-limit=128', '--memory=1g', '--cpus=1',
    `--user=${files.uid}:${files.gid}`, '--stop-timeout=5',
    '--tmpfs=/tmp:rw,nosuid,nodev,size=64m,mode=1777',
    `--tmpfs=/home/worker:rw,nosuid,nodev,size=64m,uid=${files.uid},gid=${files.gid},mode=0700`,
    '--mount', `type=bind,src=${workspace},dst=/workspace`,
    '--mount', `type=bind,src=${key},dst=/run/worker/key,readonly`,
    '--mount', `type=bind,src=${socket},dst=/run/worker/gateway.sock`,
    '--env', 'HOME=/home/worker', '--env', 'CODEX_HOME=/home/worker/.codex',
    '--env', 'ACT_MCP_TOKEN=worker-local', '--env', 'ACT_INFERENCE_TOKEN=worker-local',
    '--env', 'ACT_RUNTIME_URL=http://127.0.0.1:8787',
    files.imageId, 'node', '/opt/act/bridge.mjs', files.model
  ];
}
