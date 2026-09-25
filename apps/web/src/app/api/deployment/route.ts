import { getPublicDeployment } from "@/lib/deployment";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(getPublicDeployment(), {
    headers: { "Cache-Control": "public, max-age=60" },
  });
}
