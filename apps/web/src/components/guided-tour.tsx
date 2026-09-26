import Link from "next/link";
import { ArrowLeft, ArrowRight, Compass, X } from "lucide-react";
import {
  clampStep,
  tourExitHref,
  tourStepCount,
  tourStepHref,
  tourSteps,
  type TourContext,
} from "@/lib/tour-steps";

/**
 * Docked banner that guides a first-time viewer through the 5-step demo.
 * Rendered on every view; visible only when ?tour=1 is present. All navigation
 * is <Link>-based and URL-driven, so it persists across route changes.
 */
export function GuidedTour({ active, step, context }: { active: boolean; step: number; context: TourContext }) {
  if (!active) return null;

  const current = clampStep(step);
  const stepData = tourSteps[current - 1];
  const isFirst = current === 1;
  const isLast = current === tourStepCount;

  return (
    <aside className="guided-tour" role="region" aria-label="Guided tour">
      <div className="guided-tour-body">
        <span className="guided-tour-mark" aria-hidden="true"><Compass size={16} /></span>
        <div className="guided-tour-copy">
          <span className="guided-tour-step">Guided tour · Step {current} of {tourStepCount}</span>
          <strong>{stepData.title}</strong>
          <p>{stepData.caption}</p>
        </div>
      </div>
      <div className="guided-tour-actions">
        {!isFirst && (
          <Link className="button button-secondary button-small" href={tourStepHref(current - 1, context)}>
            <ArrowLeft size={14} aria-hidden="true" /> Back
          </Link>
        )}
        {!isLast ? (
          <Link className="button button-primary button-small" href={tourStepHref(current + 1, context)}>
            Next <ArrowRight size={14} aria-hidden="true" />
          </Link>
        ) : (
          <Link className="button button-primary button-small" href={tourExitHref(current, context)}>
            Finish tour
          </Link>
        )}
        <Link className="guided-tour-exit" href={tourExitHref(current, context)} aria-label="Exit guided tour">
          <X size={15} aria-hidden="true" /> Exit
        </Link>
      </div>
    </aside>
  );
}
