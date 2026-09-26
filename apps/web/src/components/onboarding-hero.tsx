"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { tourStepHref, type TourContext } from "@/lib/tour-steps";

const STORAGE_KEY = "act.onboarding.dismissed";
export const ONBOARDING_OPEN_EVENT = "act:onboarding-open";

const steps = [
  "A human funds a root vault and authorizes a master agent.",
  "The master moves part of its capital into a child's separate vault. Children can delegate again, up to three levels.",
  "ENS roles plus our controller enforce inherited limits — descendants can never broaden their mandate.",
  "Chat actions use a separate operator key. Creating a child vault does not start an autonomous worker.",
  "Revocation stops future management. Funds stay in the vault until a separate recovery action.",
];

/**
 * First-run orientation on the Overview. Explains what Agent Capital Tree is,
 * the "How it works" narrative, and launches the guided tour. Dismissible and
 * re-openable (via the "How it works" link in the topbar).
 */
export function OnboardingHero({ context }: { context: TourContext }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try { setHidden(window.localStorage.getItem(STORAGE_KEY) === "1"); } catch { /* Optional preference. */ }
    const reopen = () => setHidden(false);
    window.addEventListener(ONBOARDING_OPEN_EVENT, reopen);
    return () => window.removeEventListener(ONBOARDING_OPEN_EVENT, reopen);
  }, []);

  if (hidden) return null;

  function hide() {
    try { window.localStorage.setItem(STORAGE_KEY, "1"); } catch { /* Optional preference. */ }
    setHidden(true);
  }

  return (
    <section id="how-it-works" className="panel onboarding-hero" aria-labelledby="onboarding-title">
      <div className="onboarding-intro">
        <h2 id="onboarding-title">How it works</h2>
        <p>
          Fund a root, authorize a master agent, and let it delegate smaller amounts and narrower permissions
          down a tree of separate on-chain vaults. The human owner keeps an independent recovery path — separate
          from the agents, ENS, and the activity indexer.
        </p>
        <p className="onboarding-distinction">
          <strong>Capital, permission, and a running agent are three separate things.</strong> A valid mandate does
          not prove that a bot is actually running.
        </p>
        <div className="onboarding-actions">
          <Link className="button button-primary" href={tourStepHref(1, context)}>
            Start guided tour
          </Link>
          <Link className="button button-secondary" href={context.preview ? "/mcp?preview=1" : `/mcp?vault=${encodeURIComponent(context.vault)}`}>MCP guide</Link>
          <button className="button button-secondary" type="button" onClick={hide}>Hide</button>
        </div>
      </div>
      <ol className="setup-steps onboarding-steps" aria-label="How it works">
        {steps.map((text, index) => (
          <li className="setup-step" key={index}>
            <span aria-hidden="true">{index + 1}</span>
            <div><strong>{text}</strong></div>
          </li>
        ))}
      </ol>
    </section>
  );
}
