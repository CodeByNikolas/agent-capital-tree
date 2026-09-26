import { Dashboard } from "@/components/dashboard";
import { getPublicDeployment } from "@/lib/deployment";
import { previewDashboard } from "@/lib/preview-data";
import { notFound } from "next/navigation";

export type DashboardView = "overview" | "tree" | "activity" | "uniswap" | "payments" | "applications" | "mcp" | "setup";
export type DashboardSearchParams = Promise<{ root?: string | string[]; vault?: string | string[]; preview?: string | string[]; node?: string | string[]; action?: string | string[]; label?: string | string[]; budget?: string | string[]; operator?: string | string[]; tour?: string | string[]; step?: string | string[] }>;

export async function renderDashboard(view: DashboardView, searchParams: DashboardSearchParams) {
  const params = await searchParams;
  if (params.root !== undefined || Array.isArray(params.vault)) notFound();
  const deployment = getPublicDeployment();
  const vault = params.preview === "1" ? null : typeof params.vault === "string" ? params.vault : null;
  const node = typeof params.node === "string" ? params.node : null;
  const actions = ["create-root", "fund-root", "set-root-operator", "spawn-child", "tighten-policy", "revoke-subtree", "owner-recovery"] as const;
  const action = typeof params.action === "string" && actions.some((candidate) => candidate === params.action) ? params.action as (typeof actions)[number] : null;
  const tour = params.tour === "1";
  const parsedStep = typeof params.step === "string" ? Number.parseInt(params.step, 10) : NaN;
  const step = Number.isFinite(parsedStep) ? parsedStep : 1;
  const demoLabel = typeof params.label === "string" && /^[a-z][a-z0-9-]{0,30}$/.test(params.label) ? params.label : null;
  const demoBudget = typeof params.budget === "string" && /^(?:0|[1-9]\d{0,5})$/.test(params.budget) && Number(params.budget) <= 100000 ? params.budget : null;
  const setupOperator = vault && typeof params.operator === "string" && /^0x[a-fA-F0-9]{40}$/.test(params.operator) ? params.operator : null;
  return <Dashboard data={previewDashboard} deployment={deployment} onboarding={!vault && params.preview !== "1" && view !== "mcp"} vaultQuery={vault} nodeQuery={node} actionQuery={action} demoLabel={demoLabel} demoBudget={demoBudget} setupOperator={setupOperator} view={view} tour={tour} step={step} />;
}
