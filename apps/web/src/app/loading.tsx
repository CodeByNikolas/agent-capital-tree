import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <main className="dashboard-content" aria-busy="true" aria-label="Loading page">
    <Skeleton className="loading-heading" /><Skeleton className="loading-description" />
    <div className="loading-grid">{[0, 1].map(index => <div className="loading-panel" key={index}><Skeleton className="loading-label" /><Skeleton className="loading-value" /><Skeleton className="loading-line" /></div>)}</div>
  </main>;
}
