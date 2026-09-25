import { Dashboard } from "@/components/dashboard";
import { previewDashboard } from "@/lib/preview-data";

export default function HomePage() {
  return <Dashboard data={previewDashboard} />;
}
