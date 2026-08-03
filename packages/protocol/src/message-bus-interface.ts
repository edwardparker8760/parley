/**
 * The only channel between the two agents.
 *
 * This interface is what buys the "independent parties" property while the
 * agents still run in one process (plan.md, decided 2026-08-03). Agents never
 * import each other and never share a memory reference to the counterparty's
 * guardrails; everything crosses this boundary.
 *
 * `publish` is async even for the in-process implementation, so an HTTP
 * implementation can be dropped in later with no signature change and no edit
 * to agent code.
 *
 * Phase 03 inserts its outbound band guard at this boundary, which is why
 * publish must be the single egress point: a message that never crosses the
 * bus never reaches the counterparty.
 */

import type { Envelope, EnvelopeParty } from "./message-envelope-schema.js";

/** Call to stop receiving. Idempotent. */
export type Unsubscribe = () => void;

export type EnvelopeHandler = (envelope: Envelope) => Promise<void> | void;

export interface MessageBus {
  /**
   * Send an envelope to the party it is addressed to (the counterparty of
   * `envelope.from`). Resolves once delivery handlers have run.
   */
  publish(envelope: Envelope): Promise<void>;

  /** Receive envelopes addressed to `party`. */
  subscribe(party: EnvelopeParty, handler: EnvelopeHandler): Unsubscribe;
}

/**
 * Optional hook run on every publish before delivery. Returning a rejection
 * blocks the message. Phase 03 installs the guardrail egress guard here.
 */
export type PublishInterceptor = (envelope: Envelope) => void | Promise<void>;
