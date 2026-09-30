import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateTrackerRule } from "../lib/trackers";
import type { RegionalRule } from "../lib/regional-rules";
import type { NetworkRequest } from "../lib/results";

const rule: RegionalRule = { id: "t", country: "de", name: "No trackers", kind: "no-trackers", selector: "", expected: "" };
const request = (url: string, extra: Partial<NetworkRequest> = {}): NetworkRequest => ({
  method: "GET", request: url, status: 200, durationMs: 10, ...extra,
});

test("fails on tracker requests or tracker cookies before consent, naming the vendor", () => {
  const check = evaluateTrackerRule(rule, [
    request("https://example.com/app.js"),
    request("https://www.facebook.com/tr?id=1&ev=PageView"),
    request("https://region1.google-analytics.com/g/collect?v=2&gcs=G111"),
  ], ["_ga", "session"], false);
  assert.equal(check.outcome, "fail");
  assert.equal(check.observed, "Meta Pixel (www.facebook.com), Google Analytics (region1.google-analytics.com, _ga cookie)");
  assert.equal(evaluateTrackerRule(rule, [], ["_fbp"], false).outcome, "fail");
});

test("passes a clean page; consent-mode pings with storage denied and blocked requests do not count", () => {
  const check = evaluateTrackerRule(rule, [
    request("https://www.facebook.com/somepage"),
    request("https://www.google-analytics.com/g/collect?v=2&gcs=G100"),
    request("https://connect.facebook.net/en_US/fbevents.js", { status: 0, failure: "net::ERR_BLOCKED_BY_CLIENT" }),
  ], ["session", "cookie_consent"], false);
  assert.equal(check.outcome, "pass");
  assert.match(check.reason, /1 Google consent-mode ping/);
});

test("an incomplete request log or unreadable cookies is inconclusive, not a pass", () => {
  assert.equal(evaluateTrackerRule(rule, [], [], true).outcome, "inconclusive");
  assert.equal(evaluateTrackerRule(rule, [], null, false).outcome, "inconclusive");
});
