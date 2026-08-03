/**
 * The clamp. Arithmetic disposes of whatever the strategy or the LLM proposed.
 *
 * Order is not arbitrary and must not be rearranged:
 *
 *   1. quantity  -> the price band depends on it (budget / quantity)
 *   2. terms     -> the seller's floor depends on them
 *   3. re-derive the band for the CLAMPED quantity and terms
 *   4. price     -> into the band, rounded toward the clamping side's safety
 *   5. re-check total spend AFTER rounding, because rounding can push the
 *      product one unit over a cap that step 3 believed was satisfied
 *
 * Every clamp that actually changes a value emits a ClampEvent. A clamp that
 * changes nothing emits nothing, so a marker on the dashboard always means a
 * limit really bound.
 *
 * This module never reads `rationale` or any other free text. That is not an
 * oversight to be "fixed" later: it is the reason prompt injection cannot move
 * a price (property P6).
 */

import { SLA_TIERS_ASCENDING, slaTierRank } from "@parley/shared";
import type { Offer, SlaTier, Terms } from "@parley/shared";
import type { BuyerGuardrails } from "./buyer-guardrails-type.js";
import type { SellerGuardrails } from "./seller-guardrails-type.js";
import { computeFeasibleBand } from "./compute-feasible-band.js";
import type { ClampEvent, ClampResult } from "./clamp-event-types.js";

/** A proposal may be arbitrary garbage. That is the point of clamping it. */
export interface OfferProposal {
  readonly unitPriceMicroUsdc: bigint;
  readonly quantity: number;
  readonly terms: Terms;
}

function clampInteger(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo;
  const truncated = Math.trunc(value);
  if (truncated < lo) return lo;
  if (truncated > hi) return hi;
  return truncated;
}

/** Quantity bounds for a side, as a plain interval. */
function quantityBounds(
  guardrails: BuyerGuardrails | SellerGuardrails,
): { lo: number; hi: number; loBound: ClampEvent["bound"]; hiBound: ClampEvent["bound"] } {
  if (guardrails.party === "BUYER") {
    return {
      lo: guardrails.minQuantity,
      // A buyer never asks for more than it targets.
      hi: Math.max(guardrails.minQuantity, guardrails.targetQuantity),
      loBound: "MIN_QUANTITY",
      hiBound: "MIN_QUANTITY",
    };
  }
  return {
    lo: guardrails.minQuantity,
    hi: guardrails.availableQuantity,
    loBound: "MIN_QUANTITY",
    hiBound: "MAX_QUANTITY_AVAILABLE",
  };
}

/** Terms bounds for a side. */
function clampTerms(
  guardrails: BuyerGuardrails | SellerGuardrails,
  terms: Terms,
  events: ClampEvent[],
): Terms {
  const party = guardrails.party;
  let slaTier: SlaTier = SLA_TIERS_ASCENDING.includes(terms.slaTier)
    ? terms.slaTier
    : "basic";
  let deliveryWindowHours = Number.isFinite(terms.deliveryWindowHours)
    ? Math.trunc(terms.deliveryWindowHours)
    : 24;

  if (guardrails.party === "BUYER") {
    if (slaTierRank(slaTier) < slaTierRank(guardrails.minSlaTier)) {
      events.push({
        party,
        bound: "MIN_SLA_TIER",
        field: "slaTier",
        proposed: slaTier,
        clamped: guardrails.minSlaTier,
        explanation: `Buyer's owner requires at least ${guardrails.minSlaTier} SLA.`,
      });
      slaTier = guardrails.minSlaTier;
    }
    if (deliveryWindowHours > guardrails.maxDeliveryWindowHours) {
      events.push({
        party,
        bound: "MAX_DELIVERY_WINDOW",
        field: "deliveryWindowHours",
        proposed: String(terms.deliveryWindowHours),
        clamped: String(guardrails.maxDeliveryWindowHours),
        explanation: `Buyer's owner will not wait beyond ${guardrails.maxDeliveryWindowHours}h.`,
      });
      deliveryWindowHours = guardrails.maxDeliveryWindowHours;
    }
    if (deliveryWindowHours <= 0) deliveryWindowHours = 1;
  } else {
    if (slaTierRank(slaTier) > slaTierRank(guardrails.maxSlaTier)) {
      events.push({
        party,
        bound: "MAX_SLA_TIER",
        field: "slaTier",
        proposed: slaTier,
        clamped: guardrails.maxSlaTier,
        explanation: `Seller's owner will not commit beyond ${guardrails.maxSlaTier} SLA.`,
      });
      slaTier = guardrails.maxSlaTier;
    }
    if (deliveryWindowHours < guardrails.minDeliveryWindowHours) {
      events.push({
        party,
        bound: "MIN_DELIVERY_WINDOW",
        field: "deliveryWindowHours",
        proposed: String(terms.deliveryWindowHours),
        clamped: String(guardrails.minDeliveryWindowHours),
        explanation: `Seller cannot deliver faster than ${guardrails.minDeliveryWindowHours}h.`,
      });
      deliveryWindowHours = guardrails.minDeliveryWindowHours;
    }
  }

  return { slaTier, deliveryWindowHours };
}

export function clampOfferIntoBand(
  guardrails: BuyerGuardrails | SellerGuardrails,
  proposal: OfferProposal,
): ClampResult {
  const events: ClampEvent[] = [];
  const party = guardrails.party;

  // 1. Quantity, because the band depends on it.
  const bounds = quantityBounds(guardrails);
  const quantity = clampInteger(proposal.quantity, bounds.lo, bounds.hi);
  if (quantity !== proposal.quantity) {
    const hitCeiling = quantity === bounds.hi && proposal.quantity > bounds.hi;
    events.push({
      party,
      bound: hitCeiling ? bounds.hiBound : bounds.loBound,
      field: "quantity",
      proposed: String(proposal.quantity),
      clamped: String(quantity),
      explanation: hitCeiling
        ? `Cannot go above ${bounds.hi} calls.`
        : `Cannot go below ${bounds.lo} calls.`,
    });
  }

  // 2. Terms, because the seller's floor depends on them.
  const terms = clampTerms(guardrails, proposal.terms, events);

  // 3. Re-derive the band for the clamped quantity and terms.
  const band = computeFeasibleBand(guardrails, quantity, terms);
  if (band.empty) {
    return {
      ok: false,
      reason: "NO_FEASIBLE_OFFER",
      cause: band.cause,
      detail: band.detail,
    };
  }

  // 4. Price into the band. Non-finite or negative input collapses to the
  //    nearest legal bound rather than being trusted.
  let unitPrice = proposal.unitPriceMicroUsdc;
  if (unitPrice < band.loMicroUsdc) {
    events.push({
      party,
      bound:
        party === "SELLER" ? "MIN_UNIT_PRICE_FROM_MARGIN" : "MAX_UNIT_PRICE",
      field: "unitPrice",
      proposed: unitPrice.toString(),
      clamped: band.loMicroUsdc.toString(),
      explanation:
        party === "SELLER"
          ? `Below the seller's cost-plus-margin floor of ${band.loMicroUsdc}.`
          : `Below the minimum legal price of ${band.loMicroUsdc}.`,
    });
    unitPrice = band.loMicroUsdc;
  } else if (band.hiMicroUsdc !== null && unitPrice > band.hiMicroUsdc) {
    const budgetBound =
      guardrails.party === "BUYER" &&
      band.hiMicroUsdc < guardrails.maxUnitPriceMicroUsdc;
    events.push({
      party,
      bound: budgetBound ? "MAX_TOTAL_SPEND" : "MAX_UNIT_PRICE",
      field: "unitPrice",
      proposed: unitPrice.toString(),
      clamped: band.hiMicroUsdc.toString(),
      explanation: budgetBound
        ? `Total spend cap allows at most ${band.hiMicroUsdc} per call at this quantity.`
        : `Buyer's owner set a hard ceiling of ${band.hiMicroUsdc} per call.`,
    });
    unitPrice = band.hiMicroUsdc;
  }

  // 5. Total spend re-check AFTER rounding. Cheap, and the likely bug site.
  if (guardrails.party === "BUYER") {
    const total = unitPrice * BigInt(quantity);
    if (total > guardrails.maxTotalSpendMicroUsdc) {
      const corrected = guardrails.maxTotalSpendMicroUsdc / BigInt(quantity);
      events.push({
        party,
        bound: "MAX_TOTAL_SPEND",
        field: "unitPrice",
        proposed: unitPrice.toString(),
        clamped: corrected.toString(),
        explanation:
          `${unitPrice} x ${quantity} exceeds the ${guardrails.maxTotalSpendMicroUsdc} ` +
          `total spend cap.`,
      });
      unitPrice = corrected;
    }
  }

  const offer: Offer = { unitPriceMicroUsdc: unitPrice, quantity, terms };
  return { ok: true, offer, clampsApplied: events };
}
