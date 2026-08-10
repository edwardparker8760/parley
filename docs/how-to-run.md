# How to run Parley

For someone who has never seen this repository. Every command below was run on
2026-08-07 and the "you should see" blocks are copied from real output, not
written from memory.

**What the project is:** two software agents negotiate the price of a batch of
API calls. One buys, one sells. Each acts for a human owner who set a price
limit in advance, neither agent can see the other's limit, and neither can be
argued past its own, because the limits are arithmetic applied after the agent
decides rather than instructions in a prompt.

Needs **Node 20+** and **pnpm**. No API key and no crypto wallet are required
for anything in sections 1 to 6.

Shell syntax below is bash. Where a command sets an environment variable,
the PowerShell form is given too, because the bash form silently does nothing
in PowerShell.

---

## 1. Install and build from a clean clone

```bash
git clone https://github.com/edwardparker8760/parley.git
cd parley
pnpm install
```

`pnpm install` also builds every package, which is deliberate: without it
`pnpm test` would find no compiled output, run zero tests, and exit green.

**You should see:** a long install log ending with a `prepare` step that
compiles each package, then a line like `Done in 45s`. No red text.

Then check it:

```bash
pnpm test
```

**You should see:** seven blocks of `✔` lines, one per package, each ending
with a count. The totals are:

```
packages/settlement          14
packages/guardrails          11
packages/negotiation-engine  15
packages/llm-layer           14
packages/seller-service       4
packages/orchestrator        26
apps/web                     44
```

**128 tests, `fail 0`.** If the count is 0 anywhere, the build did not happen;
run `pnpm build` and try again.

---

## 2. Run one negotiation and watch the ladder

```bash
pnpm run:scenario A
```

**You should see** a header, then one line per message as the two agents trade
offers, then the result. Roughly this:

```
scenario A: Wide ZOPA
expected: Converges and settles

negotiation a-negotiation  scenario A  cap 12 rounds
seq rnd party  type         detail                                    rationale
  0 r 1 BUYER  OFFER        0.000522/call x 10000 = 5.22 USDC          Opening at 0.000522/call.
  1 r 1 SELLER OFFER        0.001476/call x 10000 = 14.76 USDC         Opening at 0.001476/call.
  2 r 2 BUYER  COUNTEROFFER 0.000561/call x 10000 = 5.61 USDC          Moving to 0.000561/call, worth 0.67 to me. 10 rounds left.
  ...
 17 r 9 SELLER ACCEPT       accepts seq 16                             0.000982/call scores 0.35 for me. Taking it.
----------------------------------------------------------------------
OUTCOME: DEAL (18 messages)
GUARDRAILS: 0 clamps applied

SETTLEMENT
  amount    9.82 USDC (10000 calls at 982 micro-USDC)
  termsHash 0xd25ffa705779ee9a5779dbf23d9ec12f0916fc47d8a4a6aa3a6cd2195f9aa423
  adapter   local-stub  [SIMULATED: no real money moved]
  status    SETTLED_STUB in 803ms
  reference 0xstub-d25ffa705779ee9a
```

The buyer's numbers go **up** and the seller's go **down** until they meet.
That is the whole product.

### The one worth running first

```bash
pnpm run:scenario C
```

Here the seller's minimum is **above** the buyer's maximum, so no price can
satisfy both owners.

**You should see** the ladder end with `WALK_AWAY` instead of `ACCEPT`, then:

```
 16 r 9 BUYER  WALK_AWAY    NO_ZOPA_PRICE   counterparty trend projects to 955 by round 12, which cannot reach my limit of 600
----------------------------------------------------------------------
OUTCOME: NO DEAL (17 messages)
GUARDRAILS: 0 clamps applied

WALK-AWAY POST-MORTEMS
  a deal was IMPOSSIBLE: seller floor 951 exceeds buyer ceiling 600: no price satisfies both owners
  BUYER  [NO_ZOPA_PRICE] buyer maximum unit price and total spend cap bound after 9 rounds, final gap 827 micro-USDC
  SELLER [NO_ZOPA_PRICE] seller margin floor over cost basis bound after 9 rounds, final gap 827 micro-USDC
  no payment was made.
```

and **no `SETTLEMENT` block at all**. Nothing is paid. That absence is the
point: it is asserted by a test that counts settlement calls and requires zero.

Scenario B is the middle case: the limits overlap by only 45 millionths of a
dollar, and the agents still find it.

### Options

```bash
pnpm run:scenario A --db parley-ledger.db   # keep the run in a SQLite file
pnpm replay <negotiation-id> --db <path>    # print a saved run again
```

---

## 3. The screen, replay mode (default)

```bash
pnpm --filter @parley/web dev
```

Then open **http://localhost:4020/app**.

This is the default because it needs no database: it serves three recordings
bundled in the repo.

**You should see** a header reading `Parley`, three buttons across the top
labelled `Scenario A / limits overlap a lot`, `Scenario B / limits barely
overlap`, `Scenario C / limits do not overlap`, and under them the grey line:

> Three recorded runs. This instance replays them; it cannot start a new negotiation.

Below that, a white panel that states the setup in sentences: what is being
traded, what each owner's limit is, whether a deal is possible, and how it
ended. Then a dark banner reading **"Replaying a recorded run. No agents are
running and nothing here is live."** Then the chart, the limits panel, and the
full transcript.

**What you can do here:** switch between the three recordings, read any
transcript, see every clamp.

**What you cannot do here:** start a negotiation. The buttons switch
recordings; they do not run agents. If you want a live run, use section 4.

The landing page, a separate thing, is at **http://localhost:4020**.

---

## 4. The screen, live mode

Live mode runs real negotiations on demand and writes them to a real SQLite
ledger. It is opt-in because it needs a database and a native module.

```bash
PARLEY_DATA_SOURCE=sqlite pnpm --filter @parley/web dev
```

PowerShell:

```powershell
$env:PARLEY_DATA_SOURCE="sqlite"; pnpm --filter @parley/web dev
```

Then open **http://localhost:4020/app**.

**You should see**, above the buttons, the instruction:

> Press one of these to start a negotiation:

and three buttons reading **`Start scenario A`**, **`Start scenario B`**,
**`Start scenario C`**, each with a sentence underneath saying what will happen
("Their limits overlap a lot. They should agree."). Below, a panel headed
**"What you are about to watch"** explaining the setup in three numbered
points. There is no chart and no transcript yet, because nothing has run.

### Which button starts a real negotiation

**Any of the three `Start scenario ...` buttons.** They are the only controls
that start anything.

The `engine` / `baseline` pair below them is **not** a start button. It chooses
which agent runs, and takes effect on the next run you start:

- `engine` concedes on a schedule and never reaches its own limit, so the
  guardrail fires **0 times**
- `baseline` is blunt, walks straight into its limit, and gets stopped
  repeatedly

Running scenario B under each is the clearest single demonstration in the
project: same limits, one agent clamped nine times, the other zero.

**After you press a button you should see** the header show a run id and the
word `RUNNING`, the setup panel appear, and the transcript fill in one message
at a time at reading speed (about one row every half second). When it finishes,
the status becomes `SETTLED` or `WALKED_AWAY` and the `Outcome` line reads
something like:

> Agreed at 982 per call in round 9. That sits between the seller's floor of
> 756 and the buyer's ceiling of 1200, so both owners' limits were respected.
> Neither owner's limit ever had to stop its agent. 9.82 USDC settled,
> simulated: no real money moved.

`?negotiation=<id>` on the URL redisplays any finished run with no live
process, including runs recorded from the CLI with `--db`.

---

## 5. The benchmark

Regenerates the engine-versus-baseline comparison over all three scenarios.

```bash
pnpm benchmark
```

**You should see** a section per scenario and a final line naming the file:

```
### Scenario A: Wide ZOPA
Expected: Converges and settles

- Rounds: engine is 1 round faster.
- Price quality: engine settles 63 micro-USDC closer to the fair midpoint.
- Outcome correctness: baseline correct, engine correct.
...
written to C:\...\parley\docs\engine-benchmark.md
```

It rewrites `docs/engine-benchmark.md`. Expect `git status` to show that file
as modified afterwards; that is normal, not a failure.

---

## 6. Wallet balances

Read-only. Safe to run with no wallet configured, in which case it prints
zeros or tells you the keys are unset.

```bash
pnpm --filter @parley/wallets balances
```

**You should see** three addresses and two figures each:

```
Arc Testnet balances (https://rpc.testnet.arc.network)

buyer          0x38D6faC8493cd60C120fa0629A19713606d64F38
               USDC 7.995753   native 7.9957539398
seller         0x4Fc4cec3b6F29Fe2d7a50101BFa5737715ce6bCB
               USDC 0   native 0
seller payout  0x46580aCf6e812F2DeB1bABCe736b79ec4baf12Be
               USDC 0   native 0
```

`USDC` and `native` track each other because on Arc, USDC **is** the native gas
token. The chain reports one balance two ways, at 6 and 18 decimals. A seller
balance of 0 is expected: settlement pays into a Circle Gateway balance, which
is a different pot from the wallet and is not shown here.

---

## 7. A real settlement on Arc Testnet

Everything above moves no money. This section does, and it needs a funded
testnet wallet. Skip it unless that is specifically what you want.

```bash
pnpm provision-wallets
```

Generates local keys and writes them to `.env`.

**You should see** a provider line, then one line per role, then the file it
wrote:

```
provider: local-evm-key  network: eip155:5042002  (generated fresh keys)
  buyer          0x38D6faC8493cd60C120fa0629A19713606d64F38
  seller         0x4Fc4cec3b6F29Fe2d7a50101BFa5737715ce6bCB
  seller payout  0x46580aCf6e812F2DeB1bABCe736b79ec4baf12Be

wrote .env  (contains private keys, gitignored)
```

Run it a second time and the suffix becomes `(reused existing keys from .env)`
rather than generating new ones. `.env` is gitignored; do not commit it and do
not put it on screen while recording.

Then fund the buyer address at **https://faucet.circle.com**, choosing Arc
Testnet. One request gives roughly 20 USDC per address every 2 hours. There is
no separate gas token to request: USDC is the gas token.

Move the money from the wallet into a Gateway balance, which is the step that
is easy to miss and the reason payments otherwise fail:

```bash
pnpm --filter @parley/settlement deposit 12
```

**You should see** a before balance, `depositing 12 USDC into Gateway...`,
`done: {...}`, and an after balance showing the Gateway figure risen by 12.

Start the seller's paid endpoint in one terminal:

```bash
pnpm --filter @parley/seller-service start --db ../../parley-real.db --port 4021
```

**You should see** four lines, and then nothing until a payment arrives:

```
seller service on http://127.0.0.1:4021
  paying to  0x4Fc4cec3b6F29Fe2d7a50101BFa5737715ce6bCB
  ledger     ../../parley-real.db
  route      POST /deals/:dealId/capacity  (402 until paid)
```

Leave it running. When the buyer pays, this terminal prints
`settled deal <id> tx <transfer-id>`.

In a second terminal, run a negotiation that settles for real:

```bash
SETTLEMENT_MODE=arc-x402 SELLER_SERVICE_URL=http://127.0.0.1:4021 \
  pnpm run:scenario A --db ../../parley-real.db
```

PowerShell:

```powershell
$env:SETTLEMENT_MODE="arc-x402"; $env:SELLER_SERVICE_URL="http://127.0.0.1:4021"
pnpm run:scenario A --db ../../parley-real.db
```

**You should see** the usual ladder, then a `SETTLEMENT` block **without** the
`[SIMULATED]` tag, with `adapter arc-x402`, a real Circle transfer id as the
reference, and `status PENDING`.

`PENDING` is correct and is not an error. Circle settles in batches and there
is no way to force one, so at this moment an authorisation has been accepted
and the money has left your Gateway balance, but no on-chain transaction
exists yet. There is therefore **no explorer link yet either**.

The measured run on 2026-08-06 took **857 ms** to authorise and **12 min 43 s**
for the batch to land. To get the transaction hash afterwards:

```bash
pnpm --filter @parley/settlement transfer-status <transfer-id>
```

using the reference from the settlement block. **You should see** the full
transfer record, and at the bottom either:

```
status received, no on-chain hash yet. The batch has not landed.
```

or, once it has:

```
status completed
explorer https://testnet.arcscan.app/tx/0xcccd6d68...
```

That explorer link is the **Circle batch** your authorisation was settled in,
not a transfer naming your deal. It decodes to zero token transfers and is sent
from a Circle address. See
[`settlement-latency.md`](settlement-latency.md#what-that-hash-is-and-what-it-is-not).

If `arc-x402` is selected without funded keys it **fails at startup** rather
than quietly falling back to the stub. That is deliberate: a silent downgrade
is how a fake transaction hash ends up in a demo.

---

## Troubleshooting

**`EADDRINUSE: address already in use :::4020`** means a previous dev server is
still holding the port. Find and stop it:

```powershell
Get-NetTCPConnection -LocalPort 4020 -State Listen | Select-Object OwningProcess
Stop-Process -Id <that id> -Force
```

**`pnpm test` reports 0 tests and exits green.** The packages are not built.
Run `pnpm build`.

**The dashboard says it "cannot start a new negotiation".** You are in replay
mode. See section 4 for the environment variable that enables live mode.

**Tape miss when using `LLM_MODE=replay`.** `LLM_TAPE_PATH` is resolved
relative to the package, not the repo root. Pass an absolute path.
