import assert from 'node:assert/strict';
import { formatAmount, formatCompactAmount, formatRoundedAmount, formatExactAmount } from '../apps/web/src/lib/format-display-amount.ts';
const amount = (rawAmount, decimals = 18) => ({ rawAmount, decimals, symbol: 'ERC20' });
for (const format of [formatAmount, formatCompactAmount, formatRoundedAmount]) {
  assert.equal(format(amount('96685045370483148793')), '96.685');
  assert.equal(format(amount('1')), '<0.001');
  assert.equal(format(amount('750000', 6)), '0.750');
  assert.equal(format(amount('999500', 6)), '1.000');
  assert.equal(format(amount('999', 6)), '<0.001');
  assert.equal(format(amount('0', 6)), '0.000');
  assert.equal(format(amount('123', 0)), '123.000');
  assert.equal(format(amount('9007199254740993999500', 6)), '9,007,199,254,740,994.000');
}
assert.equal(formatExactAmount(amount('96685045370483148793')), '96.685045370483148793');
assert.equal(formatExactAmount(amount('1', 6)), '0.000001');
console.log('PASS: three decimals across token precisions, rounding carry, dust, large integers and exact inspection values.');
