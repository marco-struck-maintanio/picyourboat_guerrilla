"use client";

import { useRef, useState } from "react";
import {
  CrewResponse,
  EMAIL_SUCCESS_ID,
  extractEmail,
  INITIAL_STATE,
  LeadState,
  Locale,
  openingResponse,
  QuickReply,
  ROOT_ID,
  t,
  TREE,
  TreeNode,
} from "./tree";
import { ui } from "./messages";

// Claude-Verlauf: Assistant-Inhalte sind der rohe JSON-String, damit das Modell
// seinen State mitführt. Tree-Schritte schreiben ins selbe Format.
type ApiMessage = { role: "user" | "assistant"; content: string };

const TOTAL_STEPS = 5;

function progressStep(na: LeadState["next_action"]): number {
  switch (na) {
    case "ask_status":
      return 1;
    case "ask_pain":
      return 2;
    case "reveal_and_pitch":
    case "request_email":
    case "confirm_email":
      return 4;
    case "wrap_up":
    case "goodbye":
      return 5;
    default:
      return 1;
  }
}

export default function Home() {
  const [locale, setLocale] = useState<Locale>("de");
  const u = ui(locale);

  const [mode, setMode] = useState<"tree" | "claude">("tree");
  const [nodeId, setNodeId] = useState<string>(ROOT_ID);
  const [scene, setScene] = useState<string>(TREE[ROOT_ID].scene ?? "opener");
  const [claudeReply, setClaudeReply] = useState<string | null>(null);

  const [state, setState] = useState<LeadState>(INITIAL_STATE);
  const [leadReady, setLeadReady] = useState(false);
  const [history, setHistory] = useState<ApiMessage[]>(() => [
    { role: "assistant", content: JSON.stringify(openingResponse("de")) },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false); // kurze Sperre während Frame-Wechsel
  const [error, setError] = useState<string | null>(null);
  const [frameKey, setFrameKey] = useState(0);
  const [started, setStarted] = useState(false); // Intro-/Hero-Screen vorgeschaltet

  const inputRef = useRef<HTMLInputElement>(null);
  const touchStartY = useRef<number | null>(null);

  const node: TreeNode | null = mode === "tree" ? TREE[nodeId] : null;
  const reply = mode === "tree" && node ? t(node.reply, locale) : (claudeReply ?? "");
  const pills =
    mode === "tree" && node?.quickReplies && !loading ? node.quickReplies : null;

  const wantsEmail =
    (mode === "tree" && node?.mode === "email") ||
    (mode === "claude" &&
      (state.next_action === "request_email" ||
        state.next_action === "confirm_email"));

  const wrappedUp =
    (mode === "tree" && !!node?.terminal) ||
    (mode === "claude" && state.next_action === "goodbye");

  const step = progressStep(state.next_action);
  const bigText = reply.length <= 120;

  // Sobald die Email erfasst ist (Lead bereit), immer die Sonnenuntergang-Szene
  // des Abschluss-Nodes zeigen — egal über welchen Pfad (Buttons oder Claude).
  const heroScene = leadReady ? (TREE[EMAIL_SUCCESS_ID].scene ?? scene) : scene;

  function focusInputSoon() {
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  // Tree-Übergang: State + Verlauf fortschreiben, Frame neu einblenden.
  function goToNode(
    target: TreeNode,
    userText: string | null,
    patch?: Partial<LeadState>,
  ) {
    const nextState: LeadState = {
      ...state,
      ...patch,
      ...target.patch,
      next_action: target.nextAction,
    };
    const ready = target.leadReady ?? leadReady;
    const crew: CrewResponse = {
      reply: t(target.reply, locale),
      state: nextState,
      lead_ready_for_crm: ready,
    };

    setHistory((h) => [
      ...h,
      ...(userText ? [{ role: "user" as const, content: userText }] : []),
      { role: "assistant", content: JSON.stringify(crew) },
    ]);
    setState(nextState);
    setLeadReady(ready);
    setNodeId(target.id);
    if (target.scene) setScene(target.scene);
    setMode("tree");
    setClaudeReply(null);
    setError(null);
    setFrameKey((k) => k + 1);

    setBusy(true);
    window.setTimeout(() => setBusy(false), 350);

    if (target.mode === "email" || !target.quickReplies) focusInputSoon();
  }

  function onPill(qr: QuickReply) {
    if (busy || loading) return;
    const target = TREE[qr.next];
    if (!target) return;
    goToNode(target, t(qr.send ?? qr.label, locale), qr.patch);
  }

  async function sendToClaude(text: string) {
    const nextHistory: ApiMessage[] = [...history, { role: "user", content: text }];
    setHistory(nextHistory);
    setMode("claude");
    setClaudeReply(null);
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextHistory, locale }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Da ist etwas schiefgelaufen.");

      const crew = data as CrewResponse;
      setHistory((h) => [...h, { role: "assistant", content: JSON.stringify(crew) }]);
      setState(crew.state);
      setLeadReady(crew.lead_ready_for_crm);
      setClaudeReply(crew.reply);
      setFrameKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler.");
    } finally {
      setLoading(false);
      focusInputSoon();
    }
  }

  function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");

    // Steckt im Email-Schritt eine Email im Text, token-frei abschließen.
    if (mode === "tree" && node?.mode === "email" && extractEmail(text)) {
      goToNode(TREE[EMAIL_SUCCESS_ID], text);
      return;
    }
    sendToClaude(text);
  }

  function restart() {
    setMode("tree");
    setNodeId(ROOT_ID);
    setScene(TREE[ROOT_ID].scene ?? "opener");
    setState(INITIAL_STATE);
    setLeadReady(false);
    setClaudeReply(null);
    setHistory([{ role: "assistant", content: JSON.stringify(openingResponse(locale)) }]);
    setError(null);
    setInput("");
    setFrameKey((k) => k + 1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function begin() {
    setStarted(true);
    setFrameKey((k) => k + 1);
  }

  // ── Intro-/Hero-Screen (vor der ersten Frage) ──────────────────────────────
  if (!started) {
    return (
      <div
        onClick={begin}
        onTouchStart={(e) => (touchStartY.current = e.touches[0].clientY)}
        onTouchEnd={(e) => {
          const sy = touchStartY.current;
          if (sy !== null && sy - e.changedTouches[0].clientY > 40) begin();
          touchStartY.current = null;
        }}
        className="relative mx-auto h-[100dvh] w-full max-w-md cursor-pointer overflow-hidden bg-hull-deep text-white select-none"
      >
        <img
          src="/scenes/opener.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/80" />

        {/* Sprach-Umschalter — über dem Inhalt (z-20), damit Klicks nicht zu begin() durchschlagen */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-5 top-[max(1rem,env(safe-area-inset-top))] z-20 flex items-center gap-0.5 rounded-full bg-white/15 p-0.5 text-[11px] font-bold ring-1 ring-white/25 backdrop-blur"
        >
          {(["de", "en"] as Locale[]).map((l) => (
            <button
              key={l}
              onClick={(e) => {
                e.stopPropagation();
                setLocale(l);
              }}
              className={`rounded-full px-2.5 py-1 transition ${
                locale === l ? "bg-white text-hull-deep" : "text-white/80"
              }`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="absolute inset-0 flex flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[16%]">
          <img
            src="/pyb-logo-light.png"
            alt="Pick Your Boat"
            className="animate-frame mx-auto w-64 drop-shadow-[0_6px_22px_rgba(0,0,0,0.5)]"
          />

          <div className="flex-1" />

          <h1 className="animate-frame text-[44px] font-extrabold leading-[1.03] tracking-tight drop-shadow-[0_2px_14px_rgba(0,0,0,0.6)]">
            {u.heroTitle}
          </h1>
          <BrushAccent />

          <div className="mt-7 flex flex-col items-center gap-1 text-white/85">
            <span className="text-sm font-medium drop-shadow">{u.begin}</span>
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="animate-bounce"
            >
              <path d="m6 15 6-6 6 6" />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative mx-auto h-[100dvh] w-full max-w-md overflow-hidden bg-hull-deep text-white">
      {/* Hero-Hintergrund (Platzhalter aus /public/scenes) */}
      <img
        key={heroScene}
        src={`/scenes/${heroScene}.jpg`}
        alt=""
        className="animate-frame absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/25 to-black/80" />

      <div className="absolute inset-0 flex flex-col">
        {/* Kopf: horizontales Logo (über dem Fortschrittsbalken) + Sprach-Umschalter */}
        <header className="flex items-center px-5 pt-[max(1rem,env(safe-area-inset-top))]">
          <img
            src="/pyb-logo-h.png"
            alt="Pick Your Boat"
            className="h-8 w-auto drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
          />
          <div className="ml-auto flex items-center gap-0.5 rounded-full bg-white/15 p-0.5 text-[11px] font-bold ring-1 ring-white/25 backdrop-blur">
            {(["de", "en"] as Locale[]).map((l) => (
              <button
                key={l}
                onClick={() => setLocale(l)}
                className={`rounded-full px-2.5 py-1 transition ${
                  locale === l ? "bg-white text-hull-deep" : "text-white/80"
                }`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </header>

        {/* Fortschritt */}
        <div className="mt-3 flex gap-1.5 px-5">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i < step ? "bg-rope" : "bg-white/30"
              }`}
            />
          ))}
        </div>

        {/* Frage / Antwort */}
        <main className="flex flex-1 flex-col justify-start overflow-y-auto px-6 pt-6 pb-3">
          <div key={`q-${frameKey}`} className="animate-frame">
            <h1
              className={`font-display font-semibold leading-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.55)] ${
                bigText ? "text-[28px]" : "text-[19px] leading-snug"
              }`}
            >
              {reply}
            </h1>
            <BrushAccent />
          </div>
        </main>

        {/* Aktionen */}
        <footer className="px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {pills && (
            <div key={`p-${frameKey}`} className="animate-frame mb-3 flex flex-col gap-2.5">
              {pills.map((qr) => (
                <button
                  key={qr.next + qr.label.de}
                  onClick={() => onPill(qr)}
                  disabled={busy}
                  className="flex items-center gap-3 rounded-2xl bg-white/15 px-4 py-3.5 text-left text-[15px] font-medium ring-1 ring-white/30 backdrop-blur transition hover:bg-white/25 active:scale-[0.98] disabled:opacity-60"
                >
                  <span className="h-4 w-4 shrink-0 rounded-full ring-1 ring-white/70" />
                  <span>{t(qr.label, locale)}</span>
                </button>
              ))}
            </div>
          )}

          {loading && <TypingDots />}

          {error && (
            <div className="mb-2 rounded-xl bg-red-900/50 px-3 py-2 text-center text-sm text-red-100 ring-1 ring-red-400/30 backdrop-blur">
              {error}
            </div>
          )}

          {wantsEmail && !wrappedUp && (
            <div className="mb-2 px-1 text-[11px] font-semibold text-rope drop-shadow">
              ✦ {u.emailHint}
            </div>
          )}

          {/* Eingabe — bleibt immer offen. Auf Email-Screens: klare Ja-Aktion,
              nie eine „Nein"-Option (wer nicht will, verlässt die Seite). */}
          {wantsEmail && !wrappedUp ? (
            <div className="flex flex-col gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={loading}
                type="text"
                inputMode="email"
                autoComplete="email"
                placeholder={u.placeholderEmail}
                className="w-full rounded-2xl bg-white/85 px-4 py-3 text-[15px] text-hull-deep placeholder:text-hull-deep/40 outline-none ring-1 ring-white/40 backdrop-blur transition focus:ring-rope disabled:opacity-60"
              />
              <button
                onClick={send}
                disabled={loading || !input.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rope py-3.5 text-[15px] font-semibold text-hull-deep transition hover:bg-rope-dark active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {u.joinCta}
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14" />
                  <path d="m13 6 6 6-6 6" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={loading}
                type="text"
                inputMode="text"
                autoComplete="off"
                placeholder={pills ? u.tapHint : u.placeholder}
                className="min-w-0 flex-1 rounded-2xl bg-white/85 px-4 py-3 text-[15px] text-hull-deep placeholder:text-hull-deep/40 outline-none ring-1 ring-white/40 backdrop-blur transition focus:ring-rope disabled:opacity-60"
              />
              <button
                onClick={send}
                disabled={loading || !input.trim()}
                aria-label={u.send}
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
          )}

          {wrappedUp && (
            <button
              onClick={restart}
              className="mt-3 w-full rounded-2xl bg-hull-deep/70 py-3 text-sm font-semibold text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-hull-deep"
            >
              ↺ {u.restart}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function BrushAccent() {
  return (
    <svg
      width="116"
      height="16"
      viewBox="0 0 116 16"
      fill="none"
      className="mt-3"
      aria-hidden
    >
      <path
        d="M2 8 Q 16 2 30 8 T 58 8 T 86 8 T 114 8"
        stroke="#d9a441"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TypingDots() {
  return (
    <div className="mb-3 flex items-center gap-1.5 px-1">
      <span className="dot h-2 w-2 rounded-full bg-white/85" />
      <span className="dot h-2 w-2 rounded-full bg-white/85" />
      <span className="dot h-2 w-2 rounded-full bg-white/85" />
    </div>
  );
}
