// Read-only AI classification proof-of-concept.
// Fetches recent Zoho Desk tickets, classifies each into the canonical taxonomy
// with a confidence score, and (where a human cf_problem already exists) reports
// an agreement rate. Writes NOTHING back to Zoho.
//
// Usage:  node scripts/classify-sample.mjs [sampleSize]
// Requires .env.local with the Zoho vars + ANTHROPIC_API_KEY.

import Anthropic from "@anthropic-ai/sdk";
import { loadEnv, loadTaxonomy, classifyTickets } from "./_classify.mjs";
import { fetchRecentTickets, enrichWithFirstThread } from "./_zoho.mjs";

loadEnv();
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY in .env.local — add it and re-run.");
  process.exit(1);
}

const taxonomy = loadTaxonomy();
const anthropic = new Anthropic();
const sampleSize = Number(process.argv[2] ?? 30);

console.log(`Fetching ${sampleSize} recent tickets...`);
const tickets = await fetchRecentTickets(sampleSize);
console.log("Enriching with first-thread content...");
await enrichWithFirstThread(tickets);
console.log(`Classifying ${tickets.length} tickets with claude-opus-4-8...\n`);

const byNum = new Map(tickets.map((t) => [t.ticketNumber, t]));
const results = await classifyTickets(anthropic, taxonomy, tickets, {
  onProgress: (d, total) => { if (d % 5 === 0 || d === total) process.stderr.write(`  classified ${d}/${total}\n`); },
});

const map = taxonomy.legacyMapping;
let haveTag = 0;
let agree = 0;
const confCounts = { high: 0, medium: 0, low: 0 };

console.log("ticket".padEnd(9), "AI category".padEnd(34), "conf".padEnd(7), "human (mapped)".padEnd(34), "match");
console.log("-".repeat(98));

for (const r of results) {
  const t = byNum.get(r.ticketNumber);
  confCounts[r.confidence] = (confCounts[r.confidence] ?? 0) + 1;
  let humanMapped = "(untagged)";
  let match = "";
  if (t?.currentTag) {
    const firstTag = String(t.currentTag).split(";")[0].trim();
    humanMapped = map[firstTag] ?? `?(${firstTag})`;
    haveTag++;
    if (humanMapped === r.category) { agree++; match = "OK"; } else { match = "x"; }
  }
  console.log(r.ticketNumber.padEnd(9), r.category.padEnd(34), r.confidence.padEnd(7), humanMapped.padEnd(34), match);
}

console.log("\n--- summary ---");
console.log(`Classified: ${results.length}`);
console.log(`Confidence: high ${confCounts.high}, medium ${confCounts.medium}, low ${confCounts.low}`);
if (haveTag > 0) {
  console.log(`Agreement vs existing human tag: ${agree}/${haveTag} = ${((agree / haveTag) * 100).toFixed(0)}%`);
  console.log("(Human tags are themselves inconsistent — use the gold-set scripts for a real accuracy number.)");
} else {
  console.log("No pre-tagged tickets in sample to compare against.");
}
