/**
 * The small hand-drawn circle that sits above each section title.
 *
 * Two overlapping ellipse strokes rather than one, because a single clean
 * ellipse reads as a border and the whole point is that it should look drawn.
 * The wobble comes from cubic segments whose control points are deliberately
 * uneven, and from a small rotation on the second pass.
 *
 * `seed` picks between a few pre-drawn wobbles so that consecutive sections do
 * not look stamped from the same die. It is an index, not randomness: this
 * renders during a static export, and a random path would change on every build
 * and make the diff noisy for no benefit.
 */

const WOBBLES: readonly { first: string; second: string; rotate: number }[] = [
  {
    first: "M 6 22 C 10 6, 62 2, 108 5 C 150 8, 176 14, 172 25 C 168 36, 120 42, 74 40 C 30 38, 3 34, 6 22 Z",
    second: "M 9 24 C 14 10, 66 5, 106 8",
    rotate: -0.8,
  },
  {
    first: "M 4 20 C 12 4, 70 3, 112 7 C 156 11, 174 18, 168 28 C 162 38, 108 43, 66 40 C 24 37, -2 32, 4 20 Z",
    second: "M 160 30 C 140 39, 82 43, 44 39",
    rotate: 1.1,
  },
  {
    first: "M 8 21 C 14 7, 58 1, 104 4 C 148 7, 178 16, 170 27 C 162 38, 112 44, 68 41 C 26 38, 2 33, 8 21 Z",
    second: "M 12 26 C 20 12, 74 6, 118 10",
    rotate: -1.4,
  },
];

export function CircledLabel(props: { children: string; seed?: number }) {
  const wobble = WOBBLES[(props.seed ?? 0) % WOBBLES.length]!;

  return (
    <span className="circled">
      <svg viewBox="0 0 178 46" preserveAspectRatio="none" aria-hidden="true">
        <path d={wobble.first} />
        <path
          d={wobble.second}
          style={{ transform: `rotate(${wobble.rotate}deg)`, transformOrigin: "center" }}
        />
      </svg>
      {props.children}
    </span>
  );
}
