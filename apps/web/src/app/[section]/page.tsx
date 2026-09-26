import { notFound } from "next/navigation";
import { renderDashboard, type DashboardSearchParams, type DashboardView } from "@/lib/dashboard-page";

const sections: readonly DashboardView[] = ["tree", "activity", "applications", "setup"];

export default async function SectionPage({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: DashboardSearchParams }) {
  const { section } = await params;
  if (!sections.includes(section as DashboardView)) notFound();
  return renderDashboard(section as DashboardView, searchParams);
}
