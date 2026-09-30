import { LockKeyhole } from "lucide-react";

/** Live failures show an empty capture; only the explicit demo uses a placeholder. */
export function PageCapture({
  url,
  screenshotUrl,
  demo = false,
}: {
  url: string;
  screenshotUrl: string | null;
  demo?: boolean;
}) {
  return (
    <div className="browser-capture">
      <div className="browser-bar">
        <div>● ● ●</div>
        <span title={url}>
          <LockKeyhole size={9} />
          {url}
        </span>
      </div>
      {screenshotUrl ? (
        // Captures will come from the browser runner; dimensions are not known in advance.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="page-screenshot"
          src={screenshotUrl}
          alt={`Browser screenshot of ${url}`}
        />
      ) : !demo ? (
        <div className="capture-unavailable">
          No screenshot was captured for this run.
        </div>
      ) : (
        <div
          className="fake-site"
          aria-label="Illustrative screenshot placeholder, not a capture of the submitted website"
        >
          <div className="fake-nav">
            <b>◈ layers</b>
            <span>A place for your next idea</span>
            <span>Explore ↗</span>
          </div>
          <div className="fake-site-body">
            <span className="fake-pill">YOUR NEXT BIG THING</span>
            <h3>
              Good work.
              <br />
              Great together.
            </h3>
            <p>
              A calmer place to turn
              <br />
              big ideas into something real.
            </p>
            <span className="fake-cta">Start building →</span>
            <div className="fake-product">
              <div className="fake-sidebar">
                ◈ &nbsp; Overview
                <br />
                <br />▦ &nbsp; Projects
                <br />
                <br />◇ &nbsp; Resources
              </div>
              <div>
                <b>Let’s make things happen.</b>
                <div className="fake-tiles">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="fake-lines" />
              </div>
            </div>
          </div>
          <div className="capture-placeholder-label">
            Illustrative screenshot · no live capture
          </div>
        </div>
      )}
    </div>
  );
}
