import { Dashboard } from "@/components/dashboard";
import { getPublicDeployment } from "@/lib/deployment";
import { previewDashboard } from "@/lib/preview-data";
import { notFound } from "next/navigation";

export type DashboardView = "overview" | "tree" | "activity" | "applications" | "setup";
export type DashboardSearchParams = Promise<{ root?: string | string[]; vault?: string | string[]; preview?: string | string[]; node?: string | string[]; action?: string | string[] }>;

export async function renderDashboard(view: DashboardView, searchParams: DashboardSearchParams) {
  const params = await searchParams;
  if (params.root !== undefined || Array.isArray(params.vault)) notFound();
  const deployment = getPublicDeployment();
  const vault = params.preview === "1" ? null : typeof params.vault === "string" ? params.vault : null;
  const node = typeof params.node === "string" ? params.node : null;
  const actions = ["create-root", "fund-root", "set-root-operator", "spawn-child", "tighten-policy", "revoke-subtree", "owner-recovery"] as const;
  const action = typeof params.action === "string" && actions.some((candidate) => candidate === params.action) ? params.action as (typeof actions)[number] : null;
  return <Dashboard data={previewDashboard} deployment={deployment} onboarding={!vault && params.preview !== "1"} vaultQuery={vault} nodeQuery={node} actionQuery={action} view={view} />;
}
