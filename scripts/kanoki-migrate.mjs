import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const file = 'apps/web/src/app/globals.css';
let css = readFileSync(file, 'utf8');
css = css.slice(css.indexOf('* {'));
if (!css.startsWith('* {')) throw new Error('Missing CSS reset');
const aliases = {background:'surface',foreground:'ink',card:'surface-raised','card-foreground':'ink',popover:'surface-raised','popover-foreground':'ink',primary:'moss','primary-foreground':'on-moss',secondary:'moss-soft','secondary-foreground':'ink',muted:'surface-raised','muted-foreground':'ink-muted',accent:'moss-soft','accent-foreground':'ink',destructive:'signal',border:'line',input:'line',ring:'focus-ring',sidebar:'surface','sidebar-foreground':'ink','sidebar-primary':'moss','sidebar-primary-foreground':'on-moss','sidebar-accent':'moss-soft','sidebar-accent-foreground':'ink','sidebar-border':'line','sidebar-ring':'focus-ring',soft:'surface-raised',quiet:'ink-muted',brand:'moss'};
css = css.replace(/var\(--([\w-]+)(?:,[^)]*)?\)/g,(all,key)=>`var(--${aliases[key]??key})`);
css = css.replace(/@media \(prefers-color-scheme: dark\) \{[^\n]+\}\s*/g,'');
css = css.replace(/#[0-9a-fA-F]{3,8}\b/g,'var(--ink-muted)');
css = css.replace(/[^;{}]*(?:shadow|gradient|blur)[^;{}]*;?/g,'');
const spacing = [4,8,12,16,24,32,48];
const space = n => {const v=spacing.reduce((a,b)=>Math.abs(b-n)<Math.abs(a-n)?b:a);return `var(--space-${v/4})`;};
css = css.replace(/((?:padding|margin|gap|column-gap|row-gap)(?:-[\w]+)?\s*:)\s*([^;}]+)/g,(_,prop,value)=>prop+' '+value.replace(/(\d+(?:\.\d+)?)px/g,(_,n)=>Number(n)===0?'0':space(Number(n))));
css = css.replace(/border-radius:\s*[^;}]+/g,match=>`border-radius: var(--radius-${/50%|999|20px/.test(match)?'full':/3px|4px/.test(match)?'sm':'md'})`);
css = css.replace(/font-size:\s*[^;}]+/g,match=>`font-size: ${/1[1-4]px|0\.\d|\.\d/.test(match)?13:/1[5-7]px|1rem/.test(match)?15:18}px`);
css = css.replace(/font-weight:\s*(?:[5-9]\d\d)/g,'font-weight: 600');
css = css.replace(/line-height:\s*[^;}]+/g,'line-height: 24px');
css = css.replace(/letter-spacing:\s*[^;}]+;?/g,'');
css = css.replace(/font-family:\s*[^;}]+/g,match=>match.includes('mono')?'font-family: var(--font-mono)':'font-family: var(--font-sans)');
// Theme and shared components own focus and state changes.
css = css.replace(/outline:\s*[^;}]+/g,'outline: 2px solid var(--focus-ring)').replace(/outline-offset:\s*[^;}]+/g,'outline-offset: 2px');
css = css.replace(/transition:\s*[^;}]+/g,'transition: color 150ms ease-out, background-color 150ms ease-out, border-color 150ms ease-out');
css = css.replace(/\.wallet-address \{ display: none; \}/g,'');
writeFileSync(file,css);
// Styling belongs to token-backed component selectors, not generated utility strings.
for (const name of readdirSync('apps/web/src/components/ui')) {
  if (!name.endsWith('.tsx') || ['sidebar.tsx','button.tsx','badge.tsx','alert.tsx'].includes(name)) continue;
  const p=`apps/web/src/components/ui/${name}`;
  let code=readFileSync(p,'utf8');
  code=code.replace(/className="[^"]*"/g,'className=""');
  code=code.replace(/className=\{cn\(\s*"[^"]*"/g,'className={cn(""');
  code=code.replace(/<TooltipPrimitive.Arrow[^\n]+\/>/g,'');
  writeFileSync(p,code);
}
