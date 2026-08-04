"use client";

/**
 * The SIMULATED banner.
 *
 * This is an integrity control, not decoration. It renders whenever a receipt
 * says `isStub`, and `isStub` is a persisted column written by the adapter that
 * produced the receipt, never inferred from an adapter name or a config flag
 * the UI could get wrong.
 *
 * ## It must not depend on colour
 *
 * The dangerous failure mode here is not that a simulated settlement is
 * mistaken for an error. It is that someone believes the money was real. A
 * screenshot gets compressed, a video gets re-encoded, a judge may be
 * colour-blind, and a deck may be printed in greyscale. So the literal sentence
 * carries the meaning and the red only reinforces it. Strip every colour from
 * this component and it still says exactly what it needs to say.
 *
 * Full width and above the figures, so it cannot be cropped out of a frame that
 * still shows the amount.
 *
 * Removing or softening this while the stub adapter is in use turns a
 * screenshot into a false claim that money moved. Treat any change here as a
 * blocking review failure.
 */

export function SimulatedSettlementBadge() {
  return (
    <p className="simulated-banner" role="status">
      SIMULATED: no real money moved
    </p>
  );
}
