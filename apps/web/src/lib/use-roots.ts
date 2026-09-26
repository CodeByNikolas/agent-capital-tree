"use client";

import { useEffect, useState } from "react";

export interface DirectoryRoot {
  id: string;
  label: string;
  ensName: string;
  owner: string;
  vault: string;
  nodeCount: number;
  revoked: boolean;
}

// Module-level cache so switching pages doesn't re-scan the chain every time.
let cache: { at: number; roots: DirectoryRoot[] } | null = null;
let inflight: Promise<DirectoryRoot[]> | null = null;
const TTL = 30_000;

async function load(): Promise<DirectoryRoot[]> {
  const response = await fetch("/api/roots", { cache: "no-store" });
  const body = await response.json() as { roots?: DirectoryRoot[] };
  if (!response.ok || !Array.isArray(body.roots)) throw new Error("Root directory unavailable.");
  return body.roots;
}

/** Read every root/tree that exists on-chain, so created vaults appear without a hardcoded list. */
export function useDiscoveredRoots(): { roots: DirectoryRoot[]; loading: boolean } {
  const [roots, setRoots] = useState<DirectoryRoot[]>(() => cache?.roots ?? []);
  const [loading, setLoading] = useState(() => !cache);

  useEffect(() => {
    let cancelled = false;
    if (cache && Date.now() - cache.at < TTL) {
      setRoots(cache.roots);
      setLoading(false);
      return;
    }
    setLoading(true);
    inflight ??= load();
    inflight
      .then((result) => {
        cache = { at: Date.now(), roots: result };
        if (!cancelled) { setRoots(result); setLoading(false); }
      })
      .catch(() => { if (!cancelled) setLoading(false); })
      .finally(() => { inflight = null; });
    return () => { cancelled = true; };
  }, []);

  return { roots, loading };
}
