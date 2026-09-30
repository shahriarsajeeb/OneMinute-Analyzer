"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BadgeDollarSign,
  Camera,
  ClipboardList,
  Cookie,
  Eye,
  FileSearch,
  Globe2,
  Languages,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { Badge, Logo, LocationSelector } from "./ui";
import { WorldMap } from "./world-map";
import { CheckSetup } from "./regional-rule-editor";
import { isCountryCode } from "@/lib/countries";
import { validateRules, type RegionalRule } from "@/lib/regional-rules";
import { TestProgress } from "./test-progress";
import { normalizeUrl } from "@/lib/test-session";
import { saveResult, listResults } from "@/lib/result-storage";
import type { TestResult } from "@/lib/results";

// Illustrative figures for the hero; labelled as an example in the UI.
const heroCards = [
  { id: "us", slot: "us", flag: "🇺🇸", country: "United States", status: "pass", check: "Product price matched", expected: "USD 29", observed: "USD 29" },
  { id: "de", slot: "de", flag: "🇩🇪", country: "Germany", status: "pass", check: "Consent controls matched", expected: "Reject option", observed: "“Alle ablehnen”" },
  { id: "br", slot: "jp", flag: "🇧🇷", country: "Brazil", status: "failed", check: "Product price mismatch", expected: "BRL 149", observed: "$29" },
] as const;

const steps: [LucideIcon, string, string][] = [
  [ClipboardList, "Configure per country", "Enter a URL, choose countries and state what each should see: price, language, consent controls, features."],
  [Globe2, "Isolated regional sessions", "Each country runs in a fresh browser through a country-targeted exit, checked before and after the visit."],
  [FileSearch, "Evaluate every check", "Each assertion inspects the element you selected. Screenshots are saved; background errors stay in diagnostics."],
  [ShieldCheck, "Actionable report", "“Brazil: expected BRL 149, observed $29.” Blocked or unverified sessions are Inconclusive, never a pass."],
];

export function Landing() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [selected, setSelected] = useState<string[]>(["us", "gb"]);
  const [rules, setRules] = useState<RegionalRule[]>([]);
  const [ready, setReady] = useState(false);
  const [setup, setSetup] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<TestResult[]>([]);
  useEffect(() => {
    void listResults().then(setHistory);
    try {
      const saved = JSON.parse(
        localStorage.getItem("regional-config") ?? "null",
      );
      if (saved) {
        // Drafts may hold unfinished checks; keep each one that still parses.
        if (Array.isArray(saved.rules))
          setRules(
            saved.rules.flatMap((rule: unknown) => {
              try {
                const [valid] = validateRules([
                  { ...(rule as RegionalRule), name: (rule as RegionalRule).name || "Check", selector: (rule as RegionalRule).selector || "x", expected: (rule as RegionalRule).expected || "x" },
                ]);
                return valid ? [{ ...(rule as RegionalRule), kind: valid.kind }] : [];
              } catch {
                return [];
              }
            }),
          );
        setUrl(saved.url ?? "");
        if (Array.isArray(saved.selected))
          setSelected(saved.selected.filter(isCountryCode));
      }
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem(
          "regional-config",
          JSON.stringify({ url, rules, selected }),
        );
      } catch {}
    }
  }, [ready, url, rules, selected]);
  const runRules = useMemo(
    () => rules.filter((rule) => selected.includes(rule.country)),
    // Frozen when the run starts, so editing state cannot restart a paid run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [running],
  );
  const complete = useCallback(
    async (result: TestResult) => {
      const saved = await saveResult(result);
      if (!saved)
        setError(
          "Browser storage unavailable; this capture is available for this session only.",
        );
      router.push("/result");
    },
    [router],
  );
  function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      if (!selected.length) throw new Error("Choose at least one country.");
      setUrl(normalizeUrl(url));
      setError("");
      setSetup(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Enter a valid URL");
    }
  }
  return (
    <>
      <header className="site-header">
        <div className="container nav">
          <Logo />
          <nav>
            <a href="#how">How it works</a>
            <a href="#history">Run history</a>
          </nav>
        </div>
      </header>
      <main>
        <section className="container hero">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="live-dot" /> REGIONAL QUALITY ASSURANCE
            </span>
            <h1>
              HTTP 200.
              <br />
              <span>Wrong experience?</span>
            </h1>
            <p className="hero-description">
              Check pricing, language, consent UI and feature visibility from
              real browsers in each country. See exactly what differs: not
              just “Brazil failed”.
            </p>
            <form className="test-form" onSubmit={submit}>
              <div className="test-input">
                <Camera size={19} />
                <input
                  aria-label="Website URL"
                  required
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://yourwebsite.com"
                />
              </div>
              <LocationSelector selected={selected} onChange={setSelected} />
              <button className="button primary run-button" type="submit">
                Run regional checks <ArrowRight size={16} />
              </button>
            </form>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <div className="trust-row">
              <span>
                <Globe2 size={13} /> Fresh browser per country
              </span>
              <span>
                <ShieldCheck size={13} /> Exit country verified
              </span>
              <span>
                <Camera size={13} /> Screenshot evidence
              </span>
            </div>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="visual-topline">
              <span>
                <span className="live-dot" />
                EXAMPLE REPORT
              </span>
              <span>3 countries · 3 checks</span>
            </div>
            <WorldMap hero ids={["us", "de", "br"]} selected="br" statuses={{ us: "pass", de: "pass", br: "failed" }} />
            {heroCards.map((card) => (
              <div key={card.id} className={`floating-result result-${card.slot}`}>
                <div>
                  <span>
                    {card.flag}
                    <b>{card.country}</b>
                  </span>
                  <Badge status={card.status} />
                </div>
                <p>
                  Expected <strong>{card.expected}</strong>
                </p>
                <p>
                  Observed <strong>{card.observed}</strong>
                </p>
                <div
                  className="result-foot"
                  style={card.status === "failed" ? { color: "var(--red)" } : undefined}
                >
                  {card.check}
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="container confidence-strip">
          <span>WHAT EACH COUNTRY IS CHECKED FOR</span>
          <div>
            <BadgeDollarSign /> Price &amp; currency
          </div>
          <div>
            <Languages /> Visible language
          </div>
          <div>
            <Cookie /> Consent controls
          </div>
          <div>
            <Eye /> Feature visibility
          </div>
        </section>
        <section id="how" className="container workflow">
          <div className="section-intro">
            <div>
              <span className="eyebrow">HOW IT WORKS</span>
              <h2>Expectations in. Evidence out.</h2>
            </div>
            <p>
              A pass means only that the stated expectation was met.
              <br />
              Missing access or unreliable execution is reported as
              Inconclusive.
            </p>
          </div>
          <div className="steps">
            {steps.map(([Icon, title, text], index) => (
              <div className="step" key={title}>
                <div className="step-top">
                  <span className="step-icon">
                    <Icon size={16} />
                  </span>
                  <span className="step-number">0{index + 1}</span>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </section>
        <section id="history" className="container" style={{ paddingTop: 32, paddingBottom: 56 }}>
          <div className="panel" style={{ padding: 24 }}>
            <h2>Run history</h2>
            <p className="tab-note">
              Latest 20 runs stored in this browser. Export screenshots before
              clearing browser data.
            </p>
            {!history.length && (
              <p className="muted">Your regional runs will appear here.</p>
            )}
            {history.map((run) => (
              <div key={run.id} className="history-row">
                <div>
                  <strong>{run.url}</strong>
                  <p className="muted">
                    {new Date(run.completedAt).toLocaleString()} ·{" "}
                    {run.results.length} countries
                  </p>
                </div>
                <button
                  className="button small"
                  onClick={async () => {
                    await saveResult(run);
                    router.push("/result");
                  }}
                >
                  Open report
                </button>
              </div>
            ))}
          </div>
        </section>
      </main>
      <footer className="container">
        <Logo />
        <span>Regional checks from real browsers · OneMinute Analyzer</span>
      </footer>
      {setup && (
        <CheckSetup
          url={url}
          countries={selected}
          rules={rules}
          onChange={setRules}
          onBack={() => setSetup(false)}
          onRun={() => {
            setSetup(false);
            setRunning(true);
          }}
        />
      )}
      {running && (
        <TestProgress
          ids={selected}
          rules={runRules}
          url={url}
          onComplete={complete}
          onCancel={() => setRunning(false)}
        />
      )}
    </>
  );
}
