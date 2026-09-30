import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findPrices,
  formatPrice,
  matchPrice,
  parseAmount,
  parseExpectedPrice,
} from "../lib/prices";

test("parses regional price formats without reading R$ as a dollar", () => {
  assert.equal(parseAmount("1.234,56"), 1234.56);
  assert.equal(parseAmount("1,234.56"), 1234.56);
  assert.equal(parseAmount("149,00"), 149);
  assert.equal(parseAmount("1.500"), 1500);
  const show = (text: string) => findPrices(text).map(formatPrice);
  assert.deepEqual(show("R$ 149,00"), ["BRL 149"]);
  assert.deepEqual(show("$29.99"), ["$29.99"]);
  assert.deepEqual(show("฿1,000 THB"), ["THB 1000"]);
  assert.deepEqual(show("27,00 €"), ["EUR 27"]);
  assert.deepEqual(show("Open 24 hours, 7 days"), []);
});

test("price checks compare amounts, not text, so 30 never matches 30-minute or $39.99", () => {
  const page = findPrices(
    "$39.99 One-time payment. 2 free 30-minute sessions are included with your purchase.",
  );
  const check = (expected: string) => {
    const parsed = parseExpectedPrice(expected);
    assert.ok(parsed, expected);
    return matchPrice(parsed, page);
  };
  assert.equal(check("30"), null);
  assert.equal(check("39"), null);
  assert.equal(check("39.99")?.ambiguous, false);
  assert.equal(check("$39.99")?.ambiguous, false);
  assert.equal(check("USD 39.99")?.ambiguous, true);
  assert.equal(check("SGD 39.99")?.ambiguous, true);
  assert.equal(check("€39.99"), null);
  assert.equal(check("฿1,000"), null);
  const thai = findPrices("฿1,000 THB (approximate)");
  assert.equal(matchPrice(parseExpectedPrice("฿1,000")!, thai)?.ambiguous, false);
  assert.equal(matchPrice(parseExpectedPrice("THB 1000")!, thai)?.ambiguous, false);
  assert.equal(parseExpectedPrice("thirty"), null);
  assert.equal(parseExpectedPrice("$29 or $39"), null);
});
