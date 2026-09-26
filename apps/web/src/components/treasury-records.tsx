"use client";
import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import type { CapitalActivity, DashboardActions, LiquidityPosition, VaultNode } from "@/lib/dashboard-types";
import type { ServiceListing, X402PurchaseResult } from "@/lib/x402";
import { formatAmount } from "@/lib/format-display-amount";
import { StatusPill } from "./kanoki";
import { Button } from "./ui/button";

export function ConfirmModal({ open, onClose, title, children, onConfirm }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  return <Dialog.Root open={open} onOpenChange={value => { if (!value && !busy) onClose(); }}><Dialog.Portal><Dialog.Backdrop className="modal-backdrop" /><Dialog.Popup className="modal"><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{children}</Dialog.Description>{error && <p role="alert">{error}</p>}<div className="modal-actions"><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button variant="destructive" disabled={busy} onClick={async () => { setBusy(true); setError(null); try { await onConfirm(); onClose(); } catch { setError("Action unconfirmed. Check the transaction before retrying."); } finally { setBusy(false); } }}>{busy ? "Awaiting confirmation" : "Confirm"}</Button></div></Dialog.Popup></Dialog.Portal></Dialog.Root>;
}

export function PositionCard({ position, node, actions, authorized }: { position: LiquidityPosition; node?: VaultNode; actions?: DashboardActions; authorized: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const active = authorized && node?.state === "active" && position.state === "open";
  const collect = active && node.authorizedPermissions.includes("collect-fees") && !!actions?.collectFees;
  const exit = active && node.authorizedPermissions.includes("exit-liquidity") && !!actions?.closePosition;
  return <article className="position-record">
    <div className="record-heading"><div><strong className="mono">{position.poolLabel}</strong><p className="mono">Position {position.id}</p></div><StatusPill status={position.state} /></div>
    <p className="small muted">Test ratio, not a USD valuation.</p>
    <div className="position-stats"><div><span>Liquidity</span><strong className="mono">{position.liquidity}</strong></div><div><span>Collectable fees</span>{[position.fees0, position.fees1].map((fee, index) => <strong className={fee?.symbol.includes("USDC") ? "usdc-amount" : "test-amount"} key={index}>{fee ? formatAmount(fee) + " " + fee.symbol : "Not queried"}</strong>)}</div></div>
    <div className="position-actions"><Button variant="secondary" disabled title="Available through the swap MCP tool">Swap</Button><Button variant="secondary" disabled title="Available through the increasePosition MCP tool">Add liquidity</Button><Button variant="secondary" disabled={!collect} onClick={() => void actions?.collectFees?.(position.id)}>Collect fees</Button><Button variant="destructive" disabled={!exit} onClick={() => setConfirm(true)}>Exit</Button></div>
    <p className="small muted">Swap and add liquidity are available through MCP.</p>
    <ConfirmModal open={confirm} onClose={() => setConfirm(false)} title="Exit position." onConfirm={async () => { await actions?.closePosition?.(position.id); }}>Exit position {position.id}. Assets remain in the bound vault. One transaction.</ConfirmModal>
  </article>;
}

export function ServiceCard({ service, node, purchase, pending, error, canPurchase, repeated, onPurchase }: { service: ServiceListing; node: VaultNode; purchase?: X402PurchaseResult; pending: boolean; error?: string; canPurchase: boolean; repeated: boolean; onPurchase: () => void }) {
  const ceiling = node.effectivePolicy.maxActionAmounts.find(asset => asset.symbol.includes("USDC"));
  return <article className="x402-service"><div className="record-heading"><div><strong>{service.name}</strong><p className="mono small">{service.ensName.toLowerCase()}</p></div><span className="usdc-amount">{formatAmount({rawAmount:service.priceRaw,decimals:6,symbol:"USDC"})} USDC</span></div><p>{service.description}</p>
    <dl className="service-facts"><dt>Recipient</dt><dd><code>{service.payTo}</code></dd><dt>Vault ceiling</dt><dd className="usdc-amount">{ceiling ? formatAmount(ceiling) + " USDC per action" : "Unavailable"}</dd></dl>
    <Button disabled={!canPurchase || pending} onClick={onPurchase}>{pending ? "Awaiting settlement" : "Purchase"}</Button>
    {error && <p role="alert">{error}</p>}{purchase && <div className="x402-result" role="status"><StatusPill status="settled" /><a className="mono" href={"https://sepolia.etherscan.io/tx/" + purchase.receipt.txHash} target="_blank" rel="noreferrer">{purchase.receipt.txHash}</a>{(repeated || purchase.alreadySettled) && <p>already settled — not charged again</p>}</div>}
  </article>;
}

export function ActivityRow({ activity, event, node }: { activity: CapitalActivity; event: string; node?: VaultNode }) {
  return <tr className="activity-row"><td><time dateTime={activity.timestamp}>{activity.timestamp ? new Date(activity.timestamp).toLocaleTimeString("en-GB",{timeZone:"UTC",hour:"2-digit",minute:"2-digit"}) + " UTC" : "Unavailable"}</time></td><td>{event}</td><td><span className="mono">{node?.ensName.toLowerCase() ?? activity.nodeLabel.toLowerCase()}</span></td><td className={"activity-amount " + (activity.amount?.symbol.includes("USDC") ? "usdc-amount" : "test-amount")}>{activity.amount ? formatAmount(activity.amount) + " " + activity.amount.symbol : "—"}</td><td>{activity.transactionHash && activity.source === "multi-baas" ? <a className="mono" href={"https://sepolia.etherscan.io/tx/" + activity.transactionHash} title={activity.transactionHash} target="_blank" rel="noreferrer">{activity.transactionHash.slice(0,10)}…{activity.transactionHash.slice(-6)}</a> : <span className="muted">{activity.source === "preview" ? "Preview" : "No receipt"}</span>}</td></tr>;
}
