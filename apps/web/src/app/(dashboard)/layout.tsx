import { Suspense } from "react";
import { DashboardRoute } from "@/lib/dashboard-page";
import { getPublicDeployment } from "@/lib/deployment";
import Loading from "../loading";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <><Suspense fallback={<Loading />}><DashboardRoute deployment={getPublicDeployment()} /></Suspense>{children}</>;
}
