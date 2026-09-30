import type { AssertionResult, RegionalRule } from "./regional-rules";
export type ExitObservation = {
  ip: string;
  country: string;
  checkedAt: string;
};
export type LocationVerification = {
  status: "consistent" | "unverified" | "mismatch" | "changed";
  before: ExitObservation | null;
  after: ExitObservation | null;
  provider: "ipwho.is";
};
export type Status = "pass" | "warning" | "failed";
export type NetworkRequest = {
  method: string;
  request: string;
  status: number | null;
  durationMs: number | null;
  failure?: string;
  resourceType?: string;
};
export type ConsoleEntry = {
  level: "info" | "warn" | "error";
  message: string;
  sourceUrl?: string;
  source?: "console" | "runtime";
};
export type PageResult = {
  mode: "live" | "demo";
  locationId: string;
  city: string | null;
  status: Status;
  httpStatus: number | null;
  totalLoadMs: number | null;
  finalUrl: string;
  screenshotUrl: string | null;
  networkRequests: NetworkRequest[];
  consoleEntries: ConsoleEntry[];
  redirects: { from: string; to: string; status: number }[];
  performance: {
    ttfbMs: number | null;
    fcpMs: number | null;
    lcpMs: number | null;
    domContentLoadedMs?: number | null;
    responseWaitMs?: number | null;
  };
  browser: string;
  viewport: { width: number; height: number };
  issue: string;
  error: { code: string; message: string } | null;
  notes: string[];
  timingVersion?: 2;
  assertions?: AssertionResult[];
  locationVerification?: LocationVerification;
  /** Set when the response was a bot wall or access-denied page. */
  accessIssue?: string;
  contentCheck?: {
    expectedText: string;
    outcome: "matched" | "not-matched" | "inconclusive";
  };
};
export type TestResult = {
  mode: "live" | "demo";
  id: string;
  url: string;
  rules?: RegionalRule[];
  completedAt: string;
  expectedText?: string;
  results: PageResult[];
};
/** Cancellation is an incomplete observation, not evidence of an unavailable route. */
export function isCancelledRequest(request: NetworkRequest) {
  return (
    request.failure === "net::ERR_ABORTED" &&
    !(request.status !== null && request.status >= 400)
  );
}
export function cancelledRequests(result: PageResult) {
  return result.networkRequests.filter(isCancelledRequest);
}
export function failedRequests(result: PageResult) {
  return result.networkRequests.filter(
    (request) =>
      !isCancelledRequest(request) &&
      (!!request.failure ||
        request.status === 0 ||
        (request.status !== null && request.status >= 400)),
  );
}
export function consoleErrors(result: PageResult) {
  return result.consoleEntries.filter((entry) => entry.level === "error");
}
export function formatDuration(milliseconds: number | null) {
  if (milliseconds === null) return "—";
  return milliseconds < 1000
    ? `${Math.round(milliseconds)}ms`
    : `${(milliseconds / 1000).toFixed(1)}s`;
}
export function unavailableResult(
  locationId: string,
  url: string,
  code: string,
  message: string,
): PageResult {
  return {
    mode: "live",
    locationId,
    city: null,
    status: "warning",
    httpStatus: null,
    totalLoadMs: null,
    finalUrl: url,
    screenshotUrl: null,
    networkRequests: [],
    consoleEntries: [],
    redirects: [],
    performance: { ttfbMs: null, fcpMs: null, lcpMs: null },
    browser: "Chromium",
    viewport: { width: 1440, height: 900 },
    issue: message,
    error: { code, message },
    notes: [],
  };
}
/** Asset failures remain visible, but do not imply the whole page is unavailable. */
export function isAssetRequest(
  request: NetworkRequest,
  result: PageResult,
): boolean {
  if (request.request.split("#")[0] === result.finalUrl.split("#")[0])
    return false;
  if (request.resourceType)
    return ["image", "font", "media"].includes(request.resourceType);
  // Older saved captures have no resource type. Infer only common static assets.
  if (request.method !== "GET") return false;
  try {
    return /\.(svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|mp[34]|webm|ogg|wav)$/i.test(
      new URL(request.request, result.finalUrl).pathname,
    );
  } catch {
    return false;
  }
}

export function relatedFailedRequest(
  result: PageResult,
  entry: ConsoleEntry,
): NetworkRequest | undefined {
  if (
    entry.level !== "error" ||
    entry.source === "runtime" ||
    !/^Failed to load resource:/i.test(entry.message)
  )
    return;
  const failures = [...failedRequests(result), ...cancelledRequests(result)];
  if (entry.sourceUrl)
    return failures.find((request) => request.request === entry.sourceUrl);
  // Legacy captures: correlate only an unambiguous resource failure with the same status.
  const status = entry.message.match(/status of (\d{3})\b/i)?.[1];
  if (!status) return;
  const candidates = failures.filter(
    (request) => request.status === Number(status),
  );
  return candidates.length === 1 ? candidates[0] : undefined;
}

/**
 * Why this session cannot support a regional verdict, if it cannot.
 * Checks are only counted when the page under test was served from the requested country.
 */
export function gateReason(result: PageResult): string | null {
  if (result.mode === "demo") return null;
  if (result.error) return `The run did not complete: ${result.error.message}`;
  if (result.httpStatus === null) return "No page response was recorded";
  if (result.httpStatus >= 400)
    return `The page was not served (HTTP ${result.httpStatus})`;
  if (result.accessIssue) return result.accessIssue;
  switch (result.locationVerification?.status) {
    case "consistent":
      return null;
    case "mismatch":
      return "The exit IP was outside the requested country";
    case "changed":
      return "The exit IP changed during the visit";
    default:
      return "The exit country could not be verified";
  }
}

/** The outcome a check contributes to the report, after the session gate. */
export function checkVerdict(result: PageResult, check: AssertionResult) {
  const gate = gateReason(result);
  return gate
    ? {
        outcome: "inconclusive" as const,
        reason: `${gate}. The observed value is not counted.`,
      }
    : { outcome: check.outcome, reason: check.reason };
}

export function summarizeResult(result: PageResult): void {
  if (result.mode === "demo") return;
  if (result.assertions?.length) {
    const gate = gateReason(result);
    const outcomes = result.assertions.map((check) => check.outcome);
    if (gate) {
      result.status = "warning";
      result.issue = `Inconclusive: ${gate}`;
    } else if (outcomes.includes("fail")) {
      const count = outcomes.filter((outcome) => outcome === "fail").length;
      result.status = "failed";
      result.issue = `${count} configured ${count === 1 ? "expectation" : "expectations"} did not match`;
    } else if (outcomes.includes("inconclusive")) {
      result.status = "warning";
      result.issue = "Some checks could not be evaluated";
    } else {
      result.status = "pass";
      result.issue = "All configured expectations matched";
    }
    return;
  }
  result.status = result.screenshotUrl && !result.accessIssue ? "pass" : "warning";
  result.issue = !result.screenshotUrl
    ? (result.error?.message ?? "Screenshot unavailable")
    : result.accessIssue
      ? `Screenshot shows a blocked page: ${result.accessIssue}`
      : "Screenshot captured; no regional rules evaluated";
}
