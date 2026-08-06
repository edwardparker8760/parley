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

test("the snapshot source reads bundled imports, not the filesystem", () => {
  const source = read("lib", "snapshot-negotiation-source.ts");
  for (const letter of ["a", "b", "c"]) {
    assert.match(
      source,
      new RegExp(`^import snapshot[A-Z] from "@/data/negotiation-snapshot-${letter}\\.json"`, "m"),
      `scenario ${letter.toUpperCase()} must be a bundled import`,
    );
  }
  assert.doesNotMatch(source, /readFileSync|node:fs/);
});

test("nothing a deployed instance serves imports the ledger at module scope", () => {
  /*
   * `@parley/orchestrator` re-exports through `@parley/ledger`, which imports
   * `node:sqlite`. A static import of either, anywhere in the graph a snapshot
   * deployment loads, would put SQLite in the cold-start path of a function
   * that has no database, and would make the deploy depend on the host's Node
   * build shipping `node:sqlite` at all.
   *
   * Type-only imports are fine: they are erased before anything runs.
   */
  for (const file of [
    join("app", "page.tsx"),
    join("app", "app", "page.tsx"),
    join("app", "api", "run-scenario", "route.ts"),
    join("app", "api", "negotiation-stream", "route.ts"),
    join("app", "api", "negotiation", "[id]", "route.ts"),
    join("lib", "select-negotiation-source.ts"),
    join("lib", "snapshot-negotiation-source.ts"),
  ]) {
    const source = read(file);
    for (const line of source.split("\n")) {
      if (!/^import\s/.test(line)) continue;
      if (/^import type\s/.test(line)) continue;
      assert.doesNotMatch(
        line,
        /@parley\/(orchestrator|ledger)/,
        `${file} imports the ledger graph at module scope: ${line.trim()}`,
      );
    }
  }
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

test("every bundled snapshot is a real export and carries its provenance", () => {
  for (const letter of ["a", "b", "c"]) {
    const snapshot = JSON.parse(read("data", `negotiation-snapshot-${letter}.json`));
    const where = `negotiation-snapshot-${letter}.json`;

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
        `${where}: provenance is missing ${field}, which the banner renders`,
      );
    }

    // It has to be a negotiation, not an empty shell.
    assert.ok(snapshot.view.messages.length > 0, `${where} contains no messages`);
    assert.ok(["SETTLED", "WALKED_AWAY"].includes(snapshot.view.status), where);
    assert.equal(snapshot.provenance.runId, snapshot.view.negotiationId, where);

    // The file name has to match what is inside it, or the switcher offers
    // scenario B and serves scenario A.
    assert.equal(snapshot.provenance.scenario, letter.toUpperCase(), where);

    // Absent evidence of real money must never read as evidence of real money.
    assert.equal(typeof snapshot.provenance.settlementIsStub, "boolean", where);
    if (snapshot.provenance.settlementAdapter === "none") {
      assert.equal(snapshot.provenance.settlementIsStub, true, where);
    }
  }
});

test("the three bundled runs are distinct, and cover the outcomes worth showing", () => {
  const loaded = ["a", "b", "c"].map((letter) =>
    JSON.parse(read("data", `negotiation-snapshot-${letter}.json`)),
  );

  const ids = loaded.map((s) => s.view.negotiationId);
  assert.equal(new Set(ids).size, 3, "two buttons pointing at the same run is one button");

  /*
   * The whole reason to bundle three is that they END differently. If these
   * ever collapse to the same outcome the switcher is offering a choice that
   * makes no difference, and the argument the dashboard exists to make is gone.
   */
  const statuses = loaded.map((s) => s.view.status);
  assert.ok(statuses.includes("SETTLED"), "no bundled run shows a deal being struck");
  assert.ok(statuses.includes("WALKED_AWAY"), "no bundled run shows the agents failing to agree");

  // And one of them must show the guardrail actually firing, which is the
  // claim that cannot be made by a run where nothing was ever clamped.
  const clamps = loaded.map((s) =>
    s.view.messages.reduce((total, message) => total + (message.clamps ?? []).length, 0),
  );
  assert.ok(
    clamps.some((count) => count > 0),
    "no bundled run shows a clamp, so the guardrail is unproven on screen",
  );
  assert.ok(
    clamps.some((count) => count === 0),
    "every bundled run gets clamped, so nothing shows an agent that stayed inside its limits unaided",
  );
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

test("a snapshot deployment offers the switcher instead of the launchers, never nothing", () => {
  const screen = read("components", "dashboard", "dashboard-screen.tsx");

  // The launchers still may not appear where nothing can be launched.
  assert.match(
    screen,
    /props\.canRunLive \? \(\s*<ScenarioLauncherButtons/,
    "the launchers must be hidden when nothing can be launched",
  );

  /*
   * ...but hiding them must hand over to the switcher rather than leaving an
   * empty header. A deployed dashboard with no controls at all is the failure
   * this test exists to prevent: it looked correct, it passed every other
   * check, and a visitor could not do a single thing with it.
   */
  assert.match(
    screen,
    /\) : props\.runs\.length > 0 \? \(\s*<RecordedRunSwitcher/,
    "an instance that cannot launch must still offer its recordings",
  );

  // And the switcher must move between runs by URL, so a run can be linked to.
  const switcher = read("components", "dashboard", "recorded-run-switcher.tsx");
  assert.match(switcher, /href=\{`\/app\?negotiation=/, "each run needs its own address");
});
