// tree.xlsx → app/tree.json
//
// Liest die bearbeitete Excel-Mappe und schreibt sie zurück nach app/tree.json.
// Läuft per `npm run tree:import` — NICHT in der App. Prüft vor dem Schreiben
// alle next-Referenzen; bei Fehlern wird tree.json NICHT überschrieben.

import ExcelJS from "exceljs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const JSON_PATH = path.resolve(ROOT, "app/tree.json");
const XLSX_PATH = path.resolve(ROOT, "tree.xlsx");

// Zelle als getrimmter String ("" wenn leer).
const str = (v) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "text" in v) return String(v.text).trim(); // rich text
  if (typeof v === "object" && "result" in v) return String(v.result).trim(); // formula
  return String(v).trim();
};

// Header-Zeile → { spaltenname: spaltenindex (1-based) }
function headerMap(ws) {
  const map = {};
  ws.getRow(1).eachCell((cell, col) => {
    const name = str(cell.value);
    if (name) map[name] = col;
  });
  return map;
}

// Über alle Datenzeilen (ab Zeile 2) iterieren; ganz leere Zeilen überspringen.
function eachDataRow(ws, fn) {
  for (let i = 2; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    const get = (name, h) => str(row.getCell(h[name]).value);
    fn(row, get);
  }
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(XLSX_PATH);

const configWs = wb.getWorksheet("Config");
const nodesWs = wb.getWorksheet("Nodes");
const buttonsWs = wb.getWorksheet("Buttons");
if (!configWs || !nodesWs || !buttonsWs) {
  throw new Error("tree.xlsx braucht die Blätter Config, Nodes und Buttons.");
}

// ── Config ───────────────────────────────────────────────────────────────────
const cfg = {};
const cfgH = headerMap(configWs);
eachDataRow(configWs, (_row, get) => {
  const key = get("key", cfgH);
  if (key) cfg[key] = get("value", cfgH);
});

// ── Nodes ──────────────────────────────────────────────────────────────────
const nodes = {};
const order = [];
const nH = headerMap(nodesWs);
eachDataRow(nodesWs, (_row, get) => {
  const id = get("id", nH);
  if (!id) return;

  const node = { reply: get("reply", nH), nextAction: get("nextAction", nH) };
  if (get("mode", nH) === "email") node.mode = "email";
  if (get("terminal", nH)) node.terminal = true;
  if (get("leadReady", nH)) node.leadReady = true;

  const patch = {};
  const pNext = get("patch_next_action", nH);
  const pIntent = get("patch_intent", nH);
  if (pNext) patch.next_action = pNext;
  if (pIntent) patch.intent_strength = Number(pIntent);
  if (Object.keys(patch).length) node.patch = patch;

  nodes[id] = node;
  order.push(id);
});

// ── Buttons (Zeilenreihenfolge = Reihenfolge im Chat) ─────────────────────────
const bH = headerMap(buttonsWs);
eachDataRow(buttonsWs, (_row, get) => {
  const nodeId = get("node", bH);
  const label = get("label", bH);
  if (!nodeId && !label) return; // leere Zeile
  if (!nodes[nodeId]) {
    throw new Error(`Button "${label}" verweist auf unbekannten Node "${nodeId}".`);
  }

  const qr = { label, next: get("next", bH) };
  const send = get("send", bH);
  if (send) qr.send = send;

  const patch = {};
  const setStatus = get("set_status", bH);
  const setPain = get("set_pain", bH);
  const setIntent = get("set_intent", bH);
  const setNext = get("set_next_action", bH);
  if (setStatus) patch.status = setStatus;
  if (setPain) patch.pain_points = setPain.split(",").map((s) => s.trim()).filter(Boolean);
  if (setIntent) patch.intent_strength = Number(setIntent);
  if (setNext) patch.next_action = setNext;
  if (Object.keys(patch).length) qr.patch = patch;

  (nodes[nodeId].quickReplies ??= []).push(qr);
});

// Node-Reihenfolge aus dem Nodes-Blatt beibehalten.
const orderedNodes = {};
for (const id of order) orderedNodes[id] = nodes[id];

const tree = {
  root: cfg.root,
  emailSuccessNode: cfg.emailSuccessNode,
  nodes: orderedNodes,
};

// ── Validierung (gleiche Regeln wie app/tree.ts) ─────────────────────────────
const ids = new Set(Object.keys(tree.nodes));
const problems = [];
if (!ids.has(tree.root)) problems.push(`root "${tree.root}" fehlt unter nodes`);
if (!ids.has(tree.emailSuccessNode)) {
  problems.push(`emailSuccessNode "${tree.emailSuccessNode}" fehlt unter nodes`);
}
for (const [id, n] of Object.entries(tree.nodes)) {
  if (!n.reply) problems.push(`Node "${id}": "reply" fehlt`);
  if (!n.nextAction) problems.push(`Node "${id}": "nextAction" fehlt`);
  for (const qr of n.quickReplies ?? []) {
    if (!qr.label) problems.push(`Node "${id}": Button ohne "label"`);
    if (!ids.has(qr.next)) {
      problems.push(`Node "${id}": Button "${qr.label}" verweist auf unbekannten Node "${qr.next}"`);
    }
  }
}
if (problems.length) {
  console.error("✗ tree.xlsx ist ungültig — tree.json wurde NICHT überschrieben:");
  console.error("- " + problems.join("\n- "));
  process.exit(1);
}

await writeFile(JSON_PATH, JSON.stringify(tree, null, 2) + "\n", "utf8");
console.log(
  `✓ ${path.relative(ROOT, JSON_PATH)} geschrieben — ${ids.size} Nodes.`,
);
