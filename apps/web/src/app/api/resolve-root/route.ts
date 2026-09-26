import { capitalClient } from "@agent-capital-tree/sdk";
import { isAddress } from "viem";
import { getPublicDeployment } from "@/lib/deployment";

export const runtime = "nodejs";
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const input = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const deployment = getPublicDeployment();
  const address = isAddress(input);
  const name = input.toLowerCase().replace(/\.$/, "");
  const ens = name.endsWith(`.${deployment.namespaceName}`) && name.length <= 253 && /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(name);
  if (!address && !ens) return reply({ error: `Enter a Sepolia vault address or a name under ${deployment.namespaceName}.` }, 400);
  if (!deployment.controllerAddress || !process.env.SEPOLIA_RPC_URL) return reply({ error: "Vault lookup is not configured." }, 503);
  try {
    const client = capitalClient(process.env.SEPOLIA_RPC_URL, deployment.controllerAddress);
    await client.verifyDeployment();
    const blockNumber = await client.rpc.getBlockNumber();
    const at = { blockNumber };
    const next = await client.controller.read.nextNodeId(at);
    // Bounded demo-directory scan: do not silently truncate and report a false miss.
    if (next > 513n) return reply({ error: "Address/name lookup capacity reached for this deployment." }, 503);
    const nodes = [];
    for (let start = 1n; start < next; start += 32n) {
      const ids = Array.from({ length: Number(next - start < 32n ? next - start : 32n) }, (_, i) => start + BigInt(i));
      nodes.push(...await Promise.all(ids.map(id => client.controller.read.getNode([id], at))));
    }
    const byId = new Map(nodes.map(node => [node.id, node]));
    for (const node of nodes) {
      const labels = [node.label];
      let parent = node.parentId;
      for (let depth = 0; parent !== 0n && depth < 3; depth++) {
        const ancestor = byId.get(parent);
        if (!ancestor) throw new Error("Incomplete tree");
        labels.push(ancestor.label);
        parent = ancestor.parentId;
      }
      if (parent !== 0n) throw new Error("Invalid tree depth");
      const ensName = [...labels, deployment.namespaceName].join(".");
      if (address ? node.vault.toLowerCase() === input.toLowerCase() : ensName.toLowerCase() === name) {
        return reply({ rootId: node.rootId.toString(), nodeId: node.id.toString(), vault: node.vault, ensName });
      }
    }
    return reply({ error: "No vault in this Sepolia deployment matches that name or address." }, 404);
  } catch {
    return reply({ error: "Sepolia lookup failed. Please try again." }, 503);
  }
}
