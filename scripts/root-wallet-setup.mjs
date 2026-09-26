import manifest from '../deployments/usdc-sepolia.json' with { type: 'json' };
import { z } from '../packages/plugin/node_modules/zod/index.js';
import { openWalletBrowser } from './open-wallet-browser.mjs';
import { demoBudgetSchema } from '../packages/plugin/demo-budget.mjs';

export const rootSetupSpec = {
  description: 'Prepare a new Sepolia demo root with at most 0.10 Test-USDC and open the normal system browser with the existing wallet profile. Do not use an isolated chat browser. Only the owner reviews and signs; this tool sends no transaction.',
  schema: z.object({ label: z.string().regex(/^[a-z][a-z0-9-]{0,30}$/),
    budgetRaw: demoBudgetSchema,
    openBrowser: z.boolean().default(true) }).strict(), readOnly: false
};

export async function prepareRootSetup({ label, budgetRaw, openBrowser }) {
  const url = new URL('https://agent-capital-tree.vercel.app/setup');
  url.searchParams.set('action', 'create-root'); url.searchParams.set('label', label); url.searchParams.set('budget', budgetRaw);
  const browser = openBrowser ? await openWalletBrowser(url.href) : { opened: false, method: 'not-requested', walletDetected: false };
  return { network: 'Ethereum Sepolia', chainId: 11155111, ensName: `${label}.${manifest.ensNamespace.name}`, budgetRaw,
    budgetUSDC: (Number(budgetRaw) / 1000000).toString(), url: url.href, browser,
    transactionSubmitted: false,
    next: 'After the root creation receipt confirms, use the capital-mode MCP: selectCapitalRoot with this ENS, then prepareCapitalSetup (or prepareOperatorRecovery if already bound to another signer). The keyless three-tool MCP does not expose these finance setup tools. No restart is needed for root selection inside capital mode. Review existing funding before adding anything. No owner key enters the chat.' };
}
