import manifest from '../deployments/usdc-sepolia.json' with { type: 'json' };
import { z } from '../packages/plugin/node_modules/zod/index.js';
import { openWalletBrowser } from './open-wallet-browser.mjs';
import { demoBudgetSchema } from '../packages/plugin/demo-budget.mjs';

export const rootSetupSpec = {
  description: 'Ask the user for the shared capital limit before setup. No assumed amount. Prepare a Sepolia wallet handoff; only the owner signs.',
  schema: z.object({ label: z.string().regex(/^[a-z][a-z0-9-]{0,30}$/, 'label: use 1–31 lowercase ASCII letters, digits or hyphens; start with a letter. Spaces and uppercase letters are not allowed.').describe('Optional ENS label: 1–31 lowercase ASCII letters, digits or hyphens, starting with a letter. Omit to generate a name.'),
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
