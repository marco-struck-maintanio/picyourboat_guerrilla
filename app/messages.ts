// UI-Strings (außerhalb des Gesprächs-Trees), zweisprachig.
import type { Locale } from "./tree";

type UIStrings = {
  heroTitle: string;
  begin: string;
  placeholder: string;
  placeholderEmail: string;
  send: string;
  restart: string;
  tapHint: string;
  emailHint: string;
};

const MESSAGES: Record<Locale, UIStrings> = {
  de: {
    heroTitle: "Jede Reise hat ihre Geschichte.",
    begin: "Tippen zum Start",
    placeholder: "Nachricht eingeben…",
    placeholderEmail: "Deine Email oder eine Frage",
    send: "Senden",
    restart: "Neu starten",
    tapHint: "Wähle eine Antwort oder schreib frei",
    emailHint: "Email für den Early Access – oder stell mir eine Frage",
  },
  en: {
    heroTitle: "Every Journey Has a Story.",
    begin: "Tap to begin",
    placeholder: "Type a message…",
    placeholderEmail: "Your email or a question",
    send: "Send",
    restart: "Restart",
    tapHint: "Pick an answer or type freely",
    emailHint: "Email for Early Access – or ask me a question",
  },
};

export function ui(locale: Locale): UIStrings {
  return MESSAGES[locale];
}
