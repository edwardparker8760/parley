/**
 * The visitor's own limits: bounds, refusals, and the promises the panel makes.
 *
 * `app/api/run-scenario/route.ts` allowlists three scenario names and says why:
 * accepting arbitrary guardrails from a client would let anyone construct
 * limits that make the clamp look wrong. `/api/run-custom` deliberately opens
 * that door, so these tests are the frame around it.
 *
 * The validator is TypeScript and these tests run on bare node, so it is
 * imported directly: Node 24 strips type annotations itself. An earlier version
 * of this file hand-rolled a stripper, as `framing-explains-itself.test.js`
 * still does, and it broke on the first multi-line parameter list with
 * `SyntaxError: Unexpected token ':'` pointing at nothing useful. Importing the
 * real module is both simpler and stronger: these tests now exercise the actual
 * `deriveSellerMinUnitPrice` the engine uses, not a stand-in for it.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCustomLimits, DEFAULT_CUSTOM_LIMITS, previewFloor } from "../lib/custom-limits.ts";

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => readFileSync(join(APP_ROOT, ...parts), "utf8");

const withLimits = (overrides) => ({ ...DEFAULT_CUSTOM_LIMITS, ...overrides });

test("the shipped defaults are valid, or the panel opens broken", () => {
  const result = validateCustomLimits(DEFAULT_CUSTOM_LIMITS);
  assert.equal(result.ok, true, JSON.stringify(result.problems ?? []));
});

test("a decimal is refused rather than quietly truncated", () => {
  const result = validateCustomLimits(withLimits({ buyerMaxUnitPrice: "12.5" }));
  assert.equal(result.ok, false);

  // The refusal must say WHY, and specifically that rounding would change the
  // question. Silently running 12 is the failure this product claims cannot
  // happen to a limit.
  const joined = result.problems.join(" ");
  assert.match(joined, /whole number/i);
  assert.match(joined, /12\.5/);
});

test("out of range is refused with both the bound and the value given", () => {
  const result = validateCustomLimits(withLimits({ buyerMaxUnitPrice: "9999999" }));
  assert.equal(result.ok, false);
  const joined = result.problems.join(" ");
  assert.match(joined, /between/i);
  assert.match(joined, /9,999,999/);
});

test("an empty field asks for the field by name, not by variable", () => {
  const result = validateCustomLimits(withLimits({ sellerCostBasis: "" }));
  assert.equal(result.ok, false);
  const joined = result.problems.join(" ");
  assert.match(joined, /seller's cost per call/i);
  assert.doesNotMatch(joined, /sellerCostBasis/);
});

test("a partial payload is a bad request, not a crash", () => {
  /*
   * Found by curling the deployed-shape build with one field. The validator
   * dereferenced the missing ones and the route answered 500 with a stack
   * instead of 400 with a sentence. The form always sends every field, so only
   * a direct caller can reach this, which is exactly who a boundary is for.
   */
  const result = validateCustomLimits({ buyerMaxUnitPrice: "12.5" });
  assert.equal(result.ok, false);
  assert.ok(result.problems.length > 1, "each missing field should be named");
  assert.match(result.problems.join(" "), /Fill in/);

  // The empty object, and a null field, must behave the same way.
  assert.equal(validateCustomLimits({}).ok, false);
  assert.equal(validateCustomLimits({ buyerMaxUnitPrice: null }).ok, false);
});

test("junk in a numeric field is refused", () => {
  for (const junk of ["abc", "1e5", "0x10", "--5", " "]) {
    const result = validateCustomLimits(withLimits({ buyerTargetQuantity: junk }));
    assert.equal(result.ok, false, `"${junk}" should be refused`);
  }
});

test("an impossible SLA is refused in words a person can act on", () => {
  const result = validateCustomLimits(withLimits({ buyerMinSlaTier: "platinum" }));
  assert.equal(result.ok, false);
  assert.match(result.problems.join(" "), /basic, standard or premium/);
});

test("terms that cannot be met at all are refused before running", () => {
  // The buyer wants it in 6h, the seller cannot go below 12h. There is nothing
  // to negotiate, so this is a form error rather than a walk-away.
  const result = validateCustomLimits(
    withLimits({ buyerMaxDeliveryWindowHours: "6", sellerMinDeliveryWindowHours: "12" }),
  );
  assert.equal(result.ok, false);
  assert.match(result.problems.join(" "), /Widen one of them/);
});

test("limits that make a deal impossible are ACCEPTED, because that is the point", () => {
  /*
   * The headline invitation is to set a ceiling below the floor and watch the
   * agents walk away. If validation rejected that, the panel would refuse the
   * single most interesting thing a visitor can do with it.
   */
  const impossible = validateCustomLimits(
    withLimits({ buyerMaxUnitPrice: "1", sellerCostBasis: "1000000", sellerMinMarginPct: "900" }),
  );
  assert.equal(impossible.ok, true, JSON.stringify(impossible.problems ?? []));

  // Same for ordering an amount the seller cannot supply: a real situation
  // with a correct answer, and the correct answer is not a form error.
  const oversized = validateCustomLimits(
    withLimits({ buyerTargetQuantity: "10000000", sellerAvailableQuantity: "1" }),
  );
  assert.equal(oversized.ok, true, JSON.stringify(oversized.problems ?? []));
});

test("the route is not gated on live mode, or it would be dead once deployed", () => {
  /*
   * The deployed build is a replay instance, so `canRunLive` is false there.
   * `/api/run-scenario` refuses in that mode by design. If this route copied
   * that check, the whole feature would work locally and do nothing in the one
   * place judges will see it.
   */
  const route = read("app", "api", "run-custom", "route.ts");
  const code = route.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(
    !/canRunLive/.test(code),
    "run-custom must not check canRunLive: it owns its own in-memory ledger",
  );

  // And it must stay pure: no settlement adapter, no LLM settings.
  assert.ok(!/settlement:/.test(code), "a custom run must not attempt settlement");
  assert.ok(!/\bllm:/.test(code), "a custom run must not consult a model");
  assert.match(code, /location: ":memory:"/);
});

test("the panel derives the floor from the engine's own function", () => {
  /*
   * The number shown while you type must be the number the run enforces. A
   * second implementation here would drift, and the first symptom would be a
   * panel promising one floor and a negotiation applying another.
   */
  const lib = read("lib", "custom-limits.ts");
  assert.match(lib, /import \{ deriveSellerMinUnitPrice \}/);
  assert.ok(
    !/costBasisMicroUsdc\s*\*\s*BigInt\(100/.test(lib),
    "the floor must not be recomputed locally",
  );

  // Deep imports, because the barrels reach for node:path via config-from-env
  // and this module runs in the browser.
  assert.match(lib, /@parley\/guardrails\/derive-seller-min-unit-price/);
  assert.match(lib, /@parley\/shared\/domain-types/);
});

test("the previewed floor is the real derivation, and it moves with margin", () => {
  // Now that the real function is imported, the panel's promise is testable:
  // the number shown while you type is the number the run will enforce.
  assert.equal(previewFloor(DEFAULT_CUSTOM_LIMITS), 700n);

  const higher = previewFloor(withLimits({ sellerMinMarginPct: "100" }));
  assert.ok(higher > 700n, "raising the margin must raise the floor");

  // Partly-filled forms get null rather than a wrong number.
  assert.equal(previewFloor(withLimits({ sellerCostBasis: "" })), null);
  assert.equal(previewFloor(withLimits({ sellerMinMarginPct: "abc" })), null);
});

test("the invited attacks name the agent that actually shows a clamp", () => {
  /*
   * The engine is clamped zero times however narrow the band, by design. Copy
   * that tells a visitor to expect a clamp without naming the baseline sends
   * them looking for something that correctly never happens.
   */
  const panel = read("components", "dashboard", "custom-limits-panel.tsx");

  /*
   * The prose this used to check became a one-click preset. The guarantee is
   * unchanged and matters more now: pressing the sliver button must actually
   * run the baseline agent, because the engine is clamped zero times however
   * narrow the band and the label promises nine clamps.
   */
  const sliverAt = panel.indexOf("A sliver, with the baseline agent");
  assert.ok(sliverAt > 0, "the sliver preset must exist and name the agent");

  // The strategy field inside that preset object, not somewhere else in the file.
  const presetBlock = panel.slice(sliverAt, sliverAt + 600);
  assert.match(
    presetBlock,
    /strategy: "baseline"/,
    "the sliver preset must run baseline, or its label is false",
  );

  // And its explanation must still say the engine differs, so nobody runs it
  // with the engine and concludes the clamp is broken.
  const flat = presetBlock.replace(/\s+/g, " ");
  assert.match(flat, /engine[\s\S]{0,80}clamped zero times/);
});

test("every preset is valid input and matches the outcome its label promises", () => {
  /*
   * The presets are one-click challenges, so their labels are promises about
   * what the visitor is about to see. This pins the arithmetic those promises
   * rest on. It cannot run the negotiation here (that needs the orchestrator
   * and a ledger), so it checks the two things that decide the outcome: the
   * limits parse, and the floor/ceiling relationship is the one claimed.
   *
   * The outcomes themselves were verified against the live deployment on
   * 2026-08-07 and are recorded in the panel's own comment.
   */
  const panel = read("components", "dashboard", "custom-limits-panel.tsx");

  // 1. Ceiling below floor. Must be impossible, and must say 600 and 700.
  assert.match(panel, /Ceiling below floor: 600 against 700/);
  const impossible = validateCustomLimits({
    ...DEFAULT_CUSTOM_LIMITS,
    buyerMaxUnitPrice: "600",
  });
  assert.equal(impossible.ok, true);
  assert.ok(
    previewFloor({ ...DEFAULT_CUSTOM_LIMITS, buyerMaxUnitPrice: "600" }) > 600n,
    "preset 1 must actually put the floor above the ceiling",
  );

  // 2. A sliver, and it MUST name the baseline agent: the engine is clamped
  // zero times however narrow the band, so the label would be false otherwise.
  assert.match(panel, /A sliver, with the baseline agent: 720 against 700/);
  assert.match(panel, /strategy: "baseline"/);
  const sliver = { ...DEFAULT_CUSTOM_LIMITS, buyerMaxUnitPrice: "720" };
  assert.equal(validateCustomLimits(sliver).ok, true);
  assert.equal(previewFloor(sliver), 700n, "the sliver preset assumes a floor of 700");

  // 3. Margin raised past the ceiling. 150% on 500 must clear 1200.
  const raised = {
    ...DEFAULT_CUSTOM_LIMITS,
    buyerMaxUnitPrice: "1200",
    sellerMinMarginPct: "150",
  };
  assert.equal(validateCustomLimits(raised).ok, true);
  const raisedFloor = previewFloor(raised);
  assert.equal(raisedFloor, 1250n);
  assert.ok(raisedFloor > 1200n, "preset 3 must make a deal impossible");

  // Each preset must be reachable as a button that runs, not just prose.
  assert.match(panel, /className="preset-run"/);
  assert.match(panel, /props\.onRun\(preset\.limits, preset\.strategy\)/);
});

test("the primary run button is filled, and disabled looks different in kind", () => {
  /*
   * "Run with these limits" was a pale outlined box that read as disabled and
   * sat visually below the secondary agent chips. It is the primary action.
   * Disabled is hollow rather than dimmed, because a half-opacity solid button
   * still looks pressable.
   */
  const css = readFileSync(join(APP_ROOT, "app", "dashboard.css"), "utf8");
  const rule = (selector) => {
    const at = css.indexOf(`${selector} {`);
    assert.ok(at >= 0, `missing rule ${selector}`);
    return css.slice(at, css.indexOf("}", at));
  };

  const enabled = rule(".custom-run");
  assert.match(enabled, /background:\s*var\(--text-primary\)/);
  assert.match(enabled, /color:\s*var\(--text-on-fill\)/);

  const disabled = rule(".custom-run:disabled");
  assert.match(disabled, /background:\s*transparent/);
  assert.match(disabled, /dashed/);
  assert.doesNotMatch(
    disabled,
    /opacity/,
    "disabled must differ in kind, not be a dimmed copy of enabled",
  );
});
