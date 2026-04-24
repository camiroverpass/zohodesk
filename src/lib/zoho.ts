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
