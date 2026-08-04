/**
 * The one place on this page that renders product data.
 *
 * Per the design rule for this app: because these rows describe real outcomes,
 * they use the REAL status tokens from `@parley/theme`, not approximations. A
 * judge moves from this page to the repo to the video within a few minutes, and
 * a near-miss shade of the settled colour reads as carelessness.
 *
 * Numbers come from `docs/engine-benchmark.md`, which `pnpm benchmark`
 * regenerates. They are transcribed rather than imported because this app is a
 * static export with no access to the workspace at build time; if the benchmark
 * is rerun and moves, this table has to be updated with it.
 */

interface Row {
  readonly scenario: string;
  readonly strategy: "baseline" | "engine";
  readonly outcome: "SETTLED" | "WALKED AWAY";
  readonly round: number;
  readonly settled: string;
  readonly distance: string;
  readonly clamps: number;
}

const ROWS: readonly Row[] = [
  { scenario: "A wide overlap", strategy: "baseline", outcome: "SETTLED", round: 10, settled: "1045", distance: "67", clamps: 0 },
  { scenario: "A wide overlap", strategy: "engine", outcome: "SETTLED", round: 9, settled: "982", distance: "4", clamps: 0 },
  { scenario: "B narrow overlap", strategy: "baseline", outcome: "SETTLED", round: 12, settled: "900", distance: "23", clamps: 9 },
  { scenario: "B narrow overlap", strategy: "engine", outcome: "SETTLED", round: 12, settled: "856", distance: "21", clamps: 0 },
  { scenario: "C no overlap", strategy: "baseline", outcome: "WALKED AWAY", round: 12, settled: "no deal", distance: "n/a", clamps: 18 },
  { scenario: "C no overlap", strategy: "engine", outcome: "WALKED AWAY", round: 9, settled: "no deal", distance: "n/a", clamps: 0 },
];

export function BenchmarkTable() {
  return (
    <>
      <table className="bench">
        <caption className="sr-only">
          Engine versus baseline across the three scenarios
        </caption>
        <thead>
          <tr>
            <th scope="col">Scenario</th>
            <th scope="col">Agent</th>
            <th scope="col">Outcome</th>
            <th scope="col">Round</th>
            <th scope="col">Settled at</th>
            <th scope="col">From fair split</th>
            <th scope="col">Times the limit had to stop it</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr
              key={`${row.scenario}-${row.strategy}`}
              className={row.strategy === "engine" ? "is-engine" : undefined}
            >
              <th scope="row">{row.scenario}</th>
              <td>{row.strategy}</td>
              <td
                className={
                  row.outcome === "SETTLED" ? "verdict-good" : "verdict-stopped"
                }
              >
                {row.outcome}
              </td>
              <td className="num">{row.round}</td>
              <td className="num">{row.settled}</td>
              <td className="num">{row.distance}</td>
              <td className="num">{row.clamps}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="bench-note">
        Both agents reach the correct outcome every time, which is the floor, not
        the achievement. The difference is the last two columns: the engine lands
        four micro-USDC from the fair split instead of sixty-seven, and it is
        stopped by its owner&apos;s limit zero times instead of nine and eighteen.
        It stays inside the limits by choice rather than by being caught.
      </p>
    </>
  );
}
