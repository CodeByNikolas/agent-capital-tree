"use client";
import { useState } from "react";
import { Button } from "./ui/button";
import type { Permission } from "@/lib/dashboard-types";

export function CapabilityPill({ permissions }: { permissions: readonly Permission[] }) {
  const capabilities = [
    ["DELEGATE", permissions.includes("delegate")], ["SWAP", permissions.includes("swap")],
    ["LIQUIDITY", permissions.some(p => ["manage-liquidity", "collect-fees", "exit-liquidity"].includes(p))],
    ["PAY", permissions.includes("pay")],
  ] as const;
  return <span className="capability-list" aria-label="Capabilities">{capabilities.map(([label, granted]) => <span key={label} className={"capability-pill" + (granted ? "" : " capability-absent")} aria-label={label + (granted ? " granted" : " not granted")}>{label}</span>)}</span>;
}

export function Brand() {
  return <span className="brand-lockup"><img src="/brand/kanoki-logo-512.png" width="24" height="24" alt="" /><span><span className="app-brand">Kanoki</span><span className="brand-tagline">Agent Capital Tree</span></span></span>;
}

export function ThemeControl() {
  const [light, setLight] = useState(false);
  return <Button variant="ghost" onClick={() => { const next = !light; setLight(next); document.documentElement.dataset.theme = next ? "light" : "dark"; }} aria-label={light ? "Use dark theme" : "Use light theme"}>{light ? "Dark" : "Light"}</Button>;
}
export function StatusPill({ status }: { status: string }) {
  const tone = status === "active" ? "active" : status === "revoked" ? "revoked" : status === "expiring" ? "expiring" : "neutral";
  return <span className={`status-pill status-${tone}`}>{status}</span>;
}
/** Unknown caps have no invented ratio. */
export function BudgetBar({ remaining, cap }: { remaining: bigint; cap: bigint | null }) {
  const ratio = cap !== null && cap > 0n ? Number((remaining * 10000n) / cap) / 100 : cap === 0n && remaining === 0n ? 0 : null;
  return <span className="budget-bar" role="meter" aria-label={ratio === null ? "Budget cap unavailable" : "Budget remaining"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={ratio === null ? undefined : Math.min(100, Math.max(0, ratio))} aria-valuetext={ratio === null ? "Budget cap unavailable" : `${ratio}% remaining`}><span className="budget-fill" style={{ width: `${ratio === null ? 0 : Math.min(100, Math.max(0, ratio))}%` }} /></span>;
}
export function EmptyState({ onCreate }: { onCreate: () => void }) {
  return <section className="empty-state"><h1>No tree yet.</h1><p>Fund a root to assign capital to your agents.</p><Button onClick={onCreate}>Create root</Button></section>;
}
