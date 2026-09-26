import { getService, toPaymentRequirements, X402_VERSION } from "@/lib/x402-catalog";
import { decodePaymentHeader, type X402Challenge } from "@/lib/x402";
import { verifyPayment, X402VerificationError } from "@/lib/x402-verify";

export const runtime = "nodejs";

function jsonError(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * The x402-protected resource endpoint.
 *  - Without an `X-PAYMENT` header: reply HTTP 402 with the USDC payment requirements.
 *  - With an `X-PAYMENT` header: verify the on-chain settlement + the paying agent's ENS
 *    mandate, then serve the resource and attach an `X-PAYMENT-RESPONSE` receipt.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const service = getService(id);
  if (!service) return jsonError("unknown_service", "No such x402 service.", 404);

  const paymentHeader = request.headers.get("x-payment");
  if (!paymentHeader) {
    const challenge: X402Challenge = {
      x402Version: X402_VERSION,
      error: "Payment required to access this resource.",
      accepts: [toPaymentRequirements(service)],
    };
    return Response.json(challenge, { status: 402, headers: { "Cache-Control": "no-store" } });
  }

  let payment;
  try {
    payment = decodePaymentHeader(paymentHeader);
  } catch (cause) {
    return jsonError("bad_payment_header", cause instanceof Error ? cause.message : "Invalid X-PAYMENT header.", 400);
  }

  try {
    const receipt = await verifyPayment(service, payment);
    const body = {
      service: { id: service.id, ensName: service.ensName, name: service.name },
      paidBy: receipt.payer.ensName,
      content: renderContent(service.id, receipt.payer.ensName),
      receipt,
    };
    return Response.json(body, {
      headers: {
        "Cache-Control": "no-store",
        "X-PAYMENT-RESPONSE": Buffer.from(JSON.stringify(receipt), "utf8").toString("base64"),
      },
    });
  } catch (cause) {
    if (cause instanceof X402VerificationError) return jsonError(cause.code, cause.message, cause.status);
    return jsonError("verification_failed", "The payment could not be verified.", 502);
  }
}

/** The paid resource each service returns once settlement is verified. */
function renderContent(serviceId: string, agentEnsName: string): Record<string, unknown> {
  switch (serviceId) {
    case "market-oracle":
      return {
        headline: "ETH/USDC snapshot (Sepolia demo)",
        note: `Delivered to ${agentEnsName}. Testnet demo data — not investment advice.`,
        indicators: { trend: "range-bound", volatility: "moderate", confidence: 0.62 },
      };
    case "tree-audit":
      return {
        headline: "Capital-tree risk audit",
        note: `Audit issued to ${agentEnsName}.`,
        findings: [
          "Subtree spend caps are within the parent mandate.",
          "No policy expiry within the next 7 days.",
          "LP exposure concentrated in a single fixed-range position.",
        ],
      };
    case "alpha-feed":
      return {
        headline: "Alpha research note",
        note: `Licensed to ${agentEnsName}. Redistribution outside the paying mandate is not permitted.`,
        thesis: "Bounded-mandate agents can arbitrage service pricing across ENS-addressed providers.",
      };
    default:
      return { note: `Resource delivered to ${agentEnsName}.` };
  }
}
