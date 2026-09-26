"use client";

import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { glossary, type GlossaryTerm } from "@/lib/glossary";

type InfoHintProps =
  | { term: GlossaryTerm; label?: string; text?: string }
  | { term?: undefined; label: string; text: string };

/**
 * A small, keyboard-focusable and screen-reader-labeled definition icon.
 * Replaces scattered native title= attributes with an accessible tooltip.
 * Pass a glossary `term`, or an explicit `label` + `text`.
 */
export function InfoHint(props: InfoHintProps) {
  const entry = props.term ? glossary[props.term] : undefined;
  const label = props.label ?? entry?.label ?? "";
  const text = props.text ?? entry?.text ?? "";
  if (!text) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={<button type="button" className="info-hint" aria-label={`Definition: ${label}`} />}
      >
        <Info size={13} aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}
