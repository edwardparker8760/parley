/**
 * GET /api/negotiation-stream?id=<negotiationId>
 *
 * Server-sent events. Each event is a whole `NegotiationView`.
 *
 * ## Whole snapshots, not deltas
 *
 * A delta protocol would be smaller and would give the client a second way to
 * be wrong: if one event is missed, the panels drift from the ledger and only
 * the ledger knows. A negotiation is at most 24 short rows, so a snapshot costs
 * a few kilobytes and makes the browser state provably a function of the
 * ledger. It also means the live and cold-read paths deliver an identical
 * payload, so every panel is written once.
 *
 * The stream is derived from the SAME database handle the negotiation is
 * writing to, so "poll" here means reading committed rows in-process, not
 * racing a file.
 *
 * No reconnection logic and no backpressure handling: one viewer, one screen,
 * one demo. The cold-read endpoint is the recovery path.
 */

import { readNegotiationView, runError } from "@/lib/negotiation-run-registry";

export const dynamic = "force-dynamic";

const POLL_MS = 200;
/** Hard stop, so a browser tab left open cannot pin a timer forever. */
const MAX_STREAM_MS = 10 * 60 * 1000;

export async function GET(request: Request): Promise<Response> {
  const id = new URL(request.url).searchParams.get("id");
  if (id === null) {
    return new Response("id query parameter is required", { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const startedAt = Date.now();
      let lastPayload = "";
      let closed = false;

      const send = (event: string, data: unknown): void => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      request.signal.addEventListener("abort", () => {
        closed = true;
      });

      while (!closed && Date.now() - startedAt < MAX_STREAM_MS) {
        let view;
        try {
          view = readNegotiationView(id);
        } catch {
          // The negotiation may not have written its first row yet. Wait.
          await sleep(POLL_MS);
          continue;
        }

        const payload = JSON.stringify(view);
        if (payload !== lastPayload) {
          lastPayload = payload;
          send("negotiation", view);
        }

        const failure = runError(id);
        if (failure !== null) {
          send("failed", { error: failure });
          break;
        }

        if (view.status !== "RUNNING") {
          // The transcript is terminal, but settlement resolves afterwards, so
          // give the receipt a moment to land before closing the stream.
          await sleep(1200);
          const settled = readNegotiationView(id);
          if (JSON.stringify(settled) !== lastPayload) send("negotiation", settled);
          send("ended", { outcome: settled.status });
          break;
        }

        await sleep(POLL_MS);
      }

      try {
        controller.close();
      } catch {
        // Already closed by the client going away. Nothing to do.
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
