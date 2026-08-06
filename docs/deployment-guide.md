# Deployment guide

How Parley is deployed, and why it deploys the way it does. Target: Vercel, from
the GitHub repo `edwardparker8760/parley`, branch `main`.

## What a deployed instance is

**A deployed instance replays three recorded negotiations. It runs nothing.**

That is not a limitation worked around; it is the design. Live negotiation needs
a writable SQLite ledger, an LLM key, and wallet keys. A host has none of those,
so the deployed build reads three JSON snapshots bundled at build time and says
so on screen.

| | deployed (snapshot) | local (`PARLEY_DATA_SOURCE=sqlite`) |
|---|---|---|
| data | 3 bundled JSON exports | live SQLite ledger |
| controls | switch between the 3 recordings | launch A / B / C, engine or baseline |
| `POST /api/run-scenario` | 409 with an explanation | 200, starts a real run |
| needs | nothing | ledger file, LLM key, wallet keys |

## Environment variables: none

**Set no environment variables on Vercel.** This is deliberate and it is tested.

`apps/web/lib/select-negotiation-source.ts` selects sqlite only when
`PARLEY_DATA_SOURCE === "sqlite"`. Anything else, *including unset*, gets the
snapshot source. So the failure mode of forgetting a variable is a working
replay rather than a crash on a missing database, and the option that needs a
disk is the one you have to ask for.

Setting `PARLEY_DATA_SOURCE=sqlite` on Vercel would break the deployment: there
is no ledger file there to open.

## Vercel project settings

Connect the GitHub repo, then set:

| Setting | Value |
|---|---|
| Framework Preset | Next.js (auto-detected) |
| Root Directory | `apps/web` |
| Include source files outside of the Root Directory | **on** |
| Build Command | leave default (comes from `apps/web/vercel.json`) |
| Install Command | leave default |
| Environment Variables | **none** |
| Node.js Version | default (22.x) is fine, see below |

`Root Directory = apps/web` is what makes Vercel treat this as a Next.js app
rather than as a pnpm workspace root it does not know how to build. The
"include files outside the root" toggle is what lets the build reach
`packages/*`, which the app depends on.

## The build command

`apps/web/vercel.json`:

```json
{
  "framework": "nextjs",
  "buildCommand": "pnpm --filter \"@parley/web^...\" build && next build"
}
```

The workspace packages are TypeScript compiled to `dist/`, and the app imports
their build output, so they have to be built first. `@parley/web^...` selects
the dependencies of the web app *excluding the app itself*, and pnpm builds them
in topological order. Then `next build` builds the app.

The root `package.json` also has `"prepare": "pnpm -r build"`, which would build
everything during install. Relying on that would leave the deployment depending
on whether the host runs lifecycle scripts, which is not a thing to be quietly
dependent on, so the build command states it.

## Node version

The default (22.x) is fine, because a snapshot deployment never loads SQLite.

That is worth spelling out. `@parley/ledger` uses Node's built-in `node:sqlite`,
which exists as stable only in Node 24 and is experimental in 22. If a deployed
function loaded it, the deployment would silently depend on the host's Node
build. It does not: every path to SQLite is behind a dynamic `import()` that
only the live source takes, including the scenario allowlist in
`app/api/run-scenario/route.ts`.

This is enforced by `test/deployed-source-is-safe.test.js`, which fails if
anything a deployed instance serves imports `@parley/orchestrator` or
`@parley/ledger` at module scope. It was verified by running the production
build with `node:sqlite` made unloadable: all routes served and `run-scenario`
returned its 409 without ever requiring it.

## Verifying a deployment

```bash
curl -o /dev/null -w "%{http_code}\n" https://<deployment>/
curl -o /dev/null -w "%{http_code}\n" https://<deployment>/app
curl -o /dev/null -w "%{http_code}\n" "https://<deployment>/app?negotiation=c-negotiation"

# Must be 409, not 500: a snapshot instance refuses rather than fails.
curl -X POST https://<deployment>/api/run-scenario \
  -H "Content-Type: application/json" -d '{"scenario":"A"}'
```

Then check by eye on `/app`:

- the **briefing strip** at the top, naming what is traded and both owners' limits
- the **recorded-run banner**: "Replaying a recorded run. No agents are running
  and nothing here is live", with the run id, scenario, export timestamp, model
  and settlement adapter
- the **SIMULATED: NO REAL MONEY MOVED** badge in the settlement panel on a run
  that settled (A or B)
- **three switcher buttons**, and **no** scenario launchers and no engine/baseline toggle

The banner and the badge are the honesty of the whole thing. If either is
missing after a deploy, the deployment is showing figures without saying they
are a recording and that no money moved. Treat that as a release blocker.

## The three bundled runs

| button | run id | outcome | clamps |
|---|---|---|---|
| Scenario A | `a-engine-mse6elrl` | settled at 982/call | 0 |
| Scenario B | `b-baseline-mse6fg7h` | settled at 900/call | 9 |
| Scenario C | `c-negotiation` | walked away, nothing paid | 0 |

They are chosen so the three outcomes are the argument: the good agent settles
without the guardrail firing, the blunt one settles because the guardrail
stopped it nine times, and the third pair cannot agree at all. Scenario B is the
same run the landing page hero excerpt quotes.

## Regenerating a snapshot

The snapshots are GENERATED from the ledger, never hand-written. A hand-written
one would put numbers on a public page that no run ever produced.

```bash
# Run a scenario, persisting it
pnpm run:scenario B --db parley-dashboard.db

# Export it. With no --out, the file is named after the run's own scenario,
# which is the name the web app imports.
pnpm --filter @parley/orchestrator export-snapshot <negotiationId> \
  --db ../../parley-dashboard.db
```

`test/deployed-source-is-safe.test.js` checks that all three carry provenance,
that the file name matches the scenario inside it, and that the three still
cover settled, clamped and walked-away.

## Local ports

`apps/web/package.json` has `"start": "next start"` with no `-p`, so the
platform's `$PORT` is respected. `dev` keeps `-p 4020` because that is a local
convenience and no platform is involved.
