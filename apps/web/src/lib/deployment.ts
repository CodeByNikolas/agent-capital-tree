import { getAddress, isAddress, type Address, type Hex } from "viem";
import usdcSepoliaManifest from "../../../../deployments/usdc-sepolia.json";

const USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

export interface PublicDeployment {
  id: "usdc";
  paymentsSupported: boolean;
  demoQuoteAddress: Address | null;
  chainId: number;
  network: string;
  status: string;
  namespaceName: string;
  namespaceExpiry: string | null;
  controllerAddress: Address | null;
  tokenAddresses: readonly [Address, Address] | null;
  poolId: Hex | null;
  poolConfigured: boolean;
  contractsConfigured: boolean;
}

interface DeploymentManifest {
  chainId: number;
  network: string;
  status: string;
  ensNamespace?: { name?: string; expiry?: string } | null;
  contracts: { CapitalController?: { address?: unknown } };
  tokens?: readonly { address?: unknown; symbol?: unknown; decimals?: unknown; valueless?: unknown }[];
  uniswap?: { poolId?: unknown; initialization?: unknown; seeded?: { rootId?: unknown } };
}

function pickAddress(values: readonly unknown[]): Address | null {
  for (const value of values) {
    if (typeof value === "string" && isAddress(value)) return getAddress(value);
  }
  return null;
}

export function getPublicDeployment(): PublicDeployment {
  const manifest = usdcSepoliaManifest as unknown as DeploymentManifest;
  const controllerAddress = pickAddress([manifest.contracts.CapitalController?.address]);
  const token0 = pickAddress([manifest.tokens?.[0]?.address]);
  const token1 = pickAddress([manifest.tokens?.[1]?.address]);
  const tokenAddresses = token0 && token1 ? [token0, token1] as const : null;
  const usdcAtIndexZero = token0?.toLowerCase() === USDC_ADDRESS.toLowerCase();
  const demoQuoteAddress = usdcAtIndexZero && token1 && token1.toLowerCase() !== USDC_ADDRESS.toLowerCase() &&
    manifest.tokens?.[1]?.symbol === "DEMO-USD" && manifest.tokens[1].decimals === 6 && manifest.tokens[1].valueless === true
    ? token1
    : null;
  const poolIdValue = manifest.uniswap?.poolId;
  const poolId = typeof poolIdValue === "string" && /^0x[0-9a-fA-F]{64}$/.test(poolIdValue)
    ? poolIdValue as Hex
    : null;
  const status = manifest.status;
  const contractsConfigured = (status === "contracts-deployed-pool-pending" || status === "deployed") &&
    controllerAddress !== null && tokenAddresses !== null;

  return {
    id: "usdc",
    paymentsSupported: contractsConfigured && usdcAtIndexZero,
    demoQuoteAddress: contractsConfigured ? demoQuoteAddress : null,
    chainId: manifest.chainId,
    network: manifest.network,
    status,
    namespaceName: manifest.ensNamespace?.name ?? "kanoki.eth",
    namespaceExpiry: manifest.ensNamespace?.expiry ?? null,
    controllerAddress,
    tokenAddresses,
    poolId,
    poolConfigured: contractsConfigured && status === "deployed" && poolId !== null &&
      manifest.uniswap?.initialization !== undefined && manifest.uniswap?.seeded !== undefined,
    contractsConfigured,
  };
}
