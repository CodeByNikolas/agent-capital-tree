import { Dashboard } from "@/components/dashboard";
import { getPublicDeployment } from "@/lib/deployment";
import { previewDashboard } from "@/lib/preview-data";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ root?: string | string[]; preview?: string | string[] }> }) {
  const params = await searchParams;
  const deployment = getPublicDeployment();
  const requestedRoot = typeof params.root === "string" ? params.root : null;
  const previewMode = params.preview === "1";
  const root = previewMode ? null : requestedRoot ?? deployment.defaultRootId;
  return <Dashboard data={previewDashboard} deployment={deployment} rootQuery={root} />;
}
