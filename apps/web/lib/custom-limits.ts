/**
 * A visitor's own owner limits: parsing, bounds, and the definition they run as.
 *
 * ## Why this is one shared module
 *
 * The panel validates as you type and the route validates what arrives. Those
 * must agree, or the form says a value is fine and the server disagrees, which
 * reads as the product being broken rather than as the input being wrong. So
 * both import this. The browser gets instant feedback; the route gets the real
 * boundary, because a form can be bypassed with curl.
 *
 * ## Why validation here is load-bearing, not politeness
 *
 * `app/api/run-scenario/route.ts` allowlists three scenario names, and says why:
 * accepting arbitrary guardrails from a client would let anyone construct
 * limits that make the clamp look wrong. This feature deliberately opens that
 * door, so the door needs a frame. Every field is bounded, every value must be
 * a safe integer, and anything outside is refused with a sentence rather than
 * coerced into range. Silently clamping an input would be the exact failure the
 * product claims cannot happen.
 *
 * Note what is NOT rejected: limits that make a deal impossible. A ceiling
 * below the floor is a legitimate thing to ask for and the whole point of the
 * invitation to try it. It produces a walk-away, which is the correct answer,
 * not an error.
 */

/*
 * Both imports are deep, not barrels, because this module runs in the BROWSER.
 * `@parley/guardrails` and `@parley/shared` both re-export server-only modules
 * (`config-from-env` reaches for `node:path` and `node:fs`), and importing
 * either barrel here fails the webpack build with `Module not found: node:path`.
 */
import { deriveSellerMinUnitPrice } from "@parley/guardrails/derive-seller-min-unit-price";
import type { SlaTier, Terms } from "@parley/shared/domain-types";

export const SLA_TIERS: readonly SlaTier[] = ["basic", "standard", "premium"];

/** What the form holds: strings, because that is what inputs produce. */
export interface CustomLimitsInput {
  readonly buyerMaxUnitPrice: string;
  readonly buyerMaxTotalSpendUsdc: string;
  readonly buyerTargetQuantity: string;
  readonly buyerMinSlaTier: string;
  readonly buyerMaxDeliveryWindowHours: string;
  readonly sellerCostBasis: string;
  readonly sellerMinMarginPct: string;
  readonly sellerAvailableQuantity: string;
  readonly sellerMinDeliveryWindowHours: string;
}

export const DEFAULT_CUSTOM_LIMITS: CustomLimitsInput = {
  buyerMaxUnitPrice: "1200",
  buyerMaxTotalSpendUsdc: "12",
  buyerTargetQuantity: "10000",
  buyerMinSlaTier: "basic",
  buyerMaxDeliveryWindowHours: "72",
  sellerCostBasis: "500",
  sellerMinMarginPct: "40",
  sellerAvailableQuantity: "20000",
  sellerMinDeliveryWindowHours: "12",
};

/**
 * Bounds. Generous enough to be playable, tight enough that nothing here can
 * be turned into a denial of service or an arithmetic overflow.
 *
 * The quantity ceiling matters most: quantity multiplies the unit price into
 * the total, and the round cap multiplies the work. Ten million calls at a
 * million micro-USDC is 10^13, comfortably inside a JS safe integer and inside
 * the bigint arithmetic the ledger uses.
 */
const BOUNDS = {
  buyerMaxUnitPrice: { min: 1, max: 1_000_000, label: "the buyer's maximum price per call" },
  buyerMaxTotalSpendUsdc: { min: 1, max: 1_000_000, label: "the buyer's total budget" },
  buyerTargetQuantity: { min: 1, max: 10_000_000, label: "the number of calls the buyer wants" },
  buyerMaxDeliveryWindowHours: { min: 1, max: 8760, label: "the buyer's delivery window" },
  sellerCostBasis: { min: 0, max: 1_000_000, label: "the seller's cost per call" },
  sellerMinMarginPct: { min: 0, max: 1000, label: "the seller's minimum margin" },
  sellerAvailableQuantity: { min: 1, max: 10_000_000, label: "the seller's available capacity" },
  sellerMinDeliveryWindowHours: { min: 1, max: 8760, label: "the seller's minimum delivery window" },
} as const;

export interface ParsedCustomLimits {
  readonly buyerMaxUnitPrice: number;
  readonly buyerMaxTotalSpendUsdc: number;
  readonly buyerTargetQuantity: number;
  readonly buyerMinSlaTier: SlaTier;
  readonly buyerMaxDeliveryWindowHours: number;
  readonly sellerCostBasis: number;
  readonly sellerMinMarginPct: number;
  readonly sellerAvailableQuantity: number;
  readonly sellerMinDeliveryWindowHours: number;
}

export type ValidationResult =
  | { readonly ok: true; readonly value: ParsedCustomLimits }
  | { readonly ok: false; readonly problems: readonly string[] };

/** One field, parsed and bounded, or a sentence saying why not. */
function parseBounded(
  raw: string,
  bound: { min: number; max: number; label: string },
  problems: string[],
): number | null {
  /*
   * Coerced, not trusted. The type says `string`, but this is a boundary: a
   * request carrying only some of the fields reaches here with `undefined`, and
   * `undefined.trim()` is a TypeError that surfaces as a 500. A partial payload
   * is a bad request, and it has to be answered with the same plain sentence a
   * bad value gets, not with a stack trace.
   */
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "") {
    problems.push(`Fill in ${bound.label}.`);
    return null;
  }
  // Rejected rather than truncated: "12.5" almost certainly means the person
  // wanted 12.5, and quietly running 12 would be answering a question they did
  // not ask. Every figure on this screen is a whole number of millionths.
  if (!/^-?\d+$/.test(trimmed)) {
    problems.push(
      `${capitalise(bound.label)} must be a whole number. ` +
        `"${trimmed}" is not, and rounding it would change what you asked for.`,
    );
    return null;
  }
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value)) {
    problems.push(`${capitalise(bound.label)} is too large to calculate with.`);
    return null;
  }
  if (value < bound.min || value > bound.max) {
    problems.push(
      `${capitalise(bound.label)} must be between ${bound.min.toLocaleString()} ` +
        `and ${bound.max.toLocaleString()}. You gave ${value.toLocaleString()}.`,
    );
    return null;
  }
  return value;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function validateCustomLimits(input: CustomLimitsInput): ValidationResult {
  const problems: string[] = [];

  const buyerMaxUnitPrice = parseBounded(
    input.buyerMaxUnitPrice, BOUNDS.buyerMaxUnitPrice, problems);
  const buyerMaxTotalSpendUsdc = parseBounded(
    input.buyerMaxTotalSpendUsdc, BOUNDS.buyerMaxTotalSpendUsdc, problems);
  const buyerTargetQuantity = parseBounded(
    input.buyerTargetQuantity, BOUNDS.buyerTargetQuantity, problems);
  const buyerMaxDeliveryWindowHours = parseBounded(
    input.buyerMaxDeliveryWindowHours, BOUNDS.buyerMaxDeliveryWindowHours, problems);
  const sellerCostBasis = parseBounded(
    input.sellerCostBasis, BOUNDS.sellerCostBasis, problems);
  const sellerMinMarginPct = parseBounded(
    input.sellerMinMarginPct, BOUNDS.sellerMinMarginPct, problems);
  const sellerAvailableQuantity = parseBounded(
    input.sellerAvailableQuantity, BOUNDS.sellerAvailableQuantity, problems);
  const sellerMinDeliveryWindowHours = parseBounded(
    input.sellerMinDeliveryWindowHours, BOUNDS.sellerMinDeliveryWindowHours, problems);

  const sla = String(input.buyerMinSlaTier ?? "").trim() as SlaTier;
  if (!SLA_TIERS.includes(sla)) {
    problems.push(`Service level must be one of basic, standard or premium.`);
  }

  /*
   * The one cross-field rule, and it is about the RUN being possible to start,
   * not about it being possible to settle. The seller quotes per call and the
   * buyer's window must be one the seller can meet, otherwise there are no
   * terms to negotiate at all and the run ends before a single offer.
   *
   * Everything else that looks contradictory is allowed on purpose. A ceiling
   * under the floor, capacity under the order, a budget that cannot cover the
   * ceiling: all of those are real situations with a correct answer, and the
   * correct answer is a walk-away.
   */
  if (
    buyerMaxDeliveryWindowHours !== null &&
    sellerMinDeliveryWindowHours !== null &&
    buyerMaxDeliveryWindowHours < sellerMinDeliveryWindowHours
  ) {
    problems.push(
      `The buyer wants delivery within ${buyerMaxDeliveryWindowHours}h but the ` +
        `seller cannot deliver faster than ${sellerMinDeliveryWindowHours}h, so ` +
        `there are no terms to negotiate over. Widen one of them.`,
    );
  }

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    value: {
      buyerMaxUnitPrice: buyerMaxUnitPrice!,
      buyerMaxTotalSpendUsdc: buyerMaxTotalSpendUsdc!,
      buyerTargetQuantity: buyerTargetQuantity!,
      buyerMinSlaTier: sla,
      buyerMaxDeliveryWindowHours: buyerMaxDeliveryWindowHours!,
      sellerCostBasis: sellerCostBasis!,
      sellerMinMarginPct: sellerMinMarginPct!,
      sellerAvailableQuantity: sellerAvailableQuantity!,
      sellerMinDeliveryWindowHours: sellerMinDeliveryWindowHours!,
    },
  };
}

/** The terms the run negotiates under: the buyer's stated requirement. */
export function termsFor(limits: ParsedCustomLimits): Terms {
  return {
    deliveryWindowHours: limits.buyerMaxDeliveryWindowHours,
    slaTier: limits.buyerMinSlaTier,
  };
}

/**
 * The seller's floor, from the same function the engine uses.
 *
 * Imported rather than reimplemented so the number the panel shows while you
 * type is the number the run will enforce. A second implementation here would
 * drift, and the first symptom would be a screen that promised one floor and a
 * negotiation that respected another.
 */
export function derivedFloorFor(limits: ParsedCustomLimits): bigint {
  return deriveSellerMinUnitPrice(
    {
      costBasisMicroUsdc: BigInt(limits.sellerCostBasis),
      minMarginPct: limits.sellerMinMarginPct,
    },
    termsFor(limits),
  );
}

/**
 * The live floor for a partly-filled form.
 *
 * The panel needs a number while the rest of the form is still wrong, so this
 * takes only the three fields the floor depends on and returns null when they
 * are not yet usable, rather than demanding a fully valid form.
 */
export function previewFloor(input: CustomLimitsInput): bigint | null {
  const cost = String(input.sellerCostBasis ?? "").trim();
  const margin = String(input.sellerMinMarginPct ?? "").trim();
  const window = String(input.buyerMaxDeliveryWindowHours ?? "").trim();
  if (!/^\d+$/.test(cost) || !/^\d+$/.test(margin) || !/^\d+$/.test(window)) {
    return null;
  }
  const sla = String(input.buyerMinSlaTier ?? "").trim() as SlaTier;
  if (!SLA_TIERS.includes(sla)) return null;
  if (!Number.isSafeInteger(Number(cost)) || !Number.isSafeInteger(Number(margin))) {
    return null;
  }

  try {
    return deriveSellerMinUnitPrice(
      { costBasisMicroUsdc: BigInt(cost), minMarginPct: Number(margin) },
      { deliveryWindowHours: Number(window), slaTier: sla },
    );
  } catch {
    return null;
  }
}
