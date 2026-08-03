/**
 * Phase 02 test suite. Uses the built-in `node:test` runner, so the project
 * takes on no test-framework dependency at all.
 *
 * The load-bearing tests here are the termination guarantee and the replay
 * fidelity check. Everything else in the project assumes a negotiation always
 * ends and that the transcript is a faithful record.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { InProcessMessageBus, parseEnvelope } from "@parley/protocol";
import type { Envelope } from "@parley/protocol";
import {
  ClampEventRepository,
  MessageRepository,
  NegotiationRepository,
  openLedger,
  renderLadder,
  replayNegotiation,
} from "@parley/ledger";
import type { Agent, DecisionInput, DecisionOutput } from "@parley/agents";
import { deriveSellerMinUnitPrice } from "@parley/guardrails";

import { runNegotiation } from "./negotiation-turn-loop.js";
import {
  createDeterministicClock,
  runScenario,
} from "./run-negotiation-scenario.js";
import { SCENARIOS } from "./scenario-definitions.js";

const VALID_OFFER = {
  negotiationId: "n1",
  round: 1,
  seq: 0,
  from: "BUYER",
  type: "OFFER",
  offer: {
    unitPriceMicroUsdc: "900",
    quantity: 10_000,
    terms: { deliveryWindowHours: 24, slaTier: "standard" },
  },
  rationale: "Opening.",
  createdAt: "2026-08-03T00:00:00.000Z",
};

test("envelope schema rejects malformed messages", () => {
  // Valid baseline parses, and the price becomes a bigint exactly once.
  const parsed = parseEnvelope(VALID_OFFER);
  assert.equal(parsed.type, "OFFER");
  if (parsed.type === "OFFER") {
    assert.equal(parsed.offer.unitPriceMicroUsdc, 900n);
  }

  // An OFFER without an offer body.
  assert.throws(() => parseEnvelope({ ...VALID_OFFER, offer: undefined }));

  // A WALK_AWAY without a reason code.
  assert.throws(() =>
    parseEnvelope({ ...VALID_OFFER, type: "WALK_AWAY", offer: undefined }),
  );

  // An unknown reason code.
  assert.throws(() =>
    parseEnvelope({
      ...VALID_OFFER,
      type: "WALK_AWAY",
      offer: undefined,
      reasonCode: "BECAUSE_I_SAID_SO",
    }),
  );

  // A non-integer price string. Floats in a money path are the bug class this
  // whole codebase is built to prevent.
  assert.throws(() =>
    parseEnvelope({
      ...VALID_OFFER,
      offer: { ...VALID_OFFER.offer, unitPriceMicroUsdc: "900.5" },
    }),
  );

  // Rationale beyond the cap.
  assert.throws(() =>
    parseEnvelope({ ...VALID_OFFER, rationale: "x".repeat(241) }),
  );

  // Control characters are stripped rather than rejected, so a hostile
  // rationale cannot forge a log line.
  const sanitised = parseEnvelope({
    ...VALID_OFFER,
    rationale: "line1\nline2\tend",
  });
  assert.equal(sanitised.rationale, "line1 line2 end");
});

test("turn loop alternates parties", async () => {
  const result = await runScenario({ scenario: "A" });
  const parties = result.transcript.map((envelope) => envelope.from);

  // The synthesised cap walk-away can repeat the party on turn, so compare
  // only the negotiating exchange before any terminal message.
  const upToTerminal = result.transcript.filter(
    (envelope) => envelope.type === "OFFER" || envelope.type === "COUNTEROFFER",
  );
  for (let index = 1; index < upToTerminal.length; index += 1) {
    assert.notEqual(
      upToTerminal[index]?.from,
      upToTerminal[index - 1]?.from,
      `two consecutive messages from the same party at index ${index}`,
    );
  }
  assert.equal(parties[0], "BUYER", "buyer opens");
});

test("round cap always terminates, even against a hostile agent", async () => {
  // An agent that never accepts and never walks away. If the cap lived inside
  // the agents rather than in the loop, this would run forever.
  const hostile = (party: "BUYER" | "SELLER"): Agent => ({
    party,
    async decide(input: DecisionInput): Promise<DecisionOutput> {
      const outbound: Envelope = {
        negotiationId: input.negotiationId,
        round: input.round,
        seq: input.seq,
        from: party,
        type: input.history.length === 0 ? "OFFER" : "COUNTEROFFER",
        offer: {
          unitPriceMicroUsdc: party === "BUYER" ? 1n : 999_999n,
          quantity: 1,
          terms: { deliveryWindowHours: 24, slaTier: "basic" },
        },
        rationale: "Never conceding.",
        createdAt: input.now().toISOString(),
      };
      return { outbound, clampEvents: [], decisionState: { hostile: true } };
    },
  });

  const db = openLedger({ location: ":memory:" });
  const roundCap = 6;
  // Guardrails wide enough that the egress guard permits the hostile prices;
  // this test is about TERMINATION, not about the clamp. The clamp gets its
  // own adversarial suite in packages/guardrails.
  const result = await runNegotiation({
    negotiationId: "hostile",
    scenario: "HOSTILE",
    roundCap,
    buyer: hostile("BUYER"),
    seller: hostile("SELLER"),
    bus: new InProcessMessageBus(),
    negotiations: new NegotiationRepository(db),
    messages: new MessageRepository(db),
    clampEvents: new ClampEventRepository(db),
    guardrails: {
      BUYER: {
        party: "BUYER",
        maxUnitPriceMicroUsdc: 10_000_000n,
        maxTotalSpendMicroUsdc: 10_000_000_000n,
        minQuantity: 1,
        targetQuantity: 1,
        minSlaTier: "basic",
        maxDeliveryWindowHours: 168,
        maxRounds: roundCap,
      },
      SELLER: {
        party: "SELLER",
        costBasisMicroUsdc: 0n,
        minMarginPct: 0,
        minQuantity: 1,
        availableQuantity: 1_000_000,
        maxSlaTier: "premium",
        minDeliveryWindowHours: 1,
        maxRounds: roundCap,
      },
    },
    now: createDeterministicClock(),
  });

  assert.equal(result.outcome, "WALKED_AWAY");
  assert.equal(result.terminalMessage.type, "WALK_AWAY");
  if (result.terminalMessage.type === "WALK_AWAY") {
    assert.equal(result.terminalMessage.reasonCode, "ROUND_CAP_REACHED");
  }
  // Two messages per round, plus the loop's synthesised walk-away.
  assert.equal(result.transcript.length, roundCap * 2 + 1);
  assert.ok(
    result.transcript.every((envelope) => envelope.round <= roundCap),
    "no message may carry a round beyond the cap",
  );
});

test("seq is strictly increasing and unique across all scenarios", async () => {
  for (const scenario of ["A", "B", "C"] as const) {
    const result = await runScenario({ scenario });
    const seqs = result.transcript.map((envelope) => envelope.seq);

    for (let index = 1; index < seqs.length; index += 1) {
      assert.ok(
        (seqs[index] as number) > (seqs[index - 1] as number),
        `scenario ${scenario}: seq not increasing at index ${index}`,
      );
    }
    assert.equal(
      new Set(seqs).size,
      seqs.length,
      `scenario ${scenario}: duplicate seq values`,
    );
  }
});

test("replay from SQLite is byte-identical to the live ladder", async () => {
  const directory = mkdtempSync(join(tmpdir(), "parley-replay-"));
  const location = join(directory, "replay-test.db");

  try {
    const live = await runScenario({
      scenario: "A",
      location,
      negotiationId: "replay-check",
    });

    // Reopen the file with a fresh connection: the replay must work from the
    // database alone, with nothing left in memory from the live run.
    live.db.close();
    const coldDb = openLedger({ location });
    const replayed = replayNegotiation(coldDb, "replay-check");

    assert.equal(replayed, live.ladder);
    assert.ok(replayed.includes("OUTCOME:"), "ladder renders an outcome line");

    // Windows will not delete a directory holding an open file handle.
    coldDb.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("scenario outcomes match their stated expectations", async () => {
  const a = await runScenario({ scenario: "A" });
  assert.equal(a.outcome, "SETTLED", "wide ZOPA must settle");

  const b = await runScenario({ scenario: "B" });
  assert.equal(b.outcome, "SETTLED", "narrow ZOPA must still settle");

  // Scenario C is the proof the guardrails bind. It must never settle.
  const c = await runScenario({ scenario: "C" });
  assert.equal(c.outcome, "WALKED_AWAY", "no ZOPA must not settle");

  // And the agreed price must sit inside both sides' limits.
  const settled = a.transcript.find((envelope) => envelope.type === "ACCEPT");
  assert.ok(settled !== undefined, "scenario A produced an ACCEPT");
  const acceptedOffer = a.transcript.find(
    (envelope) =>
      settled.type === "ACCEPT" && envelope.seq === settled.acceptsSeq,
  );
  assert.ok(acceptedOffer !== undefined);
  if (
    acceptedOffer.type === "OFFER" ||
    acceptedOffer.type === "COUNTEROFFER"
  ) {
    const price = acceptedOffer.offer.unitPriceMicroUsdc;
    assert.ok(
      price <= SCENARIOS.A.buyerGuardrails.maxUnitPriceMicroUsdc,
      "settled above the buyer's maximum",
    );
    // The seller's floor is derived, not stored, so derive it the same way
    // the seller does rather than asserting against a hardcoded number.
    assert.ok(
      price >=
        deriveSellerMinUnitPrice(
          SCENARIOS.A.sellerGuardrails,
          SCENARIOS.A.terms,
        ),
      "settled below the seller's derived margin floor",
    );
  }
});

test("renderLadder is stable for the same transcript", async () => {
  const first = await runScenario({ scenario: "B" });
  const second = await runScenario({ scenario: "B" });
  assert.equal(
    first.ladder,
    second.ladder,
    "two runs of the same scenario must produce identical ladders",
  );

  // The ladder interleaves clamp events, so re-rendering needs them too.
  // Omitting them is exactly the bug this assertion should catch.
  const clampEvents = new ClampEventRepository(first.db).listByNegotiation(
    first.negotiationId,
  );
  const rerendered = renderLadder(
    first.transcript,
    {
      negotiationId: first.negotiationId,
      scenario: "B",
      roundCap: SCENARIOS.B.roundCap,
    },
    clampEvents,
  );
  assert.equal(rerendered, first.ladder);
});

test("determinism: same scenario and seed produce byte-identical ladders", async () => {
  // The demo is recorded on camera. If a rerun differs, the video and the
  // repo disagree. The engine adds seeded jitter, so this guards the seeding
  // as much as the logic.
  for (const scenario of ["A", "B", "C"] as const) {
    const runs = [
      await runScenario({ scenario }),
      await runScenario({ scenario }),
      await runScenario({ scenario }),
    ];
    assert.equal(runs[0]?.ladder, runs[1]?.ladder, `${scenario} run 1 vs 2`);
    assert.equal(runs[1]?.ladder, runs[2]?.ladder, `${scenario} run 2 vs 3`);
    for (const run of runs) run?.db.close();
  }
});

test("scenario C never settles, under either strategy", async () => {
  // Non-negotiable: scenario C is the proof the guardrails bind. It is an
  // assertion on every commit, not a manual check.
  for (const strategy of ["engine", "baseline"] as const) {
    const result = await runScenario({ scenario: "C", strategy });
    assert.equal(result.outcome, "WALKED_AWAY", `strategy ${strategy}`);
    assert.equal(
      result.transcript.filter((e) => e.type === "ACCEPT").length,
      0,
      `strategy ${strategy}: scenario C contained an ACCEPT`,
    );
    result.db.close();
  }
});
