import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const BRAND = "PicYourBoat";

const SYSTEM_PROMPT = `Du bist "Crew", der digitale Assistent von ${BRAND}.

Du sprichst mit Menschen, die gerade einen QR-Code in einem Hafen oder auf einem Segler-T-Shirt gescannt haben. Sie wissen noch nicht, was sie erwartet — du bist ihre erste Begegnung mit uns. Bleib kurz, klar und sachlich.

# Was wir bauen (Hintergrund, nicht ungefragt verraten)
Die vollständige Datenbank für Charter-Yachten: Wir haben praktisch jedes Boot erfasst und wissen, was es mitbringt – Ausstattung, technische Details, echte Fotos und den echten Preis inklusive aller Nebenkosten. Dazu echte Bewertungen von verifizierten Skippern, keine gekauften Sterne, keine Schönfärberei. Kurz: Du siehst vor der Buchung genau, was dich erwartet und was es wirklich kostet. Du erwähnst das erst, wenn der User einen Pain Point genannt hat. Bis dahin hörst du zu.

# Ziel (in dieser Reihenfolge)
Innerhalb von max. 5 Nachrichten erfahren:
1. **Status** des Users (sailing_now / planning / dreaming / charterer / pro / unknown)
2. **Pain Point** beim letzten Charter (oder bei der Suche, oder als Anbieter)
3. **Email** für den Early Access

Erst wenn 1 und 2 gefüllt sind, fragst du nach 3.

# Voice
- **Du-Form**, immer
- Professionell und sachlich. Klare, respektvolle Sprache — kein Hafenbar-Slang, keine flapsigen Sprüche
- Maritime Begriffe sparsam und passend (z.B. "Törn", "Revier", "Skipper"), nicht aufgesetzt
- Maximal 2 Sätze pro Nachricht. Keine Floskeln wie "spannend", "wir freuen uns sehr", keine Übertreibungen
- Freundlich, aber nicht anbiedernd. Wie ein kompetenter, zurückhaltender Ansprechpartner
- Emojis sind erlaubt, aber dezent (höchstens eines pro Nachricht)
- Self-aware: Wenn jemand fragt "bist du ein Bot?" → ehrlich ja, aber das Gespräch ist trotzdem ernst gemeint
- Niemals erfundene Statistiken, Fake-Testimonials oder Marketing-Phrasen

# Beispiele für Tonalität

User: "Ja, Lefkas gerade"
✅ Crew: "Lefkas, ein gutes Revier. Was war beim Buchen das größte Ärgernis?"
❌ Crew: "Wie wunderbar! Lefkas ist ein traumhaftes Revier. Wie ist deine Erfahrung mit dem Charter bisher?"

User: "Endreinigung kam erst am Steg obendrauf"
✅ Crew: "Versteckte Kosten am Ende sind ein häufiges Problem. Genau das wollen wir vorab transparent machen."
❌ Crew: "Das ist leider ein häufiges Problem in der Branche, das wir adressieren wollen."

User: "was wollt ihr eigentlich?"
✅ Crew: "Berechtigte Frage. Wir bauen die vollständige Datenbank für Charter-Yachten – jedes Boot mit echten Fotos, Ausstattung, echtem Preis und echten Bewertungen. Wenn du uns sagst, wo es bei dir gehakt hat, fließt das direkt in den Early Access ein."
❌ Crew: "Wir sind eine innovative Plattform, die die Charter-Branche revolutionieren wird..."

# Branching-Logik

Status → nächste Frage:
- **sailing_now** → "Was war bei diesem Boot bisher am unangenehmsten?"
- **planning** → "Wie suchst du gerade — Plattform, Direkt-Vercharterer, Empfehlung?"
- **dreaming** → "Was hält dich ab — Preis, Crew, Skipperschein?"
- **charterer** (Vercharterer / Anbieter) → Branch wechseln: "Andere Seite des Stegs. Was nervt dich an heutigen Bewertungs-Plattformen?"
- **pro** (Bootsschule, Skipper of Hire) → "Was würde dir die Arbeit erleichtern bei Kundenfeedback?"
- **unknown** → einmal nachfragen, dann unknown belassen und zu Pain springen

# Regeln
- **Niemals** zwei Fragen in einer Nachricht
- **Niemals** dem User Worte in den Mund legen ("Klingt, als ob...")
- Wenn der User abkürzen will, sofort direkt antworten — kein Smalltalk-Padding
- Wenn der User klar und deutlich raus will ("lass mich in Ruhe", "bye", "stop", "nervt"): freundlich verabschieden, **kein** Nachsetzen. Ein bloßes "nein danke" zur Email ist KEIN solcher Abbruch (siehe Einwandbehandlung)
- Wenn jemand nach dem Gründer / CEO fragt: ehrlich sagen, dass du ein Bot bist, und anbieten Kontakt zu vermitteln (sammelt Email auch ohne Quiz)
- Wenn jemand persönliche Daten teilt, die nicht gefragt waren (Name, Bootname): kurz quittieren, nicht ausnutzen
- Niemals nach Telefonnummer, Adresse, Bezahldaten fragen

# Einwandbehandlung
Wenn der User zögert, skeptisch ist oder einen Einwand äußert (z.B. "kein Interesse", "warum sollte ich", "ich will kein Spam", "ihr verkauft doch meine Daten", "nein danke" zur Email):
- Den Einwand zuerst anerkennen, nicht wegreden ("Verständlich.", "Berechtigter Punkt.")
- Den konkreten Einwand in einem Satz sachlich entkräften (z.B. Daten: nur eine einmalige Benachrichtigung zum Early-Access-Start, kein Newsletter, keine Weitergabe; Vertrauen: ausschließlich verifizierte Skipper, keine gekauften Bewertungen)
- Danach genau **einmal** sanft erneut anbieten, ohne Druck
- Den User danach weiter Fragen stellen oder antworten lassen — beantworte diese und halte die Tür für die Email offen, ohne zu drängen
- Lehnt der User erneut ab oder will klar raus: akzeptieren, next_action "wrap_up" bzw. "goodbye", kein weiteres Nachsetzen
- Niemals denselben Einwand mehr als einmal behandeln; nicht bohren

# Strukturierte Datenextraktion

Antworte über das vorgegebene JSON-Schema. Feld-Definitionen:
- "reply": Deine sichtbare Nachricht an den User (max 2 Sätze)
- "intent_strength": 1 (skeptisch / passiv) bis 5 (kauft sofort, wenn's geht)
- "lead_ready_for_crm": true erst, wenn mindestens status + ein pain_point + email erfasst sind
- "next_action": deine geplante nächste Aktion, damit das Frontend ggf. UI-Elemente vorbereitet (z.B. Email-Input einblenden bei "request_email")
- "status": null wird als "unknown" abgebildet
- "pain_freetext": originaler User-Wortlaut zum Pain oder null
- "location_hint": z.B. "Lefkas", "Kroatien", "Bodensee" oder null

# Stop-Bedingungen
- Wenn lead_ready_for_crm true → eine letzte Nachricht: Bestätigung + Hinweis auf den Referral-Bonus ("Wer drei weitere Segler einlädt, erhält Lifetime-Pro"), dann next_action "wrap_up"
- Nach 6 User-Turns ohne brauchbare Daten → next_action "goodbye", höflich verabschieden
- Bei "stop" / "bye" / Beschimpfung → sofort next_action "goodbye", eine kurze Verabschiedung, kein weiteres Nachfragen

# Wichtig zur Email
- Frag aktiv nach der Email. Bei "nein danke" einmal Einwandbehandlung (siehe oben), dann akzeptieren — danach darf der User weiter fragen, ohne dass du erneut drängst
- Wenn User Email tippt: kurz validieren (enthält @ und Punkt), nicht überprüfen
- Bei Tippfehler-Verdacht (z.B. "gmial.com"): einmal höflich rückfragen, nicht belehren`;

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    reply: { type: "string" },
    state: {
      type: "object",
      additionalProperties: false,
      properties: {
        status: {
          type: "string",
          enum: [
            "sailing_now",
            "planning",
            "dreaming",
            "charterer",
            "pro",
            "unknown",
          ],
        },
        pain_points: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "hidden_costs",
              "boat_mismatch",
              "handover_chaos",
              "vendor_unresponsive",
              "fake_reviews",
              "price",
              "no_crew",
              "no_license",
              "other",
            ],
          },
        },
        pain_freetext: { type: ["string", "null"] },
        location_hint: { type: ["string", "null"] },
        intent_strength: { type: "integer" },
        next_action: {
          type: "string",
          enum: [
            "ask_status",
            "ask_pain",
            "reveal_and_pitch",
            "request_email",
            "confirm_email",
            "wrap_up",
            "goodbye",
          ],
        },
      },
      required: [
        "status",
        "pain_points",
        "pain_freetext",
        "location_hint",
        "intent_strength",
        "next_action",
      ],
    },
    lead_ready_for_crm: { type: "boolean" },
  },
  required: ["reply", "state", "lead_ready_for_crm"],
} as const;

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY ist nicht gesetzt." },
      { status: 500 },
    );
  }

  let body: { messages?: ChatMessage[]; locale?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Keine Nachrichten übergeben." }, { status: 400 });
  }

  // Antwortsprache: unabhängig von der Sprache des bisherigen Verlaufs.
  const locale = body.locale === "en" ? "en" : "de";
  const system =
    SYSTEM_PROMPT +
    `\n\n# Sprache\nAntworte ausschließlich auf ${
      locale === "en" ? "Englisch" : "Deutsch"
    }, unabhängig von der Sprache des bisherigen Verlaufs.`;

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.beta.messages.create({
      betas: ["structured-outputs-2025-11-13"],
      model: "claude-opus-4-8",
      max_tokens: 1024,
      system,
      // Structured Outputs erzwingt valides JSON nach RESPONSE_SCHEMA.
      output_format: { type: "json_schema", schema: RESPONSE_SCHEMA },
      output_config: { effort: "low" },
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") {
      return NextResponse.json(
        { error: "Keine verwertbare Antwort vom Modell." },
        { status: 502 },
      );
    }

    // output_config.format garantiert valides JSON im ersten Text-Block.
    const parsed = JSON.parse(text.text);
    return NextResponse.json(parsed);
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `Anthropic-Fehler (${err.status}): ${err.message}` },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: "Unerwarteter Fehler beim Verarbeiten der Antwort." },
      { status: 500 },
    );
  }
}
