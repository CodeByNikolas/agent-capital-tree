import { cp, copyFile, mkdir } from 'node:fs/promises';

const destination = new URL('./bundle/visual-assets/', import.meta.url);
await mkdir(destination, { recursive: true });
await copyFile(new URL('../../apps/web/src/app/tokens.css', import.meta.url), new URL('./visual-assets/tokens.css', import.meta.url));
await copyFile(new URL('../export/kanoki-logo-512.png', import.meta.url), new URL('./visual-assets/kanoki-logo-512.png', import.meta.url));
await cp(new URL('./visual-assets/', import.meta.url), destination, { recursive: true });
await copyFile(new URL(import.meta.resolve('@resvg/resvg-wasm/index_bg.wasm')), new URL('resvg.wasm', destination));
