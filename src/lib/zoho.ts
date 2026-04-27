import "server-only";

const ACCOUNTS_BASE = "https://accounts.zoho.com";
const API_BASE = "https://desk.zoho.com/api/v1";

type TokenCache = { accessToken: string; expiresAt: number } | null;
let tokenCache: TokenCache = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.accessToken;
  }

  const { ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN } = process.env;
  if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET || !ZOHO_REFRESH_TOKEN) {
    throw new Error("Missing Zoho OAuth env vars");
  }

  const body = new URLSearchParams({
    refresh_token: ZOHO_REFRESH_TOKEN,
    client_id: ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET,
    grant_type: "refresh_token",
  });

  const res = await fetch(`${ACCOUNTS_BASE}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Zoho token refresh failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    accessToken: json.access_token,
    expiresAt: now + json.expires_in * 1000,
  };
  return json.access_token;
}

async function zohoFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const orgId = process.env.ZOHO_ORG_ID;
  if (!orgId) throw new Error("Missing ZOHO_ORG_ID");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Zoho-oauthtoken ${token}`);
  headers.set("orgId", orgId);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers, cache: "no-store" });

  if (res.status === 401) {
    tokenCache = null;
    const retryToken = await getAccessToken();
    headers.set("Authorization", `Zoho-oauthtoken ${retryToken}`);
    return fetch(`${API_BASE}${path}`, { ...init, headers, cache: "no-store" });
  }
  return res;
}

export type TicketContact = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
};

export type Ticket = {
  id: string;
  ticketNumber: string;
  subject: string;
  createdTime: string;
  contact: TicketContact | null;
  problem: string | null;
  webUrl: string;
};

type RawTicket = {
  id: string;
  ticketNumber: string;
  subject: string;
  createdTime: string;
  webUrl: string;
  cf?: { cf_problem: string | null };
  contact?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  } | null;
};

export async function listAllTickets(params: {
  departmentId?: string;
  max?: number;
}): Promise<Ticket[]> {
  const max = params.max ?? 2500;
  const pageSize = 100;
  const fields = "subject,ticketNumber,createdTime,cf_problem,webUrl";
  const out: Ticket[] = [];

  for (let from = 1; out.length < max; from += pageSize) {
    const qs = new URLSearchParams({
      from: String(from),
      limit: String(pageSize),
      fields,
      include: "contacts",
      sortBy: "-createdTime",
    });
    if (params.departmentId) qs.set("departmentId", params.departmentId);

    const res = await zohoFetch(`/tickets?${qs.toString()}`);
    if (res.status === 204) break;
    if (!res.ok) {
      throw new Error(`Zoho list tickets failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { data: RawTicket[] };
    const page = json.data ?? [];
    for (const t of page) {
      out.push({
        id: t.id,
        ticketNumber: t.ticketNumber,
        subject: t.subject,
        createdTime: t.createdTime,
        webUrl: t.webUrl,
        problem: t.cf?.cf_problem ?? null,
        contact: t.contact
          ? {
              id: t.contact.id,
              firstName: t.contact.firstName,
              lastName: t.contact.lastName,
              email: t.contact.email,
            }
          : null,
      });
    }
    if (page.length < pageSize) break;
  }
  return out;
}

export async function updateTicketProblem(
  ticketId: string,
  problem: string | null,
): Promise<void> {
  const res = await zohoFetch(`/tickets/${ticketId}`, {
    method: "PATCH",
    body: JSON.stringify({ cf: { cf_problem: problem } }),
  });
  if (!res.ok) {
    throw new Error(`Zoho update failed for ${ticketId}: ${res.status} ${await res.text()}`);
  }
}

export async function bulkUpdateTicketProblem(
  ticketIds: string[],
  problem: string | null,
): Promise<{ updated: number; failed: { id: string; error: string }[] }> {
  const failed: { id: string; error: string }[] = [];
  let updated = 0;
  const concurrency = 5;

  for (let i = 0; i < ticketIds.length; i += concurrency) {
    const batch = ticketIds.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map((id) => updateTicketProblem(id, problem)),
    );
    results.forEach((r, idx) => {
      if (r.status === "fulfilled") updated++;
      else failed.push({ id: batch[idx], error: String(r.reason) });
    });
  }
  return { updated, failed };
}

export type LastActivity = {
  type: "thread" | "comment" | "other";
  channel: string | null;
  direction: "in" | "out" | null;
  preview: string;
  createdTime: string;
  authorName: string | null;
  isPublic: boolean | null;
};

type RawConversationItem = {
  id?: string;
  type?: string;
  channel?: string | null;
  direction?: string | null;
  summary?: string | null;
  content?: string | null;
  commentContent?: string | null;
  createdTime?: string;
  isPublic?: boolean | null;
  author?: {
    name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  } | null;
  commenter?: {
    name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
  fromEmailAddress?: string | null;
};

function stripHtml(input: string): string {
  return input
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function authorOf(item: RawConversationItem): string | null {
  if (item.author) {
    const composed = [item.author.firstName, item.author.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    return item.author.name || composed || item.author.email || null;
  }
  if (item.commenter) {
    const composed = [item.commenter.firstName, item.commenter.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    return item.commenter.name || composed || null;
  }
  return item.fromEmailAddress ?? null;
}

function toLastActivity(item: RawConversationItem): LastActivity {
  const kind: LastActivity["type"] =
    item.type === "thread" ? "thread" : item.type === "comment" ? "comment" : "other";
  const rawText =
    kind === "comment"
      ? item.content ?? item.commentContent ?? ""
      : item.summary ?? item.content ?? "";
  const preview = stripHtml(rawText).slice(0, 240);
  const direction =
    item.direction === "in" || item.direction === "out" ? item.direction : null;
  return {
    type: kind,
    channel: item.channel ?? null,
    direction,
    preview,
    createdTime: item.createdTime ?? "",
    authorName: authorOf(item),
    isPublic: typeof item.isPublic === "boolean" ? item.isPublic : null,
  };
}

export async function getLastActivityForTicket(
  ticketId: string,
): Promise<LastActivity | null> {
  // Conversations are returned chronologically; page until a partial page is hit
  // and take the last item across all pages.
  const limit = 99;
  let from = 1;
  let last: RawConversationItem | null = null;
  for (let i = 0; i < 20; i++) {
    const res = await zohoFetch(
      `/tickets/${ticketId}/conversations?from=${from}&limit=${limit}`,
    );
    if (res.status === 204) break;
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: RawConversationItem[] };
    const data = json.data ?? [];
    if (!data.length) break;
    last = data[data.length - 1];
    if (data.length < limit) break;
    from += limit;
  }
  return last ? toLastActivity(last) : null;
}

export async function bulkGetLastActivities(
  ticketIds: string[],
): Promise<Record<string, LastActivity | null>> {
  const out: Record<string, LastActivity | null> = {};
  const concurrency = 6;
  for (let i = 0; i < ticketIds.length; i += concurrency) {
    const batch = ticketIds.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map((id) => getLastActivityForTicket(id)),
    );
    results.forEach((r, idx) => {
      out[batch[idx]] = r.status === "fulfilled" ? r.value : null;
    });
  }
  return out;
}
