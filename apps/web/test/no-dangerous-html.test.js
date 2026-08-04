/**
 * The dashboard renders untrusted text.
 *
 * Phase 05 stores raw model responses, and a hostile counterparty can put
 * arbitrary text into a rationale that reaches the transcript panel. React
 * escapes text by default, so the only way to open an XSS hole here is to ask
 * for it explicitly. This test asserts nobody has.
 *
 * Plain node:test over the source files rather than a component test: the
 * property is "this string does not appear", and grepping for it is both the
 * most direct check and the one that cannot be defeated by a passing render.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["node_modules", ".next", "test"]);

/**
 * Strip comments before scanning.
 *
 * These files DISCUSS `dangerouslySetInnerHTML` in their doc comments, because
 * explaining why it is banned is worth more than the two words cost. Scanning
 * raw text would flag that prose and push someone to delete the explanation to
 * make the test pass, which is the opposite of what this test is for.
 */
function code(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function sourceFiles(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    if (SKIP.has(entry)) continue;
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
    } else if (/\.(tsx?|jsx?)$/.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

test("no file in the dashboard uses dangerouslySetInnerHTML", () => {
  const offenders = sourceFiles(APP_ROOT).filter((file) =>
    code(readFileSync(file, "utf8")).includes("dangerouslySetInnerHTML"),
  );
  assert.deepEqual(
    offenders,
    [],
    "dangerouslySetInnerHTML renders untrusted model output as markup",
  );
});

test("no file reaches for innerHTML or document.write either", () => {
  const offenders = sourceFiles(APP_ROOT).filter((file) => {
    const source = code(readFileSync(file, "utf8"));
    return source.includes(".innerHTML") || source.includes("document.write");
  });
  assert.deepEqual(offenders, [], "these bypass React's escaping just as well");
});

test("the test actually scans files, rather than passing on an empty list", () => {
  // A grep test that finds nothing because it looked nowhere is worse than no
  // test: it reports safety it never checked.
  const files = sourceFiles(APP_ROOT);
  assert.ok(files.length >= 10, `expected to scan the dashboard, saw ${files.length} files`);
  assert.ok(
    files.some((file) => file.endsWith("live-transcript-ladder.tsx")),
    "the panel that renders untrusted rationale text was not scanned",
  );
});
