import "server-only";

import {
  createPublicClient,
  decodeEventLog,
  erc20Abi,
  getAddress,
  http,
  type Address,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";
import { capitalClient } from "@agent-capital-tree/sdk";
import { getPublicDeployment } from "@/lib/deployment";
import {
  ERC20_TRANSFER_TOPIC,
  SEPOLIA_NETWORK,
  USDC_SEPOLIA,
  type ServiceListing,
  type X402PaymentPayload,
  type X402Receipt,
} from "@/lib/x402";

/** A verification failure with a stable, client-safe code. */
export class X402VerificationError extends Error {
  constructor(readonly code: string, message: string, readonly status = 402) {
    super(message);
    this.name = "X402VerificationError";
  }
}

// Demo-grade replay guard. Each settlement tx unlocks a resource once. Production must persist
// this (e.g. a DB row keyed by txHash) so restarts and multiple instances stay consistent.
const consumedSettlements = new Set<string>();

function requirePositiveInt(value: string, code: string): bigint {
  if (!/^[0-9]+$/.test(value)) throw new X402VerificationError(code, "A raw amount must be a decimal integer.");
  return BigInt(value);
}

/**
 * Verify an x402 settlement end to end:
 *  1. the payment envelope matches the service's requirements (network, asset, recipient, price);
 *  2. the on-chain USDC transfer actually happened (payer -> payTo, >= price), and is not replayed;
 *  3. the payer is the ENS-named agent bound to `nodeId`, and that mandate is still active
 *     (identity + spend gate). When USDC is a controller token, the amount is also checked
 *     against the agent's on-chain policy cap.
 * Returns a settlement receipt bound to the agent's ENS identity.
 */
export async function verifyPayment(
  service: ServiceListing,
  payment: X402PaymentPayload,
): Promise<X402Receipt> {
  const { payload } = payment;

  // (1) Envelope checks — cheap, before any RPC.
  if (payment.network !== SEPOLIA_NETWORK) {
    throw new X402VerificationError("wrong_network", "The payment network is not Ethereum Sepolia.");
  }
  if (payment.scheme !== "exact") {
    throw new X402VerificationError("unsupported_scheme", "Only the exact payment scheme is supported.");
  }
  if (payment.resource !== service.id) {
    throw new X402VerificationError("resource_mismatch", "The payment does not reference this service.");
  }
  if (getAddress(payload.asset) !== USDC_SEPOLIA.address) {
    throw new X402VerificationError("wrong_asset", "Settlement must use Sepolia USDC.");
  }
  if (getAddress(payload.payTo) !== getAddress(service.payTo)) {
    throw new X402VerificationError("wrong_recipient", "The payment recipient does not match the service.");
  }
  const paid = requirePositiveInt(payload.amount, "bad_amount");
  const price = requirePositiveInt(service.priceRaw, "bad_price");
  if (paid < price) {
    throw new X402VerificationError("insufficient_amount", "The transferred amount is below the price.");
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(payload.txHash)) {
    throw new X402VerificationError("bad_tx_hash", "The settlement transaction hash is malformed.");
  }

  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!rpcUrl) {
    throw new X402VerificationError("rpc_unconfigured", "The server-side Sepolia RPC URL is not configured.", 503);
  }

  // (2) On-chain settlement proof.
  const client = createPublicClient({ chain: sepolia, transport: http(rpcUrl, { timeout: 15000 }) });
  const from = getAddress(payload.from);
  const payTo = getAddress(service.payTo);

  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: payload.txHash as Hex });
  } catch {
    throw new X402VerificationError("settlement_not_found", "The settlement transaction is not yet mined.");
  }
  if (receipt.status !== "success") {
    throw new X402VerificationError("settlement_reverted", "The settlement transaction reverted.");
  }

  const transferred = receipt.logs.some((log) => {
    if (getAddress(log.address) !== USDC_SEPOLIA.address) return false;
    if (log.topics[0]?.toLowerCase() !== ERC20_TRANSFER_TOPIC) return false;
    try {
      const decoded = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
      if (decoded.eventName !== "Transfer") return false;
      const { from: logFrom, to: logTo, value } = decoded.args as { from: Address; to: Address; value: bigint };
      return getAddress(logFrom) === from && getAddress(logTo) === payTo && value >= price;
    } catch {
      return false;
    }
  });
  if (!transferred) {
    throw new X402VerificationError(
      "settlement_unverified",
      "No matching USDC transfer to the service recipient was found in that transaction.",
    );
  }

  // Replay guard: a settlement tx unlocks a resource exactly once.
  if (consumedSettlements.has(payload.txHash.toLowerCase())) {
    throw new X402VerificationError("payment_replayed", "This settlement has already been redeemed.");
  }

  // (3) ENS identity + mandate binding.
  const deployment = getPublicDeployment();
  if (!deployment.contractsConfigured || !deployment.controllerAddress) {
    throw new X402VerificationError("deployment_pending", "The capital controller is not configured.", 503);
  }
  const capital = capitalClient(rpcUrl, deployment.controllerAddress);
  const nodeId = requirePositiveInt(payload.nodeId, "bad_node_id");

  let node;
  try {
    node = await capital.controller.read.getNode([nodeId]);
  } catch {
    throw new X402VerificationError("unknown_agent", "No capital-tree node matches the payment.");
  }
  if (getAddress(node.agent) !== from) {
    throw new X402VerificationError(
      "payer_not_agent",
      "The payer is not the agent bound to the referenced vault.",
    );
  }

  // Derive the authoritative ENS name (do not trust the header's copy) and check the mandate.
  const tree = await capital.getTree(node.rootId);
  const named = tree.nodes.find((candidate) => candidate.id === nodeId);
  if (!named) {
    throw new X402VerificationError("unknown_agent", "The agent node is not part of its root tree.");
  }
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  if (named.effectivePolicy.expiry <= nowSeconds) {
    throw new X402VerificationError("mandate_expired", "The paying agent's mandate has expired.");
  }
  // When USDC is a controller token (post-migration), enforce the on-chain per-action cap too.
  const usdcIndex = tree.tokens.findIndex((token) => getAddress(token) === USDC_SEPOLIA.address);
  if (usdcIndex !== -1 && paid > named.effectivePolicy.maxAmounts[usdcIndex]) {
    throw new X402VerificationError("over_mandate", "The payment exceeds the agent's USDC mandate cap.");
  }

  consumedSettlements.add(payload.txHash.toLowerCase());

  return {
    settled: true,
    txHash: payload.txHash as Hex,
    network: SEPOLIA_NETWORK,
    asset: USDC_SEPOLIA.address,
    amount: payload.amount,
    payTo,
    payer: { address: from, nodeId: payload.nodeId, ensName: named.ensName },
    service: { id: service.id, ensName: service.ensName },
    settledAtBlock: receipt.blockNumber.toString(),
  };
}
