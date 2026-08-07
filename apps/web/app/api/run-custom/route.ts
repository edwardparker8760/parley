/**
 * POST /api/run-custom  { limits }  ->  { view }
 *
 * Runs one negotiation under limits the visitor set, and returns the finished
 * view in a single response.
 *
 * ## Why this is NOT gated on `canRunLive`
 *
 * `/api/run-scenario` refuses on a replay instance because it writes to a
 * ledger that a replay instance does not have. This route has no such need: it
 * opens its own in-memory database, uses it for the length of one request, and
 * lets it fall out of scope. Nothing is persisted and nothing is shared, so it
 * works identically on a deployed replay instance and on a local live one.
 *
 * That is the whole point. The claim being tested is that no input moves an
 * owner's limit, and a visitor can only test it if the thing runs where they
 * are, which is the deployed build.
 *
 * ## Why it is safe to run on demand
 *
 * With no `llm` setting the run is pure computation: no API key, no network,
 * no filesystem. `negotiation-turn-loop.js` compiles to imports of
 * `@parley/protocol` and `@parley/guardrails` only; its `@parley/ledger`
 * import is type-only and is erased. The remaining SQLite use is the in-memory
 * ledger, which `node:sqlite` provides with no native module and no flag on
 * the Node 24 runtime this deploys to.
 *
 * The work is bounded by the round cap (12) and by the input bounds in
 * `lib/custom-limits.ts`, so a request cannot ask for an expensive run.
 *
 * ## Why there is no settlement
 *
 * `runScenario` is called with no settlement adapter, so the ACCEPT branch
 * records the deal and stops. A custom run is a test of the guardrails, and
 * attaching a payment path to arbitrary visitor input would be a different and
 * much larger claim.
 */

import { NextResponse } from "next/server";
import {
  validateCustomLimits,
  termsFor,
  derivedFloorFor,
} from "@/lib/custom-limits";
import type { CustomLimitsInput } from "@/lib/custom-limits";

export const dynamic = "force-dynamic";

/** Deterministic and modest. Same cap the three scenarios use. */
const ROUND_CAP = 12;

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { problems: ["The request body was not valid JSON."] },
      { status: 400 },
    );
  }

  const limitsInput = (body as { limits?: unknown } | null)?.limits;
  if (typeof limitsInput !== "object" || limitsInput === null) {
    return NextResponse.json(
      { problems: ["No limits were sent."] },
      { status: 400 },
    );
  }

  /*
   * Coerced to strings before validation so that a JSON number, a null or a
   * nested object all take the same path as a form value. The validator is the
   * only thing that decides what is acceptable, and it works on strings.
   */
  const asStrings = Object.fromEntries(
    Object.entries(limitsInput as Record<string, unknown>).map(([key, value]) => [
      key,
      value === null || value === undefined ? "" : String(value),
    ]),
  ) as unknown as CustomLimitsInput;

  const validated = validateCustomLimits(asStrings);
  if (!validated.ok) {
    return NextResponse.json({ problems: validated.problems }, { status: 400 });
  }
  const limits = validated.value;

  /*
   * Lazy, for the reason `/api/run-scenario` documents: `@parley/orchestrator`
   * re-exports through `@parley/ledger`, which imports `node:sqlite`. Keeping
   * it out of the module graph until it is needed means a request that fails
   * validation never loads it at all.
   */
  const { runScenario, buildNegotiationView } = await import("@parley/orchestrator");

  const terms = termsFor(limits);
  const floor = derivedFloorFor(limits);
  const ceiling = BigInt(limits.buyerMaxUnitPrice);

  /*
   * Openings must sit inside each side's own band or the egress guard throws:
   * it treats an out-of-band outbound message as a broken clamp, which is
   * correct and is not something a visitor's input should be able to trigger.
   *
   * The buyer opens low inside [0, ceiling]; the seller opens high inside
   * [floor, unbounded). Both are legal whatever the two limits are, including
   * when they do not overlap, which is exactly the case the invitation asks
   * people to try.
   */
  const buyerOpening = ceiling / 2n > 0n ? ceiling / 2n : 1n;
  const sellerOpening = floor * 2n > 0n ? floor * 2n : 1n;

  const definition: import("@parley/orchestrator").ScenarioDefinition = {
    // Stored in the ledger's scenario column, which only accepts A, B or C.
    // Nothing user-facing reads it: the screen labels a custom run from the
    // response flag below, not from this. The label is what a human sees.
    name: "A",
    label: "Your own limits",
    roundCap: ROUND_CAP,
    buyerGuardrails: {
      party: "BUYER",
      maxUnitPriceMicroUsdc: ceiling,
      maxTotalSpendMicroUsdc: BigInt(limits.buyerMaxTotalSpendUsdc) * 1_000_000n,
      minQuantity: 1,
      targetQuantity: limits.buyerTargetQuantity,
      minSlaTier: limits.buyerMinSlaTier,
      maxDeliveryWindowHours: limits.buyerMaxDeliveryWindowHours,
      maxRounds: ROUND_CAP,
    },
    sellerGuardrails: {
      party: "SELLER",
      costBasisMicroUsdc: BigInt(limits.sellerCostBasis),
      minMarginPct: limits.sellerMinMarginPct,
      minQuantity: 1,
      availableQuantity: limits.sellerAvailableQuantity,
      maxSlaTier: "premium",
      minDeliveryWindowHours: limits.sellerMinDeliveryWindowHours,
      maxRounds: ROUND_CAP,
    },
    buyerOpeningMicroUsdc: buyerOpening,
    sellerOpeningMicroUsdc: sellerOpening,
    terms,
    beta: 1.2,
    expectation: "Whatever these limits allow",
  };

  try {
    /*
     * The strategy is the visitor's, because it changes what they can observe.
     *
     * The engine concedes on a schedule that never reaches its own limit, so it
     * is clamped zero times however tight you make the band: the better agent
     * and the worse demonstration. The baseline walks straight into its limit
     * and gets stopped, repeatedly, which is the only way to watch the clamp
     * actually fire on numbers you chose yourself.
     */
    const strategy =
      (body as { strategy?: unknown }).strategy === "baseline"
        ? ("baseline" as const)
        : ("engine" as const);

    const result = await runScenario({
      scenario: "A",
      definition,
      strategy,
      location: ":memory:",
      // No `settlement`: a custom run records the deal and stops.
      // No `llm`: pure computation, no key and no network.
      seedKey: "custom",
    });

    const view = buildNegotiationView(result.db, result.negotiationId, definition);

    return NextResponse.json({
      view: JSON.parse(
        JSON.stringify(view, (_key, value: unknown) =>
          typeof value === "bigint" ? value.toString() : value,
        ),
      ),
      custom: true,
      derivedFloorMicroUsdc: floor.toString(),
    });
  } catch (error: unknown) {
    /*
     * A throw here is a real defect, not a bad input: validation has already
     * run and the bands are computed from bounded integers. It is reported as
     * a 500 with the message only, never the stack, because the message is
     * built from the run's own numbers and the stack is not the visitor's
     * business.
     */
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { problems: [`The run failed: ${message}`] },
      { status: 500 },
    );
  }
}

// Referenced only so the type import above is not flagged as unused in builds
// that erase it differently.
export const runtime = "nodejs";
