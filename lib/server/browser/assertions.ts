import type { Page } from "playwright";
import {
  normalizeText,
  type AssertionResult,
  type RegionalRule,
} from "@/lib/regional-rules";
import { distinctPrices, findPrices, formatPrice } from "@/lib/prices";

const fold = (text: string) => normalizeText(text).toLowerCase();

/** A short excerpt around the match, so a pass shows where the text was found. */
function excerpt(text: string, index: number, length: number) {
  const start = Math.max(0, index - 40);
  const end = Math.min(text.length, index + length + 40);
  return `${start ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

async function observeText(
  page: Page,
  rule: RegionalRule,
): Promise<AssertionResult> {
  const where = rule.selector ? "the selected element" : "the page";
  let scope = page.locator("body");
  if (rule.selector) {
    scope = page.locator(`css=${rule.selector}`);
    const count = await scope.count();
    if (count !== 1)
      return {
        rule,
        outcome: "inconclusive",
        observed: count ? `${count} elements` : "Element not found",
        reason: count
          ? "Selector is ambiguous. Choose one specific element, or clear it to search the whole page."
          : "The element to search was not found. Clear it to search the whole page.",
      };
  }
  // innerText contains rendered text only: hidden elements are excluded.
  const text = normalizeText(await scope.innerText({ timeout: 1000 }));
  const index = fold(text).indexOf(fold(rule.expected));
  const found = index >= 0;
  const matches = rule.kind === "contains" ? found : !found;
  if (found)
    return {
      rule,
      outcome: matches ? "pass" : "fail",
      observed: excerpt(text, index, normalizeText(rule.expected).length),
      reason: matches
        ? `Found on ${where} (case and spacing ignored)`
        : `The text is visible on ${where}`,
    };
  // When an expected price is missing, the prices that are shown make the mismatch actionable.
  const shown = findPrices(rule.expected).length
    ? distinctPrices(findPrices(text)).slice(0, 6).map(formatPrice)
    : [];
  return {
    rule,
    outcome: matches ? "pass" : "fail",
    observed: shown.length
      ? `Not shown. Prices on ${where}: ${shown.join(", ")}`
      : `Not shown on ${where}`,
    reason: matches
      ? `Not visible on ${where} during the observation window`
      : `No visible text on ${where} contains the expected value`,
  };
}

export async function observeRule(
  page: Page,
  rule: RegionalRule,
): Promise<AssertionResult> {
  if (rule.kind === "no-trackers")
    return {
      rule,
      outcome: "inconclusive",
      observed: "Not evaluated",
      reason: "Tracker checks are evaluated after the observation window",
    };
  try {
    if (rule.kind === "contains" || rule.kind === "not-contains")
      return await observeText(page, rule);
    if (rule.kind === "language") {
      const observed = await page
        .locator("html")
        .getAttribute("lang", { timeout: 500 });
      const matches =
        (observed ?? "").toLowerCase() === rule.expected.toLowerCase();
      return {
        rule,
        outcome: matches ? "pass" : "fail",
        observed: observed || "No lang attribute",
        reason: matches
          ? "Document language matches"
          : "Document language attribute differs; translated copy is not inferred",
      };
    }
    const elements = page.locator(`css=${rule.selector}`);
    const count = await elements.count();
    if (count > 1)
      return {
        rule,
        outcome: "inconclusive",
        observed: `${count} elements`,
        reason: "Selector is ambiguous. Choose one specific element.",
      };
    const visible = count === 1 && (await elements.isVisible());
    if (rule.kind === "visible" || rule.kind === "hidden") {
      const matches = rule.kind === "visible" ? visible : !visible;
      return {
        rule,
        outcome: matches ? "pass" : "fail",
        observed: visible ? "Visible" : count ? "Hidden" : "Not present",
        reason: matches
          ? "Visibility matches expectation"
          : "Visibility differs from expectation",
      };
    }
    if (!visible)
      return {
        rule,
        outcome: "fail",
        observed: count ? "Element hidden" : "Element not found",
        reason:
          "Expected a visible element containing the exact configured text",
      };
    const observed = normalizeText(await elements.innerText({ timeout: 500 }));
    const matches = observed === normalizeText(rule.expected);
    return {
      rule,
      outcome: matches ? "pass" : "fail",
      observed: observed.slice(0, 2000),
      reason: matches
        ? "Exact text matches (whitespace normalized)"
        : "Observed text differs from expected value",
    };
  } catch {
    return {
      rule,
      outcome: "inconclusive",
      observed: "Could not inspect element",
      reason: "Invalid selector, changing page, or browser unavailable",
    };
  }
}

// One shared observation window, not a separate timeout for every rule.
export async function runAssertions(
  page: Page,
  rules: RegionalRule[],
  timeoutMs = 8000,
): Promise<AssertionResult[]> {
  const deadline = Date.now() + timeoutMs;
  let results: AssertionResult[] = [];
  do {
    results = await Promise.all(rules.map((rule) => observeRule(page, rule)));
    // Absence checks must observe the full window so late banners aren't prematurely accepted.
    if (
      results.every(
        (result) => result.outcome === "pass" || result.rule.kind === "no-trackers",
      ) &&
      !rules.some((rule) =>
        ["hidden", "not-contains", "no-trackers"].includes(rule.kind),
      )
    )
      break;
    if (page.isClosed() || Date.now() >= deadline) break;
    await page
      .waitForTimeout(Math.min(250, Math.max(0, deadline - Date.now())))
      .catch(() => {});
  } while (Date.now() <= deadline);
  return results;
}

/** Bot walls and access-denied pages answer with a page, but not the page under test. */
export async function detectAccessIssue(page: Page): Promise<string | undefined> {
  try {
    const signals = await page.evaluate(() => ({
      title: document.title,
      text: (document.body?.innerText ?? "").slice(0, 1500),
      length: (document.body?.innerText ?? "").length,
      widget: !!document.querySelector(
        '#challenge-form, #challenge-running, #px-captcha, iframe[src*="challenges.cloudflare.com"], iframe[src*="captcha"], .g-recaptcha, .h-captcha',
      ),
    }));
    const wall =
      /just a moment|attention required|verify you are (a )?human|are you a robot|checking your browser|access denied|request blocked|pardon our interruption|security check/i;
    if (wall.test(signals.title))
      return `Bot-protection or access-denied page (title: “${signals.title.slice(0, 80)}”)`;
    // Short pages only: a long page that mentions "access denied" is still real content.
    if (signals.length < 1500 && (signals.widget || wall.test(signals.text)))
      return "Bot-protection or CAPTCHA page detected";
  } catch {}
  return undefined;
}
