// Convert goldset.csv -> goldset.xlsx with a dropdown (data validation) on the
// gold_label column, populated from the canonical taxonomy. Pick instead of type.
//
// Usage: node scripts/goldset-xlsx.mjs   (reads goldset.csv, writes goldset.xlsx)

import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { loadTaxonomy, parseCsvLine } from "./_classify.mjs";

const csvPath = path.join(process.cwd(), "goldset.csv");
if (!fs.existsSync(csvPath)) {
  console.error("goldset.csv not found — run goldset-export.mjs first.");
  process.exit(1);
}

const taxonomy = loadTaxonomy();
const names = taxonomy.categories.map((c) => c.name);

const lines = fs.readFileSync(csvPath, "utf8").split("\n").filter((l) => l.trim());
const header = parseCsvLine(lines[0]);
const rows = lines.slice(1).map(parseCsvLine);

const wb = new ExcelJS.Workbook();

// hidden sheet holding the allowed labels (referenced by the dropdown)
const labelsWs = wb.addWorksheet("labels");
names.forEach((n, i) => (labelsWs.getCell(`A${i + 1}`).value = n));
labelsWs.state = "veryHidden";

const ws = wb.addWorksheet("tickets");
ws.columns = [
  { header: "ticketNumber", key: "ticketNumber", width: 12 },
  { header: "subject", key: "subject", width: 50 },
  { header: "description", key: "description", width: 80 },
  { header: "current_tag", key: "current_tag", width: 28 },
  { header: "gold_label", key: "gold_label", width: 34 },
];
ws.getRow(1).font = { bold: true };
ws.views = [{ state: "frozen", ySplit: 1 }];

for (const r of rows) ws.addRow(r);

// dropdown on gold_label (column E) for every data row
const lastRow = rows.length + 1;
const ref = `labels!$A$1:$A$${names.length}`;
for (let row = 2; row <= lastRow; row++) {
  ws.getCell(`E${row}`).dataValidation = {
    type: "list",
    allowBlank: true,
    formulae: [ref],
    showErrorMessage: true,
    errorStyle: "stop",
    errorTitle: "Pick a category",
    error: "Choose one of the listed cf_problem categories.",
  };
}

const outPath = path.join(process.cwd(), "goldset.xlsx");
await wb.xlsx.writeFile(outPath);
console.log(`Wrote ${outPath} with ${rows.length} tickets and a ${names.length}-option dropdown on gold_label.`);
console.log("Open it in Excel, pick a label per row from the gold_label dropdown, then export back to CSV (File > Save As > CSV) as goldset.csv before running goldset-eval.mjs.");
