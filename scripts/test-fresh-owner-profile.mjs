import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFreshOwnerProfile, recordFreshOwnerProfile, consumeFreshOwnerProfile } from './lib/fresh-owner-profile.mjs';

const base = await mkdtemp(join(tmpdir(), 'act-fresh-owner-'));
const name = 'jury-e2e-resume-test';
try {
  await mkdir(join(base, 'browser'));
  await mkdir(join(base, 'browser-runtime'));
  await createFreshOwnerProfile(base, name);
  await assert.rejects(() => createFreshOwnerProfile(base, name), { code: 'EEXIST' });
  await recordFreshOwnerProfile(base, name, '0x1234', 'extension-id');
  await assert.rejects(() => consumeFreshOwnerProfile(base, name, '0x5678', 'extension-id'));
  await consumeFreshOwnerProfile(base, name, '0x1234', 'extension-id');
  await assert.rejects(() => consumeFreshOwnerProfile(base, name, '0x1234', 'extension-id'), { code: 'ENOENT' });
  console.log('Fresh owner profile requires new directory and consumes one-use marker');
} finally { await rm(base, { recursive: true, force: true }); }
