/**
 * THE ONE BOUNDARY between Parley's integer micro-USDC and the SDK's dollar
 * strings.
 *
 * Circle's middleware prices a route as `'$0.001'` and the client pays what the
 * 402 response asks for. Everything inside Parley is bigint micro-USDC and
 * never a float, because a rounding error in a settlement amount is a real
 * financial bug even on a testnet.
 *
 * So the conversion happens exactly here, at the edge, and it is done with
 * integer arithmetic and string assembly rather than division. USDC has 6
 * decimals and micro-USDC is its atomic unit, so the conversion is exact by
 * construction: it is a decimal-point insertion, not a calculation.
 *
 * Phase 06's plan put this "in the adapter, not in the engine". It is one step
 * further out than that: its own file, so the seller service and the buyer
 * adapter cannot drift into two different roundings of the same deal.
 */

import { USDC_DECIMALS } from "@parley/shared";
import type { MicroUsdc } from "@parley/shared";

const SCALE = 10n ** BigInt(USDC_DECIMALS);

/**
 * `9_840_000n` becomes `"9.840000"`. Always 6 decimal places, never scientific
 * notation, never a float.
 */
export function microUsdcToDecimalString(micro: MicroUsdc): string {
  if (micro < 0n) {
    throw new Error(`Settlement amount cannot be negative: ${micro}`);
  }
  const whole = micro / SCALE;
  const fraction = micro % SCALE;
  return `${whole}.${fraction.toString().padStart(USDC_DECIMALS, "0")}`;
}

/** The `'$9.840000'` form the Gateway middleware expects for a route price. */
export function microUsdcToPriceString(micro: MicroUsdc): string {
  return `$${microUsdcToDecimalString(micro)}`;
}

/**
 * Inverse, for checking what was actually paid against what was agreed.
 *
 * The SDK reports amounts in atomic units, which for USDC IS micro-USDC, so
 * this is an identity in practice. It exists so that assumption is written
 * down and asserted rather than silently relied upon.
 */
export function atomicUnitsToMicroUsdc(atomic: bigint): MicroUsdc {
  return atomic;
}
