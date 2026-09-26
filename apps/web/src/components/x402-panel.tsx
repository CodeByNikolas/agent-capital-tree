"use client";

import { useEffect, useState } from "react";
import { ExternalLink, ShoppingCart, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

  const purchasable = Boolean(actions?.payForService && walletOnSepolia && canPay);

  async function buy(serviceId: string) {
    if (!actions?.payForService || pendingId) return;
    setPendingId(serviceId);
    setErrors((current) => { const next = { ...current }; delete next[serviceId]; return next; });
    try {
      const result = await actions.payForService(node.id, serviceId);
      setPurchases((current) => ({ ...current, [serviceId]: result }));
    } catch (cause) {
      setErrors((current) => ({ ...current, [serviceId]: cause instanceof Error ? cause.message : "Payment failed." }));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="panel x402-panel" id="x402" aria-labelledby="x402-title">
      <div className="panel-heading">
        <div>
          <div className="panel-overline">AGENT SERVICES · x402</div>
          <h2 id="x402-title">Buy services in USDC</h2>
        </div>
        <Badge variant="outline">Live · Sepolia</Badge>
      </div>
      <p className="x402-lede">
        Each service is addressed by an ENS name and priced in USDC. The paying agent is
        identified by its capital-tree ENS name, and the payment only settles when the agent&apos;s
        on-chain mandate covers it. Paying as <strong>{node.ensName}</strong>.
      </p>
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
      {services === null && !catalogError && <p className="x402-hint">Loading services…</p>}
      <div className="x402-services">
        {services?.map((service) => {
          const purchase = purchases[service.id];
          const error = errors[service.id];
          const pending = pendingId === service.id;
          return (
            <div className="x402-service" key={service.id}>
              <div className="x402-service-head">
                <Sparkles size={16} aria-hidden="true" />
                <div>
                  <strong>{service.name}</strong>
                  <small>{service.ensName}</small>
                </div>
                <span className="x402-price">{service.priceDisplay} <small>USDC</small></span>
              </div>
              <p className="x402-service-desc">{service.description}</p>
              <div className="x402-service-actions">
                <button
                  className="button button-secondary button-small"
                  disabled={!purchasable || pending}
                  onClick={() => void buy(service.id)}
                  title={purchasable ? "Pay in USDC and unlock" : "Connect the agent wallet on Sepolia to pay"}
                >
                  <ShoppingCart size={13} aria-hidden="true" /> {pending ? "Paying…" : purchase ? "Buy again" : `Pay ${service.priceDisplay} USDC`}
                </button>
              </div>
              {error && <p className="x402-error">{error}</p>}
              {purchase && (
                <div className="x402-result">
                  <div className="x402-result-head">
                    <Badge variant="outline">Paid by {purchase.paidBy}</Badge>
                    <a
                      className="x402-tx"
                      href={`https://sepolia.etherscan.io/tx/${purchase.receipt.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View settlement <ExternalLink size={11} aria-hidden="true" />
                    </a>
                  </div>
                  <pre className="x402-content">{JSON.stringify(purchase.content, null, 2)}</pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
