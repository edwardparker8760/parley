"use client";

/**
 * SET YOUR OWN LIMITS.
 *
 * The product's central claim is that an owner's limit is arithmetic and that
 * nothing an agent says can move it. Until now a visitor could only take that
 * on trust, because the only limits available were three sets baked into the
 * repository. This panel hands them the dial.
 *
 * ## The floor is shown before anything runs
 *
 * The seller's floor is not typed in, it is derived: cost basis, margin, and
 * the terms on the table. Showing it update as you type is the difference
 * between claiming the arithmetic is real and demonstrating it. It also makes
 * the interesting attack obvious without instructions: once you can see the
 * floor, setting a ceiling underneath it is the natural next thing to try.
 *
 * `previewFloor` calls the same `deriveSellerMinUnitPrice` the engine calls,
 * so the number here is the number that will be enforced.
 */

import { useMemo, useState } from "react";
import {
  DEFAULT_CUSTOM_LIMITS,
  SLA_TIERS,
  previewFloor,
  validateCustomLimits,
} from "@/lib/custom-limits";
import type { CustomLimitsInput } from "@/lib/custom-limits";

/**
 * The three challenges, as numbers rather than as instructions.
 *
 * EVERY ONE OF THESE WAS RUN against the deployed API before its label was
 * written, and the label states only what the run actually returned. An
 * earlier version of this panel described the second one as showing the clamp
 * fire without naming the agent, which was false: the engine is clamped zero
 * times however narrow the band. Reading about a test is not running it, and a
 * label that promises the wrong outcome is worse than no label, because the
 * visitor concludes the product is broken rather than that the copy was.
 *
 * Verified 2026-08-07 against the live deployment:
 *
 *   1. ceiling 600, floor 700, engine   -> WALKED_AWAY, 2 post-mortems, 0 clamps
 *   2. ceiling 720, floor 700, baseline -> SETTLED, 9 buyer clamps
 *   3. margin 150 -> floor 1250 vs ceiling 1200, engine -> WALKED_AWAY, 2 post-mortems
 */
interface Preset {
  readonly id: string;
  readonly label: string;
  readonly explanation: string;
  readonly strategy: "engine" | "baseline";
  readonly limits: CustomLimitsInput;
}

const PRESETS: readonly Preset[] = [
  {
    id: "no-overlap",
    label: "Ceiling below floor: 600 against 700",
    explanation:
      "No price satisfies both owners. Both agents establish that and walk away rather than force a deal: two post-mortems, nothing agreed, nothing paid.",
    strategy: "engine",
    limits: { ...DEFAULT_CUSTOM_LIMITS, buyerMaxUnitPrice: "600" },
  },
  {
    id: "sliver-baseline",
    label: "A sliver, with the baseline agent: 720 against 700",
    explanation:
      "A 20-wide window. The blunt agent settles inside it, but only because the buyer's ceiling stopped it nine times on the way. Run the same numbers with the engine and it is clamped zero times, because it stops short on its own.",
    strategy: "baseline",
    limits: { ...DEFAULT_CUSTOM_LIMITS, buyerMaxUnitPrice: "720" },
  },
  {
    id: "margin-past-ceiling",
    label: "Raise the margin until no deal is possible",
    explanation:
      "Margin 150% on a cost of 500 puts the floor at 1250, above the buyer's ceiling of 1200. The floor is derived, so raising the margin is enough to make agreement impossible, and the agents agree with the arithmetic.",
    strategy: "engine",
    limits: {
      ...DEFAULT_CUSTOM_LIMITS,
      buyerMaxUnitPrice: "1200",
      sellerMinMarginPct: "150",
    },
  },
];

export function CustomLimitsPanel(props: {
  running: boolean;
  onRun: (limits: CustomLimitsInput, strategy: "engine" | "baseline") => void;
  problems: readonly string[];
}) {
  const [limits, setLimits] = useState<CustomLimitsInput>(DEFAULT_CUSTOM_LIMITS);
  const [touched, setTouched] = useState(false);
  const [strategy, setStrategy] = useState<"engine" | "baseline">("engine");

  const floor = useMemo(() => previewFloor(limits), [limits]);
  const validation = useMemo(() => validateCustomLimits(limits), [limits]);

  // Problems are shown once the visitor has changed something. Opening the
  // panel to a wall of red would be scolding them for nothing.
  const localProblems = touched && !validation.ok ? validation.problems : [];
  const shown = [...props.problems, ...localProblems];

  const ceiling = Number(limits.buyerMaxUnitPrice.trim());
  const overlaps =
    floor !== null && Number.isSafeInteger(ceiling) && BigInt(ceiling) >= floor;

  const set = (key: keyof CustomLimitsInput) => (value: string) => {
    setTouched(true);
    setLimits((current) => ({ ...current, [key]: value }));
  };

  return (
    <section id="your-limits" className="custom-limits" aria-label="Set your own limits">
      <div className="custom-limits-head">
        <h2>Set your own limits</h2>
        <p>
          These are the numbers the two owners set before their agents start.
          Change them and run it. Prices are per call, in millionths of a
          dollar, the same units as everywhere else on this screen.
        </p>
      </div>

      <div className="custom-limits-grid">
        <fieldset className="custom-side buyer">
          <legend>Buyer&apos;s owner</legend>
          <Field
            label="Most it will pay per call"
            value={limits.buyerMaxUnitPrice}
            onChange={set("buyerMaxUnitPrice")}
          />
          <Field
            label="Total budget, whole USDC"
            value={limits.buyerMaxTotalSpendUsdc}
            onChange={set("buyerMaxTotalSpendUsdc")}
          />
          <Field
            label="Calls wanted"
            value={limits.buyerTargetQuantity}
            onChange={set("buyerTargetQuantity")}
          />
          <label className="custom-field">
            <span>Service level, at least</span>
            <select
              value={limits.buyerMinSlaTier}
              onChange={(event) => set("buyerMinSlaTier")(event.target.value)}
              disabled={props.running}
            >
              {SLA_TIERS.map((tier) => (
                <option key={tier} value={tier}>
                  {tier}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Delivered within, hours"
            value={limits.buyerMaxDeliveryWindowHours}
            onChange={set("buyerMaxDeliveryWindowHours")}
          />
        </fieldset>

        <fieldset className="custom-side seller">
          <legend>Seller&apos;s owner</legend>
          <Field
            label="Cost per call"
            value={limits.sellerCostBasis}
            onChange={set("sellerCostBasis")}
          />
          <Field
            label="Minimum margin, percent"
            value={limits.sellerMinMarginPct}
            onChange={set("sellerMinMarginPct")}
          />
          <Field
            label="Calls it can supply"
            value={limits.sellerAvailableQuantity}
            onChange={set("sellerAvailableQuantity")}
          />
          <Field
            label="Cannot deliver faster than, hours"
            value={limits.sellerMinDeliveryWindowHours}
            onChange={set("sellerMinDeliveryWindowHours")}
          />

          {/* The arithmetic, visible before anything runs. */}
          <p className="derived-floor">
            <span className="derived-floor-label">
              So the seller cannot go below
            </span>
            <strong>{floor === null ? "not yet" : floor.toString()}</strong>
            <span className="derived-floor-note">
              {floor === null
                ? "fill in cost, margin and the delivery window"
                : "per call. Derived, not typed: cost plus margin, adjusted for the terms."}
            </span>
          </p>
        </fieldset>
      </div>

      {/* Whether these two numbers leave any room, said before running. */}
      {floor !== null && Number.isSafeInteger(ceiling) ? (
        <p className={overlaps ? "custom-verdict possible" : "custom-verdict impossible"}>
          {overlaps
            ? `The buyer will pay up to ${ceiling}, the seller needs at least ${floor}. There is room, so a deal is possible.`
            : `The buyer will pay up to ${ceiling}, the seller needs at least ${floor}. There is no room. Run it and watch both agents establish that and walk away.`}
        </p>
      ) : null}

      {shown.length > 0 ? (
        <ul className="custom-problems" aria-live="polite">
          {shown.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}

      {/*
        Which agent runs, and why it is not a developer option.

        The landing page claims "A better agent needs the limit less". This
        toggle is where that claim is produced rather than asserted: same
        limits, two agents, and the clamp count is the difference. Presented as
        a developer switch it reads as debug UI; presented as the experiment it
        is, it is the most convincing thing on the page.
      */}
      <div className="strategy-proof">
        <h3>Which agent runs, and why it matters</h3>
        <p>
          The landing page claims <strong>a better agent needs the limit
          less</strong>. This is where you check it. Run the same limits twice,
          once with each agent, and compare the clamp counts in the owner limits
          panel above.
        </p>
        <p>
          On a narrow band the blunt <em>baseline</em> agent settles, but only
          because its owner&apos;s ceiling stopped it nine times on the way. The{" "}
          <em>engine</em>, on identical limits, stops short on its own and is
          clamped zero times. Neither one ever crosses its limit. That is the
          whole claim, and it is the same limits both times.
        </p>
      </div>

      <div className="custom-strategy">
        <span className="custom-strategy-label">Run it with</span>
        {(["engine", "baseline"] as const).map((option) => (
          <button
            key={option}
            type="button"
            disabled={props.running}
            className={strategy === option ? "strategy on" : "strategy"}
            onClick={() => setStrategy(option)}
          >
            {option}
          </button>
        ))}
        <span className="strategy-note">
          {strategy === "engine"
            ? "concedes on a schedule and stops short of its own limit, so it is never clamped"
            : "blunt agent: walks into its owner's limit and gets stopped, which is how you see the clamp fire"}
        </span>
      </div>

      <button
        type="button"
        className="custom-run"
        disabled={props.running || !validation.ok}
        onClick={() => props.onRun(limits, strategy)}
      >
        {props.running ? "Negotiating..." : "Run with these limits"}
      </button>

      {/* The pointer down to the challenges. Someone who never scrolls past
          the run button would otherwise never learn they exist. */}
      <p className="challenge-pointer">
        Or skip the form: <a href="#try-to-break-it">three one-click tests</a>{" "}
        below try to break the guardrails on purpose.
      </p>

      {/* The invitation. The claim is only worth anything if it survives
          somebody actively trying to break it, so say so and tell them how. */}
      <aside id="try-to-break-it" className="attack-invite">
        <h3>Try to break it</h3>
        <p>
          Nothing an agent says can move its owner&apos;s limit, because the
          limit is arithmetic applied after the agent has decided. That is a
          claim, so test it:
        </p>
        {/* Each one fills the form, picks the agent and runs, because a judge
            who clicks is convinced in a way a judge who reads is not. */}
        <ul className="preset-list">
          {PRESETS.map((preset) => (
            <li key={preset.id}>
              <button
                type="button"
                className="preset-run"
                disabled={props.running}
                onClick={() => {
                  // Fill the form too, not just run it: the visitor must be
                  // able to see the numbers that produced what they are about
                  // to watch, and change one to keep going.
                  setTouched(true);
                  setLimits(preset.limits);
                  setStrategy(preset.strategy);
                  props.onRun(preset.limits, preset.strategy);
                }}
              >
                {preset.label}
              </button>
              <span className="preset-explanation">{preset.explanation}</span>
            </li>
          ))}
        </ul>
        <p className="attack-invite-close">
          The agents never see each other&apos;s limits, so neither can aim at
          the other&apos;s. If you find a set of numbers where a limit is
          crossed, that is a real bug and worth reporting.
        </p>
      </aside>
    </section>
  );
}

/** One numeric text field. Text, not `number`: see the note on validation. */
function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="custom-field">
      <span>{props.label}</span>
      {/*
        `inputMode="numeric"` rather than `type="number"`. A number input hands
        back "" for anything it considers invalid, which would swallow the
        typo instead of explaining it, and the explanation is the feature.
      */}
      <input
        type="text"
        inputMode="numeric"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}
