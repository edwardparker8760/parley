/**
 * Consults the bounded LLM about this round's price, inside a window the
 * deterministic engine already chose.
 *
 * ## Why the model is not handed the whole feasible band
 *
 * Two reasons, one structural and one strategic.
 *
 * Structural: a seller's feasible band is `[floor, null]`. It has no upper
 * edge, so there is no range to put in a prompt at all.
 *
 * Strategic: a buyer's feasible band is `[0, ceiling]`, where the ceiling is
 * the owner's maximum payable price. Handing that to a model on round 1 and
 * asking it to pick would let it open at the owner's worst acceptable number.
 * That is legal but idiotic, and it would make the negotiation engine
 * decorative.
 *
 * So the model gets a narrow window around the deterministic pick, intersected
 * with the feasible band. It has real discretion (it can move the number, and
 * the transcript shows it doing so) but it cannot skip the concession schedule.
 * Anything it returns still passes through the phase 03 clamp and the
 * independent bus egress guard afterwards, so this window is a strategy
 * boundary, NOT the safety boundary. The safety boundary is arithmetic and is
 * enforced twice more downstream.
 */

import type { MicroUsdc } from "@parley/shared";
import type { BandResult } from "@parley/guardrails";
import type { LlmClient, LlmMode, SelectionOutcome } from "@parley/llm-layer";
import { selectOfferWithBoundedLlm } from "@parley/llm-layer";
import type { RationaleSituation } from "@parley/llm-layer";

/** How far the model may move the deterministic pick. 200bp = 2%. */
export const LLM_WINDOW_BASIS_POINTS = 200n;

export interface AgentLlmSettings {
  readonly mode: LlmMode;
  /** Null in `off` mode, and whenever no client could be built. */
  readonly client: LlmClient | null;
  readonly timeoutMs: number;
}

/** What the agent hands back for the turn loop to persist. */
export interface LlmInvocationRecord {
  readonly party: string;
  readonly mode: string;
  readonly model: string;
  readonly promptHash: string;
  readonly rawResponse: string | null;
  readonly rationale: string;
  readonly outcome: SelectionOutcome;
  readonly fallbackUsed: boolean;
  readonly rejectedPriceMicroUsdc: string | null;
  readonly finalPriceMicroUsdc: string;
  readonly latencyMs: number;
}

export interface ConsultationInputs {
  readonly party: "BUYER" | "SELLER";
  readonly llm: AgentLlmSettings;
  readonly band: BandResult;
  readonly deterministicPickMicroUsdc: MicroUsdc;
  readonly round: number;
  readonly roundCap: number;
  readonly roundsRemaining: number;
  readonly quantity: number;
  readonly ownLastOfferMicroUsdc: MicroUsdc | null;
  readonly counterpartyLastOfferMicroUsdc: MicroUsdc | null;
  readonly counterpartyRationale: string | null;
  readonly situation: RationaleSituation;
}

export interface ConsultationResult {
  readonly unitPriceMicroUsdc: MicroUsdc;
  readonly rationale: string;
  readonly invocation: LlmInvocationRecord;
}

/**
 * The window the model may choose within: the deterministic pick plus or minus
 * a small tolerance, clipped to whatever the owner's limits actually allow.
 */
export function computeRoundWindow(
  band: BandResult,
  pick: MicroUsdc,
): { lo: MicroUsdc; hi: MicroUsdc } {
  if (band.empty) return { lo: pick, hi: pick };

  const tolerance =
    (pick * LLM_WINDOW_BASIS_POINTS) / 10000n > 0n
      ? (pick * LLM_WINDOW_BASIS_POINTS) / 10000n
      : 1n;

  let lo = pick - tolerance;
  if (lo < band.loMicroUsdc) lo = band.loMicroUsdc;

  let hi = pick + tolerance;
  if (band.hiMicroUsdc !== null && hi > band.hiMicroUsdc) hi = band.hiMicroUsdc;

  // A pick outside its own band should be impossible here (the schedule is
  // bounded by the reservation), but if it ever happened, collapsing the window
  // onto the pick keeps this function total and leaves the clamp to fix it.
  if (lo > hi) return { lo: pick, hi: pick };

  return { lo, hi };
}

export async function consultBoundedLlm(
  inputs: ConsultationInputs,
): Promise<ConsultationResult> {
  const window = computeRoundWindow(
    inputs.band,
    inputs.deterministicPickMicroUsdc,
  );

  const selection = await selectOfferWithBoundedLlm({
    mode: inputs.llm.mode,
    client: inputs.llm.client,
    timeoutMs: inputs.llm.timeoutMs,
    prompt: {
      party: inputs.party,
      bandLoMicroUsdc: window.lo,
      bandHiMicroUsdc: window.hi,
      deterministicPickMicroUsdc: inputs.deterministicPickMicroUsdc,
      round: inputs.round,
      roundCap: inputs.roundCap,
      ownLastOfferMicroUsdc: inputs.ownLastOfferMicroUsdc,
      counterpartyLastOfferMicroUsdc: inputs.counterpartyLastOfferMicroUsdc,
      counterpartyRationale: inputs.counterpartyRationale,
      quantity: inputs.quantity,
    },
    template: {
      situation: inputs.situation,
      priceMicroUsdc: inputs.deterministicPickMicroUsdc,
      previousPriceMicroUsdc: inputs.ownLastOfferMicroUsdc,
      counterpartyPriceMicroUsdc: inputs.counterpartyLastOfferMicroUsdc,
      roundsRemaining: inputs.roundsRemaining,
    },
  });

  return {
    unitPriceMicroUsdc: selection.unitPriceMicroUsdc,
    rationale: selection.rationale,
    invocation: {
      party: inputs.party,
      mode: inputs.llm.mode,
      model: inputs.llm.client?.name ?? "none",
      promptHash: selection.promptHash,
      rawResponse: selection.rawResponse,
      rationale: selection.rationale,
      outcome: selection.outcome,
      fallbackUsed: selection.usedFallback,
      rejectedPriceMicroUsdc:
        selection.rejectedPriceMicroUsdc === null
          ? null
          : selection.rejectedPriceMicroUsdc.toString(),
      finalPriceMicroUsdc: selection.unitPriceMicroUsdc.toString(),
      latencyMs: selection.latencyMs,
    },
  };
}
