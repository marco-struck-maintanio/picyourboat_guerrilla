// tree.json → tree.xlsx
//
// Erzeugt eine bearbeitbare Excel-Mappe aus app/tree.json. Läuft beim Build /
// per `npm run tree:export` — NICHT in der App. Die App liest weiterhin nur
// tree.json; tree.xlsx ist reine Bearbeitungsoberfläche.
//
// Blätter:
//   - Config : root + emailSuccessNode (Schlüssel/Wert)
//   - Nodes  : ein Schritt pro Zeile (Texte, Flags, Node-patch)
//   - Buttons: ein Button pro Zeile (Reihenfolge der Zeilen = Reihenfolge im Chat)
//   - Lists  : (versteckt) Auswahllisten für die Dropdowns

import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const JSON_PATH = path.resolve(ROOT, "app/tree.json");
const XLSX_PATH = path.resolve(ROOT, "tree.xlsx");

const STATUS = [
  "sailing_now",
  "planning",
  "dreaming",
  "charterer",
  "pro",
  "unknown",
];
const PAIN = [
  "hidden_costs",
  "boat_mismatch",
  "handover_chaos",
  "vendor_unresponsive",
  "fake_reviews",
  "price",
  "no_crew",
  "no_license",
  "other",
];
const NEXT_ACTION = [
  "ask_status",
  "ask_pain",
  "reveal_and_pitch",
  "request_email",
  "confirm_email",
  "wrap_up",
  "goodbye",
];

const tree = JSON.parse(await readFile(JSON_PATH, "utf8"));
const nodeIds = Object.keys(tree.nodes);

const wb = new ExcelJS.Workbook();

// ── Config ─────────────────────────────────────────────────────────────────
const config = wb.addWorksheet("Config");
config.columns = [
  { header: "key", key: "key", width: 20 },
  { header: "value", key: "value", width: 30 },
];
config.addRow({ key: "root", value: tree.root });
config.addRow({ key: "emailSuccessNode", value: tree.emailSuccessNode });
config.getRow(1).font = { bold: true };

// ── Lists (Auswahllisten für Dropdowns) ──────────────────────────────────────
const lists = wb.addWorksheet("Lists");
lists.state = "hidden";
lists.columns = [
  { header: "node_ids", key: "node_ids", width: 24 },
  { header: "status", key: "status", width: 20 },
  { header: "pain", key: "pain", width: 22 },
  { header: "next_action", key: "next_action", width: 20 },
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
const r = {
  nodes: `Lists!$A$2:$A$${nodeIds.length + 1}`,
  status: `Lists!$B$2:$B$${STATUS.length + 1}`,
  pain: `Lists!$C$2:$C$${PAIN.length + 1}`,
  next: `Lists!$D$2:$D$${NEXT_ACTION.length + 1}`,
};

// ── Nodes ────────────────────────────────────────────────────────────────────
const nodes = wb.addWorksheet("Nodes");
nodes.columns = [
  { header: "id", key: "id", width: 22 },
  { header: "reply", key: "reply", width: 90 },
  { header: "nextAction", key: "nextAction", width: 16 },
  { header: "mode", key: "mode", width: 10 },
  { header: "terminal", key: "terminal", width: 10 },
  { header: "leadReady", key: "leadReady", width: 10 },
  { header: "patch_next_action", key: "patch_next_action", width: 18 },
  { header: "patch_intent", key: "patch_intent", width: 12 },
];
for (const [id, n] of Object.entries(tree.nodes)) {
  nodes.addRow({
    id,
    reply: n.reply,
    nextAction: n.nextAction,
    mode: n.mode ?? "",
    terminal: n.terminal ? "x" : "",
    leadReady: n.leadReady ? "x" : "",
    patch_next_action: n.patch?.next_action ?? "",
    patch_intent: n.patch?.intent_strength ?? "",
  });
}

// ── Buttons ──────────────────────────────────────────────────────────────────
const buttons = wb.addWorksheet("Buttons");
buttons.columns = [
  { header: "node", key: "node", width: 22 },
  { header: "label", key: "label", width: 36 },
  { header: "send", key: "send", width: 24 },
  { header: "next", key: "next", width: 22 },
  { header: "set_status", key: "set_status", width: 16 },
  { header: "set_pain", key: "set_pain", width: 18 },
  { header: "set_intent", key: "set_intent", width: 12 },
  { header: "set_next_action", key: "set_next_action", width: 18 },
];
for (const [id, n] of Object.entries(tree.nodes)) {
  for (const qr of n.quickReplies ?? []) {
    buttons.addRow({
      node: id,
      label: qr.label,
      send: qr.send ?? "",
      next: qr.next,
      set_status: qr.patch?.status ?? "",
      set_pain: (qr.patch?.pain_points ?? []).join(","),
      set_intent: qr.patch?.intent_strength ?? "",
      set_next_action: qr.patch?.next_action ?? "",
    });
  }
}

// ── Dropdowns (Datengültigkeit) ──────────────────────────────────────────────
const list = (formula) => ({ type: "list", allowBlank: true, formulae: [formula] });
const ROWS = 300; // großzügiger Puffer, damit auch neue Zeilen Dropdowns haben

nodes.getRow(1).font = { bold: true };
nodes.dataValidations.add(`C2:C${ROWS}`, list(r.next)); // nextAction
nodes.dataValidations.add(`D2:D${ROWS}`, list('"email"')); // mode
nodes.dataValidations.add(`E2:E${ROWS}`, list('"x"')); // terminal
nodes.dataValidations.add(`F2:F${ROWS}`, list('"x"')); // leadReady
nodes.dataValidations.add(`G2:G${ROWS}`, list(r.next)); // patch_next_action
nodes.dataValidations.add(`H2:H${ROWS}`, list('"1,2,3,4,5"')); // patch_intent

buttons.getRow(1).font = { bold: true };
buttons.dataValidations.add(`A2:A${ROWS}`, list(r.nodes)); // node
buttons.dataValidations.add(`D2:D${ROWS}`, list(r.nodes)); // next
buttons.dataValidations.add(`E2:E${ROWS}`, list(r.status)); // set_status
buttons.dataValidations.add(`F2:F${ROWS}`, list(r.pain)); // set_pain
buttons.dataValidations.add(`G2:G${ROWS}`, list('"1,2,3,4,5"')); // set_intent
buttons.dataValidations.add(`H2:H${ROWS}`, list(r.next)); // set_next_action

// Zeilenumbruch in den langen reply-Texten anzeigen
nodes.getColumn("reply").alignment = { wrapText: true, vertical: "top" };

await wb.xlsx.writeFile(XLSX_PATH);
console.log(
  `✓ ${path.relative(ROOT, XLSX_PATH)} geschrieben — ${nodeIds.length} Nodes, ` +
    `${buttons.rowCount - 1} Buttons.`,
);
