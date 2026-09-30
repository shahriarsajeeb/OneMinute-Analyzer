import { countryCodes, type CountryCode } from "./countries";

export type Status = "pass" | "warning" | "failed";
export type Location = {
  id: CountryCode;
  name: string;
  flag: string;
  city: string;
  region: string;
  status: Status;
  load: number;
  issue: string;
  x: number;
  y: number;
};
export const locations: Location[] = [
  {
    id: "us",
    name: "United States",
    flag: "🇺🇸",
    city: "Virginia",
    region: "North America",
    status: "pass",
    load: 1.2,
    issue: "None",
    x: 25,
    y: 36,
  },
  {
    id: "ca",
    name: "Canada",
    flag: "🇨🇦",
    city: "Toronto",
    region: "North America",
    status: "pass",
    load: 1.4,
    issue: "None",
    x: 23,
    y: 26,
  },
  {
    id: "gb",
    name: "United Kingdom",
    flag: "🇬🇧",
    city: "London",
    region: "Europe",
    status: "pass",
    load: 1.6,
    issue: "None",
    x: 47,
    y: 27,
  },
  {
    id: "de",
    name: "Germany",
    flag: "🇩🇪",
    city: "Frankfurt",
    region: "Europe",
    status: "pass",
    load: 1.8,
    issue: "None",
    x: 51,
    y: 29,
  },
  {
    id: "fr",
    name: "France",
    flag: "🇫🇷",
    city: "Paris",
    region: "Europe",
    status: "pass",
    load: 1.7,
    issue: "None",
    x: 48,
    y: 32,
  },
  {
    id: "nl",
    name: "Netherlands",
    flag: "🇳🇱",
    city: "Amsterdam",
    region: "Europe",
    status: "pass",
    load: 1.5,
    issue: "None",
    x: 50,
    y: 26,
  },
  {
    id: "jp",
    name: "Japan",
    flag: "🇯🇵",
    city: "Tokyo",
    region: "Asia",
    status: "failed",
    load: 12.6,
    issue: "2 failed requests",
    x: 86,
    y: 39,
  },
  {
    id: "sg",
    name: "Singapore",
    flag: "🇸🇬",
    city: "Singapore",
    region: "Asia",
    status: "pass",
    load: 1.9,
    issue: "None",
    x: 75,
    y: 59,
  },
  {
    id: "in",
    name: "India",
    flag: "🇮🇳",
    city: "Mumbai",
    region: "Asia",
    status: "warning",
    load: 4.1,
    issue: "High TTFB",
    x: 66,
    y: 46,
  },
  {
    id: "th",
    name: "Thailand",
    flag: "🇹🇭",
    city: "Bangkok",
    region: "Asia",
    status: "pass",
    load: 2.1,
    issue: "None",
    x: 74,
    y: 49,
  },
  {
    id: "br",
    name: "Brazil",
    flag: "🇧🇷",
    city: "São Paulo",
    region: "South America",
    status: "warning",
    load: 3.4,
    issue: "Slow API response",
    x: 35,
    y: 72,
  },
  {
    id: "au",
    name: "Australia",
    flag: "🇦🇺",
    city: "Sydney",
    region: "Oceania",
    status: "pass",
    load: 2.3,
    issue: "None",
    x: 89,
    y: 74,
  },
];
export const allIds: string[] = [...countryCodes];

export { failedRequests, consoleErrors, formatDuration } from "./results";
export type {
  NetworkRequest,
  ConsoleEntry,
  PageResult,
  TestResult,
} from "./results";
import type {
  NetworkRequest,
  ConsoleEntry,
  PageResult,
  TestResult,
} from "./results";

/** Mock adapter: opens only the submitted page; no navigation or clicking. */
export function createPageResult(locationId: string, url: string): PageResult {
  const location = locations.find((item) => item.id === locationId);
  if (!location) throw new Error(`Unknown location: ${locationId}`);
  const page = new URL(url);
  const failed = location.status === "failed";
  const warning = location.status === "warning";
  const totalLoadMs = Math.round(location.load * 1000);
  const networkRequests: NetworkRequest[] = [
    {
      method: "GET",
      request: page.pathname + page.search,
      status: 200,
      durationMs: 420,
    },
    {
      method: "GET",
      request: "/api/pricing",
      status: 200,
      durationMs:
        locationId === "br" ? 2900 : Math.min(1300, totalLoadMs - 100),
    },
  ];
  if (failed)
    networkRequests.push(
      { method: "POST", request: "/api/payment", status: 403, durationMs: 922 },
      {
        method: "GET",
        request: "/assets/widget.js",
        status: 503,
        durationMs: 1100,
      },
    );
  const consoleEntries: ConsoleEntry[] = [
    { level: "info", message: "Application initialized" },
  ];
  if (failed || warning)
    consoleEntries.push({ level: "warn", message: "Slow resource detected" });
  if (failed)
    consoleEntries.push({
      level: "error",
      message: "Payment request failed: 403",
    });

  return {
    mode: "demo",
    city: location.city,
    error: null,
    notes: [],
    locationId,
    status: location.status,
    httpStatus: 200,
    totalLoadMs,
    finalUrl: url,
    screenshotUrl: null,
    networkRequests,
    consoleEntries,
    redirects: [],
    performance: {
      ttfbMs: locationId === "in" ? 1400 : 840,
      fcpMs: failed ? 1800 : Math.min(1800, totalLoadMs - 200),
      lcpMs: failed ? 5600 : Math.min(1900, totalLoadMs - 100),
    },
    browser: "Chromium",
    viewport: { width: 1440, height: 900 },
    issue: location.issue,
  };
}

export function createMockTest(url: string, ids: string[]): TestResult {
  return {
    mode: "demo",
    id: "TST-8421",
    url,
    completedAt: new Date().toISOString(),
    results: ids.map((id) => createPageResult(id, url)),
  };
}
