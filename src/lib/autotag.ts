import "server-only";
import { updateTicketProblem, fetchThreadSummaries, type Ticket } from "@/lib/zoho";
import { mechanicalTag } from "@/lib/dedup";
import { classifyTickets } from "@/lib/classify";

// Shared auto-tagging decision, used by BOTH entry points (the Zoho webhook and the
// Vercel cron). Given a ticket with no cf_problem yet, it picks a tag and writes it:
//   1. Mechanical rule (New Call notifications -> Duplicate Ticket), no LLM.
//   2. Otherwise AI-classify; auto-apply only HIGH-confidence suggestions.
// Tickets that already have a cf_problem are skipped (idempotent; never clobbers
// human or prior automatic work).

export type AutoTagAction =
  | { action: "skip"; reason: string }
  | { action: "tagged"; via: "mechanical" | "ai"; category: string; confidence?: string };

// `subject`/`problem` may be passed in (cron already has them from the list call) to
// save a fetch; the webhook fetches the ticket first and passes the full object.
// `dryRun` computes the decision without writing — used for previewing a cron run.
export async function autoTagTicket(
  ticket: Pick<Ticket, "id" | "subject" | "problem">,
  opts: { dryRun?: boolean } = {},
): Promise<AutoTagAction> {
  const write = async (id: string, category: string) => {
    if (!opts.dryRun) await updateTicketProblem(id, category);
  };

  if (ticket.problem && ticket.problem.trim()) {
    return { action: "skip", reason: "already tagged" };
  }

  const mech = mechanicalTag(ticket.subject);
  if (mech) {
    await write(ticket.id, mech.category);
    return { action: "tagged", via: "mechanical", category: mech.category };
  }

  // Most descriptions are empty; the real content is in the first thread.
  const summaries = await fetchThreadSummaries([ticket.id]);
  const suggestions = await classifyTickets([
    { id: ticket.id, subject: ticket.subject, description: summaries[ticket.id] ?? "" },
  ]);
  const s = suggestions[ticket.id];
  if (s && s.confidence === "high") {
    await write(ticket.id, s.category);
    return { action: "tagged", via: "ai", category: s.category, confidence: s.confidence };
  }
  return {
    action: "skip",
    reason: s ? `confidence ${s.confidence} — left for human review` : "no suggestion",
  };
}
