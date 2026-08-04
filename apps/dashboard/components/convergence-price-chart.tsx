"use client";

/**
 * THE PICTURE THAT EXPLAINS THE PROJECT.
 *
 * Two price lines walking toward each other, two dashed lines they are not
 * allowed to cross, and a shaded band where a deal is possible. In scenario C
 * the band does not exist and the lines visibly fail to meet, which is the
 * whole safety argument in one image.
 *
 * ## The dashed lines are the sensitive part
 *
 * They are reservation prices: the numbers each side must never learn about the
 * other. They are shown here because the audience is not a participant. They
 * arrive ONLY from `view.observer`, which the orchestrator computes from the
 * phase 04 oracle. Nothing in this file reads a price out of a message, and
 * `reservation-data-source.test.ts` asserts that no component does.
 *
 * Hand-rolled SVG rather than a chart library: six lines of geometry, no
 * dependency, and full control of stroke weight for a 1920x1080 frame.
 */

import type { NegotiationView } from "@parley/orchestrator";
import { microToUsdc } from "./format-micro-usdc";

const WIDTH = 600;
const HEIGHT = 300;
// The right pad is wide because the reservation labels are written OUTSIDE the
// plot area. They carry the actual limit values, so clipping them would cut the
// number the whole panel exists to show.
const PAD = { top: 16, right: 152, bottom: 28, left: 40 };

interface Point {
  readonly round: number;
  readonly price: number;
}

/**
 * Prices become numbers HERE and nowhere else.
 *
 * A chart needs relative positions, so micro-USDC has to leave bigint at some
 * point. Doing it in one function, for pixels only, keeps every displayed and
 * settled figure on the exact integer path.
 */
function seriesFor(view: NegotiationView, party: string): Point[] {
  return view.messages
    .filter((row) => row.party === party && row.unitPriceMicroUsdc !== null)
    .map((row) => ({
      round: row.round,
      price: Number(row.unitPriceMicroUsdc),
    }));
}

export function ConvergencePriceChart(props: { view: NegotiationView }) {
  const { view } = props;
  const buyer = seriesFor(view, "BUYER");
  const seller = seriesFor(view, "SELLER");

  const buyerReservation =
    view.observer.buyerReservationMicroUsdc === null
      ? null
      : Number(view.observer.buyerReservationMicroUsdc);
  const sellerReservation =
    view.observer.sellerReservationMicroUsdc === null
      ? null
      : Number(view.observer.sellerReservationMicroUsdc);

  const prices = [
    ...buyer.map((point) => point.price),
    ...seller.map((point) => point.price),
    ...(buyerReservation === null ? [] : [buyerReservation]),
    ...(sellerReservation === null ? [] : [sellerReservation]),
  ];

  const minPrice = prices.length === 0 ? 0 : Math.min(...prices);
  const maxPrice = prices.length === 0 ? 1 : Math.max(...prices);
  // A flat series would divide by zero; a little headroom also stops the lines
  // touching the frame edge.
  const span = maxPrice - minPrice || 1;
  const lo = minPrice - span * 0.08;
  const hi = maxPrice + span * 0.08;

  const x = (round: number): number =>
    PAD.left +
    ((round - 1) / Math.max(1, view.roundCap - 1)) *
      (WIDTH - PAD.left - PAD.right);
  const y = (price: number): number =>
    PAD.top + (1 - (price - lo) / (hi - lo)) * (HEIGHT - PAD.top - PAD.bottom);

  const path = (points: readonly Point[]): string =>
    points.map((point) => `${x(point.round)},${y(point.price)}`).join(" ");

  const zopaLo =
    view.observer.zopaLoMicroUsdc === null
      ? null
      : Number(view.observer.zopaLoMicroUsdc);
  const zopaHi =
    view.observer.zopaHiMicroUsdc === null
      ? null
      : Number(view.observer.zopaHiMicroUsdc);

  return (
    <section className="panel panel-chart">
      <h2>
        Convergence
        <span className="panel-note">
          dashed lines are each side&apos;s private limit, shown to the audience only
        </span>
      </h2>

      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="chart" role="img">
        <rect x={0} y={0} width={WIDTH} height={HEIGHT} className="chart-bg" />

        {view.observer.zopaExists && zopaLo !== null && zopaHi !== null ? (
          <g>
            <rect
              x={PAD.left}
              y={y(zopaHi)}
              width={WIDTH - PAD.left - PAD.right}
              height={Math.max(1, y(zopaLo) - y(zopaHi))}
              className="zopa-band"
            />
            <text x={PAD.left + 8} y={y(zopaHi) + 14} className="chart-label zopa-label">
              ZOPA
            </text>
          </g>
        ) : null}

        {buyerReservation !== null ? (
          <g>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(buyerReservation)}
              y2={y(buyerReservation)}
              className="reservation-line buyer"
            />
            <text
              x={WIDTH - PAD.right + 6}
              y={y(buyerReservation) + 4}
              className="chart-label buyer"
            >
              buyer max {microToUsdc(view.observer.buyerReservationMicroUsdc ?? "0")}
            </text>
          </g>
        ) : null}

        {sellerReservation !== null ? (
          <g>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(sellerReservation)}
              y2={y(sellerReservation)}
              className="reservation-line seller"
            />
            <text
              x={WIDTH - PAD.right + 6}
              y={y(sellerReservation) + 4}
              className="chart-label seller"
            >
              seller floor {microToUsdc(view.observer.sellerReservationMicroUsdc ?? "0")}
            </text>
          </g>
        ) : null}

        {buyer.length > 0 ? (
          <polyline points={path(buyer)} className="price-line buyer" />
        ) : null}
        {seller.length > 0 ? (
          <polyline points={path(seller)} className="price-line seller" />
        ) : null}

        {buyer.map((point, index) => (
          <circle key={`b${index}`} cx={x(point.round)} cy={y(point.price)} r={3} className="dot buyer" />
        ))}
        {seller.map((point, index) => (
          <circle key={`s${index}`} cx={x(point.round)} cy={y(point.price)} r={3} className="dot seller" />
        ))}

        <line
          x1={PAD.left}
          x2={WIDTH - PAD.right}
          y1={HEIGHT - PAD.bottom}
          y2={HEIGHT - PAD.bottom}
          className="axis"
        />
        <text x={PAD.left} y={HEIGHT - 8} className="chart-label axis-label">
          round 1
        </text>
        <text
          x={WIDTH - PAD.right}
          y={HEIGHT - 8}
          className="chart-label axis-label"
          textAnchor="end"
        >
          round {view.roundCap}
        </text>
      </svg>

      {!view.observer.zopaExists ? (
        <p className="no-zopa">
          No overlap exists. {view.observer.blockingCause ?? ""}
        </p>
      ) : null}
    </section>
  );
}
