import { getServiceCatalog } from "@/lib/x402-catalog";

export const runtime = "nodejs";

/** Public x402 service catalog: what this deployment sells for USDC, and at what price. */
export async function GET() {
  return Response.json(
    { network: "eip155:11155111", services: getServiceCatalog() },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
