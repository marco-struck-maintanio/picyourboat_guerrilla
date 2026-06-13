"use client";

import { useEffect, useRef, useState } from "react";
import {
  CrewResponse,
  EMAIL_SUCCESS_ID,
  extractEmail,
  LeadState,
  OPENING_RESPONSE,
  QuickReply,
  ROOT_ID,
  TREE,
  TreeNode,
} from "./tree";

type DisplayMessage = {
  role: "user" | "assistant";
  text: string;
};

// Claude-Turns: Assistant-Inhalte sind der rohe JSON-String, damit das Modell
// seinen eigenen State über die Turns hinweg mitführt. Die Tree-Schritte
// schreiben in dasselbe Format, damit Claude beim Übergang nahtlos weitermacht.
type ApiMessage = { role: "user" | "assistant"; content: string };

const STATUS_LABEL: Record<LeadState["status"], string> = {
  sailing_now: "Gerade an Bord",
  planning: "Am Planen",
  dreaming: "Am Träumen",
  charterer: "Vercharterer",
  pro: "Profi",
  unknown: "Noch offen",
};

export default function Home() {
  const [display, setDisplay] = useState<DisplayMessage[]>([
    { role: "assistant", text: OPENING_RESPONSE.reply },
  ]);
  const [history, setHistory] = useState<ApiMessage[]>([
    { role: "assistant", content: JSON.stringify(OPENING_RESPONSE) },
  ]);
  const [state, setState] = useState<LeadState>(OPENING_RESPONSE.state);
  const [leadReady, setLeadReady] = useState(false);
  // Aus dem Freitext ausgewertete Email-Adresse (für Status/CRM).
  const [capturedEmail, setCapturedEmail] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showStatus, setShowStatus] = useState(false);

  // "tree" = Buttons, 0 Token. "claude" = Freitext geht an die Route.
  const [mode, setMode] = useState<"tree" | "claude">("tree");
  const [nodeId, setNodeId] = useState<string>(ROOT_ID);
  // Künstliche "Crew denkt"-Pause zwischen Tree-Schritten, damit es nicht zu
  // schnell durchrauscht (im Claude-Modus reicht die Netzwerk-Latenz).
  const [thinking, setThinking] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const node: TreeNode | null = mode === "tree" ? TREE[nodeId] : null;

  // "wrappedUp" = es gab eine abschließende Nachricht. Wichtig: das beendet den
  // Chat NICHT — die Eingabe bleibt offen, wir gehen immer davon aus, dass der
  // User noch antworten oder fragen möchte. Es blendet nur die Buttons aus.
  const wrappedUp =
    (mode === "tree" && !!node?.terminal) ||
    (mode === "claude" && state.next_action === "goodbye");

  // Buttons nur im Tree-Modus, solange der Node welche hat, kein Abschluss und
  // Crew gerade nicht "denkt".
  const quickReplies =
    mode === "tree" && !wrappedUp && !thinking
      ? (node?.quickReplies ?? null)
      : null;

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [display, loading, thinking, quickReplies]);

  // Pausenlänge grob an der Antwortlänge orientiert (kurze Reaktion = kurz,
  // langer Pitch = etwas länger), gedeckelt, damit's nie nervt.
  function thinkDelay(reply: string): number {
    return Math.min(1400, 550 + reply.length * 12);
  }

  // Schreibt einen Tree-Übergang in alle Verläufe: User-Bubble (sofern vorhanden),
  // Crew-Bubble des Ziel-Nodes und den State. Hält history im Claude-JSON-Format,
  // damit ein späterer Freitext-Turn nahtlos übergeben werden kann.
  function applyNode(
    target: TreeNode,
    userText: string | null,
    patch: Partial<LeadState> | undefined,
  ) {
    const nextState: LeadState = {
      ...state,
      ...patch,
      ...target.patch,
      next_action: target.nextAction,
    };
    const ready = target.leadReady ?? leadReady;
    const crew: CrewResponse = {
      reply: target.reply,
      state: nextState,
      lead_ready_for_crm: ready,
    };

    // Phase 1: User-Bubble sofort zeigen, dann "Crew denkt".
    if (userText) {
      setDisplay((d) => [...d, { role: "user", text: userText }]);
      setHistory((h) => [...h, { role: "user", content: userText }]);
    }
    setError(null);
    setThinking(true);

    // Phase 2: nach kurzer Pause die Crew-Antwort + State nachziehen.
    window.setTimeout(() => {
      setDisplay((d) => [...d, { role: "assistant", text: target.reply }]);
      setHistory((h) => [
        ...h,
        { role: "assistant", content: JSON.stringify(crew) },
      ]);
      setState(nextState);
      setLeadReady(ready);
      setNodeId(target.id);
      setThinking(false);

      if (target.mode === "email") {
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    }, thinkDelay(target.reply));
  }

  function onQuickReply(qr: QuickReply) {
    if (loading || thinking) return;
    const target = TREE[qr.next];
    if (!target) return;
    applyNode(target, qr.send ?? qr.label, qr.patch);
  }

  // Freitext im Tree-Modus → ab hier übernimmt Claude (mit vollem State im
  // letzten Assistant-Turn). Im Claude-Modus normaler Folge-Turn.
  async function sendToClaude(text: string) {
    // Auch wenn Claude den Turn übernimmt: eine mitgeschickte Email auswerten.
    const maybeEmail = extractEmail(text);
    if (maybeEmail) setCapturedEmail(maybeEmail);

    const userApi: ApiMessage = { role: "user", content: text };
    const nextHistory = [...history, userApi];

    setDisplay((d) => [...d, { role: "user", text }]);
    setHistory(nextHistory);
    setMode("claude");
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextHistory }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error ?? "Da ist was über Bord gegangen.");
      }

      const crew = data as CrewResponse;
      setDisplay((d) => [...d, { role: "assistant", text: crew.reply }]);
      setHistory((h) => [
        ...h,
        { role: "assistant", content: JSON.stringify(crew) },
      ]);
      setState(crew.state);
      setLeadReady(crew.lead_ready_for_crm);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler.");
    } finally {
      setLoading(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function send() {
    const text = input.trim();
    // Kein Abbruch nach einem Abschluss: der Chat bleibt immer offen, wir gehen
    // davon aus, dass der User noch antworten oder fragen möchte.
    if (!text || loading || thinking) return;
    setInput("");

    // Steckt im Tree-Schritt eine Email im Text, ziehen wir sie token-frei raus
    // und schließen ab. Alles andere ist eine normale Antwort/Frage → Claude.
    // Wir drängen nie auf eine Email; sie wird nur erkannt, wenn sie dasteht.
    if (mode === "tree" && node?.mode === "email") {
      const email = extractEmail(text);
      if (email) {
        setCapturedEmail(email);
        applyNode(TREE[EMAIL_SUCCESS_ID], text, undefined);
        return;
      }
    }

    sendToClaude(text);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="mx-auto flex h-[100dvh] max-w-md flex-col">
      {/* Kopf */}
      <header className="flex items-center gap-3 px-5 pb-3 pt-[max(0.9rem,env(safe-area-inset-top))]">
        <img
          src="/logo.png"
          alt="PicYourBoat"
          className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-rope/40"
        />
        <div className="leading-tight">
          <div className="font-display text-lg font-semibold text-sand">
            Crew
          </div>
          <div className="text-xs text-foam/55">
            dein Assistent · PicYourBoat
          </div>
        </div>
        <button
          onClick={() => setShowStatus((s) => !s)}
          className="ml-auto rounded-full px-3 py-1 text-[11px] font-medium text-foam/60 ring-1 ring-foam/15 transition hover:text-sand hover:ring-foam/30"
        >
          {showStatus ? "Schließen" : "Lead-Status"}
        </button>
      </header>

      {showStatus && (
        <StatusPanel state={state} leadReady={leadReady} email={capturedEmail} />
      )}

      {/* Verlauf */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto px-4 py-3"
      >
        {display.map((m, i) => (
          <Bubble key={i} role={m.role} text={m.text} />
        ))}

        {(loading || thinking) && <TypingBubble />}

        {error && (
          <div className="animate-surface mx-auto max-w-[85%] rounded-2xl bg-red-900/40 px-4 py-2.5 text-center text-sm text-red-100 ring-1 ring-red-400/30">
            {error}
          </div>
        )}
      </div>

      {/* Eingabe */}
      <div className="border-t border-foam/10 bg-hull-deep/40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        {/* Vorgefertigte Antworten — 0 Token, kein Claude-Call */}
        {quickReplies && (
          <div className="mb-3 flex flex-wrap gap-2">
            {quickReplies.map((qr) => (
              <button
                key={qr.next + qr.label}
                onClick={() => onQuickReply(qr)}
                disabled={loading}
                className="animate-surface rounded-full bg-foam/10 px-3.5 py-2 text-[13px] font-medium text-sand ring-1 ring-foam/15 transition hover:bg-rope/20 hover:ring-rope/50 active:scale-95 disabled:opacity-40"
              >
                {qr.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={loading || thinking}
            type="text"
            inputMode="text"
            autoComplete="off"
            placeholder={
              quickReplies ? "…oder frei formulieren" : "Nachricht eingeben…"
            }
            className="min-w-0 flex-1 rounded-2xl bg-foam/10 px-4 py-3 text-[15px] text-sand placeholder:text-foam/35 outline-none ring-1 ring-foam/15 transition focus:ring-rope/60 disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={loading || thinking || !input.trim()}
            aria-label="Senden"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rope text-hull-deep transition hover:bg-rope-dark active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 2 11 13" />
              <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function Bubble({ role, text }: DisplayMessage) {
  const isUser = role === "user";
  return (
    <div
      className={`animate-surface flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-[15px] leading-snug ${
          isUser
            ? "rounded-br-md bg-rope text-hull-deep"
            : "rounded-bl-md bg-foam/10 text-sand ring-1 ring-foam/10"
        }`}
      >
        {text}
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="animate-surface flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-foam/10 px-4 py-3 ring-1 ring-foam/10">
        <span className="dot h-1.5 w-1.5 rounded-full bg-foam/70" />
        <span className="dot h-1.5 w-1.5 rounded-full bg-foam/70" />
        <span className="dot h-1.5 w-1.5 rounded-full bg-foam/70" />
      </div>
    </div>
  );
}

function StatusPanel({
  state,
  leadReady,
  email,
}: {
  state: LeadState;
  leadReady: boolean;
  email: string | null;
}) {
  return (
    <div className="animate-surface mx-4 mb-1 rounded-xl bg-hull-deep/50 p-3 text-xs ring-1 ring-foam/10">
      <Row label="Status" value={STATUS_LABEL[state.status]} />
      <Row
        label="Pain"
        value={
          state.pain_points.length
            ? state.pain_points.join(", ")
            : "—"
        }
      />
      <Row label="O-Ton" value={state.pain_freetext ?? "—"} />
      <Row label="Revier" value={state.location_hint ?? "—"} />
      <Row label="Email" value={email ?? "—"} />
      <Row label="Intent" value={"★".repeat(state.intent_strength) || "—"} />
      <Row label="Next" value={state.next_action} />
      <div className="mt-2 flex items-center gap-2 border-t border-foam/10 pt-2">
        <span
          className={`h-2 w-2 rounded-full ${leadReady ? "bg-emerald-400" : "bg-foam/30"}`}
        />
        <span className={leadReady ? "text-emerald-300" : "text-foam/50"}>
          {leadReady ? "Lead bereit für CRM" : "Lead noch unvollständig"}
        </span>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 py-0.5">
      <span className="w-14 shrink-0 text-foam/40">{label}</span>
      <span className="min-w-0 flex-1 truncate text-sand/90">{value}</span>
    </div>
  );
}
