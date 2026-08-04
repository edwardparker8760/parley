"use client";

/**
 * The SIMULATED badge.
 *
 * This is an integrity control, not decoration. It renders whenever a receipt
 * says `isStub`, and `isStub` is a persisted column written by the adapter that
 * produced the receipt, never inferred from an adapter name or a config flag
 * the UI could get wrong.
 *
 * Removing or softening this badge while the stub adapter is in use turns a
 * screenshot into a false claim that money moved. Treat any change here as a
 * blocking review failure.
 */

export function SimulatedSettlementBadge() {
  return (
    <span className="simulated-badge" title="No real money moved">
      SIMULATED: no real money moved
    </span>
  );
}
