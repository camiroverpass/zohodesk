// Read-only: validate the dedup-pairing hypothesis.
// "New Call from Support Team - NAME (phone)" tickets are RingCentral notifications.
// Hypothesis: a New Call notification that has a SIBLING ticket (same caller phone,
// nearby in time) = Duplicate Ticket; a lone New Call notification = Missed Phone
// Call Follow-Up Email. Cross-tab the rule's prediction against the existing human tag.
// Usage: node scripts/explore-pairs.mjs [N] [windowHours]
import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env.local");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const MAX = Number(process.argv[2] ?? 1500);
const WINDOW_H = Number(process.argv[3] ?? 6);
const API = "https://desk.zoho.com/api/v1";

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

const fields = "subject,ticketNumber,createdTime,cf_problem,channel,phone";
const all = [];
for (let from = 1; all.length < MAX; from += 100) {
  const qs = new URLSearchParams({
    from: String(from),
    limit: String(Math.min(100, MAX - all.length)),
    fields,
    include: "contacts",
    departmentId: process.env.ZOHO_DEPARTMENT_ID,
    sortBy: "-createdTime",
  });
  const res = await fetch(`${API}/tickets?${qs}`, { headers });
  if (res.status === 204) break;
  if (!res.ok) throw new Error(`list ${res.status} ${await res.text()}`);
  const page = (await res.json()).data ?? [];
  all.push(...page);
  if (page.length < 100) break;
}

const digits = (s) => (s ?? "").replace(/\D/g, "");
const norm = (s) => {
  const d = digits(s);
  return d.length >= 10 ? d.slice(-10) : "";
};
// phone for any ticket: prefer the (xxx) xxx-xxxx in a New Call subject, else contact phone/phone field
const subjPhone = (subj) => {
  const m = (subj ?? "").match(/\((\d{3})\)\s*(\d{3})-?(\d{4})/) || (subj ?? "").match(/(\d{3})[.\s-](\d{3})[.\s-](\d{4})\s*$/);
  return m ? `${m[1]}${m[2]}${m[3]}` : "";
};
const isNewCall = (t) => /^New Call from Support Team/i.test(t.subject ?? "");
const phoneOf = (t) =>
  isNewCall(t) ? subjPhone(t.subject) : norm(t.contact?.phone) || norm(t.phone);
const time = (t) => new Date(t.createdTime).getTime();

const newCalls = all.filter(isNewCall);
console.log(`Fetched ${all.length} tickets; ${newCalls.length} are "New Call from Support Team".`);
console.log(`Window for sibling match: ±${WINDOW_H}h.\n`);

// existing human-tag distribution on New Call tickets
const tagDist = {};
for (const t of newCalls) {
  const tag = t.cf?.cf_problem || "(untagged)";
  tagDist[tag] = (tagDist[tag] ?? 0) + 1;
}
console.log("=== existing human tag on New Call tickets ===");
for (const [k, v] of Object.entries(tagDist).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);

// Global frequency of the follow-up tag — does CS actually use it on anything?
const FOLLOWUP = "Missed Phone Call Follow-Up Email";
const followupAll = all.filter((t) => (t.cf?.cf_problem ?? "").includes(FOLLOWUP));
console.log(`\n=== "${FOLLOWUP}" appears on ${followupAll.length} / ${all.length} tickets total ===`);
followupAll.slice(0, 10).forEach((t) =>
  console.log(`  #${t.ticketNumber} ch=${t.channel} "${(t.subject ?? "").slice(0, 55)}"`),
);

// For each New Call, look for a sibling ticket (ANY ticket, incl. other New Calls)
// with matching phone in window. A lone New Call (no sibling at all) is the only
// real Missed-Follow-Up candidate.
const windowMs = WINDOW_H * 3600 * 1000;
const others = all.filter((t) => phoneOf(t));
let predDup = 0, predMissed = 0, noPhone = 0;
const crosstab = {}; // predicted -> { humanTag: count }
const examples = { dup: [], missed: [] };

for (const nc of newCalls) {
  const ph = phoneOf(nc);
  if (!ph) { noPhone++; continue; }
  const t0 = time(nc);
  const sib = others.find(
    (o) => o.id !== nc.id && phoneOf(o) === ph && Math.abs(time(o) - t0) <= windowMs,
  );
  const predicted = sib ? "Duplicate Ticket" : "Missed Phone Call Follow-Up Email";
  if (sib) predDup++; else predMissed++;
  const human = nc.cf?.cf_problem || "(untagged)";
  crosstab[predicted] = crosstab[predicted] ?? {};
  crosstab[predicted][human] = (crosstab[predicted][human] ?? 0) + 1;
  const bucket = sib ? examples.dup : examples.missed;
  if (bucket.length < 8) {
    bucket.push(
      `#${nc.ticketNumber} ph=${ph} human=${human}` + (sib ? ` <-> #${sib.ticketNumber} "${(sib.subject ?? "").slice(0, 40)}" (${sib.cf?.cf_problem ?? "—"})` : ""),
    );
  }
}

console.log(`\n=== rule prediction ===`);
console.log(`  has sibling -> Duplicate Ticket: ${predDup}`);
console.log(`  no sibling  -> Missed Phone Call Follow-Up Email: ${predMissed}`);
console.log(`  no parseable phone: ${noPhone}`);

console.log(`\n=== crosstab: predicted (rows) vs existing human tag (cols) ===`);
for (const [pred, dist] of Object.entries(crosstab)) {
  console.log(`  [${pred}]`);
  for (const [h, c] of Object.entries(dist).sort((a, b) => b[1] - a[1])) console.log(`      ${h}: ${c}`);
}

console.log(`\n=== sample: predicted Duplicate (with sibling) ===`);
examples.dup.forEach((e) => console.log("  " + e));
console.log(`\n=== sample: predicted Missed Follow-Up (lone) ===`);
examples.missed.forEach((e) => console.log("  " + e));
