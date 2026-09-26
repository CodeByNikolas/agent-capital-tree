import { getPublicDeployment } from "@/lib/deployment";
import { readLiveDashboard } from "@/lib/live-dashboard";

export const runtime = "nodejs";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const rootParam = new URL(request.url).searchParams.get("root");
  if (!rootParam || !/^[1-9]\d*$/.test(rootParam) || rootParam.length > 78) {
    return errorResponse("invalid_root_id", "Use a positive decimal root ID.", 400);
  }

  const rootId = BigInt(rootParam);
  if (rootId >= 1n << 256n) {
    return errorResponse("invalid_root_id", "The root ID exceeds uint256.", 400);
  }

  const deployment = getPublicDeployment();
  if (!deployment.contractsConfigured) {
    return errorResponse("deployment_pending", "The public manifest does not contain a deployed controller and both configured tokens.", 503);
  }
  if (!process.env.SEPOLIA_RPC_URL) {
    return errorResponse("rpc_unconfigured", "The server-side Sepolia RPC URL is not configured.", 503);
  }

  try {
    const data = await readLiveDashboard(rootId);
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : "Unknown server error";
    if (detail === "deployment_pending") {
      return errorResponse("deployment_pending", "The public manifest does not contain a deployed controller and both configured tokens.", 503);
    }
    if (detail === "rpc_unconfigured") {
      return errorResponse("rpc_unconfigured", "The server-side Sepolia RPC URL is not configured.", 503);
    }
    if (detail === "Invalid root tree" || /InvalidNode|Root node/i.test(detail)) {
      return errorResponse("root_not_found", "No deployed root matches that ID.", 404);
    }
    if (detail === "invalid_tree_relationship") {
      return errorResponse("invalid_tree", "The controller returned inconsistent parent relationships.", 502);
    }
    if (detail === "deployment_token_mismatch") {
      return errorResponse("deployment_token_mismatch", "The configured token addresses do not match the controller. Live reads and wallet actions are disabled.", 409);
    }
    if (detail === "live_snapshot_fields_unavailable") {
      return errorResponse("snapshot_incomplete", "The live snapshot is missing current EAC authority or LP position fields. Update the SDK deployment before using live controls.", 503);
    }
    return errorResponse("rpc_unavailable", "The Sepolia read failed. Check the RPC endpoint and deployment state.", 503);
  }
}
