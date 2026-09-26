import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('./visual-assets/tokens.css', import.meta.url), 'utf8').split(':root[data-theme=')[0];
const token = name => { const match = css.match(new RegExp('--' + name + ':\\s*(#[a-fA-F0-9]+)')); if (!match) throw new Error('Missing Kanoki token: ' + name); return match[1]; };
export const theme = { background: token('surface'), foreground: token('ink'), card: token('surface-raised'), primary: token('moss'), mutedForeground: token('ink-muted'), accent: token('moss-soft'), destructive: token('signal'), border: token('line'), ring: token('moss'), soft: token('surface-raised'), gold: token('gold'), goldInk: token('gold-ink'), goldSoft: token('gold-soft'), signalSoft: token('signal-soft') };
export const dashboardTokens = theme;
