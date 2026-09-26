// Dashboard dark tokens from apps/web/src/app/globals.css. The parity test catches drift.
export const dashboardTokens = {
  background: [0.17, 0.012, 155], foreground: [0.94, 0.005, 155],
  card: [0.215, 0.015, 155], primary: [0.79, 0.075, 153],
  mutedForeground: [0.76, 0.008, 155], accent: [0.33, 0.026, 155],
  destructive: [0.73, 0.13, 28], border: [0.38, 0.01, 155],
  ring: [0.72, 0.055, 155], soft: [0.255, 0.014, 155]
};

// SVG renderers use sRGB; convert the dashboard's OKLCH tokens without a browser.
function srgb([l, c, h]) {
  const a = c * Math.cos(h * Math.PI / 180), b = c * Math.sin(h * Math.PI / 180);
  const x = (l + .3963377774 * a + .2158037573 * b) ** 3;
  const y = (l - .1055613458 * a - .0638541728 * b) ** 3;
  const z = (l - .0894841775 * a - 1.291485548 * b) ** 3;
  return '#' + [4.0767416621*x - 3.3077115913*y + .2309699292*z,
    -1.2684380046*x + 2.6097574011*y - .3413193965*z,
    -.0041960863*x - .7034186147*y + 1.707614701*z].map(v => {
      const channel = v <= .0031308 ? 12.92*v : 1.055*v**(1/2.4)-.055;
      return Math.round(Math.min(1, Math.max(0, channel))*255).toString(16).padStart(2, '0');
    }).join('');
}
export const theme = Object.fromEntries(Object.entries(dashboardTokens).map(([name, value]) => [name, srgb(value)]));
