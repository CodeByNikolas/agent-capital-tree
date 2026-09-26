import { Dashboard } from "@/components/dashboard";
import { getPublicDeployment } from "@/lib/deployment";
import { previewDashboard } from "@/lib/preview-data";

export type DashboardView = "overview" | "tree" | "activity" | "applications" | "setup";
export type DashboardSearchParams = Promise<{ root?: string | string[]; preview?: string | string[]; node?: string | string[]; action?: string | string[] }>;

export async function renderDashboard(view: DashboardView, searchParams: DashboardSearchParams) {
  const params = await searchParams;
  const deployment = getPublicDeployment();
  const requestedRoot = typeof params.root === "string" ? params.root : null;
  const root = params.preview === "1" ? null : requestedRoot;
  const node = typeof params.node === "string" ? params.node : null;
  const actions = ["create-root", "fund-root", "set-root-operator", "spawn-child", "tighten-policy", "revoke-subtree", "owner-recovery"] as const;
  const action = typeof params.action === "string" && actions.some((candidate) => candidate === params.action) ? params.action as (typeof actions)[number] : null;
  return <Dashboard data={previewDashboard} deployment={deployment} onboarding={!root && params.preview !== "1"} rootQuery={root} nodeQuery={node} actionQuery={action} view={view} />;
}
