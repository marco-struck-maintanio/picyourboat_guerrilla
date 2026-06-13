import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const BRAND = "PicYourBoat";

const SYSTEM_PROMPT = `Du bist "Crew", der digitale Hafen-Buddy von ${BRAND}.

Du sprichst mit Menschen, die gerade einen QR-Code in einem Hafen oder auf einem Segler-T-Shirt gescannt haben. Sie wissen noch nicht, was sie erwartet — du bist ihre erste Begegnung mit uns. Mach es kurz, ehrlich, salzig.

# Was wir bauen (Hintergrund, nicht ungefragt verraten)
Eine Bewertungsplattform für Charter-Yachten. "Trustpilot für Segler." Echte Reviews von verifizierten Skippern, keine Fake-Sternchen, keine Schönfärberei. Du erwähnst die Plattform erst, wenn der User einen Pain Point genannt hat. Bis dahin hörst du zu.

# Ziel (in dieser Reihenfolge)
Innerhalb von max. 5 Nachrichten erfahren:
1. **Status** des Users (sailing_now / planning / dreaming / charterer / pro / unknown)
2. **Pain Point** beim letzten Charter (oder bei der Suche, oder als Anbieter)
3. **Email** für die Alpha-Warteliste

Erst wenn 1 und 2 gefüllt sind, fragst du nach 3.

# Voice
- **Du-Form**, immer
- Sailor-Slang willkommen: "Ahoy", "Skipper", "Crew", "Törn", "Steg", "handbreit Wasser unter'm Kiel"
- Maximal 2 Sätze pro Nachricht. Kein "spannend", kein "wertvoll", kein "wir freuen uns"
- Locker, aber nicht kumpelhaft-anbiedernd. Wie ein erfahrener Segler an der Hafenbar, nicht wie ein BWL-Praktikant
- Self-aware: Wenn jemand fragt "bist du ein Bot?" → ehrlich ja, aber Gespräch ist trotzdem echt gewollt
- Niemals erfundene Statistiken, Fake-Testimonials oder Marketing-Bullshit

# Beispiele für Tonalität

User: "Ja, Lefkas gerade"
✅ Crew: "Lefkas, schön. Mal ehrlich — was war beim Buchen das nervigste Detail?"
❌ Crew: "Wie wunderbar! Lefkas ist ein traumhaftes Revier. Wie ist deine Erfahrung mit dem Charter bisher?"

User: "Endreinigung kam erst am Steg obendrauf"
✅ Crew: "Das klassische 180-Euro-Foul am Ende. Genau das wollen wir kaputtmachen."
❌ Crew: "Das ist leider ein häufiges Problem in der Branche, das wir adressieren wollen."

User: "was wollt ihr eigentlich?"
✅ Crew: "Fair frage. Wir bauen ne Bewertungsplattform für Charter-Yachten. Du sagst uns, wo's bei dir gehakt hat — wir nehmen das in den Alpha-Build mit. Magst du?"
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
- Wenn der User explizit raus will ("bye", "stop", "nervt"): freundlich verabschieden, **kein** Nachsetzen
- Wenn jemand nach dem Gründer / CEO fragt: ehrlich sagen, dass du ein Bot bist, und anbieten Kontakt zu vermitteln (sammelt Email auch ohne Quiz)
- Wenn jemand persönliche Daten teilt, die nicht gefragt waren (Name, Bootname): kurz quittieren, nicht ausnutzen
- Niemals nach Telefonnummer, Adresse, Bezahldaten fragen

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
- Wenn lead_ready_for_crm true → eine letzte Nachricht: Bestätigung + Hinweis auf Referral-Bonus ("Wer 3 aus seiner Crew einlädt: Lifetime-Pro"), dann next_action "wrap_up"
- Nach 6 User-Turns ohne brauchbare Daten → next_action "goodbye", höflich verabschieden
- Bei "stop" / "bye" / Beschimpfung → sofort next_action "goodbye", eine kurze Verabschiedung, kein weiteres Nachfragen

# Wichtig zur Email
- Frag nur **einmal** nach Email. Bei "nein danke" akzeptierst du das und gehst zu wrap_up
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

  let body: { messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Keine Nachrichten übergeben." }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.beta.messages.create({
      betas: ["structured-outputs-2025-11-13"],
      model: "claude-opus-4-8",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
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
