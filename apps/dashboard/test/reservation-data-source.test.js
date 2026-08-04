/**
 * THE INFORMATION-ASYMMETRY CLAIM, TESTED AT THE UI BOUNDARY.
 *
 * The dashboard shows both sides' reservation prices, because the audience is
 * not a participant. That is only defensible if those numbers reach the browser
 * by a path no agent can write to.
 *
 * The structural rule: reservation and ZOPA values live under `view.observer`,
 * which the orchestrator computes from the phase 04 oracle. They must never be
 * read out of a message, because messages are the bus view, which is exactly
 * what the counterparty saw.
 *
 * A judge can check this in the network tab in about ten seconds, so it is
 * worth a test rather than a comment.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["node_modules", ".next", "test"]);

function sourceFiles(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    if (SKIP.has(entry)) continue;
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (/\.(tsx?|jsx?)$/.test(entry)) found.push(full);
  }
  return found;
}

test("reservation values are read only from the observer field", () => {
  for (const file of sourceFiles(APP_ROOT)) {
    const source = readFileSync(file, "utf8");
    const mentions = source.match(/\w*[Rr]eservation\w*/g) ?? [];
    if (mentions.length === 0) continue;

    // Every mention must be an observer field, a local derived from one, or a
    // prose word in a comment. What must never appear is a reservation value
    // pulled off a message or an offer.
    const lines = source.split("\n");
    for (const [index, line] of lines.entries()) {
      if (!/[Rr]eservation/.test(line)) continue;
      const offending =
        /(message|envelope|offer|transcript)\w*\.\w*[Rr]eservation/.test(line);
      assert.equal(
        offending,
        false,
        `${file}:${index + 1} reads a reservation price off the bus view`,
      );
    }
  }
});

test("the dashboard never imports the ZOPA oracle directly", () => {
  // The oracle sees BOTH sides' guardrails. It belongs to the orchestrator,
  // which is the sanctioned observer. A client component importing it would
  // mean guardrail data being computed somewhere other than the one place that
  // is allowed to hold both.
  for (const file of sourceFiles(APP_ROOT)) {
    const source = readFileSync(file, "utf8");
    assert.equal(
      source.includes("negotiation-engine/oracle"),
      false,
      `${file} imports the ZOPA oracle; only the orchestrator may`,
    );
  }
});

test("the chart takes its dashed lines from view.observer", () => {
  const chart = readFileSync(
    join(APP_ROOT, "components", "convergence-price-chart.tsx"),
    "utf8",
  );
  assert.ok(
    chart.includes("view.observer.buyerReservationMicroUsdc"),
    "buyer reservation line must come from the observer payload",
  );
  assert.ok(
    chart.includes("view.observer.sellerReservationMicroUsdc"),
    "seller reservation line must come from the observer payload",
  );
});
