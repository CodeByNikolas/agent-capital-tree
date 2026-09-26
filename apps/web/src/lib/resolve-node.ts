import "server-only";

import { capitalClient, type CapitalClient } from "@agent-capital-tree/sdk";
import { isAddress, type Address } from "viem";
import { getPublicDeployment } from "@/lib/deployment";

export type ResolvedNode = {
  ok: true;
  client: CapitalClient;
  rootId: bigint;
  nodeId: bigint;
  vault: Address;
  /** Present only when resolved from a name or address (not from a numeric id). */
  ensName?: string;
};
export type ResolveFailure = { ok: false; error: string; status: number };

/**
 * Resolve a Sepolia vault address, a name under the project namespace, or a numeric node id to a
 * concrete tree node. Extracted from the resolve-root route so the authority endpoint can reuse the
 * same bounded, non-truncating directory scan. On success the RPC client is returned for reuse.
 */
export async function resolveNode(input: string): Promise<ResolvedNode | ResolveFailure> {
  const deployment = getPublicDeployment();
  const trimmed = input.trim();
  const numeric = /^[1-9]\d{0,77}$/.test(trimmed) && BigInt(trimmed) < 1n << 256n;
  const address = isAddress(trimmed);
  const name = trimmed.toLowerCase().replace(/\.$/, "");
  const ens = name.endsWith(`.${deployment.namespaceName}`) && name.length <= 253 && /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(name);
  if (!numeric && !address && !ens) {
    return { ok: false, error: `Enter a Sepolia vault address or a name under ${deployment.namespaceName}.`, status: 400 };
  }
  if (!deployment.controllerAddress || !process.env.SEPOLIA_RPC_URL) {
    return { ok: false, error: "Vault lookup is not configured.", status: 503 };
  }
  try {
    const client = capitalClient(process.env.SEPOLIA_RPC_URL, deployment.controllerAddress);
    await client.verifyDeployment();
    const blockNumber = await client.rpc.getBlockNumber();
    const at = { blockNumber };
    const next = await client.controller.read.nextNodeId(at);
    if (numeric) {
      if (BigInt(trimmed) >= next) return { ok: false, error: "No vault matches this ID.", status: 404 };
      const node = await client.controller.read.getNode([BigInt(trimmed)], at);
      return { ok: true, client, rootId: node.rootId, nodeId: node.id, vault: node.vault };
    }
    // Bounded demo-directory scan: do not silently truncate and report a false miss.
    if (next > 513n) return { ok: false, error: "Address/name lookup capacity reached. Open this tree using its root ID.", status: 503 };
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
      if (address ? node.vault.toLowerCase() === trimmed.toLowerCase() : ensName.toLowerCase() === name) {
        return { ok: true, client, rootId: node.rootId, nodeId: node.id, vault: node.vault, ensName };
      }
    }
    return { ok: false, error: "No vault in this Sepolia deployment matches that name or address.", status: 404 };
  } catch {
    return { ok: false, error: "Sepolia lookup failed. Please try again.", status: 503 };
  }
}
