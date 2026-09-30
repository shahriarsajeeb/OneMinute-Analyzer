"use client";

import { useState } from "react";
import { ArrowRight, RotateCw } from "lucide-react";
import {
  consoleErrors,
  failedRequests,
  formatDuration,
  type Location,
  type PageResult,
} from "@/lib/mock-data";
import { Badge } from "./ui";
import {
  cancelledRequests,
  isCancelledRequest,
  isAssetRequest,
  relatedFailedRequest,
} from "@/lib/results";
import { PageCapture } from "./page-capture";

const tabs = [
  "Screenshot",
  "Network",
  "Console",
  "Performance",
  "Details",
] as const;
type Tab = (typeof tabs)[number];

export function LocationDetail({
  location,
  result,
  testId,
  onRetest,
}: {
  location: Location;
  result: PageResult;
  testId: string;
  onRetest?: () => void;
}) {
  const [tab, setTab] = useState<Tab>("Screenshot");
  const failures = failedRequests(result);
  const cancellations = cancelledRequests(result);
  const [networkFilter, setNetworkFilter] = useState("failed");
  const [query, setQuery] = useState("");
  const visibleRequests = (
    networkFilter === "failed"
      ? failures
      : networkFilter === "cancelled"
        ? cancellations
        : result.networkRequests
  ).filter((request) =>
    request.request.toLowerCase().includes(query.toLowerCase()),
  );
  const errors = consoleErrors(result);
  const linkedMessages = errors.filter((entry) =>
    relatedFailedRequest(result, entry),
  );
  const pageLoaded =
    result.httpStatus !== null &&
    result.httpStatus >= 200 &&
    result.httpStatus < 400;
  const independentErrors = errors.filter(
    (entry) => !relatedFailedRequest(result, entry),
  );
  const observations = result.error
    ? `The check could not complete: ${result.error.message} This alone does not establish a website outage.`
    : pageLoaded
      ? `The main page responded with HTTP ${result.httpStatus}. ${failures.length || independentErrors.length ? "Review the findings below." : "No failed requests or independent console errors were observed during this visit."}`
      : `No successful main-page response was recorded${result.httpStatus ? ` (HTTP ${result.httpStatus})` : ""}.`;
  const timings = [
    [
      result.mode === "live" && result.timingVersion !== 2
        ? "Response wait (legacy)"
        : "TTFB",
      result.performance.ttfbMs,
    ],
    ...(result.timingVersion === 2
      ? ([
          ["Response wait", result.performance.responseWaitMs ?? null],
          ["DOM ready", result.performance.domContentLoadedMs ?? null],
        ] as const)
      : []),
    ["FCP", result.performance.fcpMs],
    ["LCP", result.performance.lcpMs],
    [
      result.mode === "live" ? "Full load (proxy)" : "Total Load",
      result.totalLoadMs,
    ],
  ] as const;

  return (
    <section
      className="panel detail-panel"
      aria-label={`${location.name} result details`}
    >
      <div className="detail-heading">
        <div className="country-heading">
          <span className="big-flag">{location.flag}</span>
          <div>
            <h2>
              {location.name} <Badge status={result.status} />
            </h2>
            <p>
              {result.city
                ? `${result.city}, ${location.name}`
                : `${location.name} · country-targeted proxy`}
            </p>
          </div>
        </div>
        {onRetest && (
          <button
            className="button small"
            onClick={onRetest}
            disabled={!onRetest}
          >
            <RotateCw size={12} />
            Retest this location
          </button>
        )}
      </div>
      <div className="detail-metrics">
        {[
          [
            result.error ? "Incomplete" : pageLoaded ? "Received" : "Failed",
            "Page response",
          ],
          [result.httpStatus ?? "—", "HTTP status"],
          [failures.length, "Network failures"],
          [independentErrors.length, "Other console errors"],
        ].map(([value, label]) => (
          <div key={label}>
            <strong
              className={
                label === "Load time" && result.status === "failed" ? "red" : ""
              }
            >
              {value}
            </strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="tabs" role="tablist" aria-label="Browser data">
        {tabs.map((name) => (
          <button
            key={name}
            id={`tab-${name}`}
            role="tab"
            aria-selected={tab === name}
            aria-controls="location-tab-panel"
            tabIndex={tab === name ? 0 : -1}
            className={tab === name ? "active" : ""}
            onClick={() => setTab(name)}
            onKeyDown={(event) => {
              if (
                !["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const index =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? tabs.length - 1
                    : (tabs.indexOf(name) +
                        (event.key === "ArrowRight" ? 1 : -1) +
                        tabs.length) %
                      tabs.length;
              setTab(tabs[index]);
              document.getElementById(`tab-${tabs[index]}`)?.focus();
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <div
        className="tab-content"
        role="tabpanel"
        id="location-tab-panel"
        aria-labelledby={`tab-${tab}`}
      >
        {tab === "Screenshot" && (
          <>
            <div className="capture-label">
              <span>
                {result.screenshotUrl
                  ? "BROWSER CAPTURE"
                  : result.mode === "demo"
                    ? "MOCK SCREENSHOT"
                    : "CAPTURE UNAVAILABLE"}
              </span>
              <span>
                {result.browser} · {result.viewport.width} ×{" "}
                {result.viewport.height}
              </span>
            </div>
            <PageCapture
              url={result.finalUrl}
              screenshotUrl={result.screenshotUrl}
              demo={result.mode === "demo"}
            />
            <div className="diagnosis">
              <h3>Capture evidence</h3>
              <p>{result.issue}</p>
              <p>
                {result.locationVerification?.status === "consistent"
                  ? "Exit checks before and after this visit found the same IP in the requested country. Individual website requests were not independently geolocated."
                  : `Country verification: ${result.locationVerification?.status ?? "unverified"}. The screenshot alone does not verify the requested country.`}
              </p>
              <p>Final destination: {result.finalUrl}</p>
              <details>
                <summary>Browser diagnostics</summary>
                <p>
                  These are raw observations from the capture, not a website
                  health assessment.
                </p>
                <p>{observations}</p>
                {failures.map((request, index) => (
                  <article className="finding-card" key={index}>
                    <strong
                      className={
                        isAssetRequest(request, result) ? "amber" : "red"
                      }
                    >
                      {isAssetRequest(request, result)
                        ? "Asset unavailable"
                        : "Request failed"}{" "}
                      ·{" "}
                      {request.status
                        ? `HTTP ${request.status}`
                        : "No response"}
                    </strong>
                    <code>{request.request}</code>
                    <p>
                      {request.failure ||
                        (isAssetRequest(request, result)
                          ? "Check this asset URL. Restore or replace it if needed; remove the reference if it is unused. The main page can still load without it."
                          : "Inspect this response and the affected feature. A failed request alone does not identify the underlying cause.")}
                    </p>
                  </article>
                ))}
                {cancellations.length > 0 && (
                  <article className="finding-card">
                    <strong className="amber">
                      {cancellations.length} request(s) cancelled · outcome
                      unknown
                    </strong>
                    <p>
                      The browser stopped these requests before completion. This
                      does not establish that the destination page or
                      authentication is unavailable. This test did not navigate
                      to these links or exercise sign-in.
                    </p>
                    <button
                      className="button small"
                      onClick={() => {
                        setNetworkFilter("cancelled");
                        setTab("Network");
                      }}
                    >
                      Inspect cancelled requests
                    </button>
                  </article>
                )}
                {independentErrors.map((entry, index) => (
                  <article className="finding-card" key={`console-${index}`}>
                    <strong className="red">
                      {entry.source === "runtime"
                        ? "JavaScript exception"
                        : "Console error"}
                    </strong>
                    <code>{entry.message}</code>
                    {entry.sourceUrl && <code>{entry.sourceUrl}</code>}
                    <p>
                      Reproduce the affected page behavior and inspect the
                      console trace.
                    </p>
                  </article>
                ))}
                {linkedMessages.length > 0 && (
                  <p>
                    {linkedMessages.length} matching console message(s) describe
                    recorded request outcomes, not additional issues.
                  </p>
                )}
                {result.notes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </details>
            </div>
            <div className="observation-links">
              <button
                className="button small"
                onClick={() => setTab("Network")}
              >
                {failures.length} failed requests <ArrowRight size={12} />
              </button>
              <button
                className="button small"
                onClick={() => setTab("Console")}
              >
                {errors.length} console{" "}
                {errors.length === 1 ? "error" : "errors"}{" "}
                <ArrowRight size={12} />
              </button>
            </div>
            <p className="tab-note">
              {result.mode === "demo"
                ? "Illustrative example data."
                : "Observations from one page load, with a 1.5-second capture window after load. No clicks were performed."}
            </p>
          </>
        )}
        {tab === "Network" && (
          <>
            <div className="capture-label">
              <span>NETWORK REQUESTS</span>
              <span>
                {result.networkRequests.length} requests · {failures.length}{" "}
                failed
              </span>
            </div>
            <div className="network-controls">
              <select
                aria-label="Filter network requests"
                value={networkFilter}
                onChange={(event) => setNetworkFilter(event.target.value)}
              >
                <option value="failed">Failed ({failures.length})</option>
                <option value="cancelled">
                  Cancelled ({cancellations.length})
                </option>
                <option value="all">
                  All requests ({result.networkRequests.length})
                </option>
              </select>
              <input
                aria-label="Search request URLs"
                placeholder="Search request URLs…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            {!visibleRequests.length && (
              <p className="tab-note">
                No matching requests. Select All requests to explore the
                capture.
              </p>
            )}
            <div className="table-scroll network-scroll">
              <table className="network-table">
                <thead>
                  <tr>
                    {["Method", "Request", "Status", "Duration"].map(
                      (label) => (
                        <th key={label}>{label}</th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {visibleRequests.map((request, index) => (
                    <tr
                      key={index}
                      className={
                        failures.includes(request) ? "failed-request" : ""
                      }
                    >
                      <td>{request.method}</td>
                      <td className="request-url" title={request.request}>
                        {request.request}
                        {request.failure && (
                          <small
                            className={`${isCancelledRequest(request) ? "muted" : "red"} request-failure`}
                          >
                            {request.failure}
                          </small>
                        )}
                      </td>
                      <td>
                        {isCancelledRequest(request)
                          ? `Cancelled${request.status ? ` · HTTP ${request.status}` : ""}`
                          : request.status === 0
                            ? "Failed"
                            : (request.status ?? "Not completed")}
                      </td>
                      <td>{formatDuration(request.durationMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="tab-note">
              {result.mode === "demo"
                ? "Example requests. "
                : "Requests observed while loading the submitted URL. "}{" "}
              HTTP failures describe the response, not the underlying cause.
            </p>
          </>
        )}
        {tab === "Console" && (
          <div className="console-output">
            {!result.consoleEntries.length && (
              <p className="muted">No console entries recorded.</p>
            )}
            {result.consoleEntries.map((entry, index) => (
              <p key={index} className={entry.level === "error" ? "red" : ""}>
                <b
                  className={
                    entry.level === "info"
                      ? "blue"
                      : entry.level === "warn"
                        ? "amber"
                        : "red"
                  }
                >
                  {entry.level.toUpperCase()}
                </b>{" "}
                {entry.message}
                {relatedFailedRequest(result, entry) && (
                  <span className="muted">
                    {"\n"}↳ Resource-load message · included in network
                    diagnostics
                  </span>
                )}
              </p>
            ))}
          </div>
        )}
        {tab === "Performance" && (
          <>
            <h3>Observed browser timings</h3>
            <p className="muted">
              Single visit through the proxy · no speed grade
            </p>
            <div className="performance-bars">
              {timings.map(([label, duration]) => (
                <div key={label}>
                  <div>
                    <span>{label}</span>
                    <strong>{formatDuration(duration)}</strong>
                  </div>
                  <div className="metric-track">
                    <span
                      style={{
                        width: `${duration !== null && result.totalLoadMs ? Math.min(100, (duration / result.totalLoadMs) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="tab-note">
              {result.mode === "demo"
                ? "Example timings."
                : "Full load measures navigation to the browser’s load event through DataImpulse, with HTTP cache disabled. It includes load-blocking resources and may be later than visible content. Browser startup, screenshot capture, and the post-load capture wait are excluded."}
            </p>
            {result.mode === "live" && (
              <p className="tab-note">
                FCP shows when content first appeared. DOM ready is
                DOMContentLoaded, not proof the app is interactive. LCP is the
                latest observed largest-content paint. Proxy routing and request
                interception affect these measurements; they are not direct
                server timings or a calibrated estimate for every local user.
                Missing timings display as a dash.
              </p>
            )}
          </>
        )}
        {tab === "Details" && (
          <dl className="details-list">
            {[
              ["Country", location.name],
              ["City", result.city ?? "Not verified"],
              ["Browser", result.browser],
              [
                "Viewport",
                `${result.viewport.width} × ${result.viewport.height}`,
              ],
              ["Final URL", result.finalUrl],
              ["HTTP status", result.httpStatus ?? "No response"],
              [
                "Redirects",
                result.redirects.length
                  ? result.redirects
                      .map(
                        (redirect) =>
                          `${redirect.status}: ${redirect.from} → ${redirect.to}`,
                      )
                      .join("\n")
                  : "None",
              ],
              ["Test ID", testId],
              [
                "Location verification",
                result.mode === "live"
                  ? `Before: ${result.locationVerification?.before ? `${result.locationVerification.before.ip} (${result.locationVerification.before.country.toUpperCase()})` : "unavailable"} · After: ${result.locationVerification?.after ? `${result.locationVerification.after.ip} (${result.locationVerification.after.country.toUpperCase()})` : "unavailable"}. Source: ipwho.is. Status: ${result.locationVerification?.status ?? "unverified"}`
                  : "Example data",
              ],
              ["Capture notes", result.notes.join("\n") || "None"],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}
