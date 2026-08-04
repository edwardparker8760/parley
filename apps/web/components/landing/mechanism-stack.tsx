/**
 * The four mechanisms as a stack, because the point is that they are LAYERED.
 *
 * A bulleted list says there are four of them. It does not say that they run in
 * an order, that each one re-checks the last, or that two of them are
 * independent of each other. Those three facts are the entire safety argument,
 * so the shape has to carry them:
 *
 *   - vertical order, top to bottom, is execution order;
 *   - the connector between the third and fourth layer is marked independent,
 *     because the egress guard re-derives the band rather than trusting the
 *     clamp, which is what stops one bug defeating both;
 *   - the round cap sits outside the stack entirely, because it lives in the
 *     turn loop rather than in either agent.
 */

interface Layer {
  readonly step: string;
  readonly name: string;
  readonly detail: string;
  readonly note: string;
}

const LAYERS: readonly Layer[] = [
  {
    step: "1",
    name: "Feasible band",
    detail: "Pure arithmetic over the owner's limits",
    note: "cannot read text",
  },
  {
    step: "2",
    name: "Clamp",
    detail: "Forces the proposal inside the band",
    note: "runs whatever produced the number",
  },
  {
    step: "3",
    name: "Egress guard",
    detail: "Re-derives the band on the bus and rejects breaches",
    note: "independent of the clamp",
  },
];

export function MechanismStack() {
  return (
    <figure className="stack">
      <figcaption className="stack-head">
        <span className="stack-title">order of authority</span>
      </figcaption>

      <div className="stack-model">
        <span className="stack-model-label">LLM proposes</span>
        <span className="stack-model-note">bounded to a 2% window</span>
      </div>
      <div className="stack-arrow" aria-hidden="true" />

      {LAYERS.map((layer, index) => (
        <div key={layer.step}>
          <div className="stack-layer">
            <span className="stack-step">{layer.step}</span>
            <span className="stack-name">{layer.name}</span>
            <span className="stack-detail">{layer.detail}</span>
            <span className="stack-note">{layer.note}</span>
          </div>
          {index < LAYERS.length - 1 ? (
            <div className="stack-arrow" aria-hidden="true" />
          ) : null}
        </div>
      ))}

      <div className="stack-wire">on the wire</div>

      {/* Outside the stack, because it is outside both agents. */}
      <div className="stack-outside">
        <span className="stack-outside-label">Round cap</span>
        <span className="stack-outside-note">
          in the turn loop, outside both agents. A hostile agent that never
          accepts and never walks away still terminates.
        </span>
      </div>
    </figure>
  );
}
