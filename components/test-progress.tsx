"use client";
import type { RegionalRule } from "@/lib/regional-rules";
import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, Globe2, LoaderCircle, X } from "lucide-react";
import { locations } from "@/lib/mock-data";
import { executeTest, type LocationProgress } from "@/lib/live-test";
import type { TestResult } from "@/lib/results";

export function TestProgress({
  ids,
  url,
  expectedText,
  rules,
  onComplete,
  onCancel,
}: {
  ids: string[];
  url: string;
  expectedText?: string;
  rules?: RegionalRule[];
  onComplete: (result: TestResult) => void;
  onCancel: () => void;
}) {
  const [progress, setProgress] = useState<Record<string, LocationProgress>>(
    {},
  );
  const [error, setError] = useState("");
  const callbacks = useRef({ onComplete, onCancel });
  callbacks.current = { onComplete, onCancel };
  useEffect(() => {
    const controller = new AbortController();
    // Deferring avoids duplicate paid runs during React Strict Mode's effect rehearsal.
    const start = setTimeout(() => {
      void executeTest(
        url,
        ids,
        controller.signal,
        (update) =>
          setProgress((previous) => ({ ...previous, [update.id]: update })),
        expectedText,
        rules,
      )
        .then((result) => {
          if (!controller.signal.aborted) callbacks.current.onComplete(result);
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setError(error instanceof Error ? error.message : "Test failed.");
        });
    }, 0);
    return () => {
      clearTimeout(start);
      controller.abort();
    };
  }, [ids, url, expectedText, rules]);
  const completed = Object.values(progress).filter(
    (item) => item.state === "complete",
  ).length;
  return (
    <div className="modal-backdrop">
      <section
        className="progress-modal panel"
        role="dialog"
        aria-modal="true"
        aria-label="Test progress"
      >
        <div className="progress-orb">
          <Globe2 size={36} />
        </div>
        <span className="eyebrow">ONE PAGE. MULTIPLE PERSPECTIVES.</span>
        <h2>Checking regional expectations</h2>
        <p className="mono submitted-url">{url}</p>
        <div
          className="progress-track"
          role="progressbar"
          aria-label="Locations completed"
          aria-valuemin={0}
          aria-valuemax={ids.length}
          aria-valuenow={completed}
        >
          <div
            style={{ width: `${Math.max(3, (completed / ids.length) * 100)}%` }}
          />
        </div>
        <div className="progress-caption" aria-live="polite">
          <span>
            {completed === ids.length
              ? "Saving results"
              : "Opening real browsers"}
          </span>
          <span>
            {completed} / {ids.length} locations completed
          </span>
        </div>
        <div className="progress-locations">
          {ids.map((id) => {
            const location = locations.find((item) => item.id === id)!;
            const item = progress[id];
            const status = item?.result?.status;
            return (
              <div key={id}>
                <span>
                  {location.flag} {location.name}
                </span>
                <span
                  className={`progress-status ${status === "failed" ? "red" : status === "warning" ? "amber" : status === "pass" ? "green" : ""}`}
                >
                  {item?.state === "complete" ? (
                    <>
                      {status === "failed" ? (
                        <X size={14} />
                      ) : status === "warning" ? (
                        <CircleAlert size={14} />
                      ) : (
                        <Check size={14} />
                      )}
                      {status === "failed"
                        ? "Mismatch"
                        : status === "warning"
                          ? "Inconclusive"
                          : item.result?.assertions?.length
                            ? "Matched"
                            : "Captured"}
                    </>
                  ) : item?.state === "running" ? (
                    <>
                      <LoaderCircle size={14} className="spin" />
                      Capturing…
                    </>
                  ) : (
                    "Queued"
                  )}
                </span>
              </div>
            );
          })}
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <small>Two browsers at a time · up to 55 seconds per location</small>
        <button
          className="button small progress-cancel"
          onClick={() => callbacks.current.onCancel()}
        >
          {error ? "Close" : "Cancel test"}
        </button>
      </section>
    </div>
  );
}
