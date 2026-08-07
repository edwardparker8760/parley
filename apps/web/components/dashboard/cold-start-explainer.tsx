/**
 * WHAT THIS IS, FOR SOMEONE WHO HAS NOT PRESSED ANYTHING YET.
 *
 * ## The hole this fills
 *
 * `NegotiationBriefingStrip` is the frame for a negotiation, and it can only
 * exist once there IS one: every figure in it is read off the run. So a live
 * instance before its first run rendered the title, three buttons and one
 * sentence of empty state. That is the screen a stranger actually arrives at,
 * and it explained nothing: not what is traded, not who the two sides are, not
 * what the limits are for, not what pressing a button would do.
 *
 * The briefing strip was written to solve exactly this problem and could not,
 * because it is gated on there being a view. This component is the half that
 * works with no data at all.
 *
 * ## Why it is static text
 *
 * Every scenario trades the same goods between the same two roles; only the
 * two limits move. So the setup CAN be stated before any run exists, and the
 * numbers that vary are exactly the ones the briefing strip fills in once a
 * run has started. Nothing here duplicates a live figure.
 */

export function ColdStartExplainer() {
  return (
    <section className="cold-start" aria-label="What this is">
      <h2>What you are about to watch</h2>

      <p className="cold-start-lead">
        Two software agents negotiate the price of{" "}
        <strong>10,000 calls of bulk inference capacity</strong>: one buying,
        one selling. They exchange offers round by round until they agree or
        give up.
      </p>

      <ol className="cold-start-steps">
        <li>
          <strong>Each side has a human owner who set a limit in advance.</strong>{" "}
          The buyer&apos;s owner set the most it will pay per call. The
          seller&apos;s owner set the least it will accept.
        </li>
        <li>
          <strong>Neither agent can see the other&apos;s limit.</strong> They
          only see the offers, exactly as two strangers haggling would.
        </li>
        <li>
          <strong>Neither agent can be talked past its own limit.</strong> The
          limits are arithmetic applied after the agent decides, not
          instructions in a prompt, so no clever argument moves them.
        </li>
      </ol>

      <p className="cold-start-close">
        Whether a deal is possible at all depends on whether the two limits
        leave any room between them. The three scenarios above set that room to
        wide, narrow, and none. Press one and the whole run appears here: the
        offers, both limits, and how it ended.
      </p>
    </section>
  );
}
