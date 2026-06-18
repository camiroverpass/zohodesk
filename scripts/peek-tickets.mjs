// Read-only: dump subject + description for specific ticket numbers, to eyeball
// classification disagreements. Usage: node scripts/peek-tickets.mjs 69957 69956 ...
import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env.local");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const wanted = new Set(process.argv.slice(2));

const tok = await (async () => {
  const body = new URLSearchParams({
    refresh_token: process.env.ZOHO_REFRESH_TOKEN,
    client_id: process.env.ZOHO_CLIENT_ID,
    client_secret: process.env.ZOHO_CLIENT_SECRET,
    grant_type: "refresh_token",
  });
  const r = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return (await r.json()).access_token;
})();

const headers = { Authorization: `Zoho-oauthtoken ${tok}`, orgId: process.env.ZOHO_ORG_ID };
const qs = new URLSearchParams({
  from: "1",
  limit: "100",
  fields: "subject,ticketNumber,cf_problem,description",
  departmentId: process.env.ZOHO_DEPARTMENT_ID,
  sortBy: "-createdTime",
});
const data = (await (await fetch(`https://desk.zoho.com/api/v1/tickets?${qs}`, { headers })).json()).data ?? [];
for (const t of data) {
  if (!wanted.has(String(t.ticketNumber))) continue;
  const desc = (t.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
  console.log(`\n=== #${t.ticketNumber}  (human tag: ${t.cf?.cf_problem ?? "none"}) ===`);
  console.log(`SUBJECT: ${t.subject}`);
  console.log(`DESC: ${desc || "(none)"}`);
}
