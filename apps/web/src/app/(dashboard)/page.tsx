import { notFound } from "next/navigation";
import { type DashboardSearchParams } from "@/lib/dashboard-page";

export default async function HomePage({ searchParams }: { searchParams: DashboardSearchParams }) {
  const query = await searchParams;
  if (query.root !== undefined || Array.isArray(query.vault)) notFound();
  return null;
}
