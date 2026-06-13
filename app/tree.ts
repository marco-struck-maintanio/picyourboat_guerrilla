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
  label: "Was anderes…",
  send: "Was anderes…",
  next: "pain_other",
  patch: { pain_points: ["other"] },
};

export const TREE: Record<string, TreeNode> = {
  // ── Einstieg: Status ─────────────────────────────────────────────────────
  opening: {
    id: "opening",
    reply:
      "Ahoy, Skipper. Frisch eingescannt — bist du gerade selbst auf'm Wasser, am Planen, oder noch am Träumen?",
    nextAction: "ask_status",
    quickReplies: [
      { label: "Auf'm Wasser 🌊", next: "pain_sailing", patch: { status: "sailing_now" } },
      { label: "Am Planen 🗺️", next: "pain_planning", patch: { status: "planning" } },
      { label: "Noch am Träumen 💭", next: "pain_dreaming", patch: { status: "dreaming" } },
      { label: "Ich verchartere selbst ⛵", next: "pain_charterer", patch: { status: "charterer" } },
      { label: "Profi (Schule/Skipper) 🧭", next: "pain_pro", patch: { status: "pro" } },
    ],
  },

  // ── Pain je nach Status ──────────────────────────────────────────────────
  pain_sailing: {
    id: "pain_sailing",
    reply: "Klar, dann kennst du den Steg. Was war bei dem Boot bisher am unangenehmsten?",
    nextAction: "ask_pain",
    quickReplies: [
      { label: "Versteckte Kosten 💸", next: "pitch_hidden_costs", patch: { pain_points: ["hidden_costs"] } },
      { label: "Boot war anders als gezeigt 📸", next: "pitch_boat_mismatch", patch: { pain_points: ["boat_mismatch"] } },
      { label: "Übergabe-Chaos ⚓", next: "pitch_handover", patch: { pain_points: ["handover_chaos"] } },
      { label: "Vercharterer meldet sich nicht 📵", next: "pitch_unresponsive", patch: { pain_points: ["vendor_unresponsive"] } },
      PAIN_OTHER,
    ],
  },

  pain_planning: {
    id: "pain_planning",
    reply: "Gute Phase. Was nervt dich bei der Suche gerade am meisten?",
    nextAction: "ask_pain",
    quickReplies: [
      { label: "Den Bewertungen trau ich nicht 🌟", next: "pitch_fake_reviews", patch: { pain_points: ["fake_reviews"] } },
      { label: "Preise undurchsichtig 💸", next: "pitch_price", patch: { pain_points: ["price"] } },
      { label: "Finde kein passendes Boot ⛵", next: "pitch_boat_mismatch", patch: { pain_points: ["boat_mismatch"] } },
      PAIN_OTHER,
    ],
  },

  pain_dreaming: {
    id: "pain_dreaming",
    reply: "Träumen ist der erste Schlag. Was hält dich noch ab?",
    nextAction: "ask_pain",
    quickReplies: [
      { label: "Preis 💸", next: "pitch_price", patch: { pain_points: ["price"] } },
      { label: "Keine Crew 🧑‍🤝‍🧑", next: "pitch_crew_license", patch: { pain_points: ["no_crew"] } },
      { label: "Kein Skipperschein 🪪", next: "pitch_crew_license", patch: { pain_points: ["no_license"] } },
      PAIN_OTHER,
    ],
  },

  pain_charterer: {
    id: "pain_charterer",
    reply: "Andere Seite des Stegs, willkommen. Was nervt dich an heutigen Bewertungs-Plattformen?",
    nextAction: "ask_pain",
    quickReplies: [
      { label: "Fake-Bewertungen 🌟", next: "pitch_fake_reviews", patch: { pain_points: ["fake_reviews"] } },
      { label: "Plattform-Gebühren zu hoch 💸", next: "pitch_price", patch: { pain_points: ["price"] } },
      { label: "Gäste geben kein Feedback 📵", next: "pitch_unresponsive", patch: { pain_points: ["vendor_unresponsive"] } },
      PAIN_OTHER,
    ],
  },

  pain_pro: {
    id: "pain_pro",
    reply: "Profi an Bord. Was würde dir beim Kundenfeedback am meisten helfen?",
    nextAction: "ask_pain",
    quickReplies: [
      { label: "Ehrliches, verifiziertes Feedback 🌟", next: "pitch_fake_reviews", patch: { pain_points: ["fake_reviews"] } },
      { label: "Weniger Buchungs-Chaos ⚓", next: "pitch_handover", patch: { pain_points: ["handover_chaos"] } },
      PAIN_OTHER,
    ],
  },

  // Freitext-Übergabe an Claude (kein Button → page.tsx schaltet auf Claude um,
  // sobald der User hier tippt).
  pain_other: {
    id: "pain_other",
    reply: "Schieß los — erzähl mir kurz, was war's?",
    nextAction: "ask_pain",
  },

  // ── Pitch + Email-Abfrage (mode "email" → clientseitige Validierung) ──────
  // Jeder Pitch-Node hängt die Email-CTA direkt an, spart einen Klick.
  pitch_hidden_costs: {
    id: "pitch_hidden_costs",
    reply:
      "Das klassische Foul am Ende — Endreinigung, Kaution, Sprit obendrauf. Genau das machen wir vor der Buchung sichtbar. Wirf deine Email rein, dann pingen wir dich zum Alpha-Start.",
    nextAction: "request_email",
    mode: "email",
    patch: { next_action: "request_email", intent_strength: 3 },
    quickReplies: [{ label: "Nee, lass mal 🙏", next: "wrap_up_skip" }],
  },
  pitch_boat_mismatch: {
    id: "pitch_boat_mismatch",
    reply:
      "Hochglanz-Fotos, dann liegt was anderes am Steg — kennen wir. Bei uns zählt nur, was verifizierte Skipper wirklich vorgefunden haben. Wirf deine Email rein, dann melden wir uns zum Alpha-Start.",
    nextAction: "request_email",
    mode: "email",
    patch: { next_action: "request_email", intent_strength: 3 },
    quickReplies: [{ label: "Nee, lass mal 🙏", next: "wrap_up_skip" }],
  },
  pitch_handover: {
    id: "pitch_handover",
    reply:
      "Zwei Stunden am Steg auf die Übergabe warten — genau das soll vorher sichtbar sein, bei wem's rund läuft. Wirf deine Email rein, dann pingen wir dich zum Alpha-Start.",
    nextAction: "request_email",
    mode: "email",
    patch: { next_action: "request_email", intent_strength: 3 },
    quickReplies: [{ label: "Nee, lass mal 🙏", next: "wrap_up_skip" }],
  },
  pitch_unresponsive: {
    id: "pitch_unresponsive",
    reply:
      "Funkstille ist das Schlimmste. Wir zeigen, wer wirklich antwortet — von Leuten, die's erlebt haben. Wirf deine Email rein, dann melden wir uns zum Alpha-Start.",
    nextAction: "request_email",
    mode: "email",
    patch: { next_action: "request_email", intent_strength: 3 },
    quickReplies: [{ label: "Nee, lass mal 🙏", next: "wrap_up_skip" }],
  },
  pitch_fake_reviews: {
    id: "pitch_fake_reviews",
    reply:
      "Genau unser Thema: keine gekauften Sternchen, nur verifizierte Skipper. Trustpilot für Charter-Yachten, ehrlich. Wirf deine Email rein, dann bist du beim Alpha-Start dabei.",
    nextAction: "request_email",
    mode: "email",
    patch: { next_action: "request_email", intent_strength: 4 },
    quickReplies: [{ label: "Nee, lass mal 🙏", next: "wrap_up_skip" }],
  },
  pitch_price: {
    id: "pitch_price",
    reply:
      "Preise ohne Kleingedrucktes — und Bewertungen, die sagen, ob's den Törn wert war. Beides bauen wir. Wirf deine Email rein, dann pingen wir dich zum Alpha-Start.",
    nextAction: "request_email",
    mode: "email",
    patch: { next_action: "request_email", intent_strength: 3 },
    quickReplies: [{ label: "Nee, lass mal 🙏", next: "wrap_up_skip" }],
  },
  pitch_crew_license: {
    id: "pitch_crew_license",
    reply:
      "Verständlich. Wir zeigen dir ehrlich bewertet, wo Einsteiger und Crew-Suchende gut aufgehoben sind. Wirf deine Email rein, dann melden wir uns zum Alpha-Start.",
    nextAction: "request_email",
    mode: "email",
    patch: { next_action: "request_email", intent_strength: 2 },
    quickReplies: [{ label: "Nee, lass mal 🙏", next: "wrap_up_skip" }],
  },

  // Wird gezeigt, wenn die getippte Email nicht plausibel ist.
  email_retry: {
    id: "email_retry",
    reply: "Da fehlt 'n @ oder 'n Punkt — magst du's nochmal tippen?",
    nextAction: "confirm_email",
    mode: "email",
    patch: { next_action: "confirm_email" },
    quickReplies: [{ label: "Lass gut sein 🙏", next: "wrap_up_skip" }],
  },

  // ── Abschluss ────────────────────────────────────────────────────────────
  wrap_up_email: {
    id: "wrap_up_email",
    reply:
      "Bist auf der Liste ⚓ Wer 3 aus seiner Crew mitbringt, kriegt Lifetime-Pro. Bis bald am Steg!",
    nextAction: "wrap_up",
    terminal: true,
    leadReady: true,
    patch: { next_action: "wrap_up", intent_strength: 4 },
  },
  wrap_up_skip: {
    id: "wrap_up_skip",
    reply: "Alles klar, kein Stress. Handbreit Wasser unter'm Kiel ⛵",
    nextAction: "goodbye",
    terminal: true,
    patch: { next_action: "goodbye" },
  },
};

// Ziel-Node nach erfolgreicher Email-Eingabe (konstant, daher hier zentral).
export const EMAIL_SUCCESS_ID = "wrap_up_email";
export const EMAIL_RETRY_ID = "email_retry";

// Sehr lockere Plausibilitätsprüfung — bewusst nur @ + Punkt, wie im Prompt.
export function looksLikeEmail(value: string): boolean {
  const v = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export const OPENING_RESPONSE: CrewResponse = {
  reply: TREE[ROOT_ID].reply,
  state: INITIAL_STATE,
  lead_ready_for_crm: false,
};
