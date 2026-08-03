/**
 * Cleans LLM-written rationale text before it is stored or displayed.
 *
 * Runs BEFORE persistence, so nothing hostile is ever written to the ledger in
 * a form a later consumer could mishandle. The dashboard (phase 07) must still
 * render it as text and never as HTML: sanitising here reduces the blast
 * radius, it does not make the string trusted.
 *
 * The rationale never re-enters a numeric path. Phase 03's text-independence
 * property guarantees the clamp ignores it; this module must not create a new
 * path that violates that.
 */

const CONTROL_CHARACTERS = new RegExp("[\\u0000-\\u001F\\u007F]", "g");
const ANSI_ESCAPES = new RegExp("\\u001B\\[[0-9;]*[A-Za-z]", "g");

/** Hard cap. Phase 07 may want less; the envelope schema also enforces 240. */
export const MAX_RATIONALE_LENGTH = 240;

/** Below this length, truncating at a sentence boundary makes it unreadable. */
const MIN_SENTENCE_LENGTH = 40;

export function sanitiseRationale(raw: string): string {
  let text = raw
    .replace(ANSI_ESCAPES, "")
    .replace(CONTROL_CHARACTERS, " ")
    // Markdown fences and backticks: the dashboard renders plain text, and a
    // stray fence in a transcript line looks like a rendering bug on camera.
    .replace(/```/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length === 0) return "";

  // Keep a single sentence. Truncating at the first boundary past a minimum
  // avoids cutting "I'll move to 0.9." down to "I'll move to 0."
  const boundary = findSentenceBoundary(text);
  if (boundary !== null) text = text.slice(0, boundary + 1);

  if (text.length > MAX_RATIONALE_LENGTH) {
    text = `${text.slice(0, MAX_RATIONALE_LENGTH - 1).trimEnd()}...`.slice(
      0,
      MAX_RATIONALE_LENGTH,
    );
  }
  return text;
}

/** Index of the first sentence-ending character past the minimum length. */
function findSentenceBoundary(text: string): number | null {
  for (let index = MIN_SENTENCE_LENGTH; index < text.length; index += 1) {
    const character = text[index];
    if (character === "." || character === "!" || character === "?") {
      const next = text[index + 1];
      // A decimal point is not a sentence end.
      if (next !== undefined && /\d/.test(next)) continue;
      return index;
    }
  }
  return null;
}
