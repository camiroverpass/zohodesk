// Score the AI classifier against your hand-labeled gold set.
// Reads goldset.csv (rows where gold_label is filled), classifies each ticket from
// the frozen subject/description in the CSV, and reports accuracy overall and by
// confidence, plus every mismatch with the AI's reason.
//
// Usage:  node scripts/goldset-eval.mjs [goldset.csv]

import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import ExcelJS from "exceljs";
import { loadEnv, loadTaxonomy, classifyTickets, parseCsvLine } from "./_classify.mjs";

loadEnv();
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY in .env.local.");
  process.exit(1);
}

const taxonomy = loadTaxonomy();
const validNames = new Set(taxonomy.categories.map((c) => c.name));

// Prefer goldset.xlsx (filled via the dropdown); fall back to goldset.csv.
async function readRows() {
  const arg = process.argv[2];
  const xlsxPath = path.join(process.cwd(), arg && arg.endsWith(".xlsx") ? arg : "goldset.xlsx");
  const csvPath = path.join(process.cwd(), arg && arg.endsWith(".csv") ? arg : "goldset.csv");
  if (fs.existsSync(xlsxPath) && (!arg || arg.endsWith(".xlsx"))) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(xlsxPath);
    const ws = wb.getWorksheet("tickets") ?? wb.worksheets[0];
    const head = ws.getRow(1).values.map((v) => (v == null ? "" : String(v)));
    const ci = (n) => head.indexOf(n);
    const iN = ci("ticketNumber"), iS = ci("subject"), iD = ci("description"), iG = ci("gold_label");
    const out = [];
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const cell = (i) => { const v = row.values[i]; return v == null ? "" : String(typeof v === "object" && v.text ? v.text : v).trim(); };
      out.push({ ticketNumber: cell(iN), subject: cell(iS), description: cell(iD), gold: cell(iG) });
    });
    console.log(`Reading labels from ${xlsxPath}`);
    return out;
  }
  if (!fs.existsSync(csvPath)) {
    console.error(`Not found: ${xlsxPath} or ${csvPath}. Run goldset-export.mjs / goldset-xlsx.mjs first and fill gold_label.`);
    process.exit(1);
  }
  const lines = fs.readFileSync(csvPath, "utf8").split("\n").filter((l) => l.trim());
  const head = parseCsvLine(lines[0]);
  const ci = (n) => head.indexOf(n);
  const iN = ci("ticketNumber"), iS = ci("subject"), iD = ci("description"), iG = ci("gold_label");
  console.log(`Reading labels from ${csvPath}`);
  return lines.slice(1).map(parseCsvLine).map((f) => ({
    ticketNumber: f[iN], subject: f[iS] ?? "", description: f[iD] ?? "", gold: (f[iG] ?? "").trim(),
  }));
}

const allRows = await readRows();
const labeled = [];
const badLabels = [];
for (const r of allRows) {
  const gold = (r.gold ?? "").trim();
  if (!gold) continue;
  if (!validNames.has(gold)) { badLabels.push(`${r.ticketNumber} -> "${gold}"`); continue; }
  labeled.push({ ticketNumber: r.ticketNumber, subject: r.subject, description: r.description, gold });
}

if (badLabels.length) {
  console.log(`WARNING: ${badLabels.length} rows have gold_label not matching a category name (skipped):`);
  for (const b of badLabels) console.log(`  ${b}`);
  console.log("");
}
if (!labeled.length) {
  console.error("No usable labeled rows. Fill gold_label with exact category names.");
  process.exit(1);
}

console.log(`Scoring ${labeled.length} hand-labeled tickets with claude-opus-4-8...\n`);
const anthropic = new Anthropic();
const results = await classifyTickets(anthropic, taxonomy, labeled, {
  onProgress: (d, total) => { if (d % 5 === 0 || d === total) process.stderr.write(`  classified ${d}/${total}\n`); },
});
const goldBy = new Map(labeled.map((t) => [t.ticketNumber, t.gold]));

let correct = 0;
const byConf = { high: { c: 0, n: 0 }, medium: { c: 0, n: 0 }, low: { c: 0, n: 0 } };
const mismatches = [];
for (const r of results) {
  const gold = goldBy.get(r.ticketNumber);
  if (gold === undefined) continue;
  const ok = gold === r.category;
  byConf[r.confidence].n++;
  if (ok) { correct++; byConf[r.confidence].c++; }
  else mismatches.push(`#${r.ticketNumber} [${r.confidence}] AI="${r.category}" gold="${gold}" — ${r.reason}`);
}

const total = results.length;
const pct = (c, n) => (n ? ((c / n) * 100).toFixed(0) + "%" : "n/a");
console.log("--- accuracy ---");
console.log(`Overall: ${correct}/${total} = ${pct(correct, total)}`);
console.log(`  high  : ${byConf.high.c}/${byConf.high.n} = ${pct(byConf.high.c, byConf.high.n)}`);
console.log(`  medium: ${byConf.medium.c}/${byConf.medium.n} = ${pct(byConf.medium.c, byConf.medium.n)}`);
console.log(`  low   : ${byConf.low.c}/${byConf.low.n} = ${pct(byConf.low.c, byConf.low.n)}`);

if (mismatches.length) {
  console.log(`\n--- ${mismatches.length} mismatches ---`);
  for (const m of mismatches) console.log(m);
}
