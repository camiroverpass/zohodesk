"use server";

import { revalidatePath } from "next/cache";
import {
  bulkGetLastActivities,
  bulkUpdateTicketProblem,
  fetchThreadSummaries,
  type LastActivity,
} from "@/lib/zoho";
import { classifyTickets, type Suggestion } from "@/lib/classify";

const MAX_SUGGEST = 60;

// AI-suggest a cf_problem category for the given tickets. Read-only — returns
// suggestions for human review; does NOT write anything to Zoho.
export async function suggestTagsForTickets(
  tickets: { id: string; subject: string }[],
): Promise<Record<string, Suggestion>> {
  if (!tickets.length) return {};
  const capped = tickets.slice(0, MAX_SUGGEST);
  const ids = capped.map((t) => t.id);
  const summaries = await fetchThreadSummaries(ids);
  return classifyTickets(
    capped.map((t) => ({ id: t.id, subject: t.subject, description: summaries[t.id] ?? "" })),
  );
}

export async function changeProblemForTickets(
  ticketIds: string[],
  newProblem: string,
): Promise<{ updated: number; failed: { id: string; error: string }[] }> {
  if (!ticketIds.length) return { updated: 0, failed: [] };
  const normalized = newProblem.trim() === "" ? null : newProblem.trim();
  const result = await bulkUpdateTicketProblem(ticketIds, normalized);
  revalidatePath("/");
  return result;
}

export async function getLastActivitiesForTickets(
  ticketIds: string[],
): Promise<Record<string, LastActivity | null>> {
  if (!ticketIds.length) return {};
  const capped = ticketIds.slice(0, 60);
  return bulkGetLastActivities(capped);
}
