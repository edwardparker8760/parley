/**
 * Publishes the final deck into the web app's static directory, so the
 * submission can link to our own domain instead of a GitHub blob URL.
 *
 *   node docs/publish-deck.js
 *
 * Writes two files:
 *   apps/web/public/deck.pdf   a byte copy of docs/final-submission-deck.pdf,
 *                              served by Vercel as application/pdf so the
 *                              browser opens it in its own PDF viewer with no
 *                              third-party renderer in between
 *   apps/web/public/deck.html  the same slides as one scrollable page, for
 *                              anyone who would rather not open a PDF
 *
 * Why generate the HTML rather than keep a second hand-edited copy: the deck
 * source is docs/final-submission-deck.html and it changes. A copy would drift
 * silently. This injects a small stylesheet at the end of the existing <style>
 * block and changes nothing else, so re-running it after any deck edit is the
 * whole update procedure.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOCS = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(DOCS, "..", "apps", "web", "public");

const SOURCE_HTML = path.join(DOCS, "final-submission-deck.html");
const SOURCE_PDF = path.join(DOCS, "final-submission-deck.pdf");

/*
 * The slides are a fixed 1280x720 print surface, which is right for the PDF and
 * wrong for a browser window that may be narrower. `zoom` scales the whole
 * layout, including text, without the scrollbar-vs-transform mismatch that
 * `transform: scale()` produces (a scaled element keeps its unscaled box, so
 * the page would still scroll sideways).
 *
 * The download link is first in the source order so keyboard users reach it
 * before eleven screens of slides.
 */
const SCREEN_CSS = `
  /* ---- injected by docs/publish-deck.js for the on-screen version ---- */
  html, body { background: #05070c; }
  body {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    padding: 24px 0 64px;
  }
  .slide {
    /* On paper each slide is its own page; on screen they need edges. */
    border: 1px solid var(--line);
    border-radius: 10px;
    flex: none;
  }
  .deck-bar {
    width: 1280px;
    max-width: 100%;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    padding: 0 8px;
    color: #8b98ab;
    font-family: "Segoe UI", -apple-system, Arial, sans-serif;
    font-size: 15px;
  }
  .deck-bar a { color: #4da3ff; }
  @media (max-width: 1340px) {
    /* Fit the fixed-width slide to the viewport, with room for the padding. */
    body { zoom: calc(100vw / 1340); }
  }
  @media print {
    /* Printing this page should still produce the deck, not the chrome. */
    body { display: block; padding: 0; zoom: 1; }
    .slide { border: 0; border-radius: 0; }
    .deck-bar { display: none; }
  }
`;

const DECK_BAR = `
<div class="deck-bar">
  <span>Parley - final submission deck</span>
  <span><a href="/deck.pdf">Download as PDF</a> · <a href="/">Back to parley</a></span>
</div>
`;

function main() {
  const html = fs.readFileSync(SOURCE_HTML, "utf8");

  const styleClose = html.lastIndexOf("</style>");
  const bodyOpen = html.indexOf("<body>");
  if (styleClose === -1 || bodyOpen === -1) {
    throw new Error(
      `${SOURCE_HTML} no longer has the <style>/<body> shape this script edits`,
    );
  }

  let out = html.slice(0, styleClose) + SCREEN_CSS + html.slice(styleClose);
  const insertAt = out.indexOf("<body>") + "<body>".length;
  out = out.slice(0, insertAt) + DECK_BAR + out.slice(insertAt);

  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  fs.writeFileSync(path.join(PUBLIC_DIR, "deck.html"), out);
  fs.copyFileSync(SOURCE_PDF, path.join(PUBLIC_DIR, "deck.pdf"));

  console.log(`wrote ${path.join(PUBLIC_DIR, "deck.html")}`);
  console.log(`wrote ${path.join(PUBLIC_DIR, "deck.pdf")}`);
}

main();
