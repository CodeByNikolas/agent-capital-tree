import { cp, copyFile, mkdir } from 'node:fs/promises';

const destination = new URL('./bundle/visual-assets/', import.meta.url);
await mkdir(destination, { recursive: true });
await cp(new URL('./visual-assets/', import.meta.url), destination, { recursive: true });
await copyFile(new URL(import.meta.resolve('@resvg/resvg-wasm/index_bg.wasm')), new URL('resvg.wasm', destination));
