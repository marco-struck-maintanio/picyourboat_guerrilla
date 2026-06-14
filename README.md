# PYB · Pick Your Boat (Prototyp)

Mobile-first Web-App im **Story-Format**: Vollbild-Seiten mit Hero-Fotos führen
frisch eingescannte QR-Code-Besucher durch ein paar Fragen (Status → Pain Point),
zeigen passend dazu, was die ehrliche Charter-Bewertungsplattform leistet, und
sammeln am Ende die Email für den Early Access ein. Zweisprachig (DE/EN).

Stack: **Next.js 15 (App Router) · Tailwind v4 · Anthropic SDK (Claude Opus 4.8)**.

## Lokal starten

```bash
npm install
cp .env.local.example .env.local   # ANTHROPIC_API_KEY eintragen
npm run dev
```

→ http://localhost:3000 (am besten in der Mobil-Ansicht der DevTools).

## Wie es funktioniert

- **`app/tree.json`** — der zweisprachige Antworten-Tree (Inhalte: Fragen,
  Buttons, Pitches, Szenen). Jedes Textfeld ist ein `{ de, en }`-Objekt. Hier
  werden die Inhalte gepflegt.
- **`app/tree.ts`** — lädt `tree.json`, validiert es beim Start (Referenzen,
  zweisprachige Felder) und stellt es typisiert als `TREE` bereit; enthält den
  `t()`-Locale-Helper und `extractEmail()`.
- **`app/page.tsx`** — die Story-UI. Es wird immer **eine** Seite in fester
  Viewport-Höhe gerendert (Intro/Hero → Fragen → Pitch/Email → Abschluss).
  Solange der User auf die Antwort-Buttons tippt, läuft alles clientseitig
  (0 Token); tippt er frei (oder eine Email), übernimmt Claude bzw. der
  Abschluss. Hält parallel den Claude-Verlauf als JSON-Turns, damit das Modell
  beim Übergang den `state` mitführt.
- **`app/messages.ts`** — UI-Strings (DE/EN) außerhalb des Trees.
- **`app/api/chat/route.ts`** — Server-Route. Schickt System-Prompt + Verlauf an
  Claude (mit Sprach-Hinweis je Locale) und erzwingt das Antwort-JSON über
  Structured Outputs. Charakter, Branching-Logik und Stop-Bedingungen liegen im
  `SYSTEM_PROMPT` dort.
- **`app/tree.md`** bzw. `TREE.md` / `scripts/tree-*.mjs` — optionaler
  Excel-Im/Export für den Tree (aktuell auf das einsprachige Altformat
  ausgelegt, daher mit dem `{ de, en }`-Format nicht synchron).

Hintergrund-Fotos liegen in `public/scenes/` (Platzhalter bzw. echte Segelfotos)
und werden pro Node über das `scene`-Feld zugeordnet; Logos unter `public/`.

## Auf Vercel deployen

1. Repo zu GitHub pushen, in Vercel importieren (Framework: Next.js, keine
   Sonder-Konfiguration nötig).
2. Environment Variable `ANTHROPIC_API_KEY` im Vercel-Projekt setzen.
3. Deploy.

## Nächste Schritte (bewusst noch offen)

- `lead_ready_for_crm: true` bzw. die erfasste Email an ein echtes
  CRM/Sheet/Webhook anbinden.
- Rate-Limiting / Abuse-Schutz auf der Route.
- Review-Teaser-Karte vor dem Abschluss („Join the Community").
- Excel-Konverter ans zweisprachige Format anpassen, falls weiter genutzt.
