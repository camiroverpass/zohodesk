// Shared classifier + helpers used by classify-sample.mjs and goldset-eval.mjs.
import fs from "node:fs";
import path from "node:path";

export function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
}

export function loadTaxonomy() {
  return JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "src", "lib", "taxonomy.json"), "utf8"),
  );
}

export function buildSchema(categoryNames) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      category: { type: "string", enum: categoryNames },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      reason: { type: "string" },
    },
    required: ["category", "confidence", "reason"],
  };
}

export function buildSystem(taxonomy) {
  const lines = taxonomy.categories
    .map((c) => `- ${c.name}${c.noise ? " [NOISE]" : c.routeOut ? " [ROUTE-OUT]" : ""}: ${c.description}`)
    .join("\n");
  return `You are a support-ticket classifier for RoverPass, a campground booking & management platform.
Classify each ticket into exactly ONE of these categories. Use the descriptions to disambiguate. Be aggressive about identifying NOISE (Spam/Duplicate/Test) — automated OTA/channel booking notifications (Vrbo, Hotels.com, Airbnb) are Spam. The one exception: verification/login codes (e.g. Channex) are "Codes", never Spam.

If you cannot confidently place a ticket, classify it as "Other / Product Inquiry" with LOW confidence. Do NOT fall back to "Retention & Follow-Up" — only use that category when the ticket is clearly a proactive check-in or a post-call follow-up email.

Categories:
${lines}

Classify the single ticket below. Output only the category, a confidence (high/medium/low), and a one-sentence reason. Base the decision on the subject and description provided.`;
}

// Classify ONE ticket. Returns {category, confidence, reason}. Retries once on a
// truncated/unparseable response; falls back to a low-confidence "Other" rather
// than crashing the whole run.
async function classifyOne(anthropic, system, schema, ticket) {
  const content = `Subject: ${ticket.subject}\nDescription: ${ticket.description || "(none)"}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      system,
      output_config: { format: { type: "json_schema", schema } },
      messages: [{ role: "user", content }],
    });
    if (res.stop_reason === "refusal") break;
    const text = res.content.find((b) => b.type === "text")?.text ?? "";
    try {
      return JSON.parse(text);
    } catch {
      if (attempt === 1) {
        console.error(`  WARN: #${ticket.ticketNumber} unparseable after retry (stop=${res.stop_reason})`);
      }
    }
  }
  return { category: "Other / Product Inquiry", confidence: "low", reason: "classification failed" };
}

// tickets: [{ticketNumber, subject, description}] -> [{ticketNumber, category, confidence, reason}]
// One API call per ticket (reliable), run with bounded concurrency.
export async function classifyTickets(anthropic, taxonomy, tickets, { concurrency = 5, onProgress } = {}) {
  const schema = buildSchema(taxonomy.categories.map((c) => c.name));
  const system = buildSystem(taxonomy);
  const out = new Array(tickets.length);
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < tickets.length) {
      const idx = next++;
      const t = tickets[idx];
      const c = await classifyOne(anthropic, system, schema, t);
      out[idx] = { ticketNumber: t.ticketNumber, ...c };
      done++;
      if (onProgress) onProgress(done, tickets.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tickets.length) }, worker));
  return out;
}

// --- minimal single-line CSV helpers (fields must not contain newlines) ---
export function csvCell(v) {
  const s = String(v ?? "").replace(/[\r\n]+/g, " ");
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
