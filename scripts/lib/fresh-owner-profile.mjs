import assert from 'node:assert/strict';
import { lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const markerPath = (base, name) => join(base, 'browser-runtime', `fresh-owner-resume-${name}.json`);

export async function createFreshOwnerProfile(base, name) {
  assert(/^jury-e2e-resume-[a-z0-9]+$/.test(name), 'Use a dedicated new jury-e2e resume profile name');
  const profile = join(base, 'browser', name);
  await mkdir(profile, { mode: 0o700 }); // EEXIST means this is not a fresh profile.
  return profile;
}

export async function recordFreshOwnerProfile(base, name, owner, extensionId) {
  const profile = join(base, 'browser', name);
  const info = await lstat(profile);
  assert(info.isDirectory());
  const marker = { purpose: 'owner-recovery-resume', profile: name, owner: owner.toLowerCase(),
    extensionId, device: info.dev, inode: info.ino, createdAt: new Date().toISOString() };
  await writeFile(markerPath(base, name), `${JSON.stringify(marker)}\n`, { flag: 'wx', mode: 0o600 });
}

export async function consumeFreshOwnerProfile(base, name, owner, extensionId) {
  const markerFile = markerPath(base, name);
  const marker = JSON.parse(await readFile(markerFile, 'utf8'));
  const info = await lstat(join(base, 'browser', name));
  assert(/^jury-e2e-resume-[a-z0-9]+$/.test(name));
  assert(marker.purpose === 'owner-recovery-resume' && marker.profile === name);
  assert.equal(marker.owner, owner.toLowerCase());
  assert.equal(marker.extensionId, extensionId);
  assert(info.isDirectory() && info.dev === marker.device && info.ino === marker.inode);
  await rename(markerFile, `${markerFile}.used`); // One resume attempt per new profile.
}
