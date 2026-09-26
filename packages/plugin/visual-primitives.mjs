import { theme as t } from './dashboard-theme.mjs';
export { t };
export const WIDTH = 1040;
export const xml = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' })[c]);
export const short = (value, size = 72) => String(value).length > size ? `${String(value).slice(0, size - 1)}…` : String(value);
export function lines(value, size = 70) {
  return String(value).match(new RegExp(`.{1,${size}}(?:\\s|$)|.{1,${size}}`, 'gu')) ?? [''];
}
export function text(x, y, value, { size = 15, color = t.foreground, weight = 400, mono = false, display = false, anchor = 'start' } = {}) {
  return `<text x="${x}" y="${y}" fill="${color}" font-family="${mono ? 'IBM Plex Mono' : display ? 'Fraunces' : 'IBM Plex Sans'}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${xml(value)}</text>`;
}
export const rect = (x, y, width, height, fill = t.card, stroke = t.border, radius = 8) =>
  `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}"/>`;
export function frame(height, title, subtitle, body, footer) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-label="${xml(title)}">
    <rect width="${WIDTH}" height="${height}" fill="${t.background}"/>
    ${rect(0, 0, WIDTH, 56, t.background, t.border, 0)}
    ${text(32, 35, 'Kanoki', { size: 20, display: true, weight: 500 })}
    ${text(144, 35, 'Agent Capital Tree', { size: 13, color: t.mutedForeground })}
    ${text(WIDTH-32, 35, 'sepolia', { size: 13, mono: true, color: t.primary, anchor: 'end' })}
    ${text(32, 112, title, { size: 44, display: true, weight: 500 })}${text(32, 145, subtitle, { color: t.mutedForeground })}
    ${body}${text(32, height-24, footer, { size: 12, color: t.mutedForeground })}
  </svg>`;
}
export function amount(raw) {
  const value = BigInt(raw);
  const decimals = (value % 1_000_000n).toString().padStart(6, '0');
  return `${(value / 1_000_000n).toLocaleString('en-US')}${decimals ? `.${decimals}` : ''}`;
}
