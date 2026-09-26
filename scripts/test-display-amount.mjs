import assert from "node:assert/strict";
import { formatAmount, formatCompactAmount } from "../apps/web/src/lib/format-display-amount.ts";

const amount = (rawAmount, decimals = 18) => ({ rawAmount, decimals, symbol: "ACT-A" });

assert.equal(formatCompactAmount(amount("96685045370483148793")), "≈96.69");
assert.equal(formatAmount(amount("96685045370483148793")), "96.685045370483148793");
assert.equal(formatCompactAmount(amount("1")), "<0.0001");
assert.equal(formatCompactAmount(amount("123450000000000000")), "≈0.1235");
assert.equal(formatCompactAmount(amount("1000000000000000000")), "1");
assert.equal(formatCompactAmount(amount("0")), "0");
assert.equal(formatAmount(amount("750000", 6)), "0.750000");
assert.equal(formatCompactAmount(amount("1", 6)), "0.000001");
assert.equal(formatAmount(amount("0", 6)), "0.000000");
console.log("Compact display amounts passed");
