// Plain-language, one-line definitions for the domain jargon a first-time
// viewer meets in the dashboard. Consumed by <InfoHint term="…" />.

export interface GlossaryEntry {
  label: string;
  text: string;
}

export const glossary = {
  mandate: {
    label: "Mandate",
    text: "What an agent is allowed to do with its vault: which assets, how much per action, which capabilities, and until when.",
  },
  effectivePolicy: {
    label: "Effective mandate",
    text: "The strictest combination of this vault's own policy and every ancestor's limits. A child can never exceed any parent.",
  },
  authorizedCapabilities: {
    label: "Allowed right now",
    text: "The on-chain EAC roles this vault holds at this moment. It can be narrower than the policy if roles were tightened or revoked.",
  },
  inheritedLimits: {
    label: "Limits inherited from parents",
    text: "Every parent on the path to the owner caps this vault. The effective mandate is the intersection of them all.",
  },
  held: {
    label: "Held now",
    text: "Tokens currently sitting in this vault, including amounts already committed to liquidity or delegated onward.",
  },
  free: {
    label: "Available",
    text: "Spendable balance the agent can still act on — separate from capital allocated to children or locked in LP positions.",
  },
  allocated: {
    label: "Sent to children",
    text: "Capital actually transferred out to child vaults. It is a real transfer between vaults, not just a budget label.",
  },
  owner: {
    label: "Owner",
    text: "The human who funds the root and keeps an independent recovery path, separate from any agent, ENS name, or indexer.",
  },
  operator: {
    label: "Operator",
    text: "The master agent bound to the root by the owner. It can delegate capital into children within its mandate.",
  },
  agent: {
    label: "Agent",
    text: "The account authorized to act for a specific vault. Its authority comes from on-chain roles, not from a model-supplied ID.",
  },
  runtime: {
    label: "Runtime link",
    text: "A connected worker process. A live mandate does not mean a bot is actually running — the two are tracked separately.",
  },
  preview: {
    label: "Preview data",
    text: "Illustrative sample records, clearly labeled. They cannot be used for wallet actions; load a live root for real chain state.",
  },
  indexed: {
    label: "Indexed",
    text: "An event pulled from the activity indexer and independently verified against the canonical Sepolia receipt.",
  },
  finality: {
    label: "Finality",
    text: "How settled a transaction is on-chain: not verified, pending, confirmed, or finalized.",
  },
} as const;

export type GlossaryTerm = keyof typeof glossary;
