/**
 * Deterministic local settlement stub.
 *
 * Purpose: unblock phases 02 to 05 while Circle credentials are pending. It
 * moves no money and says so at every level: status SETTLED_STUB, isStub true,
 * and a reference that begins with a literal "0xstub-" so it cannot be mistaken
 * for a transaction hash at a glance or in a screenshot.
 *
 * The artificial latency exists so the dashboard's pending to settled
 * transition is actually visible during the demo rather than instantaneous.
 */

import { multiplyByQuantity } from "@parley/shared";
import type {
  SettlementAdapter,
  SettlementReceipt,
  SettlementRequest,
} from "./settlement-adapter-interface.js";

export interface LocalStubSettlementAdapterOptions {
  /** Artificial delay before the receipt resolves, in ms. */
  readonly latencyMs?: number;
  /** Injectable clock, so tests are deterministic. */
  readonly now?: () => Date;
  /** Injectable sleep, so tests do not actually wait. */
  readonly sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class LocalStubSettlementAdapter implements SettlementAdapter {
  readonly name = "local-stub";
  readonly isStub = true;

  readonly #latencyMs: number;
  readonly #now: () => Date;
  readonly #sleep: (ms: number) => Promise<void>;

  constructor(options: LocalStubSettlementAdapterOptions = {}) {
    this.#latencyMs = options.latencyMs ?? 800;
    this.#now = options.now ?? (() => new Date());
    this.#sleep = options.sleep ?? defaultSleep;
  }

  async settle(request: SettlementRequest): Promise<SettlementReceipt> {
    if (this.#latencyMs > 0) {
      await this.#sleep(this.#latencyMs);
    }

    const amountMicroUsdc = multiplyByQuantity(
      request.agreedOffer.unitPriceMicroUsdc,
      request.agreedOffer.quantity,
    );

    // Derived from the terms hash, so the same deal always yields the same
    // reference. "0xstub-" is not a valid tx hash prefix, by design.
    const reference = `0xstub-${request.termsHash.replace(/^0x/, "").slice(0, 16)}`;

    return {
      dealId: request.dealId,
      status: "SETTLED_STUB",
      reference,
      amountMicroUsdc,
      termsHash: request.termsHash,
      isStub: true,
      settledAt: this.#now().toISOString(),
    };
  }
}
