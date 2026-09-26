import { authorityOf, jsonSafe } from "@agent-capital-tree/sdk";
import { resolveNode } from "@/lib/resolve-node";

export const runtime = "nodejs";
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Public, ENS-name-addressed authority view. Given a name under the project namespace, a vault
 * address, or a numeric node id (`?q=`), returns the node's live, bounded capability set — the same
 * on-chain oracle (`checkAction` + effective policy) that gates every action, now queryable by name
 * so a service or another agent can verify a mandate before trusting it.
 */
export async function GET(request: Request) {
  const input = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const resolved = await resolveNode(input);
  if (!resolved.ok) return reply({ error: resolved.error }, resolved.status);
  try {
    const authority = await authorityOf(resolved.client, resolved.nodeId);
    return reply(jsonSafe(authority));
  } catch {
    return reply({ error: "Sepolia authority lookup failed. Please try again." }, 503);
  }
}
