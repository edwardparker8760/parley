/**
 * THE WORDS THAT MAKE THE NUMBERS MEAN SOMETHING.
 *
 * Every figure the dashboard shows was already on screen before this file
 * existed. What was missing was the sentence around it: a judge opening /app
 * directly saw a price ladder, two dashed lines and a clamp code, with nothing
 * anywhere stating what was being bought, by whom, under what limits, or how it
 * ended. State without setup is noise.
 *
 * So this module adds NO data. It reads the same `NegotiationView` the panels
 * read and returns English.
 *
 * ## Units
 *
 * Per-call prices are micro-USDC, whole numbers, as they are in the ledger and
 * in every clamp event. The dashboard used to render them as `0.0009/call`,
 * which is arithmetically identical and impossible to hold in your head: the
 * difference between a ceiling of 0.0009 and a floor of 0.000855 does not read
 * as a gap of 45. Totals stay in USDC, where the number is human-sized.
 *
 * ## Arithmetic
 *
 * `format-micro-usdc.ts` says money is never parsed back into arithmetic here,
 * and it is right: a float would put a rounded figure next to a settled one.
 * The two subtractions below are BigInt, so they are exact, and they produce a
 * sentence rather than a settled amount.
 */

import type { NegotiationView, ClampMarkerView } from "@parley/orchestrator";
import { microToUsdc } from "@/components/dashboard/format-micro-usdc";

export interface NegotiationBriefing {
  /** What is being bought, in one noun phrase. */
  readonly goods: string;
  /** The non-price terms on the table. */
  readonly terms: string;
  readonly buyerCeilingMicro: string;
  readonly buyerBudgetUsdc: string;
  readonly sellerFloorMicro: string;
  readonly sellerCostBasisMicro: string;
  readonly sellerMarginPct: number;
  /** One sentence naming the situation the two ranges create. */
  readonly situation: string;
}

/** The setup, before anything happened. */
export function briefingFor(view: NegotiationView): NegotiationBriefing {
  const { buyer, seller } = view.guardrails;

  return {
    goods: `${buyer.targetQuantity.toLocaleString()} calls of bulk inference capacity`,
    terms: `${buyer.minSlaTier} service or better, delivered within ${buyer.maxDeliveryWindowHours} hours`,
    buyerCeilingMicro: buyer.maxUnitPriceMicroUsdc,
    buyerBudgetUsdc: microToUsdc(buyer.maxTotalSpendMicroUsdc),
    sellerFloorMicro: seller.derivedFloorMicroUsdc,
    sellerCostBasisMicro: seller.costBasisMicroUsdc,
    sellerMarginPct: seller.minMarginPct,
    situation: situationFor(view),
  };
}

function situationFor(view: NegotiationView): string {
  const { observer } = view;

  if (!observer.zopaExists || observer.zopaLoMicroUsdc === null || observer.zopaHiMicroUsdc === null) {
    /*
     * Written from the two numbers rather than from `blockingCause`. The
     * oracle's string is correct but already contains a colon of its own
     * ("seller floor 951 exceeds buyer ceiling 600: no price satisfies both
     * owners"), and quoting it inside another sentence produced two colons and
     * a clause that read like a log line.
     */
    const floor = observer.sellerReservationMicroUsdc;
    const ceiling = observer.buyerReservationMicroUsdc;
    if (floor === null || ceiling === null) {
      return "These two ranges do not overlap at all, so no price can satisfy both owners.";
    }
    return (
      `These two ranges do not overlap at all. The seller cannot go below ${floor} ` +
      `and the buyer cannot go above ${ceiling}, so no price satisfies both owners.`
    );
  }

  // Exact, because both operands are integer micro-USDC strings.
  const width = BigInt(observer.zopaHiMicroUsdc) - BigInt(observer.zopaLoMicroUsdc);
  return (
    `These two ranges overlap by ${width}, from ${observer.zopaLoMicroUsdc} to ` +
    `${observer.zopaHiMicroUsdc}, so a deal is possible somewhere in that gap.`
  );
}

/**
 * How it ended, in one line, with no status code and no jargon.
 *
 * The settled price is not a field on the view, but it is not new data either:
 * it is the last priced offer before the ACCEPT, which is by definition the
 * offer that was accepted. `unitPrice x quantity` equals the settled amount for
 * every bundled run, which is the check that this reads the right message.
 */
export function verdictFor(view: NegotiationView): string {
  if (view.status === "WALKED_AWAY") return walkAwayVerdict(view);
  if (view.status !== "SETTLED") return "This negotiation is still running.";

  const accepted = acceptedOffer(view);
  const round = view.messages.find((row) => row.type === "ACCEPT")?.round ?? null;

  const opening =
    accepted === null
      ? "The two agents agreed."
      : `Agreed at ${accepted.unitPriceMicroUsdc} per call` +
        (round === null ? "." : ` in round ${round}.`);

  const limits = limitClause(view);

  const settlement = view.settlement;
  const money =
    settlement === null
      ? "No settlement was attempted."
      : `${microToUsdc(settlement.amountMicroUsdc)} USDC settled` +
        (settlement.isStub ? ", simulated: no real money moved." : ".");

  return `${opening} ${limits} ${money}`;
}

/**
 * What the owners' limits did during the run. This is the sentence the whole
 * project exists to be able to say, so it is stated for both outcomes rather
 * than only when a clamp happened.
 */
function limitClause(view: NegotiationView): string {
  const buyerClamps = view.guardrails.buyer.clampCount;
  const sellerClamps = view.guardrails.seller.clampCount;

  if (buyerClamps === 0 && sellerClamps === 0) {
    return "Neither owner's limit ever had to stop its agent.";
  }

  const parts: string[] = [];
  if (buyerClamps > 0) {
    parts.push(
      `the buyer's ceiling of ${view.guardrails.buyer.maxUnitPriceMicroUsdc} stopped its agent ` +
        `${buyerClamps} ${buyerClamps === 1 ? "time" : "times"}`,
    );
  }
  if (sellerClamps > 0) {
    parts.push(
      `the seller's floor of ${view.guardrails.seller.derivedFloorMicroUsdc} stopped its agent ` +
        `${sellerClamps} ${sellerClamps === 1 ? "time" : "times"}`,
    );
  }

  return `Along the way ${parts.join(" and ")}.`;
}

function walkAwayVerdict(view: NegotiationView): string {
  const rounds = view.postMortems[0]?.roundsUsed ?? null;
  const at = rounds === null ? "" : ` at round ${rounds}`;

  const why = view.observer.zopaExists
    ? "They ran out of rounds before their offers met."
    : "No price satisfied both owners.";

  return `${why} Both agents walked away${at}. No money moved.`;
}

/** The offer the ACCEPT accepted: the last priced message before it. */
function acceptedOffer(view: NegotiationView) {
  const acceptIndex = view.messages.findIndex((row) => row.type === "ACCEPT");
  if (acceptIndex < 0) return null;

  for (let index = acceptIndex - 1; index >= 0; index -= 1) {
    const row = view.messages[index];
    if (row !== undefined && row.unitPriceMicroUsdc !== null) return row;
  }
  return null;
}

/**
 * A clamp, in words.
 *
 * `CLAMP BUYER MAX_UNIT_PRICE 954 -> 900` is precise and says nothing to
 * anybody who has not read the codebase. The three short sentences it becomes
 * are the entire product: the agent asked for a number, its owner had set a
 * different one, and arithmetic, not the model, decided which one went on the
 * wire.
 */
export function clampSentence(clamp: ClampMarkerView): string {
  const side = clamp.party === "BUYER" ? "buyer" : "seller";
  const limit = clamp.party === "BUYER" ? "ceiling" : "floor";

  return (
    `The ${side}'s agent wanted ${clamp.proposed}. ` +
    `Its owner's ${limit} is ${clamp.clamped}. ` +
    `Arithmetic sent ${clamp.clamped}.`
  );
}
