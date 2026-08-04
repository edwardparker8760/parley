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
import { startScenarioRun } from "@/lib/negotiation-run-registry";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
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
