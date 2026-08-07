import "./landing.css";

import { CircledLabel } from "@/components/landing/circled-label";
import { GeometricBullet } from "@/components/landing/geometric-bullet";
import { RevealOnScroll } from "@/components/landing/reveal-on-scroll";
import { BenchmarkTable } from "@/components/landing/benchmark-table";
import { TranscriptExcerpt } from "@/components/landing/transcript-excerpt";
import { MechanismStack } from "@/components/landing/mechanism-stack";
import { CapturedModelComparison } from "@/components/landing/captured-model-comparison";
import { BuildFigures } from "@/components/landing/build-figures";
import { SiteNav } from "@/components/landing/site-nav";
import { SplitWords } from "@/components/landing/split-words";

const REPO = "https://github.com/edwardparker8760/parley";

export default function Page() {
  return (
    <>
      <SiteNav />

      <main id="main">
        {/* ---------- hero ---------- */}
        <section className="band band-white band-hero" id="top">
          {/* Copy left, artifact right. The excerpt is a real ladder with real
              clamp events, so the proof and the visual weight arrive together.

              The hero has no RevealOnScroll: it is already in view on load, so
              it plays a choreographed CSS entrance instead. The `hero-` classes
              are the cues; the timing is in landing.css. */}
          <div className="wrap split">
            <div className="split-copy">
              <span className="hero-label">
                <CircledLabel seed={0}>Agentic economy</CircledLabel>
              </span>
              <h1 className="headline">
                {/* Each line is wrapped twice on purpose: the outer span is the
                    mask, the inner one is what rises out from behind it. */}
                <span className="headline-line">
                  <span>Agents that</span>
                </span>
                <span className="headline-line">
                  <span>negotiate</span>
                </span>
                <span className="headline-line">
                  <span>the price.</span>
                </span>
              </h1>
              <p className="headline-sub hero-sub">
                A buyer and a seller haggle over bulk inference capacity inside limits
                their owners set in advance. The limits are{" "}
                <mark className="hero-mark">arithmetic, not instructions</mark>, so no
                prompt can talk an agent past them.
              </p>
              <div className="link-row hero-actions">
                <a className="button button-primary" href={REPO}>
                  Read the code
                </a>
                <a className="button" href="/app">
                  Open the dashboard
                </a>
              </div>
            </div>

            <div className="split-artifact hero-artifact">
              <TranscriptExcerpt />
            </div>
          </div>
        </section>

        {/* ---------- the problem ---------- */}
        <section className="band band-sunken" id="gap">
          <div className="wrap">
            <RevealOnScroll variant="words">
              <CircledLabel seed={1}>The gap</CircledLabel>
              <h2 className="section-title">
                <SplitWords text="Agent payments exist. Agent pricing does not." />
              </h2>
              <p className="lede">
                Every agentic-payment demo so far, including Circle&apos;s own
                starter, shows an agent paying a fixed, posted price. The
                economically interesting step, deciding what the price should be,
                never happens.
              </p>
            </RevealOnScroll>

            {/* Two arguments, not four points. Each row is a pair that reads
                across: the state of things, then the response to it. The two
                halves of a pair arrive together and the pairs arrive in turn;
                staggering the four cards individually read as misalignment.

                The reveal element IS the grid here, so the rows are its own
                children and the stagger can reach them. */}
            <RevealOnScroll variant="stagger" className="pair-rows" delayMs={90}>
              <div className="pair-row">
                <article className="card">
                  <h3>Today</h3>
                  <p>
                    An agent is handed a number and authorised to pay it. That is a
                    payment rail with an agent attached to the end of it.
                  </p>
                </article>
                <article className="card card-answer">
                  <h3>Parley</h3>
                  <p>
                    Two agents with opposing interests discover the number
                    themselves, then settle. Settlement is the last step, not the
                    product.
                  </p>
                </article>
              </div>

              <div className="pair-row">
                <article className="card">
                  <h3>The catch</h3>
                  <p>
                    An agent that can negotiate can also be talked into a bad deal.
                    Prompt injection stops being a curiosity when the agent holds
                    your wallet.
                  </p>
                </article>
                <article className="card card-answer">
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
            {/* Copy and list left, layered diagram right. The list says there are
                four mechanisms; only the diagram shows that they are stacked, that
                each re-checks the last, and that the round cap sits outside both
                agents entirely. */}
            <RevealOnScroll variant="words">
              <div className="split split-copy-wide">
                <div className="split-copy">
                  <CircledLabel seed={2}>The claim</CircledLabel>
                  <h2 className="section-title">
                    <SplitWords text="The model proposes. Arithmetic disposes." />
                  </h2>
                  <p className="lede">
                    The band of prices an agent may offer is computed from its
                    owner&apos;s limits before the model is ever consulted, by a
                    function that has no access to any text at all. That is the whole
                    trick, and it is why no prompt can move it.
                  </p>

                  {/* Five mechanisms, dealt one at a time: the list is an argument
                      built in order, and arriving as a slab hides that. */}
                  <RevealOnScroll variant="stagger" delayMs={120}>
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

                {/* The diagram gets its own reveal: the `words` variant animates
                    text and leaves everything else alone, so without this the
                    stack would simply be there. */}
                <div className="split-artifact">
                  <RevealOnScroll variant="lift" delayMs={80}>
                    <MechanismStack />
                  </RevealOnScroll>
                </div>
              </div>
            </RevealOnScroll>

            {/* The captured-model result, full width beneath, because it is a
                comparison and needs both columns to itself. It lifts rather than
                rises: it is an artifact with a shadow, and it should read as
                settling onto the band. */}
            <RevealOnScroll variant="lift" delayMs={90}>
              <CapturedModelComparison />
            </RevealOnScroll>
          </div>
        </section>

        {/* ---------- the benchmark ---------- */}
        <section className="band band-white" id="benchmark">
          <div className="wrap">
            <RevealOnScroll variant="words">
              <CircledLabel seed={0}>Measured</CircledLabel>
              <h2 className="section-title">
                <SplitWords text="A better agent needs the limit less." />
              </h2>
              <p className="lede">
                The same three scenarios, run by a blunt fixed-concession agent and
                by the real negotiation engine, against identical owner limits.
              </p>
            </RevealOnScroll>

            <RevealOnScroll variant="lift" delayMs={90}>
              <BenchmarkTable />
            </RevealOnScroll>

            {/* Counting figures, so they count up: one after another. */}
            <RevealOnScroll variant="stagger" delayMs={140}>
              <BuildFigures />
            </RevealOnScroll>
          </div>
        </section>

        {/* ---------- what is not true ---------- */}
        <section className="band band-sunken" id="limits">
          <div className="wrap-narrow">
            <RevealOnScroll variant="mask">
              <CircledLabel seed={1}>Plainly</CircledLabel>
              <h2 className="section-title">What is not true.</h2>
              <p className="lede">
                This section is deliberately unstyled. Every line below is something
                the demo does not do, written where it cannot be missed.
              </p>
            </RevealOnScroll>

            {/* Each disclaimer lands on its own. They are separate admissions,
                not a paragraph broken into bullets. */}
            <RevealOnScroll variant="stagger" delayMs={80}>
              <ul className="plain-list">
                <li>
                  <b>Real money has moved exactly once.</b>
                  <span>
                    One negotiated deal was paid on Arc Testnet on 6 August 2026:
                    9.23 USDC, authorised in 857ms, settled on chain 12 minutes
                    and 43 seconds later. Every other settlement figure anywhere
                    in this project, including all three recorded runs on this
                    site, comes from the local stub, and the interface says so on
                    screen.
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
            <RevealOnScroll variant="words">
              <CircledLabel seed={2}>See it</CircledLabel>
              <h2 className="section-title">
                <SplitWords text="Watch the agents fail to agree." />
              </h2>
              <p className="lede">
                Scenario C is the one worth three minutes: no price satisfies both
                owners, both agents work it out in nine rounds, and nothing is paid.
                The dashboard replays that run and two others, all recorded from the
                real engine, and says so at the top of the screen. Switch between
                them there: A settles without the guardrail ever firing, B settles
                with it firing nine times, C ends with nobody paying anybody.
              </p>
            </RevealOnScroll>

            {/* The last four buttons on the page deal themselves out, which is
                the closest this page gets to a flourish, and it is at the end. */}
            <RevealOnScroll variant="stagger" className="link-row" delayMs={80}>
                {/* Straight to scenario C, because that is the run this section
                    just spent a paragraph on. Landing on A here would contradict
                    the sentence above the button. */}
                <a className="button button-primary" href="/app?negotiation=c-negotiation">
                  Watch scenario C
                </a>
                <a className="button" href="/app">
                  Open the dashboard
                </a>
                <a className="button" href={REPO}>
                  Repository
                </a>
                <a className="button" href={`${REPO}#quickstart`}>
                  Run it locally
                </a>
                <a className="button" href={`${REPO}/blob/main/docs/engine-benchmark.md`}>
                  Full benchmark
                </a>
            </RevealOnScroll>
          </div>
        </section>

        <footer className="foot">
          Parley. Built for the Encode and Arc Programmable Money hackathon, Agentic
          Economy track.
        </footer>
      </main>
    </>
  );
}
