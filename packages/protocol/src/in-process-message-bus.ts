/**
 * Default MessageBus: same process, strict ordering, no shared mutable state.
 *
 * Two properties matter and both are deliberate:
 *
 *   1. **Ordered delivery.** Publishes drain through a single sequential queue.
 *      Without this, two concurrent publishes could deliver out of order and
 *      the transcript would not match what the agents actually saw.
 *
 *   2. **No shared references.** Every delivered envelope is deep-frozen, so a
 *      receiving agent cannot mutate a message the sender still holds. In one
 *      process this is the difference between a real protocol boundary and two
 *      objects passing pointers.
 *
 * Envelopes are re-validated on receive as well as on publish. The cost is
 * negligible and it means agent logic only ever sees well-formed messages.
 */

import type {
  EnvelopeHandler,
  MessageBus,
  PublishInterceptor,
  Unsubscribe,
} from "./message-bus-interface.js";
import type { Envelope, EnvelopeParty } from "./message-envelope-schema.js";
import { parseEnvelope } from "./message-envelope-schema.js";

/** Recursively freeze. bigints and strings are already immutable. */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}

function counterpartyOf(party: EnvelopeParty): EnvelopeParty {
  return party === "BUYER" ? "SELLER" : "BUYER";
}

export class InProcessMessageBus implements MessageBus {
  readonly #handlers = new Map<EnvelopeParty, Set<EnvelopeHandler>>();
  readonly #interceptors: PublishInterceptor[] = [];
  /** Serialises publishes so delivery order matches call order. */
  #queue: Promise<void> = Promise.resolve();

  /**
   * Register a hook that runs before delivery and can throw to block the
   * message. Phase 03 installs the guardrail egress guard through this.
   */
  addPublishInterceptor(interceptor: PublishInterceptor): void {
    this.#interceptors.push(interceptor);
  }

  subscribe(party: EnvelopeParty, handler: EnvelopeHandler): Unsubscribe {
    const existing = this.#handlers.get(party) ?? new Set<EnvelopeHandler>();
    existing.add(handler);
    this.#handlers.set(party, existing);
    return () => {
      existing.delete(handler);
    };
  }

  async publish(envelope: Envelope): Promise<void> {
    // Validate on publish. The receive side validates again.
    const validated = parseEnvelope(
      JSON.parse(
        JSON.stringify(envelope, (_k, v: unknown) =>
          typeof v === "bigint" ? v.toString() : v,
        ),
      ),
    );

    const run = this.#queue.then(async () => {
      for (const interceptor of this.#interceptors) {
        // Throwing here blocks delivery. Deliberately not caught: a blocked
        // message is a bug or a guardrail violation, never something to
        // swallow silently.
        await interceptor(validated);
      }

      const recipient = counterpartyOf(validated.from);
      const handlers = this.#handlers.get(recipient);
      if (handlers === undefined || handlers.size === 0) return;

      const delivered = deepFreeze(validated);
      for (const handler of handlers) {
        await handler(delivered);
      }
    });

    // Keep the chain alive even if this publish rejects, so one failure does
    // not permanently wedge the queue for later publishes.
    this.#queue = run.catch(() => undefined);
    return run;
  }
}
