import { spawn } from 'node:child_process';
import { join } from 'node:path';

// Delegate to the user's OS browser association: normal profile and wallet extensions.
// Never use a chat browser, remote browser, incognito flag or temporary user-data-dir.
export function browserCommand(url, platform = process.platform, env = process.env) {
  const target = new URL(url);
  if (!['https://kanoki-app.vercel.app', 'https://agent-capital-tree.vercel.app', 'https://agent-capital-tree-silk.vercel.app'].includes(target.origin) || target.pathname !== '/setup' || target.username || target.password) {
    throw new Error('Only the public Kanoki wallet setup page can be opened.');
  }
  if (platform === 'win32') return { command: join(env.SystemRoot ?? 'C:\\Windows','System32','rundll32.exe'), args:['url.dll,FileProtocolHandler',target.href] };
  if (platform === 'darwin') return { command:'/usr/bin/open', args:[target.href] };
  if (platform === 'linux') return env.WSL_DISTRO_NAME
    ? { command:'/mnt/c/Windows/System32/rundll32.exe',args:['url.dll,FileProtocolHandler',target.href] }
    : { command:'xdg-open',args:[target.href] };
  throw new Error('Open the setup link in your wallet-enabled system browser.');
}

export async function openWalletBrowser(url, launch = spawn) {
  try {
    const { command,args } = browserCommand(url);
    await new Promise((resolve,reject)=>{
      const child = launch(command,args,{stdio:'ignore',shell:false,windowsHide:true});
      const timer = setTimeout(()=>{child.unref();reject(new Error('Browser launch not confirmed'));},8000);
      child.once('error',()=>{clearTimeout(timer);reject(new Error('Browser launch failed'));});
      child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('Browser launch failed'));});
    });
    return {opened:true,method:'system-default',walletDetected:false,
      note:'Browser launch accepted. Wallet injection and signatures must be checked in that browser.'};
  } catch {
    return {opened:false,method:'manual',walletDetected:false,
      note:'Automatic opening was not confirmed. Open the setup URL in your normal browser profile with the wallet extension.'};
  }
}
