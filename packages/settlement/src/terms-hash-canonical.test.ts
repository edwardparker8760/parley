/**
 * The terms hash binds a payment to exactly the terms that were agreed.
 *
 * What these tests actually defend: a hash that changed with key insertion
 * order, or with how a bigint happened to be rendered, would make the binding
 * unverifiable after the fact, which is the same as having no binding at all.
 * The stability claim is therefore tested, not assumed.
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import type { Offer } from "@parley/shared";
import { canonicalOfferJson, computeTermsHash } from "./deal-terms-hash.js";

const OFFER: Offer = {
  unitPriceMicroUsdc: 1150n,
  quantity: 10_000,
  terms: { deliveryWindowHours: 24, slaTier: "standard" },
};

test("HASH: key insertion order does not change the hash", () => {
  // Same values, built in a different order. A naive JSON.stringify over the
  // literal would serialise these differently.
  const reordered = {
    terms: { slaTier: OFFER.terms.slaTier, deliveryWindowHours: 24 },
    quantity: OFFER.quantity,
    unitPriceMicroUsdc: OFFER.unitPriceMicroUsdc,
  } as Offer;

  assert.equal(
    computeTermsHash("A-negotiation", reordered),
    computeTermsHash("A-negotiation", OFFER),
  );
});

test("HASH: is stable across runs, so it can be recomputed from the ledger", () => {
  const canonical = canonicalOfferJson("A-negotiation", OFFER);
  assert.equal(
    canonical,
    '{"dealId":"A-negotiation","quantity":10000,' +
      '"terms":{"deliveryWindowHours":24,"slaTier":"standard"},' +
      '"unitPriceMicroUsdc":"1150"}',
  );
  assert.match(computeTermsHash("A-negotiation", OFFER), /^0x[0-9a-f]{64}$/);
});

test("HASH: any change to price, quantity, terms, or id changes the hash", () => {
  const base = computeTermsHash("A-negotiation", OFFER);
  const variants: Offer[] = [
    { ...OFFER, unitPriceMicroUsdc: 1151n },
    { ...OFFER, quantity: 10_001 },
    { ...OFFER, terms: { ...OFFER.terms, deliveryWindowHours: 25 } },
    { ...OFFER, terms: { ...OFFER.terms, slaTier: "premium" } },
  ];

  for (const variant of variants) {
    assert.notEqual(computeTermsHash("A-negotiation", variant), base);
  }
  assert.notEqual(computeTermsHash("B-negotiation", OFFER), base);
});

test("HASH: bigint prices are decimal strings, never numbers", () => {
  // 2^53 + 1 survives exactly. As a JS number it would not.
  const huge: Offer = { ...OFFER, unitPriceMicroUsdc: 9_007_199_254_740_993n };
  assert.ok(
    canonicalOfferJson("A-negotiation", huge).includes(
      '"unitPriceMicroUsdc":"9007199254740993"',
    ),
  );
});
