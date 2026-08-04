/**
 * Flat geometric shapes used as list bullets.
 *
 * Decoration, deliberately: these carry no status and no data. They use the
 * lime accent and the ink tokens only, never a status colour, so that nothing
 * on this page can be mistaken for the meaning system the dashboard uses.
 *
 * `currentColor` on the outline lets a shape sit on a light or a dark band
 * without a second variant.
 */

export type BulletShape = "circle" | "triangle" | "square" | "arc" | "cross";

export function GeometricBullet(props: { shape: BulletShape }) {
  return (
    <svg className="icon" viewBox="0 0 34 34" aria-hidden="true">
      {props.shape === "circle" ? (
        <>
          <circle cx="17" cy="17" r="14" fill="var(--accent-lime)" />
          <circle cx="17" cy="17" r="6" fill="currentColor" />
        </>
      ) : null}

      {props.shape === "triangle" ? (
        <>
          <path d="M17 3 L32 30 L2 30 Z" fill="var(--accent-lime)" />
          <path d="M17 14 L23 26 L11 26 Z" fill="currentColor" />
        </>
      ) : null}

      {props.shape === "square" ? (
        <>
          <rect x="3" y="3" width="28" height="28" rx="8" fill="var(--accent-lime)" />
          <rect x="12" y="12" width="10" height="10" rx="3" fill="currentColor" />
        </>
      ) : null}

      {props.shape === "arc" ? (
        <>
          {/* A dome sitting on a baseline, both inside the viewBox. The earlier
              version put its dot at cy=27 r=4, which overran the bottom edge and
              rendered clipped. */}
          <path d="M4 25 A 13 13 0 0 1 30 25 Z" fill="var(--accent-lime)" />
          <rect x="4" y="27" width="26" height="4" rx="2" fill="currentColor" />
        </>
      ) : null}

      {props.shape === "cross" ? (
        <>
          <circle cx="17" cy="17" r="14" fill="var(--accent-lime)" />
          <path
            d="M10 10 L24 24 M24 10 L10 24"
            stroke="currentColor"
            strokeWidth="3.4"
            strokeLinecap="round"
            fill="none"
          />
        </>
      ) : null}
    </svg>
  );
}
