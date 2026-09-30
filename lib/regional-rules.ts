import { isCountryCode } from "./countries";
import { parseExpectedPrice } from "./prices";
export const ruleKinds = [
  "price",
  "contains",
  "not-contains",
  "text",
  "visible",
  "hidden",
  "language",
  "no-trackers",
] as const;
export type RuleKind = (typeof ruleKinds)[number];
/** Kinds that search visible text; an element only narrows where they look. */
export const scopeOptional = (kind: RuleKind) =>
  kind === "language" ||
  kind === "price" ||
  kind === "contains" ||
  kind === "not-contains" ||
  kind === "no-trackers";
export const needsExpected = (kind: RuleKind) =>
  kind === "text" ||
  kind === "language" ||
  kind === "price" ||
  kind === "contains" || kind === "not-contains";
export type RegionalRule = {
  id: string;
  name: string;
  country: string;
  kind: RuleKind;
  selector: string;
  expected: string;
};
export type AssertionResult = {
  rule: RegionalRule;
  outcome: "pass" | "fail" | "inconclusive";
  observed: string;
  reason: string;
};
export function validateRules(value: unknown): RegionalRule[] {
  if (!Array.isArray(value) || value.length > 30)
    throw new Error("Provide at most 30 regional rules.");
  const ids = new Set<string>();
  return value.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.id !== "string" ||
      !item.id ||
      item.id.length > 80 ||
      ids.has(item.id) ||
      !isCountryCode(item.country) ||
      !(ruleKinds as readonly string[]).includes(item.kind) ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      item.name.length > 100 ||
      typeof item.selector !== "string" ||
      item.selector.length > 300 ||
      typeof item.expected !== "string" ||
      item.expected.length > 200
    )
      throw new Error(
        "Each rule needs a unique ID, country, name, supported check, selector and expected value.",
      );
    if (!scopeOptional(item.kind) && !item.selector.trim())
      throw new Error("Choose a CSS selector for each element check.");
    if (needsExpected(item.kind) && !item.expected.trim())
      throw new Error("Text and language checks need an expected value.");
    if (item.kind === "price" && !parseExpectedPrice(item.expected))
      throw new Error("Enter one price, e.g. $39.99, ฿1,000, BRL 149 or 39.99.");
    ids.add(item.id);
    return {
      id: item.id,
      name: item.name.trim(),
      country: item.country,
      kind: item.kind,
      selector: item.selector.trim(),
      expected: item.expected.trim(),
    } as RegionalRule;
  });
}
export const normalizeText = (text: string) => text.replace(/\s+/g, " ").trim();
