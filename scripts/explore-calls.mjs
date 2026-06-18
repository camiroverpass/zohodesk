// Read-only exploration: understand how phone-call / voicemail / "New Call" tickets
// are shaped, so we can design the mechanical dedup pass (caller + time-window pairing).
// Usage: node scripts/explore-calls.mjs [N]   (default 800)
import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env.local");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const MAX = Number(process.argv[2] ?? 800);
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

// Pull a broad set of fields so we can see what actually identifies a caller.
const fields = "subject,ticketNumber,createdTime,cf_problem,channel,phone,statusType,status";
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

console.log(`Fetched ${all.length} tickets.\n`);

// 1) Channel distribution
const byChannel = {};
for (const t of all) byChannel[t.channel ?? "(none)"] = (byChannel[t.channel ?? "(none)"] ?? 0) + 1;
console.log("=== channel distribution ===");
for (const [k, v] of Object.entries(byChannel).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);

// 2) Subject-pattern buckets that look call-related
const patterns = [/new call/i, /voicemail|voice mail|vm\b/i, /missed call/i, /call from/i, /phone/i];
console.log("\n=== call-like subject pattern counts ===");
for (const p of patterns) console.log(`  ${p}: ${all.filter((t) => p.test(t.subject ?? "")).length}`);

// 3) Sample call-like tickets with the fields we'd pair on
const callLike = all.filter((t) => t.channel === "Phone" || /new call|voicemail|voice mail|missed call|call from/i.test(t.subject ?? ""));
console.log(`\n=== ${callLike.length} call-like tickets — sample of 40 ===`);
for (const t of callLike.slice(0, 40)) {
  const phone = t.phone ?? t.contact?.phone ?? "—";
  const name = [t.contact?.firstName, t.contact?.lastName].filter(Boolean).join(" ") || "—";
  console.log(
    `#${t.ticketNumber} | ${t.createdTime} | ch=${t.channel ?? "—"} | ph=${phone} | ${name} | tag=${t.cf?.cf_problem ?? "—"} | ${(t.subject ?? "").slice(0, 60)}`,
  );
}
