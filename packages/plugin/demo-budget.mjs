import { z } from 'zod';

export const DEMO_BUDGET_MESSAGE = 'budgetRaw must be 1–100000 raw Test-USDC units (6 decimals; maximum 0.10 Test-USDC). This is the demo setup/input limit, NOT an on-chain balance limit or a budget per child. Example: "100000" for the entire tree, "20000" for 0.02.';
export const demoBudgetSchema = z.string().refine(value => /^[1-9]\d{0,5}$/.test(value) && BigInt(value) <= 100000n, DEMO_BUDGET_MESSAGE);
