// Read-only: export N recent tickets to goldset.csv for hand-labeling.
// You fill the `gold_label` column with the correct category (see list printed below),
// then run goldset-eval.mjs to score the AI against your labels.
//
// Usage:  node scripts/goldset-export.mjs [N]   (default 50)

import fs from "node:fs";
import path from "node:path";
import { loadEnv, loadTaxonomy, csvCell } from "./_classify.mjs";
import { fetchRecentTickets, enrichWithFirstThread } from "./_zoho.mjs";

loadEnv();
const taxonomy = loadTaxonomy();
const n = Number(process.argv[2] ?? 50);

console.log(`Fetching ${n} recent tickets...`);
const tickets = await fetchRecentTickets(n);
console.log("Enriching with first-thread content...");
await enrichWithFirstThread(tickets);

const header = ["ticketNumber", "subject", "description", "current_tag", "gold_label"];
const rows = [header.join(",")];
for (const t of tickets) {
  rows.push([t.ticketNumber, t.subject, t.description, t.currentTag ?? "", ""].map(csvCell).join(","));
}
const outPath = path.join(process.cwd(), "goldset.csv");
fs.writeFileSync(outPath, rows.join("\n") + "\n", "utf8");

console.log(`\nWrote ${tickets.length} tickets to ${outPath}`);
console.log("\nFill the gold_label column with EXACTLY one of these category names:\n");
for (const c of taxonomy.categories) console.log(`  ${c.name}`);
console.log("\nThen run:  node scripts/goldset-eval.mjs");
