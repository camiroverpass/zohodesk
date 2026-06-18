// Shared read-only Zoho Desk fetch. Assumes loadEnv() has populated process.env.
const ACCOUNTS = "https://accounts.zoho.com";
const API = "https://desk.zoho.com/api/v1";

async function zohoToken() {
  const body = new URLSearchParams({
    refresh_token: process.env.ZOHO_REFRESH_TOKEN,
    client_id: process.env.ZOHO_CLIENT_ID,
    client_secret: process.env.ZOHO_CLIENT_SECRET,
    grant_type: "refresh_token",
  });
  const res = await fetch(`${ACCOUNTS}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Zoho token ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

function cleanDesc(d) {
  return (d ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 800);
}

export async function fetchRecentTickets(max) {
  const token = await zohoToken();
  const headers = { Authorization: `Zoho-oauthtoken ${token}`, orgId: process.env.ZOHO_ORG_ID };
  const out = [];
  for (let from = 1; out.length < max; from += 100) {
    const qs = new URLSearchParams({
      from: String(from),
      limit: String(Math.min(100, max - out.length)),
      fields: "subject,ticketNumber,createdTime,cf_problem,description",
      departmentId: process.env.ZOHO_DEPARTMENT_ID,
      sortBy: "-createdTime",
    });
    const res = await fetch(`${API}/tickets?${qs}`, { headers });
    if (res.status === 204) break;
    if (!res.ok) throw new Error(`Zoho list ${res.status} ${await res.text()}`);
    const page = (await res.json()).data ?? [];
    for (const t of page) {
      out.push({
        id: t.id,
        ticketNumber: String(t.ticketNumber),
        subject: t.subject ?? "",
        description: cleanDesc(t.description),
        currentTag: t.cf?.cf_problem ?? null,
      });
    }
    if (page.length < 100) break;
  }
  return out;
}

// Enrich each ticket's `description` with the first conversation thread's summary
// (the original message). Most ticket `description` fields are empty — the real
// content lives in threads. Runs with bounded concurrency. Mutates tickets in place.
export async function enrichWithFirstThread(tickets, { concurrency = 5, onProgress } = {}) {
  const token = await zohoToken();
  const headers = { Authorization: `Zoho-oauthtoken ${token}`, orgId: process.env.ZOHO_ORG_ID };
  let next = 0, done = 0;
  async function worker() {
    while (next < tickets.length) {
      const t = tickets[next++];
      try {
        const res = await fetch(`${API}/tickets/${t.id}/threads?limit=1`, { headers });
        if (res.ok) {
          const first = ((await res.json()).data ?? [])[0];
          const summary = cleanDesc(first?.summary);
          if (summary) t.description = t.description ? `${t.description} — ${summary}`.slice(0, 1000) : summary;
        }
      } catch { /* leave description as-is on failure */ }
      done++;
      if (onProgress) onProgress(done, tickets.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tickets.length) }, worker));
  return tickets;
}
