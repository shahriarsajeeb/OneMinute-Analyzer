/** Currency codes a price check can expect. */
export const currencyCodes = [
  "USD",
  "CAD",
  "GBP",
  "EUR",
  "JPY",
  "SGD",
  "INR",
  "THB",
  "BRL",
  "AUD",
  "CNY",
  "MXN",
] as const;
export type CurrencyCode = (typeof currencyCodes)[number];

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return (
    typeof value === "string" &&
    (currencyCodes as readonly string[]).includes(value)
  );
}

// Longest first, so "R$" is never read as "$". A symbol shared by several
// currencies resolves to all of them; the check decides what that means.
const markers: [string, CurrencyCode[]][] = [
  ["US$", ["USD"]],
  ["CA$", ["CAD"]],
  ["AU$", ["AUD"]],
  ["MX$", ["MXN"]],
  ["R$", ["BRL"]],
  ["C$", ["CAD"]],
  ["S$", ["SGD"]],
  ["A$", ["AUD"]],
  ["Rs.", ["INR"]],
  ["Rs", ["INR"]],
  ["£", ["GBP"]],
  ["€", ["EUR"]],
  ["₹", ["INR"]],
  ["฿", ["THB"]],
  ["円", ["JPY"]],
  ["元", ["CNY"]],
  ["¥", ["JPY", "CNY"]],
  ["￥", ["JPY", "CNY"]],
  ["$", ["USD", "CAD", "SGD", "AUD", "MXN"]],
];
/** Currencies whose everyday display is a symbol shared with other currencies. */
export const sharedSymbol: Partial<Record<CurrencyCode, string>> = {
  USD: "$",
  CAD: "$",
  SGD: "$",
  AUD: "$",
  MXN: "$",
  JPY: "¥",
  CNY: "¥",
};

export type ObservedPrice = {
  /** Currency marker as displayed, e.g. "R$", "$" or "BRL". */
  marker: string;
  candidates: CurrencyCode[];
  amount: number;
  raw: string;
};

/** Reads "1.234,56", "1,234.56", "149,00" and "1 500" as numbers. */
export function parseAmount(value: string): number | null {
  let text = value.replace(/[\s  ']/g, "");
  if (!/^\d[\d.,]*$/.test(text)) return null;
  const dot = text.lastIndexOf(".");
  const comma = text.lastIndexOf(",");
  if (dot >= 0 && comma >= 0) {
    const decimal = dot > comma ? "." : ",";
    text = text
      .split(decimal === "." ? "," : ".")
      .join("")
      .replace(decimal, ".");
  } else if (dot >= 0 || comma >= 0) {
    const parts = text.split(dot >= 0 ? "." : ",");
    // A single group of exactly three digits is a thousands separator ("1.500").
    text =
      parts.length > 2 || parts[parts.length - 1].length === 3
        ? parts.join("")
        : parts.join(".");
  }
  const amount = Number(text);
  return Number.isFinite(amount) ? amount : null;
}

const amountPattern =
  /\d{1,3}(?:[.,   ]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?/g;

function markerAt(text: string, side: "before" | "after") {
  const edge =
    side === "before"
      ? text.slice(-6).replace(/[\s  ]$/, "")
      : text.slice(0, 6).replace(/^[\s  ]/, "");
  for (const code of currencyCodes) {
    const found =
      side === "before"
        ? new RegExp(`(^|[^A-Za-z])${code}$`).test(edge)
        : new RegExp(`^${code}([^A-Za-z]|$)`).test(edge);
    if (found) return { marker: code, candidates: [code] };
  }
  for (const [marker, candidates] of markers) {
    if (side === "before" ? edge.endsWith(marker) : edge.startsWith(marker)) {
      // "Rs" must not be the end of a word such as "Hours".
      if (
        side === "before" &&
        /^[A-Za-z]/.test(marker) &&
        /[A-Za-z]$/.test(edge.slice(0, -marker.length))
      )
        continue;
      return { marker, candidates };
    }
  }
  return null;
}

/** Finds amounts written with a currency symbol or code before or after them. */
export function findPrices(text: string): ObservedPrice[] {
  const prices: ObservedPrice[] = [];
  for (const match of text.matchAll(amountPattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const found =
      markerAt(text.slice(0, start), "before") ??
      markerAt(text.slice(end), "after");
    const amount = parseAmount(match[0]);
    if (!found || amount === null) continue;
    prices.push({ ...found, amount, raw: match[0].trim() });
  }
  return prices;
}

export function formatAmount(amount: number) {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

/** "BRL 149" when the currency is unambiguous, otherwise the displayed symbol: "$29". */
export function formatPrice(price: ObservedPrice) {
  return price.candidates.length === 1
    ? `${price.candidates[0]} ${formatAmount(price.amount)}`
    : `${price.marker}${formatAmount(price.amount)}`;
}

/** Distinct prices, so a price repeated in the same element counts once. */
export function distinctPrices(prices: ObservedPrice[]) {
  return [
    ...new Map(prices.map((price) => [formatPrice(price), price])).values(),
  ];
}

export type ExpectedPrice = { amount: number; candidates: CurrencyCode[] | null };

/** "$39.99", "฿1,000", "BRL 149" or a bare amount such as "39.99" (any currency). */
export function parseExpectedPrice(value: string): ExpectedPrice | null {
  const text = value.trim();
  const prices = findPrices(text);
  if (prices.length === 1)
    return { amount: prices[0].amount, candidates: prices[0].candidates };
  if (prices.length > 1) return null;
  const amount = parseAmount(text);
  return amount === null ? null : { amount, candidates: null };
}

const sameAmount = (a: number, b: number) => Math.abs(a - b) < 0.005;

/**
 * Compares prices by amount and currency, never as text, so "30" does not match
 * "30-minute" or "$39.99". A shared symbol such as "$" counts as a match for any
 * currency it can stand for, and is reported as ambiguous.
 */
export function matchPrice(expected: ExpectedPrice, observed: ObservedPrice[]) {
  const matches = observed.filter(
    (price) =>
      sameAmount(price.amount, expected.amount) &&
      (!expected.candidates ||
        price.candidates.some((code) => expected.candidates!.includes(code))),
  );
  const exact = matches.find(
    (price) =>
      !expected.candidates ||
      price.candidates.length === 1 ||
      expected.candidates.length > 1,
  );
  const match = exact ?? matches[0];
  return match
    ? { match, ambiguous: !exact }
    : null;
}
