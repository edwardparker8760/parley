/**
 * Money helpers. All money in Parley is an integer count of micro-USDC held
 * in a bigint. There is no floating point anywhere in a money path.
 *
 * Rationale: negotiation compares, splits the difference between, and
 * accumulates prices thousands of times per run. Float drift in that loop
 * would show up as an agent proposing a price a hair outside its own
 * guardrail band, which would falsify the entire safety claim in phase 03.
 */

import { USDC_DECIMALS } from "./arc-network-constants.js";

/** One whole USDC expressed in micro-USDC. */
export const ONE_USDC_MICRO = 1_000_000n;

/** Branded alias documenting that a bigint is a micro-USDC amount. */
export type MicroUsdc = bigint;

/** Parse a decimal USDC string such as "0.0012" into micro-USDC. */
export function parseUsdcToMicro(usdc: string): MicroUsdc {
  const trimmed = usdc.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Not a decimal USDC amount: "${usdc}"`);
  }
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [wholePart = "0", fractionPart = ""] = unsigned.split(".");
  if (fractionPart.length > USDC_DECIMALS) {
    throw new Error(
      `USDC amount "${usdc}" has more than ${USDC_DECIMALS} decimal places; ` +
        `micro-USDC cannot represent it without rounding.`,
    );
  }
  const paddedFraction = fractionPart.padEnd(USDC_DECIMALS, "0");
  const magnitude = BigInt(wholePart) * ONE_USDC_MICRO + BigInt(paddedFraction);
  return negative ? -magnitude : magnitude;
}

/** Format micro-USDC as a decimal USDC string, for display only. */
export function formatMicroAsUsdc(micro: MicroUsdc): string {
  const negative = micro < 0n;
  const magnitude = negative ? -micro : micro;
  const whole = magnitude / ONE_USDC_MICRO;
  const fraction = magnitude % ONE_USDC_MICRO;
  const fractionText = fraction
    .toString()
    .padStart(USDC_DECIMALS, "0")
    .replace(/0+$/, "");
  const body = fractionText.length > 0 ? `${whole}.${fractionText}` : `${whole}`;
  return negative ? `-${body}` : body;
}

/**
 * Multiply a unit price by a whole quantity.
 * Quantity is a plain integer count of inference calls, not money.
 */
export function multiplyByQuantity(
  unitPrice: MicroUsdc,
  quantity: number,
): MicroUsdc {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new Error(`Quantity must be a non-negative safe integer: ${quantity}`);
  }
  return unitPrice * BigInt(quantity);
}

/**
 * Midpoint of two amounts, rounded DOWN (toward negative infinity for the
 * usual non-negative case). Deterministic, so both sides of a negotiation
 * compute the same split-the-difference value.
 */
export function midpoint(a: MicroUsdc, b: MicroUsdc): MicroUsdc {
  const sum = a + b;
  const half = sum / 2n;
  // BigInt division truncates toward zero; correct that for negative sums so
  // the result is always the floor.
  return sum < 0n && sum % 2n !== 0n ? half - 1n : half;
}

/** Clamp an amount into an inclusive [low, high] band. Throws if inverted. */
export function clampToBand(
  value: MicroUsdc,
  low: MicroUsdc,
  high: MicroUsdc,
): MicroUsdc {
  if (low > high) {
    throw new Error(
      `Inverted band: low ${low} is above high ${high}. ` +
        `An empty band means no feasible offer exists and must be handled ` +
        `by the caller as a walk-away, not silently clamped.`,
    );
  }
  if (value < low) return low;
  if (value > high) return high;
  return value;
}

/** Apply a percentage in basis points (10000 bp = 100%). Rounds down. */
export function applyBasisPoints(
  amount: MicroUsdc,
  basisPoints: number,
): MicroUsdc {
  if (!Number.isSafeInteger(basisPoints)) {
    throw new Error(`Basis points must be an integer: ${basisPoints}`);
  }
  return (amount * BigInt(basisPoints)) / 10_000n;
}

export function minMicro(a: MicroUsdc, b: MicroUsdc): MicroUsdc {
  return a < b ? a : b;
}

export function maxMicro(a: MicroUsdc, b: MicroUsdc): MicroUsdc {
  return a > b ? a : b;
}
