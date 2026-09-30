import { detectAccessIssue, runAssertions } from "./assertions";
import { evaluateTrackerRule } from "@/lib/trackers";
import type { RegionalRule } from "@/lib/regional-rules";
import "server-only";
import { chromium, type Browser, type Request } from "playwright";
import { createProxySession } from "../proxy/dataimpulse";
import { observeExit, verifyObservations } from "../proxy/geolocation";
import { ProxyError } from "../proxy/errors";
import { parseTarget, validateTarget, TargetError } from "./target";
import {
  summarizeResult,
  unavailableResult,
  type PageResult,
  type NetworkRequest,
} from "@/lib/results";
import { navigationTimings } from "@/lib/browser-timings";
import type { CountryCode } from "@/lib/countries";

export class RunnerError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RunnerError";
  }
}

export async function runPage(
  url: string,
  country: CountryCode,
  signal?: AbortSignal,
  expectedText?: string,
  rules: RegionalRule[] = [],
): Promise<PageResult> {
  const target = await validateTarget(url);
  const session = createProxySession(country);
  let browser: Browser | undefined;
  let deadline = false;
  const close = () => {
    void browser?.close().catch(() => {});
  };
  const timer = setTimeout(() => {
    deadline = true;
    close();
  }, 55_000);
  signal?.addEventListener("abort", close, { once: true });
  const result = unavailableResult(
    country,
    target.href,
    "NOT_STARTED",
    "Browser session did not start.",
  );
  result.error = null;
  if (rules.length)
    result.assertions = rules.map((rule) => ({
      rule,
      outcome: "inconclusive",
      observed: "Not evaluated",
      reason: "Navigation did not complete",
    }));
  try {
    if (signal?.aborted) throw new RunnerError("CANCELLED", "Test cancelled.");
    try {
      browser = await chromium.launch({
        headless: true,
        timeout: 15_000,
        proxy: session.proxy,
        args: [
          "--proxy-bypass-list=<-loopback>",
          "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
        ],
      });
    } catch {
      throw new RunnerError(
        "BROWSER_UNAVAILABLE",
        "Chromium could not start. Run npm run browser:install on the server.",
      );
    }
    if (signal?.aborted || deadline)
      throw new RunnerError("CANCELLED", "Test cancelled or timed out.");
    const context = await browser.newContext({
      viewport: result.viewport,
      serviceWorkers: "block",
      acceptDownloads: false,
      ignoreHTTPSErrors: false,
    });
    const exitBefore = await observeExit(context.request);
    context.setDefaultTimeout(5000);
    const page = await context.newPage();
    context.on("page", (popup) => {
      if (popup !== page) void popup.close().catch(() => {});
    });
    // The initial destination was already validated before the navigation clock starts.
    const checked = new Map<string, Promise<URL>>([
      [target.origin, Promise.resolve(target)],
    ]);
    let blocked = 0;
    let navigations = 0;
    let requestCount = 0;
    await context.route("**/*", async (route) => {
      const request = route.request();
      try {
        if (++requestCount > 300) throw new TargetError();
        if (
          request.isNavigationRequest() &&
          request.frame() === page.mainFrame() &&
          ++navigations > 12
        )
          throw new TargetError();
        const address = new URL(request.url());
        const key = address.origin;
        if (!checked.has(key)) checked.set(key, validateTarget(request.url()));
        // Validate every URL's syntax, and the DNS for each origin used by the page.
        parseTarget(request.url());
        await checked.get(key);
        await route.continue();
      } catch {
        blocked++;
        await route.abort("blockedbyclient").catch(() => {});
      }
    });
    await context.routeWebSocket("**/*", (socket) => {
      if (
        !result.notes.includes(
          "WebSocket connections were blocked during capture.",
        )
      )
        result.notes.push("WebSocket connections were blocked during capture.");
      socket.close();
    });
    await page.addInitScript(() => {
      const state = window as unknown as { __omaLcp: number | null };
      state.__omaLcp = null;
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            state.__omaLcp = entry.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
      } catch {}
    });
    const records = new Map<Request, NetworkRequest>();
    let truncated = false;
    const safeText = (text: string) =>
      text
        .split(session.proxy.password)
        .join("[redacted]")
        .split(session.proxy.username)
        .join("[redacted]")
        .slice(0, 3000);
    context.on("request", (request) => {
      if (records.size >= 300) {
        truncated = true;
        return;
      }
      const entry: NetworkRequest = {
        method: request.method(),
        resourceType: request.resourceType(),
        request: safeText(request.url()),
        status: null,
        durationMs: null,
      };
      records.set(request, entry);
      result.networkRequests.push(entry);
    });
    context.on("response", (response) => {
      const request = response.request();
      const entry = records.get(request);
      if (entry) entry.status = response.status();
      if (request.isNavigationRequest() && request.frame() === page.mainFrame())
        result.httpStatus = response.status();
      const from = request.redirectedFrom();
      if (
        from &&
        request.isNavigationRequest() &&
        request.frame() === page.mainFrame()
      ) {
        result.redirects.push({
          from: safeText(from.url()),
          to: safeText(request.url()),
          status: records.get(from)?.status ?? 302,
        });
      }
    });
    const finish = (request: Request) => {
      const entry = records.get(request);
      if (!entry) return;
      const timing = request.timing();
      entry.durationMs =
        timing.responseEnd >= 0 ? Math.round(timing.responseEnd) : null;
    };
    context.on("requestfinished", finish);
    context.on("requestfailed", (request) => {
      finish(request);
      const entry = records.get(request);
      if (entry) {
        entry.status = entry.status ?? 0;
        entry.failure = safeText(
          request.failure()?.errorText ?? "Network request failed",
        );
      }
    });
    page.on("console", (message) => {
      if (result.consoleEntries.length >= 100) {
        truncated = true;
        return;
      }
      result.consoleEntries.push({
        level:
          message.type() === "error"
            ? "error"
            : message.type() === "warning"
              ? "warn"
              : "info",
        message: safeText(message.text()),
        sourceUrl: safeText(message.location().url),
        source: "console",
      });
    });
    page.on("pageerror", (error) => {
      if (result.consoleEntries.length < 100)
        result.consoleEntries.push({
          level: "error",
          message: safeText(error.message),
          source: "runtime",
        });
      else truncated = true;
    });
    let navigationError = false;
    try {
      await page.goto(target.href, { waitUntil: "load", timeout: 30_000 });
    } catch (error) {
      navigationError = true;
      if (
        result.httpStatus !== null &&
        result.httpStatus >= 300 &&
        result.httpStatus < 400
      )
        result.httpStatus = null;
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      result.error = {
        code: timedOut ? "PAGE_TIMEOUT" : "PAGE_LOAD_FAILED",
        message: timedOut
          ? "Page load did not complete within 30 seconds."
          : "The page could not be loaded through the proxy. Check the destination or proxy plan.",
      };
    }
    if (!page.isClosed() && !signal?.aborted && !deadline) {
      if (expectedText) {
        result.contentCheck = { expectedText, outcome: "inconclusive" };
        if (!navigationError) {
          try {
            await page
              .getByText(
                new RegExp(
                  expectedText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                  "i",
                ),
              )
              .filter({ visible: true })
              .first()
              .waitFor({ state: "visible", timeout: 10_000 });
            result.contentCheck.outcome = "matched";
          } catch (error) {
            if (
              error instanceof Error &&
              error.name === "TimeoutError" &&
              !page.isClosed() &&
              !deadline &&
              !signal?.aborted
            )
              result.contentCheck.outcome = "not-matched";
          }
        }
      }
      if (rules.length && !navigationError && !deadline && !signal?.aborted)
        result.assertions = await runAssertions(page, rules);
      // A short observation window includes late-rendered content without waiting forever for network idle.
      await page.waitForTimeout(navigationError ? 200 : 1500).catch(() => {});
      if (!navigationError && !page.isClosed()) {
        result.accessIssue = await detectAccessIssue(page);
        if (result.assertions?.some((check) => check.rule.kind === "no-trackers")) {
          const cookies = await context
            .cookies()
            .then((items) => items.map((cookie) => cookie.name))
            .catch(() => null);
          result.assertions = result.assertions.map((check) =>
            check.rule.kind === "no-trackers"
              ? evaluateTrackerRule(
                  check.rule,
                  result.networkRequests,
                  cookies,
                  truncated,
                )
              : check,
          );
        }
      }
      if (page.url().startsWith("http")) result.finalUrl = safeText(page.url());
      try {
        const performance = await page.evaluate(() => {
          const nav = window.performance.getEntriesByType("navigation")[0] as
            PerformanceNavigationTiming | undefined;
          const paint = window.performance.getEntriesByName(
            "first-contentful-paint",
          )[0];
          return {
            navigation: nav
              ? {
                  startTime: nav.startTime,
                  requestStart: nav.requestStart,
                  responseStart: nav.responseStart,
                  domContentLoadedEventEnd: nav.domContentLoadedEventEnd,
                  loadEventEnd: nav.loadEventEnd,
                }
              : null,
            fcp: paint?.startTime ?? null,
            lcp:
              (window as unknown as { __omaLcp?: number | null }).__omaLcp ??
              null,
          };
        });
        const round = (value: number | null) =>
          value === null ? null : Math.max(0, Math.round(value));
        const timings = navigationTimings(performance.navigation);
        result.totalLoadMs = timings.totalLoadMs;
        result.timingVersion = 2;
        result.performance = {
          ttfbMs: timings.ttfbMs,
          responseWaitMs: timings.responseWaitMs,
          domContentLoadedMs: timings.domContentLoadedMs,
          fcpMs: round(performance.fcp),
          lcpMs: round(performance.lcp),
        };
      } catch {
        result.notes.push("Performance timings could not be collected.");
      }
      if (result.httpStatus !== null) {
        try {
          const screenshot = await page.screenshot({
            type: "jpeg",
            quality: 65,
            fullPage: false,
            timeout: 5000,
          });
          result.screenshotUrl = `data:image/jpeg;base64,${screenshot.toString("base64")}`;
        } catch {
          result.notes.push("The browser screenshot could not be captured.");
        }
      }
    }
    if (blocked)
      result.notes.push(
        `${blocked} requests were blocked by the public-destination policy or capture limits.`,
      );
    if (truncated)
      result.notes.push(
        "Capture limited to 300 requests and 100 console entries.",
      );
    if (result.totalLoadMs === null && !result.error)
      result.notes.push("The load event timing was unavailable.");
    if (deadline)
      result.error = {
        code: "TEST_TIMEOUT",
        message: "The browser session exceeded its time limit.",
      };
    if (signal?.aborted) throw new RunnerError("CANCELLED", "Test cancelled.");
    context.removeAllListeners();
    page.removeAllListeners();
    const exitAfter =
      !deadline && !signal?.aborted ? await observeExit(context.request) : null;
    result.locationVerification = verifyObservations(
      country,
      exitBefore,
      exitAfter,
    );
    if (deadline)
      result.error = {
        code: "TEST_TIMEOUT",
        message: "Browser check exceeded its time limit.",
      };
    summarizeResult(result);
    return result;
  } catch (error) {
    if (
      error instanceof RunnerError ||
      error instanceof ProxyError ||
      error instanceof TargetError
    )
      throw error;
    throw new RunnerError(
      deadline ? "TEST_TIMEOUT" : "BROWSER_FAILED",
      deadline
        ? "The browser session exceeded its time limit."
        : "The browser session ended before collection completed.",
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", close);
    await browser?.close().catch(() => {});
  }
}
