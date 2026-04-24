"use server";

import { revalidatePath } from "next/cache";
import { bulkUpdateTicketProblem } from "@/lib/zoho";

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
