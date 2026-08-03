/**
 * The settlement boundary.
 *
 * This interface is the load-bearing design call of phase 01. Everything the
 * negotiation engine does (phases 02 to 05) depends on THIS, never on the
 * Circle SDK. Consequences, both deliberate:
 *
 *   1. No Circle credentials means no blocker. The stub implementation runs
 *      the full demo end to end.
 *   2. If the `@circle-fin/x402-batching` surface turns out to differ from
 *      what the research assumed, the blast radius is one file behind this
 *      interface, not the whole engine.
 *
 * `isStub` is carried through to the dashboard and rendered as a visible
 * badge. A stubbed settlement must never be able to look real in the demo.
 */

import type { DealId, MicroUsdc, Offer } from "@parley/shared";

export type SettlementStatus =
  /** Authorization issued, not yet settled on chain. */
  | "PENDING"
  /** Settled on chain. Only ever produced by a real adapter. */
  | "SETTLED"
  /** Settled by the local stub. Never real money. */
  | "SETTLED_STUB"
  | "FAILED";

/** The agreed deal, frozen at the moment of ACCEPT. */
export interface SettlementRequest {
  readonly dealId: DealId;
  readonly agreedOffer: Offer;
  /**
   * sha256 of the canonical JSON of the agreed terms. Binds the payment to
   * exactly what was agreed, so the settlement cannot be silently detached
   * from the negotiation that produced it (spec section 6).
   */
  readonly termsHash: string;
  readonly buyerAddress: string;
  readonly sellerAddress: string;
}

export interface SettlementReceipt {
  readonly dealId: DealId;
  readonly status: SettlementStatus;
  /** Payment reference. For the stub this is a recognisably fake value. */
  readonly reference: string;
  /** Present only for real on-chain settlement. */
  readonly txHash?: string;
  readonly amountMicroUsdc: MicroUsdc;
  readonly termsHash: string;
  /** True whenever no real money moved. Rendered as a SIMULATED badge. */
  readonly isStub: boolean;
  readonly settledAt: string;
}

export interface SettlementAdapter {
  /** Stable identifier for logs and the dashboard, e.g. "local-stub". */
  readonly name: string;
  /** True when this adapter cannot move real money. */
  readonly isStub: boolean;
  settle(request: SettlementRequest): Promise<SettlementReceipt>;
}

/**
 * Thrown when a real adapter is selected but cannot operate. Deliberately NOT
 * caught anywhere with a fallback to the stub: a silent downgrade from real to
 * simulated settlement is exactly the failure that would put a fabricated
 * transaction hash into a submission video.
 */
export class SettlementNotConfiguredError extends Error {
  constructor(detail: string) {
    super(`Settlement adapter not configured: ${detail}`);
    this.name = "SettlementNotConfiguredError";
  }
}
