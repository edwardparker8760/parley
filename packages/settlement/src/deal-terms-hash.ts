/**
 * Canonical serialisation and hashing of agreed deal terms.
 *
 * The hash binds a payment to exactly the terms that were agreed (spec
 * section 6). It must be stable across processes and runs, so the JSON is
 * emitted with keys in a fixed order rather than whatever order the object
 * happens to carry, and bigints are rendered as decimal strings.
 */

import { createHash } from "node:crypto";
import type { DealId, Offer } from "@parley/shared";

/** Deterministic JSON for an offer. Key order is fixed here, not inferred. */
export function canonicalOfferJson(dealId: DealId, offer: Offer): string {
  return JSON.stringify({
    dealId,
    quantity: offer.quantity,
    terms: {
      deliveryWindowHours: offer.terms.deliveryWindowHours,
      slaTier: offer.terms.slaTier,
    },
    unitPriceMicroUsdc: offer.unitPriceMicroUsdc.toString(),
  });
}

/** sha256 of the canonical JSON, hex encoded, prefixed with 0x. */
export function computeTermsHash(dealId: DealId, offer: Offer): string {
  const canonical = canonicalOfferJson(dealId, offer);
  return `0x${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}
