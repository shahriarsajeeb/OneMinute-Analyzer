import Link from "next/link";

// Local presentation fixture. Its country is selected explicitly, never represented as IP-derived.
export default async function StorefrontLab({
  searchParams,
}: {
  searchParams: Promise<{ country?: string; fixed?: string }>;
}) {
  const query = await searchParams;
  const country = ["us", "gb", "br", "de"].includes(query.country ?? "")
    ? query.country!
    : "us";
  const price: Record<string, string> = {
    us: "$29.00",
    gb: "£24.00",
    br: query.fixed === "1" ? "R$ 149,00" : "$29.00",
    de: "€27.00",
  };
  return (
    <main
      className="container result-main"
      lang={country === "br" ? "pt-BR" : "en"}
    >
      <span className="eyebrow">CONTROLLED STOREFRONT FIXTURE</span>
      <h1>LaunchKit source code</h1>
      <p className="tab-note">
        This local fixture selects its country from the URL, not the proxy IP.
        Brazil intentionally shows the wrong price until fixed=1. It tests the
        assertion engine; it does not prove geolocation.
      </p>
      <section className="panel" style={{ padding: 32, marginTop: 24 }}>
        <h2>
          {country === "br"
            ? "Construa sua próxima ideia"
            : "Build your next idea"}
        </h2>
        <p>Next.js starter • lifetime source access</p>
        <strong
          id="price"
          style={{ fontSize: 40, display: "block", margin: "24px 0" }}
        >
          {price[country]}
        </strong>
        <button className="button primary" type="button">
          Preview only — no purchase
        </button>
        {country === "us" && <p id="early-access">Early access available</p>}
      </section>
      {country === "de" && (
        <section
          id="consent"
          className="panel"
          style={{ padding: 24, marginTop: 20 }}
        >
          Cookie preferences{" "}
          <button className="button small">Reject optional cookies</button>
        </section>
      )}
      <p className="tab-note">
        Countries:{" "}
        {["us", "gb", "br", "de"].map((code) => (
          <Link
            key={code}
            href={`/lab?country=${code}`}
            style={{ marginRight: 16 }}
          >
            {code.toUpperCase()}
          </Link>
        ))}{" "}
        <Link href={`/lab?country=${country}&fixed=1`}>
          Show corrected price
        </Link>
      </p>
    </main>
  );
}
