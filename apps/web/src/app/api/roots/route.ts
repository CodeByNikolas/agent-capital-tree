import { capitalClient } from "@agent-capital-tree/sdk";
import { getPublicDeployment } from "@/lib/deployment";

export const runtime = "nodejs";
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

// Enumerate every root (a node whose parentId is 0) directly from Sepolia state.
// Owner comes from the controller's rootOwner mapping, which mirrors the ENS
// registration one-to-one (managed names are transfer-locked), and the label is
// the on-chain ENS leaf label. No hardcoded list, no indexer required.
export async function GET() {
  const deployment = getPublicDeployment();
  if (!deployment.controllerAddress || !process.env.SEPOLIA_RPC_URL) {
    return reply({ error: "Root directory is not configured." }, 503);
  }
  try {
    const client = capitalClient(process.env.SEPOLIA_RPC_URL, deployment.controllerAddress);
    await client.verifyDeployment();
    const blockNumber = await client.rpc.getBlockNumber();
    const at = { blockNumber };
    const next = await client.controller.read.nextNodeId(at);
    // Bounded scan: report the cap rather than silently truncating and lying about coverage.
    if (next > 513n) return reply({ error: "Root directory capacity reached. Open a tree using its root ID." }, 503);

    const nodes = [];
    for (let start = 1n; start < next; start += 32n) {
      const ids = Array.from({ length: Number(next - start < 32n ? next - start : 32n) }, (_, i) => start + BigInt(i));
      nodes.push(...await Promise.all(ids.map((id) => client.controller.read.getNode([id], at))));
    }

    const rootNodes = nodes.filter((node) => node.parentId === 0n);
    const roots = await Promise.all(rootNodes.map(async (node) => {
      const [owner, nodeCount] = await Promise.all([
        client.controller.read.rootOwner([node.id], at),
        client.controller.read.rootNodeCount([node.id], at),
      ]);
      return {
        id: node.id.toString(),
        label: node.label,
        ensName: [node.label, deployment.namespaceName].join("."),
        owner,
        vault: node.vault,
        nodeCount: Number(nodeCount),
        revoked: node.revoked,
      };
    }));
    roots.sort((a, b) => Number(BigInt(a.id) - BigInt(b.id)));
    return reply({ roots, blockNumber: blockNumber.toString() });
  } catch {
    return reply({ error: "Sepolia root directory lookup failed." }, 503);
  }
}
