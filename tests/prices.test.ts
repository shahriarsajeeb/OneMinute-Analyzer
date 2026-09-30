import assert from "node:assert/strict";
import { test } from "node:test";
import { findPrices, formatPrice, parseAmount } from "../lib/prices";

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
