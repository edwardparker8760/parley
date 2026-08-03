/**
 * Readable rationales for when the LLM is off, slow, or wrong.
 *
 * These are not placeholders. `LLM_MODE=off` is a supported, tested way to run
 * the entire product, and the demo must never show "rationale unavailable".
 * Every template here should read like a sentence a person would write.
 */

import { formatMicroAsUsdc } from "@parley/shared";
import type { MicroUsdc } from "@parley/shared";

export type RationaleSituation =
  | "OPENING"
  | "CONCEDING"
  | "HOLDING_FIRM"
  | "AT_LIMIT"
  | "ACCEPTING";

export interface TemplateInputs {
  readonly situation: RationaleSituation;
  readonly priceMicroUsdc: MicroUsdc;
  readonly previousPriceMicroUsdc: MicroUsdc | null;
  readonly counterpartyPriceMicroUsdc: MicroUsdc | null;
  readonly roundsRemaining: number;
}

export function buildTemplatedRationale(inputs: TemplateInputs): string {
  const price = formatMicroAsUsdc(inputs.priceMicroUsdc);
  const rounds = inputs.roundsRemaining;
  const roundsPhrase =
    rounds === 0
      ? "no rounds left"
      : rounds === 1
        ? "one round left"
        : `${rounds} rounds left`;

  switch (inputs.situation) {
    case "OPENING":
      return `Opening at ${price} per call.`;

    case "CONCEDING": {
      if (inputs.previousPriceMicroUsdc === null) {
        return `Moving to ${price} per call, ${roundsPhrase}.`;
      }
      const from = formatMicroAsUsdc(inputs.previousPriceMicroUsdc);
      return `Moving to ${price} from ${from}, ${roundsPhrase}.`;
    }

    case "HOLDING_FIRM": {
      const theirs =
        inputs.counterpartyPriceMicroUsdc === null
          ? "their position"
          : formatMicroAsUsdc(inputs.counterpartyPriceMicroUsdc);
      return `Holding at ${price}; ${theirs} is still too far apart, ${roundsPhrase}.`;
    }

    case "AT_LIMIT":
      return `${price} is my limit and I cannot go past it, ${roundsPhrase}.`;

    case "ACCEPTING":
      return `Accepting ${price} per call; it clears my limits.`;
  }
}
