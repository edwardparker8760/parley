/**
 * Display formatting only.
 *
 * Money arrives from the server as decimal strings and is NEVER parsed back
 * into arithmetic here: the dashboard shows numbers, it does not compute with
 * them. The one exception is the chart, which needs relative positions, and it
 * converts explicitly at the point of use with a comment saying so.
 */

/** `984` becomes `0.000984`, the per-call price a human reads. */
export function microToUsdc(micro: string): string {
  const value = BigInt(micro);
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0");
  return `${whole}.${fraction}`.replace(/0+$/, "").replace(/\.$/, ".0");
}

/** Compact form for the ladder: `0.000984/call`. */
export function unitPriceLabel(micro: string | null): string {
  return micro === null ? "" : `${microToUsdc(micro)}/call`;
}

export function truncateHash(hash: string, keep = 10): string {
  return hash.length <= keep * 2 ? hash : `${hash.slice(0, keep)}...${hash.slice(-4)}`;
}
