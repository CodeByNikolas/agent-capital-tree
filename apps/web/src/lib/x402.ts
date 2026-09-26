// x402 (HTTP 402 "Payment Required") core types shared by the client and server.
//
// Design for Agent Capital Tree:
//  - Settlement asset is real Circle USDC on Ethereum Sepolia (6 decimals) — x402 is
//    USDC-native, so an agent pays a service directly in USDC and the server verifies the
//    transfer on-chain before serving the resource.
//  - Every payment is bound to the paying agent's ENS identity in the capital tree
//    (`<label>.…​.agentcapitaltree.eth`) and is only accepted when the agent's on-chain
//    mandate (EAC authority + policy) covers the spend. ENS is the payer identity; the
//    mandate is the spend gate; USDC is the rail.
//
// This module is isomorphic (no secrets, no Node-only APIs) so both the browser panel and
// the API routes can import the types and the X-PAYMENT header codec.

import type { Address, Hex } from "viem";

export const X402_VERSION = 1;
export const SEPOLIA_CHAIN_ID = 11155111;
/** CAIP-2 network identifier used in x402 payment requirements. */
export const SEPOLIA_NETWORK = `eip155:${SEPOLIA_CHAIN_ID}` as const;

/** Official Circle USDC on Ethereum Sepolia. */
export const USDC_SEPOLIA = {
  address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as Address,
  symbol: "USDC",
  decimals: 6,
} as const;

/** ERC-20 Transfer(address,address,uint256) topic, used to verify settlement on-chain. */
export const ERC20_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as Hex;

/** One entry the server is willing to sell for USDC over x402. */
export interface ServiceListing {
  id: string;
  /** The service's ENS name — its identity/branding in the agentcapitaltree namespace. */
  ensName: string;
  name: string;
  description: string;
  /** Price in raw USDC units (6 decimals), decimal string. */
  priceRaw: string;
  /** Human price, e.g. "0.10". */
  priceDisplay: string;
  payTo: Address;
  mimeType: string;
}

/** A single acceptable way to pay, per the x402 "accepts" array. */
export interface X402PaymentRequirements {
  scheme: "exact";
  network: string;
  /** ERC-20 asset address (USDC). */
  asset: Address;
  assetSymbol: string;
  assetDecimals: number;
  /** Required amount in raw asset units, decimal string. */
  maxAmountRequired: string;
  payTo: Address;
  /** The resource being purchased (service id). */
  resource: string;
  description: string;
  mimeType: string;
  maxTimeoutSeconds: number;
  /** Agent Capital Tree extension: the service's ENS identity. */
  extra: { serviceEnsName: string };
}

/** Body returned with an HTTP 402 response. */
export interface X402Challenge {
  x402Version: number;
  error: string;
  accepts: X402PaymentRequirements[];
}

/** Decoded `X-PAYMENT` header: settlement proof + the paying agent's ENS identity. */
export interface X402PaymentPayload {
  x402Version: number;
  scheme: "exact";
  network: string;
  resource: string;
  payload: {
    txHash: Hex;
    from: Address;
    payTo: Address;
    asset: Address;
    /** Raw asset units actually transferred, decimal string. */
    amount: string;
    /** The paying agent's capital-tree node id. */
    nodeId: string;
    /** The paying agent's derived ENS name, bound to the payment. */
    agentEnsName: string;
  };
}

/** Settlement receipt returned in the `X-PAYMENT-RESPONSE` header after verification. */
export interface X402Receipt {
  settled: true;
  txHash: Hex;
  network: string;
  asset: Address;
  amount: string;
  payTo: Address;
  payer: {
    address: Address;
    nodeId: string;
    ensName: string;
  };
  service: { id: string; ensName: string };
  settledAtBlock: string;
}

function toBase64(value: string): string {
  if (typeof btoa === "function") return btoa(value);
  // Node fallback (API routes may run before btoa is polyfilled).
  return Buffer.from(value, "utf8").toString("base64");
}

function fromBase64(value: string): string {
  if (typeof atob === "function") return atob(value);
  return Buffer.from(value, "base64").toString("utf8");
}

/** Encode an X-PAYMENT header value (base64 JSON), per the x402 wire format. */
export function encodePaymentHeader(payload: X402PaymentPayload): string {
  return toBase64(JSON.stringify(payload));
}

/** Decode and shallow-validate an X-PAYMENT header value. Throws on malformed input. */
export function decodePaymentHeader(header: string): X402PaymentPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64(header.trim()));
  } catch {
    throw new Error("The X-PAYMENT header is not valid base64 JSON.");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("The X-PAYMENT header is empty.");
  const candidate = parsed as Partial<X402PaymentPayload> & { payload?: Record<string, unknown> };
  const inner = candidate.payload;
  if (
    candidate.scheme !== "exact" ||
    typeof candidate.network !== "string" ||
    typeof candidate.resource !== "string" ||
    !inner ||
    typeof inner.txHash !== "string" ||
    typeof inner.from !== "string" ||
    typeof inner.payTo !== "string" ||
    typeof inner.asset !== "string" ||
    typeof inner.amount !== "string" ||
    typeof inner.nodeId !== "string" ||
    typeof inner.agentEnsName !== "string"
  ) {
    throw new Error("The X-PAYMENT header is missing required fields.");
  }
  return parsed as X402PaymentPayload;
}
