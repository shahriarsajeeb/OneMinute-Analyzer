/** ISO 3166-1 alpha-2 codes shared by the picker and proxy adapter. */
export const countryCodes = [
  "us",
  "ca",
  "gb",
  "de",
  "fr",
  "nl",
  "jp",
  "sg",
  "in",
  "th",
  "br",
  "au",
] as const;
export type CountryCode = (typeof countryCodes)[number];

export function isCountryCode(value: unknown): value is CountryCode {
  return (
    typeof value === "string" &&
    (countryCodes as readonly string[]).includes(value)
  );
}
