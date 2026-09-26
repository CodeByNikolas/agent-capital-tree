import { z } from 'zod';

export const DEMO_BUDGET_MESSAGE = 'budgetRaw: provide the user-confirmed shared capital limit as a positive uint256 integer in raw Test-USDC units (Sepolia, 6 decimals). No default and no demo maximum. 1 USDC = 1000000 raw units.';
export const demoBudgetSchema = z.string().refine(value => /^[1-9]\d{0,77}$/.test(value) && BigInt(value) < 2n ** 256n, DEMO_BUDGET_MESSAGE).describe(DEMO_BUDGET_MESSAGE);
