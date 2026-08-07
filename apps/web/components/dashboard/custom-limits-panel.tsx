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

      {/* Which agent runs. It belongs here rather than only in the top bar,
          because on a band you chose yourself it decides whether you can see a
          clamp at all: the engine never reaches its own limit, so it is clamped
          zero times however tight you make the band. */}
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

      {/* The invitation. The claim is only worth anything if it survives
          somebody actively trying to break it, so say so and tell them how. */}
      <aside className="attack-invite">
        <h3>Try to break it</h3>
        <p>
          Nothing an agent says can move its owner&apos;s limit, because the
          limit is arithmetic applied after the agent has decided. That is a
          claim, so test it:
        </p>
        {/*
          Every example below was run against this route before being written
          here. The second one originally promised clamps from any narrow band,
          which was wrong: the engine is clamped zero times however tight the
          band gets, because it stops short of its own limit by design. Naming
          the wrong agent would have sent people looking for a clamp that
          correctly never comes, and concluding the panel was broken.
        */}
        <ul>
          <li>
            <strong>Put the buyer&apos;s ceiling below the seller&apos;s
            floor.</strong> Try 600 against the default floor of 700. No price
            satisfies both owners, so watch both agents establish that and walk
            away rather than force a deal. Two post-mortems, no agreed price,
            nothing paid.
          </li>
          <li>
            <strong>Leave a sliver, and switch to the baseline agent.</strong>{" "}
            Set the ceiling to 720 against a floor of 700 and run it with{" "}
            <em>baseline</em>. It walks straight at its owner&apos;s limit and
            the ceiling stops it nine times, then it settles inside the band
            anyway. Run the same numbers with <em>engine</em> and the clamp
            never fires, because that agent stops short on its own.
          </li>
          <li>
            <strong>Raise the margin until the floor climbs past the
            ceiling.</strong> The floor updates as you type, so you can watch
            the exact percentage where a deal stops being possible. Then run it
            and confirm the agents agree with the arithmetic.
          </li>
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
