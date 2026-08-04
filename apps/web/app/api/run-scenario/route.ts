/**
 * POST /api/run-scenario  { scenario: "A" | "B" | "C" }
 *
 * Starts a negotiation and returns its id immediately, so the browser can begin
 * streaming while the ladder is still being written.
 *
 * The scenario name is checked against a fixed allowlist. That is a security
 * boundary, not validation politeness: accepting arbitrary guardrails from the
 * client would let anyone construct limits that make the clamp look wrong.
 */

import { NextResponse } from "next/server";
import { isScenarioName } from "@parley/orchestrator";
import { canRunLive } from "@/lib/select-negotiation-source";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  /*
   * A snapshot deployment has no ledger to write to and no agents to run. It
   * says so rather than failing somewhere deeper, so that a stray request gets
   * an explanation instead of a stack trace about a missing database.
   *
   * The UI already hides the launchers in this mode; this is the backstop for
   * anyone calling the endpoint directly.
   */
  if (!canRunLive()) {
    return NextResponse.json(
      {
        error:
          "This instance is replaying a recorded negotiation and cannot start " +
          "a new one. Run locally with PARLEY_DATA_SOURCE=sqlite to negotiate live.",
      },
      { status: 409 },
    );
  }

  const { startScenarioRun } = await import("@/lib/negotiation-run-registry");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }

  const scenario = (body as { scenario?: unknown } | null)?.scenario;
  if (typeof scenario !== "string" || !isScenarioName(scenario)) {
    return NextResponse.json(
      { error: "scenario must be one of A, B, C" },
      { status: 400 },
    );
  }

  // Also an allowlist, for the same reason: two named brains, no client-supplied
  // behaviour. "baseline" is the phase 02 fixed-concession agent, kept because
  // it is the thing the guardrails visibly have to stop.
  const requested = (body as { strategy?: unknown }).strategy;
  const strategy =
    requested === "baseline" ? "baseline" : requested === undefined || requested === "engine" ? "engine" : null;
  if (strategy === null) {
    return NextResponse.json(
      { error: "strategy must be engine or baseline" },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json({
      negotiationId: startScenarioRun(scenario, strategy),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
