// The x402 service catalog: the resources this deployment sells for USDC.
//
// Kept server-oriented (payTo is resolved from env) but free of secrets, so the API routes
// and tests can share it. The browser never imports this; it fetches GET /api/x402/services.

import { getAddress, isAddress, type Address } from "viem";
import manifest from "../../../../deployments/usdc-sepolia.json";
import {
  SEPOLIA_NETWORK,
  USDC_SEPOLIA,
  X402_VERSION,
  type ServiceListing,
  type X402PaymentRequirements,
} from "@/lib/x402";

// Default recipient and seller ENS identity come from the current deployment.
// Override per-environment with X402_PAY_TO. Payments are real USDC transfers verifiable on
// sepolia.etherscan.io, so the recipient must be a wallet the operator controls.
const DEFAULT_PAY_TO = getAddress(manifest.deployer);

function resolvePayTo(): Address {
  const configured = process.env.X402_PAY_TO?.trim();
  if (configured && isAddress(configured)) return getAddress(configured);
  return DEFAULT_PAY_TO;
}

/** Static service definitions; priceRaw is in 6-decimal USDC units. */
const SERVICES: ReadonlyArray<Omit<ServiceListing, "payTo">> = [
  {
    id: "market-oracle",
    ensName: manifest.ensNamespace.name,
    name: "Market oracle snapshot",
    description: "A signed Sepolia market snapshot an agent can buy per call within its mandate.",
    priceRaw: "100000", // 0.10 USDC
    priceDisplay: "0.10",
    mimeType: "application/json",
  },
  {
    id: "tree-audit",
    ensName: manifest.ensNamespace.name,
    name: "Capital-tree risk audit",
    description: "An automated review of a vault subtree's exposure and policy headroom.",
    priceRaw: "250000", // 0.25 USDC
    priceDisplay: "0.25",
    mimeType: "application/json",
  },
  {
    id: "alpha-feed",
    ensName: manifest.ensNamespace.name,
    name: "Alpha research feed",
    description: "A premium research note delivered to the paying agent identity.",
    priceRaw: "500000", // 0.50 USDC
    priceDisplay: "0.50",
    mimeType: "application/json",
  },
];

export function getServiceCatalog(): ServiceListing[] {
  const payTo = resolvePayTo();
  return SERVICES.map((service) => ({ ...service, payTo }));
}

export function getService(id: string): ServiceListing | null {
  return getServiceCatalog().find((service) => service.id === id) ?? null;
}

/** Build the x402 payment requirements advertised in a 402 challenge for a service. */
export function toPaymentRequirements(service: ServiceListing): X402PaymentRequirements {
  return {
    scheme: "exact",
    network: SEPOLIA_NETWORK,
    asset: USDC_SEPOLIA.address,
    assetSymbol: USDC_SEPOLIA.symbol,
    assetDecimals: USDC_SEPOLIA.decimals,
    maxAmountRequired: service.priceRaw,
    payTo: service.payTo,
    resource: service.id,
    description: service.description,
    mimeType: service.mimeType,
    maxTimeoutSeconds: 600,
    extra: { serviceEnsName: service.ensName },
  };
}

export { X402_VERSION };
