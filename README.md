# Crew · PicYourBoat (Prototyp)

Mobile-first Chat-Web-App. "Crew" ist der digitale Hafen-Buddy, der frisch
eingescannte QR-Code-Besucher anspricht, ihren Status + Pain Point herausfindet
und am Ende die Email für den Early Access einsammelt.

Stack: **Next.js 15 (App Router) · Tailwind v4 · Anthropic SDK (Claude Opus 4.8)**.

## Lokal starten

```bash
npm install
cp .env.local.example .env.local   # ANTHROPIC_API_KEY eintragen
npm run dev
```

→ http://localhost:3000 (am besten in der Mobil-Ansicht der DevTools).

## Wie es funktioniert

- **`app/page.tsx`** — Chat-UI. Hält zwei Verläufe: den sichtbaren Text und die
  Claude-Turns (Assistant-Turns sind der rohe JSON-String, damit das Modell
  seinen `state` über die Turns mitführt). Blendet bei `next_action:
  request_email` ein Email-Feld ein und zeigt optional ein Lead-Status-Panel.
- **`app/api/chat/route.ts`** — Server-Route. Schickt System-Prompt + Verlauf an
  Claude und erzwingt das Antwort-JSON über Structured Outputs
  (`output_config.format`). Gibt das geparste Objekt
  (`reply` / `state` / `lead_ready_for_crm`) zurück.

Der komplette Charakter, die Branching-Logik und die Stop-Bedingungen liegen im
`SYSTEM_PROMPT` in der Route — dort anpassen.

## Auf Vercel deployen

1. Repo zu GitHub pushen, in Vercel importieren (Framework: Next.js, keine
   Sonder-Konfiguration nötig).
2. Environment Variable `ANTHROPIC_API_KEY` im Vercel-Projekt setzen.
3. Deploy.

## Nächste Schritte (bewusst noch offen)

- `lead_ready_for_crm: true` an ein echtes CRM/Sheet/Webhook anbinden
  (aktuell nur im UI-Panel sichtbar).
- Rate-Limiting / Abuse-Schutz auf der Route.
- Antworten streamen (aktuell ein Request pro Turn — bei max. 2 Sätzen okay).
