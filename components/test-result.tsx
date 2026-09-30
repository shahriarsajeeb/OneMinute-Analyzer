"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "./ui";
import { LocationDetail } from "./location-detail";
import { readResult } from "@/lib/result-storage";
import { locations } from "@/lib/mock-data";
import { checkVerdict, type PageResult, type TestResult } from "@/lib/results";
import type { RegionalRule } from "@/lib/regional-rules";

const labels = { pass: "Matched", fail: "Mismatch", inconclusive: "Inconclusive" };
const tones = { pass: "green", fail: "red", inconclusive: "amber" };

function countryVerdict(result: PageResult) {
  if (!result.assertions?.length)
    return result.status === "pass"
      ? { label: "Captured", tone: "muted" }
      : { label: "Inconclusive", tone: "amber" };
  return result.status === "pass"
    ? { label: "Matched", tone: "green" }
    : result.status === "failed"
      ? { label: "Mismatch", tone: "red" }
      : { label: "Inconclusive", tone: "amber" };
}

function expectedLabel(rule: RegionalRule) {
  switch (rule.kind) {
    case "visible":
      return "Visible";
    case "hidden":
      return "Absent or hidden";
    case "no-trackers":
      return "No tracking before consent";
    case "contains":
      return `Shows “${rule.expected}”`;
    case "not-contains":
      return `Does not show “${rule.expected}”`;
    default:
      return rule.expected;
  }
}

export function TestResultPage() {
  const [run, setRun] = useState<TestResult | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    void readResult().then((value) => {
      setRun(value);
      setActive(value?.results[0]?.locationId ?? null);
      setLoaded(true);
    });
  }, []);
  const selected =
    run?.results.find((item) => item.locationId === active) ?? null;
  const selectedLocation = locations.find(
    (item) => item.id === selected?.locationId,
  );
  return (
    <>
      <header className="site-header">
        <div className="container nav">
          <Logo />
          <Link className="button" href="/">
            New run / history
          </Link>
        </div>
      </header>
      <main className="container result-main">
        <div className="result-title">
          <div>
            <h1>Regional QA results</h1>
            <p className="result-url">{run?.url}</p>
            {run && (
              <p className="tab-note">
                {new Date(run.completedAt).toLocaleString()} ·{" "}
                {run.results.length} country-targeted sessions ·{" "}
                {run.results.filter((result) => result.screenshotUrl).length}{" "}
                screenshots
              </p>
            )}
          </div>
        </div>
        {!run && (
          <p>
            {loaded
              ? "No saved capture. Start a capture from the dashboard."
              : "Loading capture…"}
          </p>
        )}
        {run && (
          <>
            <p className="timing-context">
              Results apply only to configured checks. Each country needs
              consistent exit probes for a conclusive regional verdict.
              Background network errors do not determine these results.
            </p>
            <div className="country-tabs" role="tablist" aria-label="Countries">
              {run.results.map((result) => {
                const location = locations.find(
                  (item) => item.id === result.locationId,
                );
                const verdict = countryVerdict(result);
                return (
                  <button
                    key={result.locationId}
                    type="button"
                    role="tab"
                    aria-selected={active === result.locationId}
                    className={active === result.locationId ? "active" : ""}
                    onClick={() => setActive(result.locationId)}
                  >
                    <span className="country-tab-name">
                      {location?.flag} {location?.name ?? result.locationId}
                    </span>
                    <span className={`country-tab-verdict ${verdict.tone}`}>
                      <i />
                      {verdict.label}
                    </span>
                  </button>
                );
              })}
            </div>
            {selected && (
              <>
                <section className="panel checks-panel">
                  <div className="checks-head">
                    <div>
                      <h2>
                        {selectedLocation?.flag}{" "}
                        {selectedLocation?.name ?? selected.locationId}
                        <span
                          className={`country-tab-verdict ${countryVerdict(selected).tone}`}
                        >
                          <i />
                          {countryVerdict(selected).label}
                        </span>
                      </h2>
                      <p className="tab-note">
                        {selected.issue} · HTTP {selected.httpStatus ?? "—"} ·
                        Exit checks:{" "}
                        {selected.locationVerification?.status ?? "unverified"}
                      </p>
                    </div>
                    {selected.screenshotUrl && (
                      <a
                        className="button small"
                        href={selected.screenshotUrl}
                        download={`${run.id}-${selected.locationId}.jpg`}
                      >
                        Download JPEG
                      </a>
                    )}
                  </div>
                  {!selected.assertions?.length ? (
                    <p className="tab-note">
                      No checks were configured for this country. The
                      screenshot below is the capture.
                    </p>
                  ) : (
                    <div className="assertion-grid">
                      {selected.assertions.map((check) => {
                        const verdict = checkVerdict(selected, check);
                        return (
                          <div className="assertion-card" key={check.rule.id}>
                            <div className="capture-card-heading">
                              <strong>{check.rule.name}</strong>
                              <span className={tones[verdict.outcome]}>
                                {labels[verdict.outcome]}
                              </span>
                            </div>
                            <dl>
                              <dt>Expected</dt>
                              <dd>{expectedLabel(check.rule)}</dd>
                              <dt>Observed</dt>
                              <dd>{check.observed}</dd>
                            </dl>
                            <p className="tab-note">{verdict.reason}</p>
                            <code>
                              {check.rule.kind === "language"
                                ? "html[lang]"
                                : check.rule.kind === "no-trackers"
                                  ? "Network requests + cookies"
                                  : check.rule.selector || "Whole page"}
                            </code>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
                {selectedLocation && (
                  <div style={{ marginTop: 20 }}>
                    <LocationDetail
                      key={selected.locationId}
                      result={selected}
                      location={selectedLocation}
                      testId={run.id}
                    />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
export { TestResultPage as TestResult };
