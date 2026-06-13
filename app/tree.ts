// Deterministischer Antworten-Tree für den Einstieg.
//
// Solange der User auf Buttons klickt, läuft die komplette Qualifizierung
// (Status → Pain → Pitch → Email) clientseitig ab — KEIN Anthropic-Call, also
// 0 Token. Erst wenn jemand frei tippt statt klickt, übernimmt Claude
// (siehe page.tsx → mode "claude"). Die Email wird ebenfalls hier validiert.
//
// Die Typen spiegeln das RESPONSE_SCHEMA aus app/api/chat/route.ts, damit der
// Übergang an Claude nahtlos ist: jeder Tree-Schritt schreibt denselben State,
// den Claude im letzten Assistant-Turn als JSON wiederfindet.

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

export const ROOT_ID = "opening";

export const INITIAL_STATE: LeadState = {
  status: "unknown",
  pain_points: [],
  pain_freetext: null,
  location_hint: null,
  intent_strength: 1,
  next_action: "ask_status",
};

// Gemeinsame "Was anderes…"-Option: führt in einen Freitext-Schritt, den dann
// Claude übernimmt.
const PAIN_OTHER: QuickReply = {
  label: "Etwas anderes…",
  send: "Etwas anderes…",
  next: "pain_other",
  patch: { pain_points: ["other"] },
};

export const TREE: Record<string, TreeNode> = {
  // ── Einstieg: Status ─────────────────────────────────────────────────────
  opening: {
    id: "opening",
    reply:
      "Willkommen bei PicYourBoat. Damit ich dich richtig einordnen kann: Bist du gerade selbst auf dem Wasser, in der Planung oder noch am Überlegen?",
    nextAction: "ask_status",
    quickReplies: [
      { label: "Auf dem Wasser 🌊", next: "pain_sailing", patch: { status: "sailing_now" } },
      { label: "In der Planung 🗺️", next: "pain_planning", patch: { status: "planning" } },
      { label: "Noch am Überlegen 💭", next: "pain_dreaming", patch: { status: "dreaming" } },
      { label: "Ich verchartere selbst ⛵", next: "pain_charterer", patch: { status: "charterer" } },
      { label: "Profi (Schule/Skipper) 🧭", next: "pain_pro", patch: { status: "pro" } },
    ],
  },

  // ── Pain je nach Status ──────────────────────────────────────────────────
  pain_sailing: {
    id: "pain_sailing",
    reply: "Dann kennst du den Ablauf. Was war bei diesem Boot bisher das größte Ärgernis?",
    nextAction: "ask_pain",
    quickReplies: [
      { label: "Versteckte Kosten 💸", next: "pitch_hidden_costs", patch: { pain_points: ["hidden_costs"] } },
      { label: "Boot wich von den Fotos ab 📸", next: "pitch_boat_mismatch", patch: { pain_points: ["boat_mismatch"] } },
      { label: "Probleme bei der Übergabe ⚓", next: "pitch_handover", patch: { pain_points: ["handover_chaos"] } },
      { label: "Vercharterer schlecht erreichbar 📵", next: "pitch_unresponsive", patch: { pain_points: ["vendor_unresponsive"] } },
      PAIN_OTHER,
    ],
  },

  pain_planning: {
    id: "pain_planning",
    reply: "Eine gute Phase für verlässliche Informationen. Was ist bei der Suche aktuell das größte Problem?",
    nextAction: "ask_pain",
    quickReplies: [
      { label: "Ich traue den Bewertungen nicht 🌟", next: "pitch_fake_reviews", patch: { pain_points: ["fake_reviews"] } },
      { label: "Preise sind intransparent 💸", next: "pitch_price", patch: { pain_points: ["price"] } },
      { label: "Finde kein passendes Boot ⛵", next: "pitch_boat_mismatch", patch: { pain_points: ["boat_mismatch"] } },
      PAIN_OTHER,
    ],
  },

  pain_dreaming: {
    id: "pain_dreaming",
    reply: "Verständlich. Was hält dich aktuell noch ab?",
    nextAction: "ask_pain",
    quickReplies: [
      { label: "Der Preis 💸", next: "pitch_price", patch: { pain_points: ["price"] } },
      { label: "Fehlende Crew 🧑‍🤝‍🧑", next: "pitch_crew_license", patch: { pain_points: ["no_crew"] } },
      { label: "Kein Skipperschein 🪪", next: "pitch_crew_license", patch: { pain_points: ["no_license"] } },
      PAIN_OTHER,
    ],
  },

  pain_charterer: {
    id: "pain_charterer",
    reply: "Die Anbieter-Perspektive interessiert uns besonders. Was stört dich an den heutigen Bewertungsplattformen?",
    nextAction: "ask_pain",
    quickReplies: [
      { label: "Fake-Bewertungen 🌟", next: "pitch_fake_reviews", patch: { pain_points: ["fake_reviews"] } },
      { label: "Zu hohe Plattform-Gebühren 💸", next: "pitch_price", patch: { pain_points: ["price"] } },
      { label: "Gäste geben kaum Feedback 📵", next: "pitch_unresponsive", patch: { pain_points: ["vendor_unresponsive"] } },
      PAIN_OTHER,
    ],
  },

  pain_pro: {
    id: "pain_pro",
    reply: "Als Profi hast du den besten Blick darauf. Was würde dir beim Kundenfeedback am meisten helfen?",
    nextAction: "ask_pain",
    quickReplies: [
      { label: "Ehrliches, verifiziertes Feedback 🌟", next: "pitch_fake_reviews", patch: { pain_points: ["fake_reviews"] } },
      { label: "Weniger Aufwand bei Buchungen ⚓", next: "pitch_handover", patch: { pain_points: ["handover_chaos"] } },
      PAIN_OTHER,
    ],
  },

  // Freitext-Übergabe an Claude (kein Button → page.tsx schaltet auf Claude um,
  // sobald der User hier tippt).
  pain_other: {
    id: "pain_other",
    reply: "Erzähl mir gern, worum es konkret geht.",
    nextAction: "ask_pain",
  },

  // ── Pitch + Email-Abfrage (mode "email" → clientseitige Validierung) ──────
  // Jeder Pitch-Node hängt die Email-CTA direkt an, spart einen Klick.
  pitch_hidden_costs: {
    id: "pitch_hidden_costs",
    reply:
      "Versteckte Kosten wie Endreinigung, Kaution oder Sprit, die erst am Ende auftauchen, sind ein häufiges Ärgernis. Genau diese Punkte machen wir vor der Buchung transparent. Hinterlasse mir gern deine Email, dann informieren wir dich zum Start der Alpha-Phase.",
    nextAction: "request_email",
    mode: "email",
    patch: { next_action: "request_email", intent_strength: 3 },
    quickReplies: [{ label: "Nein, danke 🙏", next: "email_decline" }],
  },
  pitch_boat_mismatch: {
    id: "pitch_boat_mismatch",
    reply:
      "Wenn das Boot von den Fotos abweicht, hilft nur ehrliche Erfahrung. Bei uns zählt ausschließlich, was verifizierte Skipper tatsächlich vorgefunden haben. Hinterlasse mir gern deine Email, dann melden wir uns zum Start der Alpha-Phase.",
    nextAction: "request_email",
    mode: "email",
    patch: { next_action: "request_email", intent_strength: 3 },
    quickReplies: [{ label: "Nein, danke 🙏", next: "email_decline" }],
  },
  pitch_handover: {
    id: "pitch_handover",
    reply:
      "Eine reibungslose Übergabe macht einen großen Unterschied. Echte Bewertungen zeigen vorab, bei welchen Anbietern das zuverlässig funktioniert. Hinterlasse mir gern deine Email, dann informieren wir dich zum Start der Alpha-Phase.",
    nextAction: "request_email",
    mode: "email",
    patch: { next_action: "request_email", intent_strength: 3 },
    quickReplies: [{ label: "Nein, danke 🙏", next: "email_decline" }],
  },
  pitch_unresponsive: {
    id: "pitch_unresponsive",
    reply:
      "Eine schlechte Erreichbarkeit des Vercharterers ist ein klares Warnsignal. Wir machen sichtbar, wer zuverlässig reagiert – bewertet von Skippern, die es selbst erlebt haben. Hinterlasse mir gern deine Email, dann melden wir uns zum Start der Alpha-Phase.",
    nextAction: "request_email",
    mode: "email",
    patch: { next_action: "request_email", intent_strength: 3 },
    quickReplies: [{ label: "Nein, danke 🙏", next: "email_decline" }],
  },
  pitch_fake_reviews: {
    id: "pitch_fake_reviews",
    reply:
      "Das ist unser Kernthema: keine gekauften Bewertungen, sondern ausschließlich verifizierte Skipper – eine unabhängige Bewertungsplattform für Charter-Yachten. Hinterlasse mir gern deine Email, dann bist du beim Start der Alpha-Phase dabei.",
    nextAction: "request_email",
    mode: "email",
    patch: { next_action: "request_email", intent_strength: 4 },
    quickReplies: [{ label: "Nein, danke 🙏", next: "email_decline" }],
  },
  pitch_price: {
    id: "pitch_price",
    reply:
      "Transparente Preise ohne Kleingedrucktes und Bewertungen, die zeigen, ob sich der Törn gelohnt hat – beides bauen wir auf. Hinterlasse mir gern deine Email, dann informieren wir dich zum Start der Alpha-Phase.",
    nextAction: "request_email",
    mode: "email",
    patch: { next_action: "request_email", intent_strength: 3 },
    quickReplies: [{ label: "Nein, danke 🙏", next: "email_decline" }],
  },
  pitch_crew_license: {
    id: "pitch_crew_license",
    reply:
      "Verständlich. Anhand ehrlicher Bewertungen zeigen wir dir, wo Einsteiger und Crew-Suchende gut aufgehoben sind. Hinterlasse mir gern deine Email, dann melden wir uns zum Start der Alpha-Phase.",
    nextAction: "request_email",
    mode: "email",
    patch: { next_action: "request_email", intent_strength: 2 },
    quickReplies: [{ label: "Nein, danke 🙏", next: "email_decline" }],
  },

  // ── Abschluss ────────────────────────────────────────────────────────────
  wrap_up_email: {
    id: "wrap_up_email",
    reply:
      "Vielen Dank – du stehst auf der Liste ⚓ Wer drei weitere Segler einlädt, erhält Lifetime-Pro. Wir melden uns zum Start der Alpha-Phase.",
    nextAction: "wrap_up",
    terminal: true,
    leadReady: true,
    patch: { next_action: "wrap_up", intent_strength: 4 },
  },
  // Einwandbehandlung: kein Sackgassen-Ende. Wert einmal sachlich einordnen,
  // Tür offen lassen (Eingabe bleibt aktiv) — der User kann weiter fragen, doch
  // noch eine Email dalassen oder das Gespräch bewusst beenden.
  email_decline: {
    id: "email_decline",
    reply:
      "Kein Problem, ich dränge dich nicht. Wir würden uns nur einmal zum Start der Alpha-Phase melden – kein Newsletter, kein Spam. Wenn du magst, beantworte ich dir vorher noch offene Fragen, oder du hinterlässt deine Email doch noch.",
    nextAction: "request_email",
    mode: "email",
    patch: { next_action: "request_email" },
    quickReplies: [{ label: "Nein, das war's 🙏", next: "goodbye_final" }],
  },

  goodbye_final: {
    id: "goodbye_final",
    reply: "Alles klar. Vielen Dank für deine Zeit und allzeit gute Fahrt ⛵",
    nextAction: "goodbye",
    terminal: true,
    patch: { next_action: "goodbye" },
  },
};

// Ziel-Node nach erfolgreicher Email-Eingabe (konstant, daher hier zentral).
export const EMAIL_SUCCESS_ID = "wrap_up_email";

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
