"use client";

import { useEffect, useRef, useState } from "react";

type LeadState = {
  status:
    | "sailing_now"
    | "planning"
    | "dreaming"
    | "charterer"
    | "pro"
    | "unknown";
  pain_points: string[];
  pain_freetext: string | null;
  location_hint: string | null;
  intent_strength: number;
  next_action:
    | "ask_status"
    | "ask_pain"
    | "reveal_and_pitch"
    | "request_email"
    | "confirm_email"
    | "wrap_up"
    | "goodbye";
};

type CrewResponse = {
  reply: string;
  state: LeadState;
  lead_ready_for_crm: boolean;
};

type DisplayMessage = {
  role: "user" | "assistant";
  text: string;
};

// Claude-Turns: Assistant-Inhalte sind der rohe JSON-String, damit das Modell
// seinen eigenen State über die Turns hinweg mitführt.
type ApiMessage = { role: "user" | "assistant"; content: string };

const OPENING: CrewResponse = {
  reply:
    "Ahoy, Skipper. Frisch eingescannt — bist du gerade selbst auf'm Wasser, am Planen, oder noch am Träumen?",
  state: {
    status: "unknown",
    pain_points: [],
    pain_freetext: null,
    location_hint: null,
    intent_strength: 1,
    next_action: "ask_status",
  },
  lead_ready_for_crm: false,
};

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
    { role: "assistant", text: OPENING.reply },
  ]);
  const [history, setHistory] = useState<ApiMessage[]>([
    { role: "assistant", content: JSON.stringify(OPENING) },
  ]);
  const [state, setState] = useState<LeadState>(OPENING.state);
  const [leadReady, setLeadReady] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showStatus, setShowStatus] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ended = state.next_action === "goodbye";
  const wantsEmail =
    state.next_action === "request_email" ||
    state.next_action === "confirm_email";

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [display, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading || ended) return;

    const userDisplay: DisplayMessage = { role: "user", text };
    const userApi: ApiMessage = { role: "user", content: text };
    const nextHistory = [...history, userApi];

    setDisplay((d) => [...d, userDisplay]);
    setHistory(nextHistory);
    setInput("");
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
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rope/15 text-xl ring-1 ring-rope/40">
          ⚓
        </div>
        <div className="leading-tight">
          <div className="font-display text-lg font-semibold text-sand">
            Crew
          </div>
          <div className="text-xs text-foam/55">
            dein Hafen-Buddy · PicYourBoat
          </div>
        </div>
        <button
          onClick={() => setShowStatus((s) => !s)}
          className="ml-auto rounded-full px-3 py-1 text-[11px] font-medium text-foam/60 ring-1 ring-foam/15 transition hover:text-sand hover:ring-foam/30"
        >
          {showStatus ? "Schließen" : "Lead-Status"}
        </button>
      </header>

      {showStatus && <StatusPanel state={state} leadReady={leadReady} />}

      {/* Verlauf */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto px-4 py-3"
      >
        {display.map((m, i) => (
          <Bubble key={i} role={m.role} text={m.text} />
        ))}

        {loading && <TypingBubble />}

        {error && (
          <div className="animate-surface mx-auto max-w-[85%] rounded-2xl bg-red-900/40 px-4 py-2.5 text-center text-sm text-red-100 ring-1 ring-red-400/30">
            {error}
          </div>
        )}

        {ended && (
          <div className="animate-surface mx-auto mt-2 text-center text-xs text-foam/45">
            handbreit Wasser unter'm Kiel ⛵
          </div>
        )}
      </div>

      {/* Eingabe */}
      <div className="border-t border-foam/10 bg-hull-deep/40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        {wantsEmail && !ended && (
          <div className="mb-2 px-1 text-[11px] font-medium text-rope">
            ✦ Tipp deine Email für die Alpha-Warteliste
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={loading || ended}
            type={wantsEmail ? "email" : "text"}
            inputMode={wantsEmail ? "email" : "text"}
            autoComplete={wantsEmail ? "email" : "off"}
            placeholder={
              ended
                ? "Gespräch beendet"
                : wantsEmail
                  ? "name@beispiel.de"
                  : "Schreib was…"
            }
            className="min-w-0 flex-1 rounded-2xl bg-foam/10 px-4 py-3 text-[15px] text-sand placeholder:text-foam/35 outline-none ring-1 ring-foam/15 transition focus:ring-rope/60 disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={loading || ended || !input.trim()}
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
}: {
  state: LeadState;
  leadReady: boolean;
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
