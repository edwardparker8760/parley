/**
 * The deployment invariants, which are the ones that decide whether this ships.
 *
 * A deployed instance has no database, no writable filesystem and no API key.
 * Three things have to hold for that to be true, and none of them is obvious
 * from reading a single file:
 *
 *   1. the snapshot is the DEFAULT, so forgetting the env var yields a working
 *      replay rather than a crash on a missing database;
 *   2. `better-sqlite3` is reachable only through a lazy import, so it never
 *      enters the bundle when the snapshot is selected;
 *   3. the snapshot is a real export, carrying provenance, not a fixture
 *      somebody typed.
 *
 * The third matters as much as the others. A hand-written snapshot would put
 * numbers on a public page that no run ever produced, which is the same failure
 * as a fabricated latency report.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
/**
 * Reads a source file with its comments stripped.
 *
 * These files DISCUSS the things being grepped for: `snapshot-negotiation-source`
 * explains in prose why it does not call `readFileSync`. Scanning raw text would
 * flag that explanation and push someone to delete it to make the test pass,
 * which is exactly backwards.
 */
const read = (...parts) => {
  const raw = readFileSync(join(APP_ROOT, ...parts), "utf8");
  if (parts[parts.length - 1].endsWith(".json")) return raw;
  return raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
};

test("the snapshot source is the default, so a bare deploy cannot look for a database", () => {
  const selector = read("lib", "select-negotiation-source.ts");

  // The comparison must be against sqlite, so that everything else, including
  // an unset variable, falls through to the snapshot.
  assert.match(
    selector,
    /PARLEY_DATA_SOURCE"\]\s*===\s*"sqlite"/,
    "selection must opt IN to sqlite, never opt out of it",
  );
  assert.match(selector, /createSnapshotSource\(\)/);
});

test("sqlite is imported lazily, so it stays out of a snapshot deployment", () => {
  const selector = read("lib", "select-negotiation-source.ts");
  assert.doesNotMatch(
    selector,
    /^import .*sqlite-negotiation-source/m,
    "a top-level import would pull better-sqlite3 into every bundle",
  );
  assert.match(selector, /require\("\.\/sqlite-negotiation-source"\)/);
});

test("the snapshot source reads a bundled import, not the filesystem", () => {
  const source = read("lib", "snapshot-negotiation-source.ts");
  assert.match(source, /^import snapshot from "@\/data\/negotiation-snapshot\.json"/m);
  assert.doesNotMatch(source, /readFileSync|node:fs/);
});

test("the live endpoints refuse rather than fail when there is nothing to run", () => {
  for (const route of [
    join("app", "api", "run-scenario", "route.ts"),
    join("app", "api", "negotiation-stream", "route.ts"),
  ]) {
    const source = read(route);
    assert.match(source, /canRunLive\(\)/, `${route} must check before acting`);
    assert.match(source, /409/, `${route} must answer with a status, not a stack trace`);
  }
});

test("the bundled snapshot is a real export and carries its provenance", () => {
  const snapshot = JSON.parse(read("data", "negotiation-snapshot.json"));

  for (const field of [
    "runId",
    "scenario",
    "strategy",
    "transcriptClockStartedAt",
    "exportedAt",
    "llmMode",
    "llmCallCount",
    "settlementAdapter",
    "settlementIsStub",
    "generatedBy",
  ]) {
    assert.ok(
      Object.hasOwn(snapshot.provenance, field),
      `provenance is missing ${field}, which the banner renders`,
    );
  }

  // It has to be a negotiation, not an empty shell.
  assert.ok(snapshot.view.messages.length > 0, "snapshot contains no messages");
  assert.ok(["SETTLED", "WALKED_AWAY"].includes(snapshot.view.status));
  assert.equal(snapshot.provenance.runId, snapshot.view.negotiationId);

  // Absent evidence of real money must never read as evidence of real money.
  assert.equal(typeof snapshot.provenance.settlementIsStub, "boolean");
  if (snapshot.provenance.settlementAdapter === "none") {
    assert.equal(snapshot.provenance.settlementIsStub, true);
  }
});

test("the recorded-run banner renders provenance literally and unconditionally", () => {
  const banner = read("components", "dashboard", "recorded-run-banner.tsx");

  // No branch may hide it: it renders whenever the component is rendered, and
  // the screen renders it whenever provenance exists.
  assert.doesNotMatch(banner, /return null/, "the banner must never opt out");
  assert.match(banner, /No agents are running/);

  for (const field of [
    "runId",
    "scenario",
    "exportedAt",
    "llmMode",
    "settlementAdapter",
  ]) {
    assert.ok(banner.includes(field), `the banner must show ${field}`);
  }

  const screen = read("components", "dashboard", "dashboard-screen.tsx");
  assert.match(
    screen,
    /provenance === null \? null : \(\s*<RecordedRunBanner/,
    "the banner must appear whenever provenance exists, with no other condition",
  );
});

test("a snapshot deployment does not offer buttons that cannot work", () => {
  const screen = read("components", "dashboard", "dashboard-screen.tsx");
  assert.match(
    screen,
    /props\.canRunLive \? \(\s*<ScenarioLauncherButtons/,
    "the launchers must be hidden when nothing can be launched",
  );
});
