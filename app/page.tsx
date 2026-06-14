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
} from "./tree";
import { ui } from "./messages";

// Claude-Verlauf: Assistant-Inhalte sind der rohe JSON-String, damit das Modell
// seinen State mitführt. Tree-Schritte schreiben ins selbe Format.
type ApiMessage = { role: "user" | "assistant"; content: string };

// Ein gerenderter Vollbild-Abschnitt im Scroll-Feed.
type Frame = {
  key: number;
  kind: "intro" | "tree" | "claude";
  nodeId?: string; // bei kind "tree"
  reply?: string; // bei kind "claude" (bereits aufgelöster Text)
  scene: string;
  chosen?: string; // gewählte Antwort (für die Verlaufs-Darstellung)
};

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

// Es wird immer nur die aktive (letzte) Seite gerendert; Antworten hängen die
// nächste Seite an und ersetzen die sichtbare. Start = Intro/Hero.
function introFrame(): Frame {
  return { key: 0, kind: "intro", scene: "opener" };
}
function openingFrame(): Frame {
  return { key: 1, kind: "tree", nodeId: ROOT_ID, scene: TREE[ROOT_ID].scene ?? "deck" };
}
function initialFrames(): Frame[] {
  return [introFrame()];
}

export default function Home() {
  const [locale, setLocale] = useState<Locale>("de");
  const u = ui(locale);

  const [frames, setFrames] = useState<Frame[]>(initialFrames);
  const [state, setState] = useState<LeadState>(INITIAL_STATE);
  const [leadReady, setLeadReady] = useState(false);
  const [history, setHistory] = useState<ApiMessage[]>(() => [
    { role: "assistant", content: JSON.stringify(openingResponse("de")) },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const nextKey = useRef(2);

  const step = progressStep(state.next_action);
  const current = frames[frames.length - 1]; // nur die aktive Seite wird gerendert
  const showHeader = current.kind !== "intro"; // Kopf erst nach dem Intro

  // Vom Intro zur ersten Frage (Opening ist im Verlauf bereits geseedet).
  function begin() {
    setFrames((f) => [...f, openingFrame()]);
  }

  // Tree-Übergang: State + Verlauf fortschreiben, Frame anhängen.
  function appendTree(targetId: string, userText: string, patch?: Partial<LeadState>) {
    const target = TREE[targetId];
    if (!target) return;

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
      { role: "user", content: userText },
      { role: "assistant", content: JSON.stringify(crew) },
    ]);
    setState(nextState);
    setLeadReady(ready);
    setError(null);

    // gewählte Antwort am bisher aktiven Frame vermerken + neuen Frame anhängen
    setFrames((fs) => {
      const marked = fs.map((f, i) =>
        i === fs.length - 1 ? { ...f, chosen: userText } : f,
      );
      const sceneForReady = ready ? (TREE[EMAIL_SUCCESS_ID].scene ?? target.scene) : target.scene;
      return [
        ...marked,
        {
          key: nextKey.current++,
          kind: "tree",
          nodeId: targetId,
          scene: sceneForReady ?? marked[marked.length - 1].scene,
        },
      ];
    });

    if (target.mode === "email" || !target.quickReplies) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function onPill(qr: QuickReply) {
    if (busy || loading) return;
    setBusy(true);
    window.setTimeout(() => setBusy(false), 350);
    appendTree(qr.next, t(qr.send ?? qr.label, locale), qr.patch);
  }

  async function sendToClaude(text: string) {
    const nextHistory: ApiMessage[] = [...history, { role: "user", content: text }];
    setHistory(nextHistory);
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
      setFrames((fs) => {
        const prevScene = fs[fs.length - 1].scene;
        const scene = crew.lead_ready_for_crm
          ? (TREE[EMAIL_SUCCESS_ID].scene ?? prevScene)
          : prevScene;
        return [
          ...fs,
          { key: nextKey.current++, kind: "claude", reply: crew.reply, scene },
        ];
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler.");
    } finally {
      setLoading(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");

    const activeNode =
      current.kind === "tree" && current.nodeId ? TREE[current.nodeId] : null;

    // Email-Schritt: steckt eine Email im Text → token-frei abschließen.
    if (activeNode?.mode === "email" && extractEmail(text)) {
      appendTree(EMAIL_SUCCESS_ID, text);
      return;
    }
    sendToClaude(text);
  }

  function restart() {
    setFrames(initialFrames());
    setState(INITIAL_STATE);
    setLeadReady(false);
    setHistory([{ role: "assistant", content: JSON.stringify(openingResponse(locale)) }]);
    setError(null);
    setInput("");
    requestAnimationFrame(() => window.scrollTo({ top: 0 }));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  // Beim Fokus ins Textfeld: Scroll-Snap aus (sonst kann iOS das Feld nicht über
  // die Tastatur schieben) und das Feld aktiv in den sichtbaren Bereich scrollen.
  function onInputFocus() {
    document.documentElement.style.scrollSnapType = "none";
    window.setTimeout(
      () => inputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }),
      300,
    );
  }
  function onInputBlur() {
    document.documentElement.style.scrollSnapType = "";
  }

  // ── Feste Viewport-Seite: immer nur die aktive Seite, kein Scroll ──────────
  return (
    <div className="relative mx-auto h-[100dvh] w-full max-w-md overflow-hidden bg-hull-deep text-white">
      <FrameSection
        key={current.key}
        frame={current}
        active
        locale={locale}
        loading={loading}
        error={error}
        busy={busy}
        input={input}
        setInput={setInput}
        onPill={onPill}
        onKeyDown={onKeyDown}
        send={send}
        restart={restart}
        inputRef={inputRef}
        onInputFocus={onInputFocus}
        onInputBlur={onInputBlur}
        onBegin={begin}
        u={u}
      />

      {/* Kopf-Overlay: Sprach-Umschalter immer; Logo + Fortschritt erst nach dem Intro */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center">
          <img
            src="/pyb-logo-h.png"
            alt="Pick Your Boat"
            className={`h-8 w-auto drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] transition-opacity duration-300 ${
              showHeader ? "opacity-100" : "opacity-0"
            }`}
          />
          <div className="pointer-events-auto ml-auto flex items-center gap-0.5 rounded-full bg-white/15 p-0.5 text-[11px] font-bold ring-1 ring-white/25 backdrop-blur">
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
        </div>
        <div
          className={`mt-3 flex gap-1.5 transition-opacity duration-300 ${
            showHeader ? "opacity-100" : "opacity-0"
          }`}
        >
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i < step ? "bg-rope" : "bg-white/30"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FrameSection({
  frame,
  active,
  sectionRef,
  locale,
  loading,
  error,
  busy,
  input,
  setInput,
  onPill,
  onKeyDown,
  send,
  restart,
  inputRef,
  onInputFocus,
  onInputBlur,
  onBegin,
  u,
}: {
  frame: Frame;
  active: boolean;
  sectionRef?: React.Ref<HTMLElement>;
  locale: Locale;
  loading: boolean;
  error: string | null;
  busy: boolean;
  input: string;
  setInput: (v: string) => void;
  onPill: (qr: QuickReply) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  send: () => void;
  restart: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onInputFocus: () => void;
  onInputBlur: () => void;
  onBegin: () => void;
  u: ReturnType<typeof ui>;
}) {
  // ── Intro-/Hero-Sektion (Sektion 0) ───────────────────────────────────────
  if (frame.kind === "intro") {
    return (
      <section
        ref={sectionRef}
        onClick={onBegin}
        className="relative h-[100dvh] w-full cursor-pointer overflow-hidden"
      >
        <img src={`/scenes/${frame.scene}.jpg`} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/80" />
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
          <button
            onClick={onBegin}
            className="mt-7 flex flex-col items-center gap-1 self-center text-white/85"
          >
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
          </button>
        </div>
      </section>
    );
  }

  const node = frame.kind === "tree" && frame.nodeId ? TREE[frame.nodeId] : null;
  const reply = node ? t(node.reply, locale) : (frame.reply ?? "");
  const pills = node?.quickReplies ?? null;
  const isEmail = node?.mode === "email";
  const terminal = !!node?.terminal;
  const bigText = reply.length <= 120;

  return (
    <section
      ref={sectionRef}
      className="relative h-[100dvh] w-full snap-start overflow-hidden"
    >
      <img src={`/scenes/${frame.scene}.jpg`} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/25 to-black/80" />

      <div className="absolute inset-0 flex flex-col px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-28">
        <div className="animate-frame">
          <h1
            className={`font-display font-semibold leading-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.55)] ${
              bigText ? "text-[28px]" : "text-[19px] leading-snug"
            }`}
          >
            {reply}
          </h1>
          <BrushAccent />
        </div>

        <div className="flex-1" />

        {/* Verlauf: gewählte Antwort als Chip */}
        {!active && frame.chosen && (
          <div className="mb-2 self-end rounded-2xl bg-rope/85 px-4 py-2 text-[14px] font-medium text-hull-deep shadow">
            {frame.chosen}
          </div>
        )}

        {active && (
          <div className="animate-frame">
            {pills && (
              <div className="mb-3 flex flex-col gap-2.5">
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

            {isEmail && !terminal && (
              <div className="mb-2 px-1 text-[11px] font-semibold text-rope drop-shadow">
                ✦ {u.emailHint}
              </div>
            )}

            <div className="flex items-end gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                onFocus={onInputFocus}
                onBlur={onInputBlur}
                disabled={loading}
                type="text"
                inputMode={isEmail ? "email" : "text"}
                autoComplete={isEmail ? "email" : "off"}
                placeholder={isEmail ? u.placeholderEmail : pills ? u.tapHint : u.placeholder}
                className="min-w-0 flex-1 rounded-2xl bg-white/85 px-4 py-3 text-[15px] text-hull-deep placeholder:text-hull-deep/40 outline-none ring-1 ring-white/40 backdrop-blur transition focus:ring-rope disabled:opacity-60"
              />
              <button
                onClick={send}
                disabled={loading || !input.trim()}
                aria-label={u.send}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rope text-hull-deep transition hover:bg-rope-dark active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2 11 13" />
                  <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
                </svg>
              </button>
            </div>

            {terminal && (
              <button
                onClick={restart}
                className="mt-3 w-full rounded-2xl bg-hull-deep/70 py-3 text-sm font-semibold text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-hull-deep"
              >
                ↺ {u.restart}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function BrushAccent() {
  return (
    <svg width="116" height="16" viewBox="0 0 116 16" fill="none" className="mt-3" aria-hidden>
      <path d="M2 8 Q 16 2 30 8 T 58 8 T 86 8 T 114 8" stroke="#d9a441" strokeWidth="4" strokeLinecap="round" />
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
