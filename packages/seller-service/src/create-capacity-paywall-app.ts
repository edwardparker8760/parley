/**
 * The seller's 402-protected endpoint: the thing the buyer actually pays.
 *
 * ## Why this service has to exist
 *
 * Circle's `GatewayClient.pay(url)` pays an HTTP resource that answers 402. It
 * is not a "send money to this address" call. Until this file existed, Parley's
 * two agents negotiated inside one process and there was nothing to pay, which
 * is why phase 06 shipped on a stub. This is the missing counterparty.
 *
 * ## The price comes from the SELLER's copy of the deal
 *
 * The buyer names a deal id. This service looks that deal up in the ledger and
 * prices the route from the row it finds, never from anything in the request.
 * A buyer that asks to pay less than it agreed gets a 402 for the full agreed
 * amount, because the number in the 402 is the seller's number.
 *
 * The terms hash is checked the same way: the buyer must present the hash the
 * seller already has, so a payment cannot be detached from the negotiation that
 * produced it. That is requirement 1 of phase 06 enforced at the point of
 * payment rather than merely recorded afterwards.
 *
 * ## What the buyer gets for the money
 *
 * A capacity grant: the quantity, terms and window that were agreed. It is a
 * demo good, and it is deliberately the same shape as the deal so that a judge
 * can compare the transcript, the grant and the on-chain settlement and see
 * three views of one agreement.
 */

import express from "express";
import type { Express, Request, Response } from "express";
import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";
import {
  ARC_TESTNET_CAIP2,
  CIRCLE_X402_FACILITATOR_URL,
} from "@parley/shared";
import { DealRepository, openLedger } from "@parley/ledger";
import type { Database } from "@parley/ledger";
import { microUsdcToPriceString } from "@parley/settlement";

export interface CapacityPaywallOptions {
  /** Address that receives payment. Must match the buyer's expectation. */
  readonly sellerAddress: string;
  /** Path to the SQLite ledger the negotiation wrote its deal into. */
  readonly ledgerPath: string;
  readonly facilitatorUrl?: string;
  readonly network?: string;
  /** Called after a payment settles, with the SDK's transaction reference. */
  readonly onSettled?: (dealId: string, transaction: string | undefined) => void;
}

export interface CapacityPaywall {
  readonly app: Express;
  readonly db: Database;
}

export function createCapacityPaywallApp(
  options: CapacityPaywallOptions,
): CapacityPaywall {
  const db = openLedger({ location: options.ledgerPath });
  const deals = new DealRepository(db);

  const gateway = createGatewayMiddleware({
    sellerAddress: options.sellerAddress,
    networks: options.network ?? ARC_TESTNET_CAIP2,
    // REQUIRED. The SDK's default facilitator is MAINNET, and a mainnet
    // facilitator on a testnet key fails in a confusing way rather than an
    // obvious one. Verified in docs/x402-sdk-verified-surface.md.
    facilitatorUrl: options.facilitatorUrl ?? CIRCLE_X402_FACILITATOR_URL,
    description: "Parley bulk inference capacity",
  });

  if (options.onSettled !== undefined) {
    const notify = options.onSettled;
    // The SDK's hook carries the facilitator's settle response, not the HTTP
    // request, so the deal id comes from `lastDealId` below.
    gateway.onAfterSettle(async (context) => {
      notify(lastDealId ?? "unknown", context.result.transaction);
    });
  }

  // The deal currently being paid for. Single-flight by construction: this
  // service settles one demo negotiation at a time, and the hook the SDK gives
  // us does not carry the request. A production seller would key this per
  // request; a hackathon seller with one buyer does not need to.
  let lastDealId: string | undefined;

  const app = express();
  app.use(express.json());

  /** Unpriced. Lets the buyer confirm the seller agrees on the amount first. */
  app.get("/deals/:dealId/quote", (request: Request, response: Response) => {
    const deal = deals.findById(String(request.params["dealId"] ?? ""));
    if (deal === undefined) {
      response.status(404).json({ error: "unknown deal" });
      return;
    }
    response.json({
      dealId: deal.id,
      amountMicroUsdc: deal.amountMicroUsdc.toString(),
      price: microUsdcToPriceString(deal.amountMicroUsdc),
      termsHash: deal.termsHash,
      quantity: deal.quantity,
      terms: {
        deliveryWindowHours: deal.deliveryWindowHours,
        slaTier: deal.slaTier,
      },
    });
  });

  /**
   * The paid route. Priced per deal, so the middleware is built per request
   * rather than once at startup: every negotiation settles a different amount.
   */
  app.post("/deals/:dealId/capacity", (request: Request, response: Response, next) => {
    const deal = deals.findById(String(request.params["dealId"] ?? ""));
    if (deal === undefined) {
      response.status(404).json({ error: "unknown deal" });
      return;
    }

    const presentedHash = String(
      (request.body as { termsHash?: unknown } | undefined)?.termsHash ?? "",
    );
    if (presentedHash !== deal.termsHash) {
      // Refuse BEFORE quoting a price. A payment that is not bound to the
      // agreed terms is worse than no payment: it looks legitimate later.
      response.status(409).json({
        error: "terms hash does not match the recorded deal",
        expected: deal.termsHash,
      });
      return;
    }

    lastDealId = deal.id;
    const priced = gateway.require(microUsdcToPriceString(deal.amountMicroUsdc));
    priced(request, response, () => {
      response.json({
        grant: "bulk-inference-capacity",
        dealId: deal.id,
        negotiationId: deal.negotiationId,
        quantity: deal.quantity,
        unitPriceMicroUsdc: deal.unitPriceMicroUsdc.toString(),
        amountMicroUsdc: deal.amountMicroUsdc.toString(),
        termsHash: deal.termsHash,
        terms: {
          deliveryWindowHours: deal.deliveryWindowHours,
          slaTier: deal.slaTier,
        },
      });
    });
    void next;
  });

  return { app, db };
}
