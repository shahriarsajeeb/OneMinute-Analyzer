import type { AssertionResult, RegionalRule } from "./regional-rules";
import type { NetworkRequest } from "./results";

/** Hosts whose requests send visitor data to an analytics or advertising vendor. */
const trackerHosts: [RegExp, string][] = [
  [/(^|\.)google-analytics\.com$|^analytics\.google\.com$/, "Google Analytics"],
  [/(^|\.)doubleclick\.net$|(^|\.)googleadservices\.com$|(^|\.)googlesyndication\.com$/, "Google Ads"],
  [/^connect\.facebook\.net$/, "Meta Pixel"],
  [/(^|\.)facebook\.com$/, "Meta Pixel"],
  [/^analytics\.tiktok\.com$/, "TikTok Pixel"],
  [/^bat\.bing\.com$/, "Microsoft Ads"],
  [/(^|\.)clarity\.ms$/, "Microsoft Clarity"],
  [/(^|\.)hotjar\.(com|io)$/, "Hotjar"],
  [/^snap\.licdn\.com$|^px\.ads\.linkedin\.com$/, "LinkedIn Insight"],
  [/^ct\.pinterest\.com$|^s\.pinimg\.com$/, "Pinterest Tag"],
  [/^static\.ads-twitter\.com$|^analytics\.twitter\.com$/, "X (Twitter) Pixel"],
  [/^(api|cdn)\.segment\.(io|com)$/, "Segment"],
  [/(^|\.)mixpanel\.com$/, "Mixpanel"],
  [/(^|\.)amplitude\.com$/, "Amplitude"],
  [/(^|\.)heapanalytics\.com$/, "Heap"],
  [/(^|\.)fullstory\.com$/, "FullStory"],
  [/^sc-static\.net$|^tr\.snapchat\.com$/, "Snap Pixel"],
];
/** Cookies these vendors set to identify a visitor. */
const trackerCookies: [RegExp, string][] = [
  [/^_ga(_.+)?$|^_gid$/, "Google Analytics"],
  [/^_gcl_(au|aw|dc)$/, "Google Ads"],
  [/^_fb[pc]$/, "Meta Pixel"],
  [/^_ttp$|^_tt_enable_cookie$/, "TikTok Pixel"],
  [/^_uet(sid|vid)$/, "Microsoft Ads"],
  [/^_cl(ck|sk)$/, "Microsoft Clarity"],
  [/^_hj(SessionUser|Session|id)/, "Hotjar"],
  [/^ajs_(anonymous|user)_id$/, "Segment"],
  [/^mp_.+_mixpanel$/, "Mixpanel"],
  [/^AMP_/, "Amplitude"],
  [/^_pin_unauth$/, "Pinterest Tag"],
  [/^li_sugr$/, "LinkedIn Insight"],
];

export type TrackerFinding = { vendor: string; evidence: string };

function vendorFor(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    // facebook.com itself is only a tracker for the pixel endpoint.
    if (/(^|\.)facebook\.com$/.test(host) && !new URL(url).pathname.startsWith("/tr"))
      return null;
    return trackerHosts.find(([pattern]) => pattern.test(host))?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Google consent mode sends cookieless pings when storage is denied (gcs=G100).
 * They are listed separately and do not fail the check.
 */
function isDeniedConsentPing(url: string) {
  try {
    return new URL(url).searchParams.get("gcs") === "G100";
  } catch {
    return false;
  }
}

export function findTrackers(
  requests: NetworkRequest[],
  cookieNames: string[],
): { findings: TrackerFinding[]; consentModePings: number } {
  const findings = new Map<string, TrackerFinding>();
  let consentModePings = 0;
  for (const request of requests) {
    // Requests blocked inside the browser were never sent.
    if (request.failure?.includes("ERR_BLOCKED_BY_CLIENT")) continue;
    const vendor = vendorFor(request.request);
    if (!vendor) continue;
    if (isDeniedConsentPing(request.request)) {
      consentModePings++;
      continue;
    }
    if (!findings.has(vendor))
      findings.set(vendor, {
        vendor,
        evidence: new URL(request.request).hostname,
      });
  }
  for (const name of cookieNames) {
    const vendor = trackerCookies.find(([pattern]) => pattern.test(name))?.[1];
    if (!vendor) continue;
    const existing = findings.get(vendor);
    if (existing) {
      if (!existing.evidence.includes("cookie"))
        existing.evidence += `, ${name} cookie`;
    } else findings.set(vendor, { vendor, evidence: `${name} cookie` });
  }
  return { findings: [...findings.values()], consentModePings };
}

/**
 * The visit never clicks a consent control, so everything observed happened
 * before the visitor consented.
 */
export function evaluateTrackerRule(
  rule: RegionalRule,
  requests: NetworkRequest[],
  cookieNames: string[] | null,
  truncated: boolean,
): AssertionResult {
  if (cookieNames === null)
    return {
      rule,
      outcome: "inconclusive",
      observed: "Cookies could not be read",
      reason: "The browser session ended before cookies were collected",
    };
  const { findings, consentModePings } = findTrackers(requests, cookieNames);
  const pings = consentModePings
    ? ` ${consentModePings} Google consent-mode ping(s) with storage denied were not counted.`
    : "";
  if (findings.length)
    return {
      rule,
      outcome: "fail",
      observed: findings
        .map((finding) => `${finding.vendor} (${finding.evidence})`)
        .join(", "),
      reason: `Tracking ran before any consent was given. No consent control was clicked during this visit.${pings}`,
    };
  if (truncated)
    return {
      rule,
      outcome: "inconclusive",
      observed: "No trackers in the recorded requests",
      reason: "The request log hit its 300-request limit, so later trackers may be missing",
    };
  return {
    rule,
    outcome: "pass",
    observed: "No tracking requests or tracking cookies",
    reason: `Nothing from known analytics or advertising vendors was observed before consent.${pings}`,
  };
}
