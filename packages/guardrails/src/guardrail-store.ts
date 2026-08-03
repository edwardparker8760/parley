/**
 * Frozen, private guardrail holder.
 *
 * Guardrails are set by a human owner before the negotiation opens and are
 * immutable for its duration (spec §3). This class enforces that structurally:
 * it deep-freezes on construction and exposes a getter only. There is no
 * setter, so no strategy, no LLM, and no counterparty message can widen a
 * limit mid-negotiation.
 *
 * One store belongs to one party. Handing a store to the other side would
 * defeat the information asymmetry the whole design depends on, so keep
 * construction at the composition root and never pass one across the bus.
 */

import type { BuyerGuardrails } from "./buyer-guardrails-type.js";
import type { SellerGuardrails } from "./seller-guardrails-type.js";

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}

export class GuardrailStore<
  T extends BuyerGuardrails | SellerGuardrails,
> {
  readonly #guardrails: T;

  constructor(guardrails: T) {
    this.#guardrails = deepFreeze({ ...guardrails });
  }

  /** Read-only access. Mutating the result throws in strict mode. */
  get(): T {
    return this.#guardrails;
  }
}
