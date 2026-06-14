# Antworten-Tree bearbeiten (`app/tree.json`)

Der komplette token-freie Gesprächs-Einstieg (Status → Pain → Pitch → Email)
liegt als **bearbeitbare JSON** in [`app/tree.json`](app/tree.json). Du kannst
sie exportieren/kopieren, in einem Editor oder Tool ändern und wieder
zurücklegen. Beim Start lädt [`app/tree.ts`](app/tree.ts) die Datei, **prüft
alle Verweise** und stellt sie der App bereit. Ein Tippfehler (z. B. ein Button,
der ins Leere zeigt) bricht sofort mit einer klaren Meldung ab, statt still
falsch zu laufen.

> Nach dem Bearbeiten: Dev-Server neu laden (`npm run dev`) bzw. neu bauen.

## Bearbeiten in Excel (optional)

Wer lieber in einer Tabelle arbeitet, kann den Tree als Excel bearbeiten. Die
Konvertierung läuft als Build-/CLI-Skript — **nicht in der App** (die liest
weiterhin nur `tree.json`):

```bash
npm run tree:export   # app/tree.json  →  tree.xlsx  (zum Bearbeiten)
# … tree.xlsx in Excel/Numbers/Google Sheets bearbeiten …
npm run tree:import   # tree.xlsx  →  app/tree.json  (mit Referenz-Prüfung)
```

`tree.json` bleibt die maßgebliche Quelle. Beim Import werden alle `next`-Verweise
geprüft; ist etwas kaputt, bricht das Skript ab und überschreibt `tree.json`
**nicht**.

Die Mappe hat vier Blätter:

- **Config** – `root` und `emailSuccessNode` (Schlüssel/Wert).
- **Nodes** – ein Schritt pro Zeile: `id`, `reply`, `nextAction`, `mode`,
  `terminal`, `leadReady`, `patch_next_action`, `patch_intent`.
- **Buttons** – ein Button pro Zeile: `node` (zu welchem Schritt), `label`,
  `send`, `next`, `set_status`, `set_pain`, `set_intent`, `set_next_action`.
  **Die Reihenfolge der Zeilen je `node` = die Reihenfolge im Chat.**
- **Lists** – versteckt, liefert nur die Dropdown-Werte.

Für `nextAction`, `mode`, `status`, `pain`, `next` etc. gibt es **Dropdowns**,
damit keine Tippfehler bei den festen Werten entstehen. Mehrere Pains in einem
Button: in `set_pain` mit Komma trennen (`no_crew,price`).

## Aufbau

```jsonc
{
  "root": "opening",              // mit diesem Node startet das Gespräch
  "emailSuccessNode": "wrap_up_email", // Node nach erfolgreicher Email-Eingabe
  "nodes": {
    "<node-id>": { ...Node... },  // der KEY ist die ID; "next" referenziert ihn
    ...
  }
}
```

### Ein Node

| Feld          | Pflicht | Bedeutung |
|---------------|:------:|-----------|
| `reply`       |  ✅    | Die sichtbare Crew-Nachricht (Bubble). |
| `nextAction`  |  ✅    | Status-Marker (s. u.) — landet im Lead-Status. |
| `quickReplies`|  –     | Liste von Buttons. Fehlt sie, ist es ein reiner Freitext-Schritt (Eingabe geht an Claude). |
| `mode`        |  –     | `"email"` = an dieser Stelle wird eine getippte Email erkannt und token-frei erfasst. |
| `terminal`    |  –     | `true` = abschließende Nachricht (blendet Buttons aus; der Chat bleibt trotzdem offen). |
| `leadReady`   |  –     | `true` = Lead gilt als CRM-bereit (z. B. nach Email). |
| `patch`       |  –     | Schreibt Felder in den Lead-State beim Betreten des Nodes (s. u.). |

> Das `id`-Feld wird **nicht** in die JSON geschrieben — die ID ist der Key
> unter `nodes`.

### Ein Button (`quickReplies[]`)

| Feld    | Pflicht | Bedeutung |
|---------|:------:|-----------|
| `label` |  ✅    | Beschriftung des Buttons (Emojis erlaubt). |
| `next`  |  ✅    | ID des Folge-Nodes (muss unter `nodes` existieren). |
| `send`  |  –     | Text, der als User-Bubble erscheint. Default: `label`. |
| `patch` |  –     | Schreibt Felder in den Lead-State, wenn der Button geklickt wird. |

### `patch` — erlaubte Felder

`patch` setzt Teile des Lead-States. Nutze nur diese Felder/Werte:

- `status`: `sailing_now` · `planning` · `dreaming` · `charterer` · `pro` · `unknown`
- `pain_points`: Liste aus `hidden_costs` · `boat_mismatch` · `handover_chaos` · `vendor_unresponsive` · `fake_reviews` · `price` · `no_crew` · `no_license` · `other`
- `intent_strength`: Zahl `1`–`5`
- `pain_freetext`: Text oder `null`
- `location_hint`: Text (z. B. `"Kroatien"`) oder `null`
- `next_action`: wie `nextAction` (s. u.)

### `nextAction` / `next_action` — erlaubte Werte

`ask_status` · `ask_pain` · `reveal_and_pitch` · `request_email` ·
`confirm_email` · `wrap_up` · `goodbye`

## Beispiel: neuen Pain-Zweig hinzufügen

1. In der passenden `pain_*`-Node einen Button ergänzen:
   ```json
   { "label": "Versicherung unklar 🛟", "next": "pitch_insurance",
     "patch": { "pain_points": ["other"] } }
   ```
2. Einen neuen Pitch-Node anlegen:
   ```json
   "pitch_insurance": {
     "reply": "… kurzer Pitch … Hinterlasse mir gern deine Email, dann sichern wir dir den Early Access.",
     "nextAction": "request_email",
     "mode": "email",
     "patch": { "next_action": "request_email", "intent_strength": 3 },
     "quickReplies": [{ "label": "Nein, danke 🙏", "next": "email_decline" }]
   }
   ```
3. Speichern, neu laden. Zeigt ein `next` ins Leere, meldet der Start sofort
   `tree.json ist ungültig: … verweist auf unbekannten Node "…"`.

## Hinweise

- **Reine Inhalte** gehören in die JSON. Die *Logik* (Email-Erkennung,
  Claude-Übergabe, Denkpause) bleibt im Code.
- Freitext-Schritt = Node **ohne** `quickReplies`: sobald der User tippt,
  übernimmt Claude mit dem bis dahin gesammelten State.
- JSON kennt keine Kommentare — Notizen ggf. hier in `TREE.md` festhalten.
