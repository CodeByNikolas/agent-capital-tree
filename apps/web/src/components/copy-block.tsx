"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Reusable copy-to-clipboard code block for commands and config snippets.
 * Mirrors the clipboard pattern used by AddressLine in dashboard.tsx, but for
 * multi-line content.
 */
export function CopyBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="code-block">
      <button
        type="button"
        className="code-copy"
        onClick={copy}
        aria-label={label ? `Copy ${label}` : "Copy to clipboard"}
        title="Copy"
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
      <pre>{code}</pre>
    </div>
  );
}
