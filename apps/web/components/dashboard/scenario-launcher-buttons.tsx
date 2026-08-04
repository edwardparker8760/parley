"use client";

/**
 * Scenario buttons, plus the brain switch.
 *
 * ## Why the brain switch earned its place on a deliberately minimal screen
 *
 * The phase 04 engine stays inside its owner's limits BY CHOICE: it concedes
 * along a schedule that never reaches the band edge, so it gets clamped zero
 * times. That is the better agent and the worse demo, because the guardrail
 * panel then reads "overrode the strategy 0 times" and the audience never sees
 * the safety mechanism fire.
 *
 * The phase 02 baseline is a blunt fixed-concession agent that walks straight
 * into its limits and gets stopped, repeatedly and visibly.
 *
 * Running both against the same scenario is the actual argument: the limits
 * bind (baseline gets clamped), and the good agent does not need them to
 * (engine does not). One switch, two claims.
 */

import type { ScenarioName } from "@/hooks/use-negotiation-event-stream";

export type StrategyName = "engine" | "baseline";

const SCENARIOS: readonly { name: ScenarioName; label: string }[] = [
  { name: "A", label: "Wide ZOPA" },
  { name: "B", label: "Narrow ZOPA" },
  { name: "C", label: "No ZOPA" },
];

export function ScenarioLauncherButtons(props: {
  running: boolean;
  active: string | null;
  strategy: StrategyName;
  onStrategyChange: (strategy: StrategyName) => void;
  onRun: (scenario: ScenarioName) => void;
}) {
  return (
    <div className="launcher-bar">
      <div className="launchers">
        {SCENARIOS.map((scenario) => (
          <button
            key={scenario.name}
            type="button"
            disabled={props.running}
            onClick={() => props.onRun(scenario.name)}
            className={props.active === scenario.name ? "launcher active" : "launcher"}
          >
            <span className="launcher-name">Scenario {scenario.name}</span>
            <span className="launcher-label">{scenario.label}</span>
          </button>
        ))}
        {props.running ? <span className="running-dot">negotiating...</span> : null}
      </div>

      <div className="strategy-switch">
        <button
          type="button"
          disabled={props.running}
          className={props.strategy === "engine" ? "strategy on" : "strategy"}
          onClick={() => props.onStrategyChange("engine")}
        >
          engine
        </button>
        <button
          type="button"
          disabled={props.running}
          className={props.strategy === "baseline" ? "strategy on" : "strategy"}
          onClick={() => props.onStrategyChange("baseline")}
        >
          baseline
        </button>
        <span className="strategy-note">
          {props.strategy === "engine"
            ? "concedes on a schedule; never reaches its limit"
            : "blunt agent; walks into its limit and gets stopped"}
        </span>
      </div>
    </div>
  );
}
