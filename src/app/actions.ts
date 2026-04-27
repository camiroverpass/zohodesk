"use server";

import { revalidatePath } from "next/cache";
import {
  bulkGetLastActivities,
  bulkUpdateTicketProblem,
  type LastActivity,
} from "@/lib/zoho";

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
