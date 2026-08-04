/**
 * The sentences the engine writes when the model is not writing them.
 *
 * These are not placeholders. `LLM_MODE=off` is a supported way to run the
 * whole product and a one-env-var rollback for demo day, so its ladder has to
 * read well on its own. Each sentence quotes the numbers that actually drove
 * the decision (the utility scores, the term that was traded), which is more
 * than a model reliably does.
 *
 * Kept out of the agent so the agent file is decision flow and nothing else.
 */

import { formatMicroAsUsdc } from "@parley/shared";
import type { MicroUsdc } from "@parley/shared";
import type { RationaleSituation } from "@parley/llm-layer";

export function buildEngineRationale(context: {
  opening: boolean;
  price: MicroUsdc;
  utility: number;
  termsTraded: string | null;
  roundsRemaining: number;
}): string {
  const unit = formatMicroAsUsdc(context.price);
  if (context.opening) {
    return `Opening at ${unit}/call.`;
  }
  if (context.termsTraded !== null) {
    return (
      `Holding near ${unit}/call by giving ground on terms instead ` +
      `(${context.termsTraded}). ${context.roundsRemaining} rounds left.`
    ).slice(0, 240);
  }
  return (
    `Moving to ${unit}/call, worth ${context.utility.toFixed(2)} to me. ` +
    `${context.roundsRemaining} rounds left.`
  ).slice(0, 240);
}

/**
 * Why we took the deal. The deadline case is worth distinguishing: accepting
 * something worse than we could have reached, because the rounds ran out, is a
 * different decision from accepting something good, and the transcript should
 * not blur the two.
 */
export function buildAcceptRationale(context: {
  priceMicroUsdc: MicroUsdc;
  inboundUtility: number;
  reachableUtility: number;
  atDeadline: boolean;
}): string {
  const unit = formatMicroAsUsdc(context.priceMicroUsdc);
  if (context.atDeadline) {
    return (
      `${unit}/call scores ${context.inboundUtility.toFixed(2)}, below the ` +
      `${context.reachableUtility.toFixed(2)} I wanted, but it clears my ` +
      `limits and the rounds are gone. Better than no deal.`
    );
  }
  return (
    `${unit}/call scores ${context.inboundUtility.toFixed(2)} for me, at or ` +
    `above the ${context.reachableUtility.toFixed(2)} I could still reach. ` +
    `Taking it.`
  );
}

/** Which templated sentence fits, when the model has nothing to say. */
export function describeSituation(
  ownLast: MicroUsdc | null,
  proposal: { unitPriceMicroUsdc: MicroUsdc; termsTraded: string | null },
  ownOfferCount: number,
): RationaleSituation {
  if (ownOfferCount === 0) return "OPENING";
  if (ownLast !== null && proposal.unitPriceMicroUsdc === ownLast) {
    return "HOLDING_FIRM";
  }
  if (proposal.termsTraded !== null) return "HOLDING_FIRM";
  return "CONCEDING";
}
