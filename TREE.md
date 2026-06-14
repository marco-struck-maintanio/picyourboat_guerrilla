# Fragenkatalog bearbeiten (`app/tree.json` ⇄ `tree.xlsx`)

Der komplette Gesprächs-Einstieg liegt zweisprachig in
[`app/tree.json`](app/tree.json) und kann als **eine flache Excel-Tabelle**
bearbeitet werden. Die App liest immer nur `tree.json`; `tree.xlsx` ist die
Bearbeitungsoberfläche.

```bash
npm run tree:export   # app/tree.json  →  tree.xlsx  (zum Bearbeiten)
# … tree.xlsx in Excel/Numbers/Google Sheets bearbeiten …
npm run tree:import   # tree.xlsx  →  app/tree.json  (mit Referenz-Prüfung)
```

Beim Import werden alle `next`-Verweise und die Zweisprachigkeit geprüft; ist
etwas kaputt, bricht das Skript ab und überschreibt `tree.json` **nicht**.

## Die Tabelle „Tree" (ein Blatt, flach)

Jede Zeile ist **entweder eine Seite/Frage oder eine Antwort** — verbunden über
die **`page`-ID**. Eine Seite steht zuerst, darunter ihre Antwortzeilen.

| Spalte | gilt für | Bedeutung |
|---|---|---|
| `page` | beide | Seiten-ID. Auf Antwortzeilen **dieselbe** ID wie die Frage. |
| `scene` | Seite | Hintergrundbild aus `public/scenes` (ohne `.jpg`). |
| `flags` | Seite | Komma-/Leerzeichen-Liste: `root`, `email`, `terminal`, `leadReady`, `emailSuccess`. |
| `nextAction` | Seite | Status-Marker (s. u.). |
| `question_de` / `question_en` | Seite | Die Frage (beide Sprachen). |
| `answer_de` / `answer_en` | Antwort | Button-Text (beide Sprachen). |
| `next` | Antwort | ID der Folge-Seite. |
| `set_status` | Antwort | setzt den Status (s. u.). |
| `set_pain` | Antwort | setzt Pain-Point(s), mehrere mit Komma. |
| `set_intent` | Antwort **oder** Seite | Intent 1–5. |

**Zeilen-Regel:** Ist `question_de`/`question_en` gefüllt → Seiten-Zeile.
Ist `answer_de` gefüllt → Antwort-Zeile (für die `page` darüber). Eine
Seite ohne Antwortzeilen ist ein reiner Freitext-Schritt (Eingabe → Claude).

### `flags`

- `root` – Startseite des Gesprächs.
- `email` – auf dieser Seite wird eine getippte Email erkannt (Abschluss).
- `terminal` – abschließende Seite.
- `leadReady` – Lead gilt als CRM-bereit.
- `emailSuccess` – Zielseite nach erfolgreicher Email-Eingabe.

### Erlaubte Werte

- `nextAction` / Status-Marker: `ask_status` · `ask_pain` · `reveal_and_pitch` ·
  `request_email` · `confirm_email` · `wrap_up` · `goodbye`
- `set_status`: `sailing_now` · `planning` · `dreaming` · `charterer` · `pro` · `unknown`
- `set_pain`: `hidden_costs` · `boat_mismatch` · `handover_chaos` ·
  `vendor_unresponsive` · `fake_reviews` · `price` · `no_crew` · `no_license` · `other`

Für `nextAction`, `next`, `set_status`, `set_pain`, `set_intent` gibt es
Dropdowns (Vorschläge; eigene/neue Werte bleiben erlaubt).

## Beispiel: neuen Pain-Zweig hinzufügen

1. In der passenden `pain_*`-Seite eine **Antwort-Zeile** ergänzen:
   `page=pain_sailing`, `answer_de=Versicherung unklar 🛟`,
   `answer_en=Insurance unclear 🛟`, `next=pitch_insurance`, `set_pain=other`.
2. Eine neue **Seiten-Zeile** anlegen: `page=pitch_insurance`, `scene=bay`,
   `flags=email`, `nextAction=request_email`, `set_intent=3`,
   `question_de/en=…kurzer Pitch…`.
3. `npm run tree:import`. Zeigt ein `next` ins Leere, meldet das Skript
   `… verweist auf unbekannte Seite "…"` und schreibt nicht.

## Hinweise

- **Reine Inhalte** gehören in die Tabelle. Die *Logik* (Email-Erkennung,
  Claude-Übergabe, feste Viewport-Seiten) bleibt im Code.
- Beim Import wird `tree.json` neu formatiert (das ist gewollt und stabil).
