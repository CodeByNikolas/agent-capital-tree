import { Dashboard } from "@/components/dashboard";
import { getPublicDeployment } from "@/lib/deployment";
import { previewDashboard } from "@/lib/preview-data";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ root?: string | string[] }> }) {
  const params = await searchParams;
  const root = typeof params.root === "string" ? params.root : null;
  return <Dashboard data={previewDashboard} deployment={getPublicDeployment()} rootQuery={root} />;
}
