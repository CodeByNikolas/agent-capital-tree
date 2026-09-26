import "server-only";
import { capitalClient } from "@agent-capital-tree/sdk";
import { createPublicClient, getAddress, http, parseAbiItem, parseEventLogs, type Address } from "viem";
import { sepolia } from "viem/chains";
import { getPublicDeployment } from "@/lib/deployment";
import manifest from "../../../../../../deployments/usdc-sepolia.json";

export const runtime = "nodejs";

const authorizationUsed = parseAbiItem("event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)");
const transfer = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const MAX_SCAN_BLOCKS = 8_000n;
const LOG_BATCH_BLOCKS = 1_000n;

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const root = new URL(request.url).searchParams.get("root") ?? "";
  if (!/^[1-9]\d{0,77}$/.test(root)) return reply({ error: "Enter a valid root ID." }, 400);
  const deployment = getPublicDeployment();
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const startBlock = BigInt(manifest.contracts.CapitalController.blockNumber);
  const usdc = deployment.tokenAddresses?.[0];
  if (!rpcUrl || !deployment.controllerAddress || !usdc || !deployment.paymentsSupported) {
    return reply({ error: "Sepolia payment history is not configured." }, 503);
  }

  try {
    const sdk = capitalClient(rpcUrl, deployment.controllerAddress);
    const tree = await sdk.getTree(BigInt(root));
    if (tree.nodes.length === 0 || tree.nodes.length > 32 || tree.nodes.some((node) => node.rootId !== BigInt(root))) {
      return reply({ error: "Root is unavailable or exceeds the supported tree size." }, 404);
    }
    const vaults = new Map(tree.nodes.map((node) => [node.vault.toLowerCase(), {
      nodeId: node.id.toString(), name: node.ensName,
    }]));
    const authorizers = tree.nodes.map((node) => getAddress(node.vault)) as Address[];
    const rpc = createPublicClient({ chain: sepolia, transport: http(rpcUrl, { timeout: 10_000 }) });
    const head = await rpc.getBlockNumber();
    const fromBlock = head - startBlock + 1n > MAX_SCAN_BLOCKS ? head - MAX_SCAN_BLOCKS + 1n : startBlock;
    const authorizationLogs = [];
    for (let start = fromBlock; start <= head; start += LOG_BATCH_BLOCKS) {
      const end = start + LOG_BATCH_BLOCKS - 1n < head ? start + LOG_BATCH_BLOCKS - 1n : head;
      authorizationLogs.push(...await rpc.getLogs({ address: usdc, event: authorizationUsed, args: { authorizer: authorizers }, fromBlock: start, toBlock: end }));
    }

    const transactions = [...new Set(authorizationLogs.map((log) => log.transactionHash))];
    const receipts = await Promise.all(transactions.map((hash) => rpc.getTransactionReceipt({ hash })));
    const payments = receipts.flatMap((receipt) => {
      if (receipt.status !== "success") return [];
      const authorizations = parseEventLogs({ abi: [authorizationUsed], logs: receipt.logs.filter((log) => log.address.toLowerCase() === usdc.toLowerCase()) });
      const usedVaults = new Set(authorizations.map((log) => log.args.authorizer.toLowerCase()));
      const transfers = parseEventLogs({ abi: [transfer], logs: receipt.logs.filter((log) => log.address.toLowerCase() === usdc.toLowerCase()) });
      return transfers.filter((log) => usedVaults.has(log.args.from.toLowerCase()) && vaults.has(log.args.from.toLowerCase()))
        .map((log) => ({
          id: `${receipt.transactionHash}:${log.logIndex}`,
          nodeId: vaults.get(log.args.from.toLowerCase())!.nodeId,
          nodeName: vaults.get(log.args.from.toLowerCase())!.name,
          from: log.args.from,
          to: log.args.to,
          amountRaw: log.args.value.toString(),
          transactionHash: receipt.transactionHash,
          blockNumber: Number(receipt.blockNumber),
        }));
    }).sort((left, right) => right.blockNumber - left.blockNumber);

    return reply({
      source: "circle-usdc-receipts",
      rootId: root,
      payments,
      coverage: {
        fromBlock: Number(fromBlock), toBlock: Number(head),
        completeSinceDeployment: fromBlock === startBlock,
      },
      note: "USDC EIP-3009 authorizations settled from vaults. Chain receipts cannot prove whether an external merchant used x402.",
    });
  } catch {
    return reply({ error: "Sepolia payment receipts could not be read. No completeness claim is available." }, 503);
  }
}
