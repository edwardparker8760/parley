/**
 * Deterministic PRNG.
 *
 * Two requirements pull against each other here and this module is how they
 * are both satisfied:
 *
 *   1. The demo must be reproducible on camera. Same scenario, same seed,
 *      byte-identical ladder. So `Math.random()` is banned everywhere.
 *   2. The concession schedule must not be a closed-form function of the
 *      agent's own reservation price, or a counterparty can invert it and read
 *      the reservation off the wire (see
 *      `time-dependent-concession-schedule.ts`).
 *
 * A seeded PRNG gives jitter that is unpredictable to anyone who does not hold
 * the seed, while staying perfectly reproducible for anyone who does. The seed
 * is private to each agent and never crosses the bus.
 */

/** mulberry32: small, fast, good enough for jitter. Not cryptographic. */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash of a string, so a seed can be derived from an id. */
export function hashStringToSeed(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Per-agent seed. Derived from the negotiation id, the party, and a private
 * salt the counterparty does not have. Without the salt, an attacker who knows
 * the negotiation id cannot reproduce the jitter sequence.
 */
export function deriveAgentSeed(
  negotiationId: string,
  party: string,
  privateSalt: string,
): number {
  return hashStringToSeed(`${negotiationId}:${party}:${privateSalt}`);
}
