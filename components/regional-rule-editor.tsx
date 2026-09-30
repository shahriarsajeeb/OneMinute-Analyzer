"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Trash2, X } from "lucide-react";
import {
  needsExpected,
  scopeOptional,
  validateRules,
  type RegionalRule,
} from "@/lib/regional-rules";
import { locations } from "@/lib/mock-data";
import { parseExpectedPrice } from "@/lib/prices";

type Preset = {
  label: string;
  hint: string;
  rule: Pick<RegionalRule, "kind" | "name" | "selector" | "expected">;
};
const presets: Preset[] = [
  {
    label: "Price",
    hint: "The page shows this price, e.g. ฿1,000",
    rule: { kind: "price", name: "Price", selector: "", expected: "" },
  },
  {
    label: "Text on page",
    hint: "The page shows this text, e.g. “Regional pricing for Thailand”",
    rule: { kind: "contains", name: "Text on page", selector: "", expected: "" },
  },
  {
    label: "Text not on page",
    hint: "The page does not show this text",
    rule: { kind: "not-contains", name: "Text not on page", selector: "", expected: "" },
  },
  {
    label: "Language",
    hint: "The page declares this language",
    rule: { kind: "language", name: "Page language", selector: "", expected: "" },
  },
  {
    label: "No trackers before consent",
    hint: "No analytics or ad trackers load before the visitor consents (GDPR)",
    rule: { kind: "no-trackers", name: "No trackers before consent", selector: "", expected: "" },
  },
  {
    label: "Cookie banner shown",
    hint: "The consent banner element is visible",
    rule: { kind: "visible", name: "Cookie banner", selector: "", expected: "" },
  },
  {
    label: "Feature shown",
    hint: "An element is visible in this country",
    rule: { kind: "visible", name: "Feature shown", selector: "", expected: "" },
  },
  {
    label: "Feature hidden",
    hint: "An element is absent or hidden in this country",
    rule: { kind: "hidden", name: "Feature hidden", selector: "", expected: "" },
  },
];
const kindLabels: Record<RegionalRule["kind"], string> = {
  price: "Page shows price",
  contains: "Page shows",
  "not-contains": "Page does not show",
  text: "Element shows exact text",
  visible: "Element is visible",
  hidden: "Element is absent or hidden",
  language: "Page language is",
  "no-trackers": "No trackers before consent",
};
const defaultNames: Record<RegionalRule["kind"], string> = {
  price: "Price",
  contains: "Text on page",
  "not-contains": "Text not on page",
  text: "Text",
  visible: "Element shown",
  hidden: "Element hidden",
  language: "Page language",
  "no-trackers": "No trackers before consent",
};
const helpText: Record<RegionalRule["kind"], string> = {
  price:
    "Reads the prices shown on the page and compares the amount, e.g. $39.99, ฿1,000 or BRL 149. Include the currency to check it too; a bare amount like 39.99 matches any currency.",
  contains:
    "Passes when this text is visible anywhere on the page (case and spacing ignored). Add an element only to narrow the search.",
  "not-contains":
    "Passes when this text is not visible on the page for the whole observation window.",
  text: "A CSS selector for one element. Its visible text must match exactly, currency included.",
  visible: "A CSS selector for one element, e.g. #early-access.",
  hidden: "A CSS selector for one element, e.g. #early-access.",
  language: "Compared with the page’s lang attribute, e.g. “pt-BR”.",
  "no-trackers":
    "Fails if Google Analytics, Meta Pixel, TikTok, Hotjar or similar send requests or set cookies during the visit. No consent is ever clicked, so everything observed is pre-consent.",
};

/** Step two of a run: what each selected country should see. */
export function CheckSetup({
  url,
  countries,
  rules,
  onChange,
  onBack,
  onRun,
}: {
  url: string;
  countries: string[];
  rules: RegionalRule[];
  onChange: (rules: RegionalRule[]) => void;
  onBack: () => void;
  onRun: (rules: RegionalRule[]) => void;
}) {
  const [active, setActive] = useState(countries[0]);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    dialog.current?.focus();
  }, []);
  const visibleRules = rules.filter((rule) => countries.includes(rule.country));
  const countryRules = visibleRules.filter((rule) => rule.country === active);
  const location = locations.find((item) => item.id === active);
  const update = (id: string, change: Partial<RegionalRule>) =>
    onChange(
      rules.map((rule) => (rule.id === id ? { ...rule, ...change } : rule)),
    );
  const unchecked = countries.filter(
    (country) => !visibleRules.some((rule) => rule.country === country),
  );

  function run() {
    const named = visibleRules.map((rule) => ({
      ...rule,
      name: rule.name.trim() || defaultNames[rule.kind],
    }));
    try {
      validateRules(named);
    } catch (error) {
      const missingElement = (rule: RegionalRule) =>
        !scopeOptional(rule.kind) && !rule.selector.trim();
      const badPrice = (rule: RegionalRule) =>
        rule.kind === "price" &&
        !!rule.expected.trim() &&
        !parseExpectedPrice(rule.expected);
      const broken = named.find(
        (rule) =>
          missingElement(rule) ||
          (needsExpected(rule.kind) && !rule.expected.trim()) ||
          badPrice(rule),
      );
      if (broken) setActive(broken.country);
      setError(
        broken
          ? `Finish “${broken.name}” for ${locations.find((item) => item.id === broken.country)?.name}: ${
              missingElement(broken)
                ? "choose the element to inspect."
                : badPrice(broken)
                  ? "enter one price, e.g. $39.99, ฿1,000 or BRL 149."
                  : "enter the expected value."
            }`
          : error instanceof Error
            ? error.message
            : "Some checks are incomplete.",
      );
      return;
    }
    onChange([
      ...rules.filter((rule) => !countries.includes(rule.country)),
      ...named,
    ]);
    onRun(named);
  }

  return (
    <div className="modal-backdrop">
      <section
        ref={dialog}
        tabIndex={-1}
        className="panel setup-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") onBack();
        }}
      >
        <header className="setup-head">
          <div>
            <span className="eyebrow">STEP 2 OF 2 · WHAT SHOULD EACH COUNTRY SEE?</span>
            <h2 id="setup-title">Set up checks</h2>
            <p className="mono submitted-url">{url}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            onClick={onBack}
          >
            <X size={16} />
          </button>
        </header>

        <div className="setup-tabs" role="tablist" aria-label="Countries">
          {countries.map((country) => {
            const item = locations.find((entry) => entry.id === country);
            const count = visibleRules.filter(
              (rule) => rule.country === country,
            ).length;
            return (
              <button
                key={country}
                type="button"
                role="tab"
                aria-selected={active === country}
                className={active === country ? "active" : ""}
                onClick={() => setActive(country)}
              >
                <span>{item?.flag}</span> {item?.name}
                <small>{count || "—"}</small>
              </button>
            );
          })}
        </div>

        <div className="setup-body">
          <p className="setup-label">
            Add a check for {location?.name}
          </p>
          <div className="preset-row">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="preset-chip"
                title={preset.hint}
                disabled={rules.length >= 30}
                onClick={() => {
                  setError("");
                  onChange([
                    ...rules,
                    { id: crypto.randomUUID(), country: active, ...preset.rule },
                  ]);
                }}
              >
                + {preset.label}
              </button>
            ))}
          </div>

          {!countryRules.length && (
            <div className="setup-empty">
              <strong>No checks for {location?.name} yet</strong>
              <p>
                Pick a check above, or leave it empty to capture a screenshot
                only.
              </p>
            </div>
          )}

          {countryRules.map((rule) => (
            <div className="check-card" key={rule.id}>
              <div className="check-card-top">
                <input
                  className="check-name"
                  aria-label="Check name"
                  value={rule.name}
                  placeholder={defaultNames[rule.kind]}
                  maxLength={100}
                  onChange={(event) =>
                    update(rule.id, { name: event.target.value })
                  }
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove ${rule.name || "check"}`}
                  onClick={() =>
                    onChange(rules.filter((item) => item.id !== rule.id))
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="check-fields">
                <label className="check-kind">
                  Check
                  <select
                    value={rule.kind}
                    onChange={(event) =>
                      update(rule.id, {
                        kind: event.target.value as RegionalRule["kind"],
                      })
                    }
                  >
                    {Object.entries(kindLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                {needsExpected(rule.kind) && (
                  <label>
                    {rule.kind === "language"
                      ? "Language"
                      : rule.kind === "price"
                        ? "Price"
                        : "Text"}
                    <input
                      value={rule.expected}
                      list={rule.kind === "language" ? "language-codes" : undefined}
                      placeholder={
                        rule.kind === "language"
                          ? "pt-BR"
                          : rule.kind === "price"
                            ? "฿1,000"
                            : "Regional pricing for Thailand"
                      }
                      maxLength={200}
                      onChange={(event) =>
                        update(rule.id, { expected: event.target.value })
                      }
                    />
                  </label>
                )}
                {rule.kind !== "language" && rule.kind !== "no-trackers" && (
                  <label>
                    {scopeOptional(rule.kind) ? "Only inside element (optional)" : "Element"}
                    <input
                      value={rule.selector}
                      placeholder={
                        scopeOptional(rule.kind)
                          ? "Whole page"
                          : rule.name === "Cookie banner"
                            ? "#cookie-banner"
                            : "#early-access"
                      }
                      maxLength={300}
                      onChange={(event) =>
                        update(rule.id, { selector: event.target.value })
                      }
                    />
                  </label>
                )}
              </div>
              <p className="check-help">{helpText[rule.kind]}</p>
            </div>
          ))}
          <datalist id="language-codes">
            {["en", "en-US", "en-GB", "pt-BR", "es", "de", "fr", "nl", "ja", "th", "hi"].map(
              (code) => (
                <option key={code} value={code} />
              ),
            )}
          </datalist>
        </div>

        <footer className="setup-foot">
          <div>
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : unchecked.length ? (
              <p className="muted">
                Screenshot only for{" "}
                {unchecked
                  .map((id) => locations.find((item) => item.id === id)?.name)
                  .join(", ")}
                .
              </p>
            ) : (
              <p className="muted">
                {visibleRules.length} checks across {countries.length} countries.
              </p>
            )}
          </div>
          <div className="setup-actions">
            <button type="button" className="button" onClick={onBack}>
              <ArrowLeft size={14} /> Back
            </button>
            <button type="button" className="button primary" onClick={run}>
              Run {countries.length} {countries.length === 1 ? "country" : "countries"}{" "}
              <ArrowRight size={14} />
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
