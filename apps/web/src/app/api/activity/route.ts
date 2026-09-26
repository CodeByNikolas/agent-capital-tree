import "server-only";
import { createMultiBaasHistoryClient, type CapitalActivityPage } from "@agent-capital-tree/multibaas";
import { getPublicDeployment } from "@/lib/deployment";
import type { ActivityFeedPage, ActivityFeedResult, IndexedCapitalActivity } from "@/lib/dashboard-types";

export const runtime = "nodejs";

function unavailable(
  reason: Extract<ActivityFeedResult, { source: "unavailable" }>["reason"],
  message: string,
) {
  const body: ActivityFeedResult = { source: "unavailable", reason, message };
  return Response.json(body, {
    headers: { "Cache-Control": "no-store" },
  });
}

function indexedPage(page: CapitalActivityPage, expectedRootId: string): ActivityFeedPage {
  if (page.rootId !== expectedRootId || page.items.some((item) => item.rootId !== expectedRootId)) {
    throw new Error("MultiBaas returned activity for a different root.");
  }
  const items: IndexedCapitalActivity[] = page.items.map((item) => {
    const hash = (value: string) => {
      if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error("MultiBaas returned an invalid transaction or block hash.");
      return value as `0x${string}`;
    };
    return {
      ...item,
      provenance: {
        ...item.provenance,
        transactionHash: hash(item.provenance.transactionHash),
        blockHash: hash(item.provenance.blockHash),
      },
    };
  });
  return {
    rootId: page.rootId,
    items,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
    indexing: {
      state: page.indexing.state,
      latestIndexedBlock: page.indexing.latestIndexedBlock,
      indexingStartBlock: page.indexing.indexingStartBlock,
      chainHeadBlock: page.indexing.chainHeadBlock,
      indexGapBlocks: page.indexing.indexGapBlocks,
      updatedAt: page.indexing.updatedAt,
    },
    ...(page.verification ? { verification: page.verification } : {}),
  };
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const rootId = params.get("root");
  const cursor = params.get("cursor") ?? undefined;
  if (!rootId || !/^[1-9]\d*$/.test(rootId) || rootId.length > 78 || (cursor && cursor.length > 160)) {
    return Response.json({ error: { code: "invalid_activity_query", message: "Use a positive root ID and a valid activity cursor." } }, {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const deployment = getPublicDeployment();
  if (!deployment.contractsConfigured || !deployment.controllerAddress) {
    return unavailable("deployment_pending", "The controller deployment is pending, so live activity is unavailable.");
  }
  const apiKey = process.env.MULTIBAAS_API_KEY;
  const deploymentUrl = process.env.MULTIBAAS_URL;
  const controllerLabel = process.env.MULTIBAAS_CONTROLLER_LABEL;
  if (!apiKey || !deploymentUrl || !controllerLabel) {
    return unavailable("not_configured", "MultiBaas activity history is pending server-side deployment URL, API key, and controller-label configuration.");
  }
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!rpcUrl) {
    return unavailable("rpc_unconfigured", "MultiBaas activity is hidden until the server-side Sepolia RPC can verify canonical receipts.");
  }

  try {
    const client = createMultiBaasHistoryClient({
      deploymentUrl,
      apiKey,
      controllerAddress: deployment.controllerAddress,
      controllerLabel,
      rpcUrl,
    });
    const page = indexedPage(await client.getCapitalActivity(rootId, cursor), rootId);
    const body: ActivityFeedResult = { source: "multi-baas", page };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return unavailable("upstream_error", "MultiBaas activity could not be verified. The live Sepolia tree remains available.");
  }
}
