// Deterministischer Antworten-Tree für den Einstieg.
//
// Die INHALTE (Fragen, Buttons, Pitches, Abschlüsse) liegen in ./tree.json und
// werden dort bearbeitet und re-importiert — siehe TREE.md für das Format.
// Diese Datei lädt die JSON, validiert sie beim Start und stellt sie typisiert
// als TREE bereit.
//
// Solange der User auf Buttons klickt, läuft die komplette Qualifizierung
// (Status → Pain → Pitch → Email) clientseitig ab — KEIN Anthropic-Call, also
// 0 Token. Erst wenn jemand frei tippt statt klickt, übernimmt Claude
// (siehe page.tsx → mode "claude").
//
// Die Typen spiegeln das RESPONSE_SCHEMA aus app/api/chat/route.ts, damit der
// Übergang an Claude nahtlos ist: jeder Tree-Schritt schreibt denselben State,
// den Claude im letzten Assistant-Turn als JSON wiederfindet.

import treeData from "./tree.json";

export type LeadStatus =
  | "sailing_now"
  | "planning"
  | "dreaming"
  | "charterer"
  | "pro"
  | "unknown";

export type PainPoint =
  | "hidden_costs"
  | "boat_mismatch"
  | "handover_chaos"
  | "vendor_unresponsive"
  | "fake_reviews"
  | "price"
  | "no_crew"
  | "no_license"
  | "other";

export type NextAction =
  | "ask_status"
  | "ask_pain"
  | "reveal_and_pitch"
  | "request_email"
  | "confirm_email"
  | "wrap_up"
  | "goodbye";

export type LeadState = {
  status: LeadStatus;
  pain_points: PainPoint[];
  pain_freetext: string | null;
  location_hint: string | null;
  intent_strength: number;
  next_action: NextAction;
};

export type CrewResponse = {
  reply: string;
  state: LeadState;
  lead_ready_for_crm: boolean;
};

// Ein Button. `send` ist der Text, der als User-Bubble erscheint (Default:
// label). `patch` schreibt in den State. `next` zeigt auf den Folge-Node.
export type QuickReply = {
  label: string;
  send?: string;
  next: string;
  patch?: Partial<LeadState>;
};

export type TreeNode = {
  id: string;
  reply: string; // sichtbare Crew-Nachricht
  nextAction: NextAction; // wird beim Betreten in state.next_action geschrieben
  quickReplies?: QuickReply[]; // Buttons; fehlt = reiner Freitext-Schritt
  mode?: "email"; // erwartet eine Email (clientseitig validiert, kein Claude)
  terminal?: boolean; // Gespräch endet hier
  leadReady?: boolean; // setzt lead_ready_for_crm
  patch?: Partial<LeadState>; // State-Änderung beim Betreten des Nodes
};

export const INITIAL_STATE: LeadState = {
  status: "unknown",
  pain_points: [],
  pain_freetext: null,
  location_hint: null,
  intent_strength: 1,
  next_action: "ask_status",
};

// ─── tree.json laden, validieren, typisieren ───────────────────────────────

// In der JSON ist der Objekt-Key die Node-ID (das `id`-Feld wird hier ergänzt).
type RawTree = {
  root: string;
  emailSuccessNode: string;
  nodes: Record<string, Omit<TreeNode, "id">>;
};

// JSON kommt mit weiten string-Typen; der Cast bridged zu den Unions. Korrekt-
// heit der Werte stellt validateTree() + der manuelle Pflegeprozess sicher.
const data = treeData as unknown as RawTree;

// Verweise prüfen, damit ein Tippfehler in tree.json sofort beim Start auffällt
// (statt erst als stummer Sprung-ins-Leere zur Laufzeit).
function validateTree(t: RawTree): void {
  const ids = new Set(Object.keys(t.nodes));
  const problems: string[] = [];

  if (!ids.has(t.root)) problems.push(`root "${t.root}" fehlt unter nodes`);
  if (!ids.has(t.emailSuccessNode)) {
    problems.push(`emailSuccessNode "${t.emailSuccessNode}" fehlt unter nodes`);
  }

  for (const [id, node] of Object.entries(t.nodes)) {
    if (!node.reply) problems.push(`Node "${id}": "reply" fehlt`);
    if (!node.nextAction) problems.push(`Node "${id}": "nextAction" fehlt`);
    for (const qr of node.quickReplies ?? []) {
      if (!qr.label) problems.push(`Node "${id}": Button ohne "label"`);
      if (!ids.has(qr.next)) {
        problems.push(
          `Node "${id}": Button "${qr.label}" verweist auf unbekannten Node "${qr.next}"`,
        );
      }
    }
  }

  if (problems.length) {
    throw new Error(`tree.json ist ungültig:\n- ${problems.join("\n- ")}`);
  }
}

validateTree(data);

export const ROOT_ID = data.root;

// Ziel-Node nach erfolgreicher Email-Eingabe (in tree.json konfiguriert).
export const EMAIL_SUCCESS_ID = data.emailSuccessNode;

// Node-Map mit ergänzter id (= JSON-Key).
export const TREE: Record<string, TreeNode> = Object.fromEntries(
  Object.entries(data.nodes).map(
    ([id, node]) => [id, { id, ...node }] as [string, TreeNode],
  ),
);

// Zieht eine Email-Adresse aus freiem Text — egal ob nackt ("max@foo.de") oder
// eingebettet ("klar, schreib mir an max@foo.de!"). Bewusst lockere Regel
// (@ + Punkt), wie im Prompt. Gibt null zurück, wenn keine drinsteckt — dann
// behandelt das Frontend die Eingabe als Frage und gibt sie an Claude.
export function extractEmail(text: string): string | null {
  const m = text.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
  if (!m) return null;
  // Übliche Satzzeichen am Ende abschneiden ("...@foo.de." / "...@foo.de,").
  return m[0].replace(/[.,;:!?")\]]+$/, "");
}

export const OPENING_RESPONSE: CrewResponse = {
  reply: TREE[ROOT_ID].reply,
  state: INITIAL_STATE,
  lead_ready_for_crm: false,
};
