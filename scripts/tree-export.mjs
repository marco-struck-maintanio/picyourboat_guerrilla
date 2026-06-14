// tree.json → tree.xlsx  (eine flache Tabelle "Tree")
//
// Pro Seite eine Zeile mit Frage (question_de/en) + Seiten-Infos, darunter je
// eine Zeile pro vorgefertigter Antwort (answer_de/en) mit derselben page-ID.
// Läuft per `npm run tree:export` — NICHT in der App.

import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const JSON_PATH = path.resolve(ROOT, "app/tree.json");
const XLSX_PATH = path.resolve(ROOT, "tree.xlsx");

const STATUS = ["sailing_now", "planning", "dreaming", "charterer", "pro", "unknown"];
const PAIN = [
  "hidden_costs", "boat_mismatch", "handover_chaos", "vendor_unresponsive",
  "fake_reviews", "price", "no_crew", "no_license", "other",
];
const NEXT_ACTION = [
  "ask_status", "ask_pain", "reveal_and_pitch", "request_email",
  "confirm_email", "wrap_up", "goodbye",
];

const tree = JSON.parse(await readFile(JSON_PATH, "utf8"));
const nodeIds = Object.keys(tree.nodes);

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("Tree");
ws.columns = [
  { header: "page", key: "page", width: 20 },
  { header: "scene", key: "scene", width: 10 },
  { header: "flags", key: "flags", width: 24 },
  { header: "nextAction", key: "nextAction", width: 15 },
  { header: "question_de", key: "question_de", width: 60 },
  { header: "question_en", key: "question_en", width: 60 },
  { header: "answer_de", key: "answer_de", width: 34 },
  { header: "answer_en", key: "answer_en", width: 34 },
  { header: "next", key: "next", width: 20 },
  { header: "set_status", key: "set_status", width: 14 },
  { header: "set_pain", key: "set_pain", width: 16 },
  { header: "set_intent", key: "set_intent", width: 11 },
];

function flagsFor(id, n) {
  const f = [];
  if (id === tree.root) f.push("root");
  if (n.mode === "email") f.push("email");
  if (n.terminal) f.push("terminal");
  if (n.leadReady) f.push("leadReady");
  if (id === tree.emailSuccessNode) f.push("emailSuccess");
  return f.join(",");
}

for (const [id, n] of Object.entries(tree.nodes)) {
  ws.addRow({
    page: id,
    scene: n.scene ?? "",
    flags: flagsFor(id, n),
    nextAction: n.nextAction,
    question_de: n.reply.de,
    question_en: n.reply.en,
    set_status: n.patch?.status ?? "",
    set_pain: (n.patch?.pain_points ?? []).join(","),
    set_intent: n.patch?.intent_strength ?? "",
  });
  for (const qr of n.quickReplies ?? []) {
    ws.addRow({
      page: id,
      answer_de: qr.label.de,
      answer_en: qr.label.en,
      next: qr.next,
      set_status: qr.patch?.status ?? "",
      set_pain: (qr.patch?.pain_points ?? []).join(","),
      set_intent: qr.patch?.intent_strength ?? "",
    });
  }
}
ws.getRow(1).font = { bold: true };
ws.getColumn("question_de").alignment = { wrapText: true, vertical: "top" };
ws.getColumn("question_en").alignment = { wrapText: true, vertical: "top" };

// Versteckte Hilfslisten für Dropdowns
const lists = wb.addWorksheet("Lists");
lists.state = "hidden";
lists.columns = [
  { header: "node_ids", width: 24 },
  { header: "status", width: 16 },
  { header: "pain", width: 18 },
  { header: "next_action", width: 16 },
];
const maxLen = Math.max(nodeIds.length, STATUS.length, PAIN.length, NEXT_ACTION.length);
for (let i = 0; i < maxLen; i++) {
  lists.addRow({
    node_ids: nodeIds[i] ?? null,
    status: STATUS[i] ?? null,
    pain: PAIN[i] ?? null,
    next_action: NEXT_ACTION[i] ?? null,
  });
}
const ref = {
  nodes: `Lists!$A$2:$A$${nodeIds.length + 1}`,
  status: `Lists!$B$2:$B$${STATUS.length + 1}`,
  pain: `Lists!$C$2:$C$${PAIN.length + 1}`,
  na: `Lists!$D$2:$D$${NEXT_ACTION.length + 1}`,
};
// Dropdowns als Vorschlag (showErrorMessage:false → neue Werte bleiben erlaubt)
const dv = (formula) => ({ type: "list", allowBlank: true, showErrorMessage: false, formulae: [formula] });
const ROWS = 400;
ws.dataValidations.add(`D2:D${ROWS}`, dv(ref.na)); // nextAction
ws.dataValidations.add(`I2:I${ROWS}`, dv(ref.nodes)); // next
ws.dataValidations.add(`J2:J${ROWS}`, dv(ref.status)); // set_status
ws.dataValidations.add(`K2:K${ROWS}`, dv(ref.pain)); // set_pain
ws.dataValidations.add(`L2:L${ROWS}`, dv('"1,2,3,4,5"')); // set_intent

await wb.xlsx.writeFile(XLSX_PATH);
console.log(`✓ ${path.relative(ROOT, XLSX_PATH)} — ${nodeIds.length} Seiten`);
