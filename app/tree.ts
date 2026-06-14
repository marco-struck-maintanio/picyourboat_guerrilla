// Deterministischer Antworten-Tree für den Einstieg.
//
// Die INHALTE (Fragen, Buttons, Pitches) liegen zweisprachig in ./tree.json:
// jedes Textfeld ist ein { de, en }-Objekt. Diese Datei lädt die JSON,
// validiert sie beim Start und stellt sie typisiert als TREE bereit.
//
// Solange der User auf Buttons tippt, läuft die Qualifizierung clientseitig ab
// (KEIN Anthropic-Call). Erst bei Freitext übernimmt Claude (page.tsx).
//
// Die State-Typen spiegeln das RESPONSE_SCHEMA aus app/api/chat/route.ts.

import treeData from "./tree.json";

export type Locale = "de" | "en";

// Ein zweisprachiges Textfeld.
export type LocalizedText = { de: string; en: string };

export function t(text: LocalizedText, locale: Locale): string {
  return text[locale] ?? text.de;
}

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

// Antwort-Objekt, das ins API-Verlaufs-JSON geschrieben wird (reply schon in der
// gewählten Sprache aufgelöst).
export type CrewResponse = {
  reply: string;
  state: LeadState;
  lead_ready_for_crm: boolean;
};

// Ein Button. `send` ist der Text, der als User-Bubble erscheint (Default:
// label). `patch` schreibt in den State. `next` zeigt auf den Folge-Node.
export type QuickReply = {
  label: LocalizedText;
  send?: LocalizedText;
  next: string;
  patch?: Partial<LeadState>;
};

export type TreeNode = {
  id: string;
  reply: LocalizedText; // sichtbare Crew-Nachricht (zweisprachig)
  nextAction: NextAction; // wird beim Betreten in state.next_action geschrieben
  scene?: string; // Datei in /public/scenes (ohne .jpg); Hintergrundbild
  quickReplies?: QuickReply[]; // Buttons; fehlt = reiner Freitext-Schritt
  mode?: "email"; // erwartet eine Email (clientseitig erkannt, kein Claude)
  terminal?: boolean; // abschließende Nachricht (Chat bleibt trotzdem offen)
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

type RawTree = {
  root: string;
  emailSuccessNode: string;
  nodes: Record<string, Omit<TreeNode, "id">>;
};

const data = treeData as unknown as RawTree;

const hasBoth = (x: unknown): x is LocalizedText =>
  !!x && typeof x === "object" && "de" in x && "en" in x;

// Beim Start prüfen: Verweise gültig, Texte zweisprachig vorhanden.
function validateTree(tr: RawTree): void {
  const ids = new Set(Object.keys(tr.nodes));
  const problems: string[] = [];

  if (!ids.has(tr.root)) problems.push(`root "${tr.root}" fehlt unter nodes`);
  if (!ids.has(tr.emailSuccessNode)) {
    problems.push(`emailSuccessNode "${tr.emailSuccessNode}" fehlt unter nodes`);
  }

  for (const [id, node] of Object.entries(tr.nodes)) {
    if (!hasBoth(node.reply)) problems.push(`Node "${id}": reply braucht { de, en }`);
    if (!node.nextAction) problems.push(`Node "${id}": "nextAction" fehlt`);
    for (const qr of node.quickReplies ?? []) {
      if (!hasBoth(qr.label)) problems.push(`Node "${id}": Button-Label braucht { de, en }`);
      if (!ids.has(qr.next)) {
        problems.push(
          `Node "${id}": Button verweist auf unbekannten Node "${qr.next}"`,
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
// eingebettet ("schreib mir an max@foo.de!"). Gibt null zurück, wenn keine
// drinsteckt — dann behandelt das Frontend die Eingabe als Frage (→ Claude).
export function extractEmail(text: string): string | null {
  const m = text.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
  if (!m) return null;
  return m[0].replace(/[.,;:!?")\]]+$/, "");
}

// Baut die Eröffnungs-Antwort in der gewünschten Sprache (zum Seeden des Chats).
export function openingResponse(locale: Locale): CrewResponse {
  return {
    reply: t(TREE[ROOT_ID].reply, locale),
    state: INITIAL_STATE,
    lead_ready_for_crm: false,
  };
}
