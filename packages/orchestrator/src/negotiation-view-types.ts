/**
 * THE ONE SHAPE THE DASHBOARD RENDERS.
 *
 * Live streaming and cold replay both produce this. That is deliberate: a
 * second implementation for replay would be a second set of bugs, and the
 * replay path is the fallback if SSE misbehaves while the video is being shot.
 * Every panel is written once against this type.
 *
 * ## The reservation lines live in `observer`, and only there
 *
 * A reservation price is the number an agent must never learn about its
 * counterparty. The dashboard shows both, because the audience is not a
 * participant (spec section 7). The separation that keeps that honest is
 * structural: reservation and ZOPA data appear ONLY under `observer`, which is
 * computed by the orchestrator from the phase 04 oracle and is never derived
 * from anything that crossed the message bus.
 *
 * `messages` is the bus view: exactly what the counterparty saw. If a
 * reservation value ever appears there, the information-asymmetry claim is
 * dead, and `reservation-data-source.test.ts` exists to catch that.
 *
 * ## Everything is a string
 *
 * bigint does not survive JSON. Money crosses this boundary as decimal strings
 * and is never parsed back into arithmetic on the client: the dashboard
 * displays numbers, it does not compute with them.
 */

export interface TranscriptRowView {
  readonly seq: number;
  readonly round: number;
  readonly party: string;
  readonly type: string;
  readonly unitPriceMicroUsdc: string | null;
  readonly quantity: number | null;
  readonly deliveryWindowHours: number | null;
  readonly slaTier: string | null;
  /** UNTRUSTED text. May be model output. Render as text, never as HTML. */
  readonly rationale: string;
  readonly reasonCode: string | null;
  readonly clamps: readonly ClampMarkerView[];
  /** Present when the LLM was consulted for this message. */
  readonly llm: LlmMarkerView | null;
}

export interface ClampMarkerView {
  readonly party: string;
  readonly bound: string;
  readonly field: string;
  readonly proposed: string;
  readonly clamped: string;
  readonly explanation: string;
}

export interface LlmMarkerView {
  readonly outcome: string;
  readonly rejectedPriceMicroUsdc: string | null;
  readonly finalPriceMicroUsdc: string;
  readonly latencyMs: number;
}

/** Owner limits, shown side by side. Audience view; neither agent sees both. */
export interface GuardrailsView {
  readonly buyer: {
    readonly maxUnitPriceMicroUsdc: string;
    readonly maxTotalSpendMicroUsdc: string;
    readonly targetQuantity: number;
    readonly minSlaTier: string;
    readonly maxDeliveryWindowHours: number;
    readonly clampCount: number;
  };
  readonly seller: {
    readonly costBasisMicroUsdc: string;
    readonly minMarginPct: number;
    readonly derivedFloorMicroUsdc: string;
    readonly availableQuantity: number;
    readonly maxSlaTier: string;
    readonly minDeliveryWindowHours: number;
    readonly clampCount: number;
  };
}

/**
 * Oracle output. Orchestrator only. No agent can produce this, and no agent
 * reads it: `oracle-isolation` is asserted by a phase 04 test that scans source
 * for imports.
 */
export interface ObserverView {
  readonly zopaExists: boolean;
  readonly zopaLoMicroUsdc: string | null;
  readonly zopaHiMicroUsdc: string | null;
  readonly blockingCause: string | null;
  /** The dashed lines. Buyer ceiling and seller floor at the agreed terms. */
  readonly buyerReservationMicroUsdc: string | null;
  readonly sellerReservationMicroUsdc: string | null;
}

export interface SettlementView {
  readonly status: string;
  readonly adapter: string;
  readonly amountMicroUsdc: string;
  readonly termsHash: string;
  readonly reference: string | null;
  readonly txHash: string | null;
  /** Drives the SIMULATED badge. Persisted, never inferred from a name. */
  readonly isStub: boolean;
  readonly explorerUrl: string | null;
  readonly latencyMs: number | null;
  readonly error: string | null;
}

export interface PostMortemView {
  readonly party: string;
  readonly reasonCode: string;
  readonly boundName: string;
  readonly finalGapMicroUsdc: string | null;
  readonly roundsUsed: number;
  readonly zopaExisted: boolean;
  readonly explanation: string;
}

export interface NegotiationView {
  readonly negotiationId: string;
  readonly scenario: string;
  readonly roundCap: number;
  readonly status: "RUNNING" | "SETTLED" | "WALKED_AWAY";
  readonly messages: readonly TranscriptRowView[];
  readonly guardrails: GuardrailsView;
  readonly observer: ObserverView;
  readonly settlement: SettlementView | null;
  readonly postMortems: readonly PostMortemView[];
}
