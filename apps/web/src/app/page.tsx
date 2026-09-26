import { renderDashboard, type DashboardSearchParams } from "@/lib/dashboard-page";

export default function HomePage({ searchParams }: { searchParams: DashboardSearchParams }) {
  return renderDashboard("overview", searchParams);
}
