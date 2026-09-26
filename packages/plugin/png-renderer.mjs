import { readFile } from 'node:fs/promises';
import { initWasm, Resvg } from '@resvg/resvg-wasm';

let ready;
export function prepareRenderer() {
  return ready ??= (async () => {
    const wasm = await readFile(new URL('./visual-assets/resvg.wasm', import.meta.url))
      .catch(() => readFile(new URL(import.meta.resolve('@resvg/resvg-wasm/index_bg.wasm'))));
    const fonts = await Promise.all(['Manrope.ttf', 'Manrope-Bold.ttf', 'DMMono-Regular.ttf'].map(name =>
      readFile(new URL(`./visual-assets/${name}`, import.meta.url))));
    await initWasm(wasm);
    return fonts;
  })();
}

export async function svgAsPng(svg) {
  const fontBuffers = await prepareRenderer();
  const renderer = new Resvg(svg, { font: { fontBuffers, defaultFontFamily: 'Manrope' } });
  let rendered;
  try { rendered = renderer.render(); return Buffer.from(rendered.asPng()); }
  finally { rendered?.free(); renderer.free(); }
}
