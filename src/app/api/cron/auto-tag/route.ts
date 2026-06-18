import { NextRequest, NextResponse } from "next/server";
import { listAllTickets } from "@/lib/zoho";
import { autoTagTicket } from "@/lib/autotag";

// Scheduled auto-tagger (Vercel Cron, every 5 min — see vercel.json). Pulls the most
// recent tickets, keeps the untagged ones, and runs each through the shared
// autoTagTicket helper (mechanical rule + high-confidence AI). This is the trigger we
// chose over a Zoho-side webhook: zero Zoho admin config, near-real-time (= the cadence).
//
// Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically when the
// CRON_SECRET env var is set. Manual runs can pass the same secret via ?token=.

export const dynamic = "force-dynamic";
export const maxDuration = 60; // seconds; raise on a Pro plan if backfilling large batches

const SCAN_RECENT = 200; // how many recent tickets to look at per run
const MAX_PER_RUN = 40; // cap work (and LLM cost) per run; the 5-min cadence catches up

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = req.headers.get("authorization");
  if (bearer === `Bearer ${secret}`) return true;
  return req.nextUrl.searchParams.get("token") === secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const departmentId = process.env.ZOHO_DEPARTMENT_ID;
  if (!departmentId) {
    return NextResponse.json({ ok: false, error: "missing ZOHO_DEPARTMENT_ID" }, { status: 500 });
  }

  let recent;
  try {
    recent = await listAllTickets({ departmentId, max: SCAN_RECENT });
  } catch (e) {
    console.error("[cron/auto-tag] list failed:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 200 },
    );
  }

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
  const untagged = recent.filter((t) => !t.problem || !t.problem.trim()).slice(0, MAX_PER_RUN);

  // Bounded concurrency through the shared helper.
  const concurrency = 5;
  const summary = {
    dryRun,
    scanned: recent.length,
    untagged: untagged.length,
    tagged: 0,
    skipped: 0,
    errors: 0,
  };
  const details: { ticketNumber: string; action: string; category?: string }[] = [];
  let next = 0;
  async function worker() {
    while (next < untagged.length) {
      const t = untagged[next++];
      try {
        const r = await autoTagTicket(t, { dryRun });
        if (r.action === "tagged") {
          summary.tagged++;
          details.push({ ticketNumber: t.ticketNumber, action: `tagged:${r.via}`, category: r.category });
        } else {
          summary.skipped++;
        }
      } catch (e) {
        summary.errors++;
        console.error(`[cron/auto-tag] ticket ${t.ticketNumber} failed:`, e);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, untagged.length) }, worker));

  return NextResponse.json({ ok: true, ...summary, tagged_detail: details });
}
