import { theme as t } from './dashboard-theme.mjs';
export { t };
export const WIDTH = 1040;
export const xml = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' })[c]);
export const short = (value, size = 72) => String(value).length > size ? `${String(value).slice(0, size - 1)}…` : String(value);
export function lines(value, size = 70) {
  return String(value).match(new RegExp(`.{1,${size}}(?:\\s|$)|.{1,${size}}`, 'gu')) ?? [''];
}
export function text(x, y, value, { size = 15, color = t.foreground, weight = 500, mono = false, anchor = 'start' } = {}) {
  return `<text x="${x}" y="${y}" fill="${color}" font-family="${mono ? 'DM Mono' : 'Manrope'}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${xml(value)}</text>`;
}
export const rect = (x, y, width, height, fill = t.card, stroke = t.border, radius = 10) =>
  `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}"/>`;
export function frame(height, title, subtitle, body, footer) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-label="${xml(title)}">
    <rect width="${WIDTH}" height="${height}" fill="${t.background}"/>
    ${rect(0, 0, WIDTH, 74, t.card, t.border, 0)}${rect(28, 20, 34, 34, t.primary, t.primary, 9)}
    <path d="M 39 31 H 51 M 45 31 V 42 M 38 46 V 42 H 52 V 46" fill="none" stroke="${t.background}" stroke-width="2"/>
    ${text(74, 42, 'Agent Capital Tree', { size: 18, weight: 800 })}
    ${text(WIDTH-28, 42, 'SEPOLIA · TEST ASSETS', { size: 12, mono: true, color: t.primary, anchor: 'end' })}
    ${text(32, 117, title, { size: 29, weight: 800 })}${text(32, 145, subtitle, { color: t.mutedForeground })}
    ${body}${text(32, height-24, footer, { size: 12, color: t.mutedForeground })}
  </svg>`;
}
export function amount(raw) {
  const value = BigInt(raw);
  const decimals = (value % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return `${(value / 1_000_000n).toLocaleString('en-US')}${decimals ? `.${decimals}` : ''}`;
}
