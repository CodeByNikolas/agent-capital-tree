"use client";
import { Skeleton } from "@/components/ui/skeleton";

import { useEffect, useRef, useState } from "react";
import { ServiceCard } from "./treasury-records";
import type { DashboardActions, VaultNode } from "@/lib/dashboard-types";
import type { ServiceListing, X402PurchaseResult } from "@/lib/x402";

interface CatalogResponse {
  network: string;
  services: ServiceListing[];
}

/**
 * x402 service marketplace. Each service is ENS-named and priced in USDC; the connected agent
 * pays from its own wallet and the payment is bound to its capital-tree ENS mandate. This is
 * the live replacement for the former "x402 service payments — Future work" placeholder.
 */
export function X402Panel({
  node,
  actions,
  walletOnSepolia,
  canPay,
}: {
  node: VaultNode;
  actions?: DashboardActions;
  walletOnSepolia: boolean;
  canPay: boolean;
}) {
  const [services, setServices] = useState<ServiceListing[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [purchases, setPurchases] = useState<Record<string, X402PurchaseResult>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    fetch("/api/x402/services", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Catalog unavailable"))))
      .then((body: CatalogResponse) => { if (active) setServices(body.services); })
      .catch((cause: unknown) => { if (active) setCatalogError(cause instanceof Error ? cause.message : "Catalog unavailable"); });
    return () => { active = false; };
  }, []);

  const [repeated, setRepeated] = useState<Record<string, boolean>>({});
  const requestPending = useRef(false);
  const purchaseKey = (serviceId: string) => node.vaultAddress.toLowerCase() + ":" + serviceId;
  const purchasable = Boolean(actions?.payForService && walletOnSepolia && canPay && node.state === "active" && node.authorizedPermissions.includes("pay"));

  async function buy(serviceId: string) {
    const key = purchaseKey(serviceId);
    if (purchases[key]) { setRepeated(current => ({ ...current, [key]: true })); return; }
    if (!actions?.payForService || requestPending.current || !purchasable) return;
    requestPending.current = true;
    setPendingId(serviceId);
    setErrors((current) => { const next = { ...current }; delete next[serviceId]; return next; });
    try {
      const result = await actions.payForService(node.id, serviceId);
      setPurchases((current) => ({ ...current, [key]: result }));
    } catch (cause) {
      setErrors((current) => ({ ...current, [serviceId]: cause instanceof Error ? cause.message : "Payment failed." }));
    } finally {
      requestPending.current = false;
      setPendingId(null);
    }
  }

  return (
    <section className="panel x402-panel" id="x402" aria-labelledby="x402-title">
      <div className="panel-heading">
        <div>
          <h2 id="x402-title">Services · x402</h2>
        </div>
      </div>
      <p className="x402-lede">
        Selected node <code>{node.ensName.toLowerCase()}</code>.
      </p>
      <p className="small muted">Browser purchases debit the connected agent wallet. The service checks its node mandate.</p>
      {!purchasable && (
        <p className="x402-hint">
          {!walletOnSepolia
            ? "Connect a wallet on Ethereum Sepolia to pay."
            : !canPay
              ? `Connect the wallet bound to ${node.ensName} (its agent) to spend under this mandate.`
              : "Payments are unavailable in this data source."}
        </p>
      )}
      {catalogError && <p className="x402-hint">Service catalog unavailable: {catalogError}</p>}
      {services === null && !catalogError && <div role="status" aria-label="Loading services"><Skeleton className="loading-table-row" /><Skeleton className="loading-table-row" /></div>}
      <div className="x402-services">
        {services?.map(service => <ServiceCard key={purchaseKey(service.id)} service={service} node={node} purchase={purchases[purchaseKey(service.id)]} pending={pendingId === service.id} error={errors[service.id]} canPurchase={purchasable} repeated={!!repeated[purchaseKey(service.id)]} onPurchase={() => void buy(service.id)} />)}
      </div>
    </section>
  );
}
