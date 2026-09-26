import { z } from '../packages/plugin/node_modules/zod/index.js';
import { openWalletBrowser } from './open-wallet-browser.mjs';

export const rootSetupSpec = {
  description: 'Prepare a new Sepolia demo root with at most 0.10 Test-USDC and open the normal system browser with the existing wallet profile. Do not use an isolated chat browser. Only the owner reviews and signs; this tool sends no transaction.',
  schema: z.object({ label: z.string().regex(/^[a-z][a-z0-9-]{0,30}$/),
    budgetRaw: z.string().max(6).regex(/^[1-9]\d*$/).refine(value => BigInt(value) <= 100000n),
    openBrowser: z.boolean().default(true) }).strict(), readOnly: false
};

export async function prepareRootSetup({ label, budgetRaw, openBrowser }) {
  const url = new URL('https://agent-capital-tree-silk.vercel.app/setup');
  url.searchParams.set('action', 'create-root'); url.searchParams.set('label', label); url.searchParams.set('budget', budgetRaw);
  const browser = openBrowser ? await openWalletBrowser(url.href) : { opened: false, method: 'not-requested', walletDetected: false };
  return { network: 'Ethereum Sepolia', chainId: 11155111, ensName: `${label}.agentcapitalusdc.eth`, budgetRaw,
    budgetUSDC: (Number(budgetRaw) / 1000000).toString(), url: url.href, browser,
    next: 'Owner reviews and signs in their normal wallet browser. Point the capital MCP at this new root ENS to authorize its local agent key. No owner key enters the chat.' };
}
