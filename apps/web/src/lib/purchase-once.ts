/** Public receipt journal. An uncertain attempt is never replaced by a new charge. */
export async function purchaseOnce<T>(storage: Pick<Storage, "getItem" | "setItem">, key: string, execute: () => Promise<T>): Promise<{ result: T; repeated: boolean }> {
  const stored = storage.getItem(key);
  if (stored) {
    let entry: { state: string; result?: T };
    try { entry = JSON.parse(stored); } catch { throw new Error("Cannot purchase: receipt journal needs reconciliation."); }
    if (entry.state === "settled" && entry.result) return { result: entry.result, repeated: true };
    throw new Error("Cannot purchase: the previous outcome is unconfirmed. Reconcile its receipt before any new payment.");
  }
  // Fail before signing if durable storage is unavailable.
  storage.setItem(key, JSON.stringify({ state: "unconfirmed" }));
  const result = await execute();
  storage.setItem(key, JSON.stringify({ state: "settled", result }));
  return { result, repeated: false };
}
