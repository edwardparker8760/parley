/**
 * Builds docs/recording-sheet.html: a single self-contained file, opened from
 * disk, used to record the demo one shot at a time.
 *
 * Why a generator rather than a hand-written HTML file: the screenshots are
 * embedded as data URIs so the sheet survives being moved or opened with no
 * network, and pasting ~1MB of base64 by hand is not editable afterwards. Run
 * this again after any change to the shot list.
 *
 *   node docs/build-recording-sheet.js
 *
 * Narration is transcribed from docs/demo-video-script.md. Where a token is
 * respelled for text-to-speech, the substitution is declared in `ttsNotes` and
 * rendered visibly on the row, so no wording changes silently.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOCS = path.dirname(fileURLToPath(import.meta.url));

/** Reads a png next to this script and returns a data URI, or null if absent. */
function dataUri(file) {
  const full = path.join(DOCS, file);
  if (!fs.existsSync(full)) return null;
  return `data:image/png;base64,${fs.readFileSync(full).toString("base64")}`;
}

/**
 * The shots, in recording order.
 *
 * `narration` is the exact spoken text, markdown emphasis removed and tokens
 * respelled only where `ttsNotes` says so. `shotImageNote` is required whenever
 * the screenshot is an approximation rather than this exact frame: a reference
 * image that quietly shows something else is worse than none.
 */
const SHOTS = [
  {
    id: 1,
    time: "0:00 - 0:18",
    name: "The differentiator, first",
    steps: [
      "Open a fresh browser window at parley-blond.vercel.app (the LANDING PAGE, not /app).",
      "Scroll to the very top. The hero fills the frame: headline, the arithmetic-not-instructions line, and the transcript excerpt on the right.",
      "Do not touch anything. Start recording. The address bar must be visible in frame.",
    ],
    narration:
      "Agent payments already exist. Agent pricing does not. Every agent payment demo pays a price somebody else posted. Parley's two agents discover the price themselves: one buying bulk inference capacity, one selling, haggling inside hard limits their owners set in advance.",
    ttsNotes: [],
    image: null,
    imageNote:
      "No capture of the landing hero exists. Frame it so the headline, the marked phrase arithmetic, not instructions, and the transcript excerpt with its CLAMP line are all visible at once.",
    verify:
      "Opens on the hero, not /app. The hero already pictures what these two beats say; /app on load is a static block of explanatory text.",
  },
  {
    id: 2,
    time: "0:18 - 0:32",
    name: "The mechanism",
    steps: [
      "Same hero frame as shot 1.",
      'Rest the cursor near the ">> CLAMP" line in the transcript excerpt as you say "arithmetic disposes".',
      'ON THE WORDS "so I will test it on screen", click "Open the dashboard" in the hero button row.',
      "Do not click early. The click and the last four words land together.",
    ],
    narration:
      "The limits are arithmetic, not instructions in a prompt. The model proposes; arithmetic disposes. No prompt talks an agent past its owner's limit. That is a claim, so I will test it on screen.",
    ttsNotes: [],
    image: null,
    imageNote:
      "Same hero frame as shot 1, until the click. The navigation to /app is the transition into shot 3.",
    verify:
      'The click is what motivates the cut to /app, so the audience is not absorbing a jump. Button label is exactly "Open the dashboard".',
  },
  {
    id: 3,
    time: "0:32 - 1:00",
    name: "Scenario B, the clamp firing",
    steps: [
      "You arrive here from the click at the end of shot 2.",
      'Click "View scenario B" in the row of three at the top.',
      "Wait for the page to render. It is server-rendered, so there is no spinner.",
      'Point the cursor at the buyer column in the "Owner limits" panel.',
      'Hold on the line reading "guardrail overrode the strategy 9 times".',
    ],
    narration:
      "This is a recorded run and the page says so. Blue is the buyer walking up, orange the seller coming down. The dashed lines are the owners' limits: neither agent sees the other's, you see both. They barely overlap, so the buyer walks into its ceiling of nine hundred. Nine times the guardrail overrode what the agent wanted to send. It still closed, inside both limits.",
    ttsNotes: [],
    image: "demo-scenario-b-baseline.png",
    imageNote: null,
    verify:
      "Buyer ceiling 900, seller derived floor 855, buyer clamp count 9, seller 0, settled at 9.00 USDC. Checked against negotiation-snapshot-b.json.",
  },
  {
    id: 4,
    time: "1:00 - 1:40",
    name: "HERO BEAT: break it live",
    hero: true,
    steps: [
      'Scroll down to the section headed "Try to break it".',
      'Click the first preset: "Ceiling below floor: 600 against 700".',
      "It runs immediately and returns finished in one response.",
      "SCROLL BACK UP. The result renders ABOVE the panel and nothing auto-scrolls. Rehearse this until it is one motion.",
      "Hold on the walk-away panel. NOTE: it is the last panel in the left column and it scrolls; at a viewport under about 1000px tall you must scroll the column to see both cards in full.",
    ],
    narration:
      "Those were recordings. This is not. I am setting the buyer's ceiling to six hundred, new numbers, not the ones you just saw, against a seller floor of seven hundred, derived from its cost and margin. No price satisfies both owners. Computed live on the server, and here it is: nine rounds, then the buyer walks away, naming its own ceiling as the reason. Nothing agreed. Nothing paid. That is the system refusing to break, not me promising it will not.",
    ttsNotes: [],
    image: "demo-scenario-c.png",
    imageNote:
      "APPROXIMATE. This is recorded scenario C (ceiling 600 against a floor of 951), not the preset run (600 against 700). The shape is the same, the floor number is not. Use it for layout only, never as proof of this shot.",
    verify:
      "This is the only live computation in the take. /api/run-custom opens its own in-memory database per request and is not gated on canRunLive, so it runs on the deployed replay instance. Protect this beat in the edit.",
  },
  {
    id: 5,
    time: "1:40 - 2:03",
    name: "The same claim in code (CUT THIS BY DEFAULT)",
    optional: true,
    steps: [
      "DO NOT ALT-TAB DURING THE TAKE. Xbox Game Bar captures a single window; switching breaks the capture.",
      "If keeping it: record this as a SEPARATE clip, before or after the browser take, and splice it in with CapCut.",
      "In that separate clip: second terminal, scrollback cleared, sitting in the repo root.",
      "Run: pnpm --filter @parley/orchestrator test",
      "Let the pass list scroll. Hold on the final count.",
    ],
    narration:
      "And in code: a model that answers every prompt with an absurd price, ninety-nine million, across all three scenarios, puts zero out of band offers on the wire. Property tests, an adversarial corpus, and prompt injection through the counterparty's own text. One hundred forty-eight tests, all green.",
    ttsNotes: [
      'Script says "out-of-band"; hyphens removed so the engine does not read them as pauses.',
    ],
    image: null,
    imageNote:
      "No capture. Terminal output only. Clear scrollback before recording: this is the shot where old commands are visible.",
    verify:
      "Cutting this is now the default, not the fallback. It buys 21 seconds, three of which pay for the benchmark hold in shot 7, and it removes the only alt-tab in the take. The hero beat already proved the same property live. Note also: this command runs 26 tests, while the line says one hundred forty-eight, which is the whole suite. Do not cut to this terminal as if it printed that number.",
  },
  {
    id: 6,
    time: "2:03 - 2:35",
    name: "Settlement and the Circle stack",
    steps: [
      "Alt-tab back to the browser.",
      'Click "View scenario A".',
      "Scroll to the Settlement panel.",
      'Point at the amber badge reading "SIMULATED: no real money moved".',
    ],
    narration:
      "One real payment has run on Arc testnet. Nine point two three U S D C, through Circle Gateway, over the x four oh two flow its facilitator settles. Permission was granted in under one second. The money reached the chain about thirteen minutes later, because Circle settles in batches. Every recording you saw today is labelled simulated on screen. The run you watched me start was live, and you can type your own numbers into that same form and get the same thing.",
    ttsNotes: [
      'USDC respelled "U S D C" so the engine does not read it as one word.',
      'x402 respelled "x four oh two". Read as digits it becomes "x four hundred two", which is not the product name.',
    ],
    image: "demo-scenario-a.png",
    imageNote:
      "Layout reference. Confirm the amber SIMULATED badge is in frame before you speak this line.",
    verify:
      "Do not compress the two latencies. Authorisation was 857 milliseconds; landing on chain took 12 minutes 43 seconds, which \"about thirteen minutes\" rounds fairly. This shot names all five Circle terms: Arc, USDC, Gateway, x402, facilitator.",
  },
  {
    id: "6b",
    time: "3 seconds, silent",
    name: "Benchmark hold (only if shot 5 was cut)",
    optional: true,
    steps: [
      "Navigate back to the landing page.",
      "Scroll to the benchmark table.",
      "HOLD THREE SECONDS IN SILENCE. Say nothing at all.",
      "Then scroll to the top of the hero for the close.",
    ],
    narration: "",
    ttsNotes: [],
    image: null,
    imageNote:
      "No capture. Frame the scenario B row pair so both lines are readable: baseline needed the limit 9 times, engine 0.",
    verify:
      "This is the one claim nothing else in the video makes: on identical limits the blunt agent had to be stopped nine times and the engine never did. It is legible on its own, so narrating it would cost fifteen words the budget does not have. Only take this beat if shot 5 was cut; with shot 5 kept, the take lands at 3:01.",
  },
  {
    id: 7,
    time: "2:35 - 2:55",
    name: "Close, holding the URL",
    steps: [
      "You should be on the LANDING PAGE hero, the frame the video opened on.",
      "Address bar must read the bare parley-blond.vercel.app, no sub-path.",
      "STOP MOVING THE MOUSE. Hands off entirely.",
      "Hold completely static for the full twenty seconds.",
      "Keep holding for three seconds of silence after the last word, then stop recording.",
    ],
    narration:
      "Agents that discover the price, inside limits a human set, with the limits holding whatever the model says. It is live at parley dash blond dot vercel dot app. Set your own limits and try to break it.",
    ttsNotes: [],
    image: null,
    imageNote:
      "No capture. The frame is the landing hero with the address bar legible. A judge must be able to type the URL without rewinding.",
    verify:
      "Ending where the video opened closes the loop, and puts the root URL in the address bar rather than a sub-path.",
  },
];

const PRE_COMMANDS = [
  {
    cmd: "https://parley-blond.vercel.app/app",
    note: "Record against THIS, not localhost. A localhost recording is a claim nobody can check.",
  },
  {
    cmd: "pnpm --filter @parley/orchestrator test",
    note: "Second terminal, cleared, repo root. Only needed for shot 5.",
  },
];

const POST_CHECKS = [
  "Watch the whole video back at full speed, looking for a visible API key. One frame is enough to lose the key. This is unrecoverable once published.",
  "Watch again for any stub presented as real. Every simulated figure must carry its badge on screen.",
  "Confirm all five Circle terms are audible: Arc, USDC, Gateway, x402, facilitator.",
  "Confirm the two latencies were never merged into one number.",
  "Check the runtime is under 3:00.",
  "Confirm the closing URL is legible and held long enough to type.",
  "Upload to YouTube as UNLISTED. Confirm the link plays in a private window, signed out.",
  "Open EVERY submitted link in a private window, signed out: the video, the repo, the deck, and parley-blond.vercel.app.",
  "Confirm the deck opens without a login.",
  "git status is clean and everything is pushed to origin/main before you submit.",
  "Submit on the Encode platform.",
];

/* ------------------------------------------------------------------ render */

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Copy text lives in an attribute, so quotes and newlines must be neutralised. */
const escAttr = (s) => esc(s).replace(/"/g, "&quot;");

function renderShot(shot) {
  const img = shot.image ? dataUri(shot.image) : null;
  if (shot.image && !img) {
    console.warn(`WARNING: ${shot.image} not found, shot ${shot.id} has no image`);
  }

  const steps = shot.steps
    .map((s) => `<li>${esc(s)}</li>`)
    .join("\n          ");

  const ttsNotes = shot.ttsNotes.length
    ? `<p class="tts-note"><strong>Respelled for speech:</strong> ${shot.ttsNotes
        .map(esc)
        .join(" ")}</p>`
    : "";

  const verify = shot.verify
    ? `<p class="verify"><strong>Check:</strong> ${esc(shot.verify)}</p>`
    : "";

  const imageBlock = img
    ? `<img src="${img}" alt="Reference frame for shot ${shot.id}">`
    : `<div class="no-image">No capture for this shot</div>`;

  const imageNote = shot.imageNote
    ? `<p class="${
        /APPROXIMATE|Closest/.test(shot.imageNote) ? "img-warn" : "img-note"
      }">${esc(shot.imageNote)}</p>`
    : "";

  const wordCount = shot.narration.trim()
    ? shot.narration.trim().split(/\s+/).length
    : 0;

  /* A silent beat gets no copy box: a copy button that yields an empty string
     is a trap at 2am. It says "no line" and explains why instead. */
  const sayBlock = wordCount
    ? `<div class="say-box">
              <p class="narration">${esc(shot.narration)}</p>
              <button class="copy" data-copy="${escAttr(shot.narration)}">Copy line</button>
            </div>
            ${ttsNotes}`
    : `<div class="say-box silent">
              <p class="narration">Nothing to say. This beat is silent.</p>
            </div>`;

  const classes = [
    "shot",
    shot.hero ? "hero" : "",
    shot.optional ? "optional" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `
      <section class="${classes}" id="shot-${shot.id}">
        <header class="shot-head">
          <label class="tick">
            <input type="checkbox" data-shot="${shot.id}">
            <span class="tickbox" aria-hidden="true"></span>
          </label>
          <div class="shot-title">
            <span class="time">${esc(shot.time)}</span>
            <h2>${esc(shot.name)}</h2>
            ${shot.optional ? '<span class="badge-opt">optional</span>' : ""}
          </div>
          <span class="wc">${wordCount ? wordCount + " words" : "silent"}</span>
        </header>

        <div class="shot-body">
          <div class="col-do">
            <h3>Do this</h3>
            <ol>
          ${steps}
            </ol>
            ${verify}
          </div>

          <div class="col-say">
            <h3>Paste into text-to-speech</h3>
            ${sayBlock}
          </div>

          <div class="col-see">
            <h3>Screen should look like</h3>
            ${imageBlock}
            ${imageNote}
          </div>
        </div>
      </section>`;
}

const countWords = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);

const totalWords = SHOTS.reduce((n, s) => n + countWords(s.narration), 0);


/*
 * Runtime is computed from the SCRIPT's word count, not this sheet's.
 *
 * Respelling for speech splits one token into several ("USDC" becomes "U S D C",
 * "x402" becomes "x four oh two"), which inflates the count here by nine words
 * without adding any time to the spoken track: the engine says the same sounds
 * either way. Deriving the estimate from the inflated count reports 3:02 for a
 * take that runs 2:58, which is the wrong side of the limit to be wrong on.
 *
 * These are the canonical counts from docs/demo-video-script.md. Update them
 * together with the narration.
 */
const SCRIPT_WORDS_ALL = 382;
const SCRIPT_WORDS_CUT = 337;

const runtime = (words, wpm) => {
  const s = Math.round((words / wpm) * 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Parley recording sheet</title>
<style>
  :root {
    --bg: #14161a;
    --panel: #1c1f25;
    --panel-2: #23272f;
    --line: #333944;
    --ink: #e8eaed;
    --dim: #9aa3af;
    --accent: #f0b429;
    --good: #4ade80;
    --warn: #fb7185;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 2rem 1.5rem 5rem;
    background: var(--bg);
    color: var(--ink);
    font: 16px/1.6 -apple-system, "Segoe UI", Roboto, system-ui, sans-serif;
  }
  .wrap { max-width: 1280px; margin: 0 auto; }
  h1 { font-size: 1.8rem; margin: 0 0 .3rem; }
  .sub { color: var(--dim); margin: 0 0 2rem; }

  .banner {
    background: var(--panel);
    border: 1px solid var(--line);
    border-left: 4px solid var(--accent);
    border-radius: 6px;
    padding: 1.1rem 1.3rem;
    margin-bottom: 1.2rem;
  }
  .banner h2 { margin: 0 0 .7rem; font-size: 1.05rem; letter-spacing: .04em; text-transform: uppercase; color: var(--accent); }
  .banner.stop { border-left-color: var(--warn); }
  .banner.stop h2 { color: var(--warn); }

  .facts { display: flex; flex-wrap: wrap; gap: 1.6rem; margin: 0 0 1rem; padding: 0; list-style: none; }
  .facts div { min-width: 130px; }
  .facts dt { color: var(--dim); font-size: .78rem; text-transform: uppercase; letter-spacing: .06em; }
  .facts dd { margin: .15rem 0 0; font-size: 1.15rem; font-weight: 600; }

  code, .cmd {
    font-family: "Cascadia Mono", Consolas, "SF Mono", Menlo, monospace;
    font-size: .9rem;
  }
  .cmd-row { margin: .6rem 0; }
  .cmd {
    display: inline-block;
    background: #0f1115;
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: .35rem .6rem;
    color: var(--accent);
    word-break: break-all;
  }
  .cmd-note { color: var(--dim); font-size: .88rem; margin: .25rem 0 0; }

  .shot {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    margin: 0 0 1.1rem;
    overflow: hidden;
  }
  .shot.hero { border-color: var(--accent); }
  .shot.optional { border-style: dashed; }
  .shot.done { opacity: .45; }
  .badge-opt {
    font-size: .68rem; text-transform: uppercase; letter-spacing: .08em;
    border: 1px solid var(--dim); color: var(--dim);
    border-radius: 3px; padding: .1rem .4rem;
  }
  .say-box.silent { border-style: dashed; }
  .say-box.silent .narration { color: var(--dim); font-style: italic; margin: 0; }

  .shot-head {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: .85rem 1.1rem;
    background: var(--panel-2);
    border-bottom: 1px solid var(--line);
  }
  .shot.hero .shot-head { background: #2a2415; }
  .shot-title { display: flex; align-items: baseline; gap: .9rem; flex: 1; flex-wrap: wrap; }
  .shot-title h2 { margin: 0; font-size: 1.05rem; }
  .time { font-family: Consolas, monospace; color: var(--accent); font-size: .95rem; }
  .wc { color: var(--dim); font-size: .8rem; white-space: nowrap; }

  .tick { cursor: pointer; display: flex; }
  .tick input { position: absolute; opacity: 0; width: 0; height: 0; }
  .tickbox {
    width: 22px; height: 22px;
    border: 2px solid var(--dim);
    border-radius: 4px;
    display: inline-block;
    position: relative;
  }
  .tick input:checked + .tickbox { background: var(--good); border-color: var(--good); }
  .tick input:checked + .tickbox::after {
    content: "";
    position: absolute; left: 6px; top: 1px;
    width: 6px; height: 12px;
    border: solid #14161a; border-width: 0 3px 3px 0;
    transform: rotate(45deg);
  }
  .tick input:focus-visible + .tickbox { outline: 2px solid var(--accent); outline-offset: 2px; }

  .shot-body {
    display: grid;
    grid-template-columns: 1fr 1.15fr .9fr;
    gap: 1.3rem;
    padding: 1.1rem;
  }
  @media (max-width: 1000px) { .shot-body { grid-template-columns: 1fr; } }

  .shot-body h3 {
    margin: 0 0 .6rem;
    font-size: .76rem;
    text-transform: uppercase;
    letter-spacing: .07em;
    color: var(--dim);
  }
  .col-do ol { margin: 0; padding-left: 1.2rem; }
  .col-do li { margin-bottom: .4rem; }

  .say-box {
    background: #0f1115;
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: .9rem;
  }
  .narration { margin: 0 0 .8rem; font-size: 1.02rem; line-height: 1.65; }
  .copy {
    width: 100%;
    background: var(--accent);
    color: #14161a;
    border: 0;
    border-radius: 5px;
    padding: .55rem;
    font-size: .92rem;
    font-weight: 700;
    cursor: pointer;
  }
  .copy:hover { filter: brightness(1.08); }
  .copy.copied { background: var(--good); }

  .tts-note, .img-note, .verify, .img-warn {
    font-size: .84rem;
    margin: .6rem 0 0;
    line-height: 1.5;
  }
  .tts-note { color: var(--accent); }
  .img-note, .verify { color: var(--dim); }
  .img-warn { color: var(--warn); }
  .verify { border-left: 2px solid var(--line); padding-left: .7rem; }

  .col-see img {
    width: 100%;
    height: auto;
    border: 1px solid var(--line);
    border-radius: 5px;
    display: block;
  }
  .no-image {
    border: 1px dashed var(--line);
    border-radius: 5px;
    padding: 2.2rem 1rem;
    text-align: center;
    color: var(--dim);
    font-size: .88rem;
  }

  ol.post { padding-left: 1.3rem; }
  ol.post li { margin-bottom: .55rem; }

  .progress {
    position: sticky; top: 0; z-index: 5;
    background: var(--bg);
    padding: .7rem 0;
    margin-bottom: 1rem;
    border-bottom: 1px solid var(--line);
    color: var(--dim);
    font-size: .9rem;
  }
  .progress strong { color: var(--good); font-size: 1.05rem; }

  footer { margin-top: 2.5rem; color: var(--dim); font-size: .84rem; }
</style>
</head>
<body>
<div class="wrap">

  <h1>Parley recording sheet</h1>
  <p class="sub">One shot at a time. Paste each line into CapCut text-to-speech, record the shot, tick it off.</p>

  <div class="progress"><strong id="done-count">0</strong> of ${SHOTS.length} shots recorded</div>

  <div class="banner stop">
    <h2>Before you press record</h2>
    <div class="cmd-row">
      <span class="cmd">https://parley-blond.vercel.app</span>
      <p class="cmd-note">The opening frame is the LANDING PAGE hero, not /app. Record against this, NOT localhost. The address bar must be in frame for the whole take: a judge who can see the URL can open it, and a localhost recording is a claim nobody can check.</p>
    </div>
    <div class="cmd-row">
      <span class="cmd">https://parley-blond.vercel.app/app</span>
      <p class="cmd-note">Visit once to warm it, then go back to the landing page. The route is force-dynamic, so a cold first visit can be slow, and you do not want that on the cut at 0:32.</p>
    </div>
    <div class="cmd-row">
      <span class="cmd">pnpm --filter @parley/orchestrator test</span>
      <p class="cmd-note">Only for shot 5, which is cut by default. If you keep it, capture it as a SEPARATE clip: Xbox Game Bar captures one window, so alt-tabbing mid-take breaks the recording.</p>
    </div>
    <p class="cmd-note" style="margin-top:.9rem">
      Close every editor window in case a dotenv file is in a tab. Close every terminal whose scrollback touched a dotenv file, provision-wallets, or a faucet page. Close every browser tab except this one recording target. Turn off notification popups.
    </p>
    <p class="cmd-note">
      Rehearse shot 4 before recording anything. Clicking the preset renders the result ABOVE the panel and nothing auto-scrolls, so you have to scroll back up yourself. That fumble on camera is the most likely retake.
    </p>
  </div>

  <div class="banner">
    <h2>The take</h2>
    <dl class="facts">
      <div><dt>Resolution</dt><dd>1920 x 1080</dd></div>
      <div><dt>Hard limit</dt><dd>Under 3:00</dd></div>
      <div><dt>Words, all beats</dt><dd>${SCRIPT_WORDS_ALL}</dd></div>
      <div><dt>Words, shot 5 cut</dt><dd>${SCRIPT_WORDS_CUT}</dd></div>
      <div><dt>Runtime, all beats</dt><dd>${runtime(SCRIPT_WORDS_ALL, 130)}</dd></div>
      <div><dt>Runtime, shot 5 cut</dt><dd>${runtime(SCRIPT_WORDS_CUT, 130)}</dd></div>
      <div><dt>Video host</dt><dd>YouTube, unlisted</dd></div>
    </dl>
    <p class="cmd-note">
      Runtimes are the spoken track at 130 words per minute, a slow deliberate pace. With every beat kept the take lands at ${runtime(
        SCRIPT_WORDS_ALL,
        130
      )}, which leaves two seconds: that is a coin toss, not a budget, because any pause for a click puts it over. <strong>Cutting shot 5 is the default</strong>, not the fallback. It removes the only alt-tab in the take, and three of the recovered twenty-one seconds pay for the benchmark hold.
    </p>
    <p class="cmd-note">
      Per-shot word counts on the rows below total ${totalWords}, higher than the ${SCRIPT_WORDS_ALL} used above, because respelling for speech splits one token into several. It costs no time to say, so the runtime figures use the script's count.
    </p>
    <p class="cmd-note">
      Never cut shot 4, the SIMULATED badge sentence in shot 6, or the static URL hold in shot 7.
    </p>
  </div>
${SHOTS.map(renderShot).join("\n")}

  <div class="banner stop" style="margin-top:1.6rem">
    <h2>After recording, before submitting</h2>
    <ol class="post">
      ${POST_CHECKS.map((c) => `<li>${esc(c)}</li>`).join("\n      ")}
    </ol>
  </div>

  <footer>
    Generated from docs/demo-video-script.md by docs/build-recording-sheet.js.
    Narration transcribed from that script; substitutions for speech are marked on the row.
    Local working file: not deployed, not linked from the app, not part of the submission.
  </footer>
</div>

<script>
  // Copy uses the async clipboard API where the browser allows it on file://,
  // and falls back to a temporary textarea where it does not. The fallback is
  // the point: this page is opened from disk, where the modern API is not
  // guaranteed, and a copy button that silently fails is worse than none.
  function copyText(text, button) {
    var done = function () {
      var original = button.textContent;
      button.textContent = "Copied";
      button.classList.add("copied");
      setTimeout(function () {
        button.textContent = original;
        button.classList.remove("copied");
      }, 1400);
    };
    var fallback = function () {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); done(); }
      catch (e) { button.textContent = "Copy failed, select by hand"; }
      document.body.removeChild(ta);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  document.querySelectorAll(".copy").forEach(function (b) {
    b.addEventListener("click", function () {
      copyText(b.getAttribute("data-copy"), b);
    });
  });

  // Ticks persist in localStorage so closing the page mid-session does not lose
  // which shots are already in the can.
  var KEY = "parley-recording-sheet-v1";
  var state = {};
  try { state = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { state = {}; }

  function refresh() {
    var n = 0;
    document.querySelectorAll('input[data-shot]').forEach(function (cb) {
      if (cb.checked) n++;
      cb.closest(".shot").classList.toggle("done", cb.checked);
    });
    document.getElementById("done-count").textContent = n;
  }

  document.querySelectorAll('input[data-shot]').forEach(function (cb) {
    var id = cb.getAttribute("data-shot");
    if (state[id]) cb.checked = true;
    cb.addEventListener("change", function () {
      state[id] = cb.checked;
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
      refresh();
    });
  });
  refresh();
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(DOCS, "recording-sheet.html"), html, "utf8");
const kb = Math.round(Buffer.byteLength(html) / 1024);
console.log(`wrote docs/recording-sheet.html (${kb} KB, ${SHOTS.length} shots, ${totalWords} spoken words)`);
