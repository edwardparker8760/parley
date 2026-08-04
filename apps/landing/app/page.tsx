import { CircledLabel } from "@/components/circled-label";
import { GeometricBullet } from "@/components/geometric-bullet";
import { RevealOnScroll } from "@/components/reveal-on-scroll";
import { BenchmarkTable } from "@/components/benchmark-table";

const REPO = "https://github.com/edwardparker8760/parley";

export default function Page() {
  return (
    <main>
      {/* ---------- hero ---------- */}
      <section className="band band-white">
        <div className="wrap">
          <CircledLabel seed={0}>Agentic economy</CircledLabel>
          <h1 className="headline">
            <span>Agents that</span>
            <span>negotiate</span>
            <span>the price.</span>
          </h1>
          <p className="headline-sub">
            A buyer and a seller haggle over bulk inference capacity inside limits
            their owners set in advance. The limits are arithmetic, not
            instructions, so no prompt can talk an agent past them.
          </p>
          <div className="link-row">
            <a className="button button-primary" href={REPO}>
              Read the code
            </a>
            <a className="button" href="#guardrail">
              How the limit holds
            </a>
          </div>
        </div>
      </section>

      {/* ---------- the problem ---------- */}
      <section className="band band-sunken">
        <div className="wrap">
          <RevealOnScroll>
            <CircledLabel seed={1}>The gap</CircledLabel>
            <h2 className="section-title">Agent payments exist. Agent pricing does not.</h2>
            <p className="lede">
              Every agentic-payment demo so far, including Circle&apos;s own
              starter, shows an agent paying a fixed, posted price. The
              economically interesting step, deciding what the price should be,
              never happens.
            </p>
          </RevealOnScroll>

          <RevealOnScroll delayMs={90}>
            <div className="card-stack card-stack-offset">
              <article className="card">
                <h3>Today</h3>
                <p>
                  An agent is handed a number and authorised to pay it. That is a
                  payment rail with an agent attached to the end of it.
                </p>
              </article>
              <article className="card">
                <h3>Parley</h3>
                <p>
                  Two agents with opposing interests discover the number
                  themselves, then settle. Settlement is the last step, not the
                  product.
                </p>
              </article>
              <article className="card">
                <h3>The catch</h3>
                <p>
                  An agent that can negotiate can also be talked into a bad deal.
                  Prompt injection stops being a curiosity when the agent holds
                  your wallet.
                </p>
              </article>
              <article className="card">
                <h3>The answer</h3>
                <p>
                  Put the owner&apos;s limits somewhere language cannot reach
                  them. Then it does not matter what the model is told.
                </p>
              </article>
            </div>
          </RevealOnScroll>
        </div>
      </section>

      {/* ---------- how the guardrail works ---------- */}
      <section className="band band-dark" id="guardrail">
        <div className="wrap">
          <RevealOnScroll>
            <CircledLabel seed={2}>The claim</CircledLabel>
            <h2 className="section-title">The model proposes. Arithmetic disposes.</h2>
            <p className="lede">
              The band of prices an agent may offer is computed from its
              owner&apos;s limits before the model is ever consulted, by a
              function that has no access to any text at all. That is the whole
              trick, and it is why no prompt can move it.
            </p>

            <ul className="icon-list">
              <li>
                <GeometricBullet shape="square" />
                <div>
                  <strong>The band is computed first</strong>
                  <p>
                    Pure arithmetic over the owner&apos;s numbers. No clock, no
                    randomness, and critically no free text. A function that
                    cannot read language cannot be argued with.
                  </p>
                </div>
              </li>
              <li>
                <GeometricBullet shape="circle" />
                <div>
                  <strong>The model picks inside it</strong>
                  <p>
                    It may move the price within a two percent window and it
                    writes the sentence explaining every offer. It never chooses
                    the window.
                  </p>
                </div>
              </li>
              <li>
                <GeometricBullet shape="triangle" />
                <div>
                  <strong>The clamp re-checks</strong>
                  <p>
                    Whatever comes back is forced into the band again, whether it
                    came from the model, a fallback, or a bug.
                  </p>
                </div>
              </li>
              <li>
                <GeometricBullet shape="arc" />
                <div>
                  <strong>An independent guard re-checks again</strong>
                  <p>
                    A separate check on the message bus re-derives the band from
                    scratch and refuses anything outside it, before the
                    counterparty ever sees the message.
                  </p>
                </div>
              </li>
              <li>
                <GeometricBullet shape="cross" />
                <div>
                  <strong>Proven, not asserted</strong>
                  <p>
                    A model rigged to answer 99999999 to every single prompt,
                    across all three scenarios, puts zero out-of-band offers on
                    the wire. That is a test, and it runs on every commit.
                  </p>
                </div>
              </li>
            </ul>
          </RevealOnScroll>
        </div>
      </section>

      {/* ---------- the benchmark ---------- */}
      <section className="band band-white">
        <div className="wrap">
          <RevealOnScroll>
            <CircledLabel seed={0}>Measured</CircledLabel>
            <h2 className="section-title">A better agent needs the limit less.</h2>
            <p className="lede">
              The same three scenarios, run by a blunt fixed-concession agent and
              by the real negotiation engine, against identical owner limits.
            </p>
          </RevealOnScroll>

          <RevealOnScroll delayMs={90}>
            <BenchmarkTable />
          </RevealOnScroll>
        </div>
      </section>

      {/* ---------- what is not true ---------- */}
      <section className="band band-sunken">
        <div className="wrap-narrow">
          <RevealOnScroll>
            <CircledLabel seed={1}>Plainly</CircledLabel>
            <h2 className="section-title">What is not true.</h2>
            <p className="lede">
              This section is deliberately unstyled. Every line below is something
              the demo does not do, written where it cannot be missed.
            </p>

            <ul className="plain-list">
              <li>
                <b>No real money has moved.</b>
                <span>
                  Settlement runs on a local stub. The Arc adapter is implemented
                  and tested, but no wallet has been funded, so every settlement
                  figure anywhere in this project is a stub figure and the
                  interface says so on screen.
                </span>
              </li>
              <li>
                <b>Testnet only.</b>
                <span>No mainnet configuration exists in the repository.</span>
              </li>
              <li>
                <b>Prompts go to a third-party API.</b>
                <span>
                  With the model enabled, each agent&apos;s own band and offer
                  history are sent to Google&apos;s Gemini endpoint. That is fine
                  for testnet demo data and is not a production privacy posture.
                </span>
              </li>
              <li>
                <b>The dashboard has no authentication.</b>
                <span>
                  It is a local demo. It should not be exposed publicly with a
                  funded wallet behind it.
                </span>
              </li>
              <li>
                <b>There is no reputation or identity layer.</b>
                <span>
                  It was scoped, then cut on day one of six when the schedule made
                  it unreachable. It is the next thing to build, not a claim.
                </span>
              </li>
              <li>
                <b>One good, two parties.</b>
                <span>No multi-party auctions and no multi-item bundles.</span>
              </li>
            </ul>
          </RevealOnScroll>
        </div>
      </section>

      {/* ---------- links ---------- */}
      <section className="band band-white">
        <div className="wrap-narrow">
          <RevealOnScroll>
            <CircledLabel seed={2}>See it</CircledLabel>
            <h2 className="section-title">Watch the agents fail to agree.</h2>
            <p className="lede">
              Scenario C is the one worth three minutes: no price satisfies both
              owners, both agents work it out in nine rounds, and nothing is paid.
            </p>
            <div className="link-row">
              <a className="button button-primary" href={REPO}>
                Repository
              </a>
              <a className="button" href={`${REPO}#quickstart`}>
                Run it locally
              </a>
              <a className="button" href={`${REPO}/blob/main/docs/engine-benchmark.md`}>
                Full benchmark
              </a>
            </div>
          </RevealOnScroll>
        </div>
      </section>

      <footer className="foot">
        Parley. Built for the Encode and Arc Programmable Money hackathon, Agentic
        Economy track.
      </footer>
    </main>
  );
}
