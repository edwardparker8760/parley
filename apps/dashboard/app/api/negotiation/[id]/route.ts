/**
 * GET /api/negotiation/:id
 *
 * The cold read. Rebuilds the whole view from the ledger with no live process,
 * which is what `/?negotiation=<id>` renders and what the video falls back to
 * if live streaming misbehaves on the day.
 */

import { NextResponse } from "next/server";
import { readNegotiationView } from "@/lib/negotiation-run-registry";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  try {
    return NextResponse.json(readNegotiationView(id));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
