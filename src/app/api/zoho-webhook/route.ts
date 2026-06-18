import { NextRequest, NextResponse } from "next/server";
import { getTicketById } from "@/lib/zoho";
import { autoTagTicket, type AutoTagAction } from "@/lib/autotag";

// Zoho Desk -> this app webhook. Fires on ticket creation (configure a Desk workflow
// rule + webhook pointing here). Auto-tags the ticket's cf_problem:
//   1. Mechanical rule first (New Call notifications -> Duplicate Ticket).
//   2. Otherwise AI-classify; auto-apply only HIGH-confidence suggestions.
// Never overwrites a ticket that already has a cf_problem (idempotent + safe against
// clobbering human work). Always returns 200 so Zoho doesn't retry-storm us; the JSON
// body records what happened.

export const dynamic = "force-dynamic";

// Constant-time-ish equality to avoid leaking the secret via timing.
function secretOk(req: NextRequest): boolean {
  const expected = process.env.ZOHO_WEBHOOK_SECRET;
  if (!expected) return false;
  const provided =
    req.headers.get("x-webhook-token") ??
    req.nextUrl.searchParams.get("token") ??
    "";
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

// Zoho's payload shape is configurable in the workflow rule; accept the common spots.
function extractTicketId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const candidates = [
    b.ticketId,
    b.id,
    (b.ticket as Record<string, unknown> | undefined)?.id,
    (b.payload as Record<string, unknown> | undefined)?.ticketId,
    (b.payload as Record<string, unknown> | undefined)?.id,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
    if (typeof c === "number") return String(c);
  }
  return null;
}

export async function POST(req: NextRequest) {
  if (!secretOk(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const ticketId = extractTicketId(body);
  if (!ticketId) {
    return NextResponse.json({ ok: false, error: "no ticket id in payload" }, { status: 400 });
  }

  let result: AutoTagAction;
  try {
    const ticket = await getTicketById(ticketId);
    result = ticket
      ? await autoTagTicket(ticket)
      : { action: "skip", reason: "ticket not found" };
  } catch (e) {
    // Log for observability, but still 200 so Zoho doesn't retry-storm.
    console.error(`[zoho-webhook] ticket ${ticketId} failed:`, e);
    return NextResponse.json(
      { ok: false, ticketId, error: e instanceof Error ? e.message : String(e) },
      { status: 200 },
    );
  }

  return NextResponse.json({ ok: true, ticketId, ...result });
}
