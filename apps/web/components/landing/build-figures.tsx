/**
 * A plain row of build figures.
 *
 * No count-up animation, deliberately and for the same reason the dashboard has
 * none: a number that animates is a number that is wrong for the first few
 * hundred milliseconds, and every figure here is a claim someone could check.
 * They appear at their final value or not at all.
 *
 * Counted on 2026-08-04 with `git ls-files`, excluding generated output and
 * node_modules. `pnpm test` is the source of the test count, run from a clean
 * clone rather than from a warm working tree, because that is the number a
 * stranger will actually see.
 */

interface Figure {
  readonly value: string;
  readonly label: string;
  readonly note: string;
}

const FIGURES: readonly Figure[] = [
  { value: "12", label: "packages", note: "one app, twelve libraries" },
  { value: "12,427", label: "lines of TypeScript", note: "excluding tests" },
  { value: "3,845", label: "lines of tests", note: "roughly one line in four" },
  { value: "111", label: "tests passing", note: "from a clean clone" },
];

export function BuildFigures() {
  return (
    <dl className="figures">
      {FIGURES.map((figure) => (
        <div key={figure.label} className="figure">
          <dd className="figure-value">{figure.value}</dd>
          <dt className="figure-label">{figure.label}</dt>
          <dd className="figure-note">{figure.note}</dd>
        </div>
      ))}
    </dl>
  );
}
