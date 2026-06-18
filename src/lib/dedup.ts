// Mechanical (non-LLM) dedup rule for RingCentral phone-call notifications.
//
// Data finding (1,500 recent tickets, see scripts/explore-pairs.mjs): tickets whose
// subject begins "New Call from Support Team -" are auto-generated RingCentral
// notifications. ~91% are already human-tagged "Duplicate Ticket"; the rest are
// TEST/Spam/mislabels. CS does the real follow-up on a SEPARATE "<Park> - Phone Call"
// ticket (tagged Missed Phone Call Follow-Up Email there), so tagging the raw
// notification as Duplicate is safe and never clobbers worked tickets.
//
// This is intentionally simpler than the time-window pairing originally planned:
// the data showed lone notifications are still tagged Duplicate, so pairing added
// complexity without improving accuracy.

export const DUPLICATE_TICKET = "Duplicate Ticket";

const NEW_CALL_RE = /^\s*New Call from Support Team\b/i;

// True when the subject is a raw RingCentral "New Call from Support Team -" notification.
export function isNewCallNotification(subject: string | null | undefined): boolean {
  return NEW_CALL_RE.test(subject ?? "");
}

export type MechanicalResult = { category: string; reason: string } | null;

// Returns the mechanical tag for a ticket, or null if no mechanical rule applies
// (i.e. it should fall through to the AI classifier).
export function mechanicalTag(subject: string | null | undefined): MechanicalResult {
  if (isNewCallNotification(subject)) {
    return {
      category: DUPLICATE_TICKET,
      reason: "RingCentral 'New Call from Support Team' auto-notification.",
    };
  }
  return null;
}
