// tree.xlsx → app/tree.json  (eine flache Tabelle "Tree")
//
// Gruppiert die Zeilen nach page-ID: Zeile mit question_* definiert die Seite,
// Zeilen mit answer_* (gleiche page) sind ihre Antworten (Reihenfolge = Chat).
// Läuft per `npm run tree:import`. Prüft Referenzen; bei Fehlern wird tree.json
// NICHT überschrieben.

import ExcelJS from "exceljs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const JSON_PATH = path.resolve(ROOT, "app/tree.json");
const XLSX_PATH = path.resolve(ROOT, "tree.xlsx");

const str = (v) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "text" in v) return String(v.text).trim();
  if (typeof v === "object" && "result" in v) return String(v.result).trim();
  return String(v).trim();
};
const list = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(XLSX_PATH);
const ws = wb.getWorksheet("Tree");
if (!ws) throw new Error("Blatt 'Tree' fehlt in tree.xlsx.");

const H = {};
ws.getRow(1).eachCell((c, col) => {
  const n = str(c.value);
  if (n) H[n] = col;
});
for (const k of ["page", "nextAction", "question_de", "question_en", "answer_de", "answer_en", "next"]) {
  if (!H[k]) throw new Error(`Spalte '${k}' fehlt in tree.xlsx.`);
}
const get = (row, name) => (H[name] ? str(row.getCell(H[name]).value) : "");

const nodes = {};
const order = [];
let root = null;
let emailSuccess = null;

for (let i = 2; i <= ws.rowCount; i++) {
  const row = ws.getRow(i);
  const page = get(row, "page");
  if (!page) continue;

  const qd = get(row, "question_de");
  const qen = get(row, "question_en");
  const ad = get(row, "answer_de");

  if (qd || qen) {
    // ── Seiten-/Frage-Zeile ──
    const flags = list(get(row, "flags").replace(/\s+/g, ","));
    const intent = get(row, "set_intent");
    const st = get(row, "set_status");
    const pn = get(row, "set_pain");
    const nextAction = get(row, "nextAction");

    const node = {};
    const scene = get(row, "scene");
    if (scene) node.scene = scene;
    node.reply = { de: qd, en: qen };
    node.nextAction = nextAction;
    if (flags.includes("email")) node.mode = "email";
    if (flags.includes("terminal")) node.terminal = true;
    if (flags.includes("leadReady")) node.leadReady = true;

    const patch = {};
    if (st) patch.status = st;
    if (pn) patch.pain_points = list(pn);
    if (intent) {
      patch.next_action = nextAction;
      patch.intent_strength = Number(intent);
    }
    if (Object.keys(patch).length) node.patch = patch;
    node.quickReplies = [];

    nodes[page] = node;
    order.push(page);
    if (flags.includes("root")) root = page;
    if (flags.includes("emailSuccess")) emailSuccess = page;
  } else if (ad) {
    // ── Antwort-Zeile ──
    if (!nodes[page]) throw new Error(`Antwort "${ad}" steht vor ihrer Seite "${page}".`);
    const qr = { label: { de: ad, en: get(row, "answer_en") }, next: get(row, "next") };
    const patch = {};
    const st = get(row, "set_status");
    const pn = get(row, "set_pain");
    const intent = get(row, "set_intent");
    if (st) patch.status = st;
    if (pn) patch.pain_points = list(pn);
    if (intent) patch.intent_strength = Number(intent);
    if (Object.keys(patch).length) qr.patch = patch;
    nodes[page].quickReplies.push(qr);
  }
}

// Leere quickReplies entfernen (reine Freitext-Seiten)
for (const id of order) {
  if (nodes[id].quickReplies.length === 0) delete nodes[id].quickReplies;
}

if (!root) root = order[0];
if (!emailSuccess) emailSuccess = order.find((id) => nodes[id].leadReady) ?? order[order.length - 1];

const orderedNodes = {};
for (const id of order) orderedNodes[id] = nodes[id];
const tree = { root, emailSuccessNode: emailSuccess, nodes: orderedNodes };

// ── Validierung (wie app/tree.ts) ──
const ids = new Set(order);
const both = (x) => x && typeof x === "object" && "de" in x && "en" in x;
const problems = [];
if (!ids.has(tree.root)) problems.push(`root "${tree.root}" fehlt unter den Seiten`);
if (!ids.has(tree.emailSuccessNode)) {
  problems.push(`emailSuccessNode "${tree.emailSuccessNode}" fehlt unter den Seiten`);
}
for (const [id, n] of Object.entries(tree.nodes)) {
  if (!both(n.reply)) problems.push(`Seite "${id}": Frage braucht de + en`);
  if (!n.nextAction) problems.push(`Seite "${id}": nextAction fehlt`);
  for (const qr of n.quickReplies ?? []) {
    if (!both(qr.label)) problems.push(`Seite "${id}": Antwort-Text braucht de + en`);
    if (!ids.has(qr.next)) problems.push(`Seite "${id}": Antwort verweist auf unbekannte Seite "${qr.next}"`);
  }
}
if (problems.length) {
  console.error("✗ tree.xlsx ist ungültig — tree.json wurde NICHT überschrieben:");
  console.error("- " + problems.join("\n- "));
  process.exit(1);
}

await writeFile(JSON_PATH, JSON.stringify(tree, null, 2) + "\n", "utf8");
console.log(`✓ ${path.relative(ROOT, JSON_PATH)} — ${order.length} Seiten`);
