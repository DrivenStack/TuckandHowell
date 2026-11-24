import { NextResponse, type NextRequest } from "next/server";
import { buildCallbackRows } from "@/lib/callbacks/live";
import { syncCalls } from "@/lib/servicetitan/calls";
import { ServiceTitanError } from "@/lib/servicetitan/client";

/** Longest range one request may ask for */
const MAX_RANGE_MS = 62 * 24 * 3_600_000;

/**
 * GET /api/callbacks?from=<ms>&to=<ms>
 * Call backs owed for inbound calls between `from` and `to` (to defaults to now),
 * live from ServiceTitan. Call backs made after `to` still count, so older rows can turn done.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const now = Date.now();
  const from = Number(params.get("from"));
  const to = params.get("to") ? Number(params.get("to")) : now;
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to || from > now) {
    return NextResponse.json({ error: "Pick a valid date range." }, { status: 400 });
  }
  if (to - from > MAX_RANGE_MS) {
    return NextResponse.json({ error: "Pick a range of 62 days or less." }, { status: 400 });
  }
  try {
    const { calls, syncedAt } = await syncCalls(from);
    const rows = buildCallbackRows(calls, from, Math.min(to, now));
    return NextResponse.json({ rows, syncedAt }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const status = err instanceof ServiceTitanError ? err.status : 502;
    const message = err instanceof ServiceTitanError ? err.message : "Could not reach ServiceTitan.";
    console.error("[api/callbacks]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: message }, { status });
  }
}
