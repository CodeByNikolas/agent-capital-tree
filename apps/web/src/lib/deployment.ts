import { getAddress, isAddress, type Address, type Hex } from "viem";
import sepoliaManifest from "../../../../deployments/sepolia.json";

export interface PublicDeployment {
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
  ensNamespace: { name: string; expiry?: string };
  contracts: { CapitalController?: { address?: unknown } };
  tokens?: readonly { address?: unknown }[];
  uniswap?: { poolId?: unknown; initialization?: unknown; seeded?: unknown };
}

function pickAddress(values: readonly unknown[]): Address | null {
  for (const value of values) {
    if (typeof value === "string" && isAddress(value)) return getAddress(value);
  }
  return null;
}

export function getPublicDeployment(): PublicDeployment {
  const manifest = sepoliaManifest as unknown as DeploymentManifest;
  const controllerAddress = pickAddress([manifest.contracts.CapitalController?.address]);
  const token0 = pickAddress([manifest.tokens?.[0]?.address]);
  const token1 = pickAddress([manifest.tokens?.[1]?.address]);
  const tokenAddresses = token0 && token1 ? [token0, token1] as const : null;
  const poolIdValue = manifest.uniswap?.poolId;
  const poolId = typeof poolIdValue === "string" && /^0x[0-9a-fA-F]{64}$/.test(poolIdValue)
    ? poolIdValue as Hex
    : null;
  const status = manifest.status;
  const contractsConfigured = (status === "contracts-deployed-pool-pending" || status === "deployed") &&
    controllerAddress !== null && tokenAddresses !== null;

  return {
    chainId: manifest.chainId,
    network: manifest.network,
    status,
    namespaceName: manifest.ensNamespace.name,
    namespaceExpiry: manifest.ensNamespace.expiry ?? null,
    controllerAddress,
    tokenAddresses,
    poolId,
    poolConfigured: contractsConfigured && status === "deployed" && poolId !== null &&
      manifest.uniswap?.initialization !== undefined && manifest.uniswap?.seeded !== undefined,
    contractsConfigured,
  };
}
