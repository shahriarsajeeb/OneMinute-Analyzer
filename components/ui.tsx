"use client";

import Link from "next/link";
import { Activity, Check, ChevronDown, Globe2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { allIds, locations, type Status } from "@/lib/mock-data";

export function Logo() {
  return (
    <Link href="/" className="logo">
      <span className="logo-mark">
        <Activity size={21} />
      </span>
      <span>
        OneMinute<span className="logo-light"> Analyzer</span>
      </span>
    </Link>
  );
}

export function Badge({ status }: { status: Status }) {
  return (
    <span className={`badge ${status}`}>
      <i />
      {status === "pass"
        ? "Matched"
        : status === "warning"
          ? "Inconclusive"
          : "Mismatch"}
    </span>
  );
}

export function LocationSelector({
  selected,
  onChange,
  availableIds = allIds,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  availableIds?: string[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const options = locations.filter((location) =>
    availableIds.includes(location.id),
  );
  const allSelected = options.every((location) =>
    selected.includes(location.id),
  );

  useEffect(() => {
    const dismiss = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, []);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <div
      className="location-select"
      ref={ref}
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
    >
      <button
        type="button"
        ref={trigger}
        className="select-trigger"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="Choose test locations"
      >
        <Globe2 size={17} />
        {allSelected
          ? "All locations"
          : `${selected.length} ${selected.length === 1 ? "location" : "locations"}`}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="location-menu">
          <div className="menu-title">
            Test locations <span>{selected.length} selected</span>
          </div>
          <label>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => onChange(allSelected ? [] : [...availableIds])}
            />
            Select all locations
          </label>
          {[...new Set(options.map((location) => location.region))].map(
            (region) => (
              <div key={region}>
                <h5>{region}</h5>
                {options
                  .filter((location) => location.region === region)
                  .map((location) => (
                    <label key={location.id}>
                      <input
                        type="checkbox"
                        checked={selected.includes(location.id)}
                        onChange={() =>
                          onChange(
                            selected.includes(location.id)
                              ? selected.filter((id) => id !== location.id)
                              : [...selected, location.id],
                          )
                        }
                      />
                      <span>{location.flag}</span>
                      {location.name}
                    </label>
                  ))}
              </div>
            ),
          )}
          <button type="button" className="button small full" onClick={close}>
            Done <Check size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
