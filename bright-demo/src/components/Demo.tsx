"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import BrightMark from "./BrightMark";
import ResultCard from "./ResultCard";
import Segmented from "./Segmented";
import { COPY } from "@/lib/copy";
import { EASE } from "@/lib/motion";
import {
  buildSystemPrompt,
  endSessionPrompt,
  openingPrompt,
  type AiRole,
  type Difficulty,
  type Language,
  type TraineeRole,
  type TurnResult,
} from "@/lib/prompt";
import {
  AI_ROLES,
  DIFFICULTIES,
  SCENARIOS,
  TRAINEE_ROLES,
  randomScenario,
} from "@/lib/scenarios";
import { SCRIPTED_SCENARIO, scriptedTurn, scriptedWrapUp } from "@/lib/script";

const KEY_STORAGE = "bright-demo-groq-key";

type ChatMessage = {
  id: number;
  role: "ai" | "user";
  text: string;
  score?: number | null;
  feedback?: string | null;
};

type ApiMessage = { role: "system" | "user" | "assistant"; content: string };

export default function Demo() {
  const [language, setLanguage] = useState<Language>("en");
  const t = COPY[language];

  const [phase, setPhase] = useState<"setup" | "session" | "complete">("setup");
  const [apiKey, setApiKey] = useState("");
  const [keyOpen, setKeyOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");

  const [scenarioId, setScenarioId] = useState<string>("cardiac_arrest");
  const [customScenario, setCustomScenario] = useState("");
  const [aiRole, setAiRole] = useState<AiRole>("patient");
  const [traineeRole, setTraineeRole] = useState<TraineeRole>("doctor");
  const [difficulty, setDifficulty] = useState<Difficulty>("intermediate");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wrapUp, setWrapUp] = useState<string | null>(null);

  const history = useRef<ApiMessage[]>([]);
  const scriptStep = useRef(0);
  const nextId = useRef(0);
  const transcriptEnd = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  const scripted = apiKey.trim() === "";
  const scenarioText =
    customScenario.trim() ||
    SCENARIOS.find((s) => s.id === scenarioId)?.[language] ||
    scenarioId;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY_STORAGE);
      if (saved) setApiKey(saved);
    } catch {
      // Storage can be blocked; the demo simply runs scripted.
    }
  }, []);

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy, wrapUp]);

  function push(message: Omit<ChatMessage, "id">) {
    setMessages((current) => [...current, { ...message, id: nextId.current++ }]);
  }

  function growComposer() {
    const el = composer.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }

  /** One turn: either the scripted reply, or a real round-trip to Groq. */
  async function takeTurn(userContent: string): Promise<TurnResult> {
    if (scripted) {
      await new Promise((resolve) => setTimeout(resolve, 650));
      const ending = userContent.startsWith("[END_SESSION]");
      const turn = ending
        ? scriptedWrapUp(language)
        : scriptedTurn(language, scriptStep.current);
      if (!ending) scriptStep.current += 1;
      return turn;
    }

    history.current.push({ role: "user", content: userContent });

    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey, messages: history.current }),
    });

    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error ?? t.error);

    const turn = payload.turn as TurnResult;
    history.current.push({ role: "assistant", content: JSON.stringify(turn) });
    return turn;
  }

  async function start() {
    setError(null);
    setBusy(true);
    setPhase("session");
    setMessages([]);
    setWrapUp(null);
    scriptStep.current = 0;

    const description = scripted ? SCRIPTED_SCENARIO[language] : scenarioText;
    history.current = [
      {
        role: "system",
        content: buildSystemPrompt({
          scenarioDescription: description,
          aiRole,
          traineeRole,
          difficulty,
          language,
        }),
      },
    ];

    try {
      const turn = await takeTurn(openingPrompt(language));
      push({ role: "ai", text: turn.next_prompt });
    } catch (e) {
      setError(e instanceof Error ? e.message : t.error);
      setPhase("setup");
    } finally {
      setBusy(false);
    }
  }

  async function answer() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    requestAnimationFrame(growComposer);
    setError(null);
    push({ role: "user", text });
    setBusy(true);

    try {
      const turn = await takeTurn(text);
      // The grade belongs to the answer just given, so it lands on that message.
      setMessages((current) =>
        current.map((message, i) =>
          i === current.length - 1
            ? { ...message, score: turn.score, feedback: turn.feedback }
            : message,
        ),
      );
      if (turn.session_complete) {
        setWrapUp(turn.next_prompt);
        setPhase("complete");
      } else {
        push({ role: "ai", text: turn.next_prompt });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t.error);
    } finally {
      setBusy(false);
    }
  }

  async function end() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const turn = await takeTurn(endSessionPrompt(language));
      setWrapUp(turn.next_prompt);
      setPhase("complete");
    } catch (e) {
      setError(e instanceof Error ? e.message : t.error);
    } finally {
      setBusy(false);
    }
  }

  function saveKey() {
    const trimmed = keyDraft.trim();
    setApiKey(trimmed);
    try {
      if (trimmed) localStorage.setItem(KEY_STORAGE, trimmed);
      else localStorage.removeItem(KEY_STORAGE);
    } catch {
      // Non-fatal: the key still works for this tab.
    }
    setKeyOpen(false);
  }

  const scores = messages
    .map((m) => m.score)
    .filter((s): s is number => typeof s === "number");
  const average =
    scores.length > 0
      ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
      : "—";

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Chrome stays nearly empty: name on the left, the two things you might
          change on the right. */}
      <header className="sticky top-0 z-30 bg-paper/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-6">
          <span className="flex items-center gap-2.5">
            <BrightMark className="size-[19px]" />
            <span className="text-[15px] font-semibold tracking-[-0.02em]">Bright</span>
            <span className="text-[12px] text-ink-faint">{t.demoChip}</span>
          </span>

          <div className="flex items-center gap-1">
            {phase === "session" && (
              <button
                type="button"
                onClick={end}
                disabled={busy}
                className="rounded-full px-3 py-1.5 text-[13px] text-ink-muted transition-colors duration-200 hover:bg-raised hover:text-ink disabled:opacity-40"
              >
                {t.endShort}
              </button>
            )}
            <button
              type="button"
              onClick={() => setLanguage(language === "en" ? "ko" : "en")}
              className="rounded-full px-3 py-1.5 text-[13px] text-ink-muted transition-colors duration-200 hover:bg-raised hover:text-ink"
            >
              {language === "en" ? "한국어" : "English"}
            </button>
            <button
              type="button"
              onClick={() => {
                setKeyDraft(apiKey);
                setKeyOpen(true);
              }}
              title={t.key}
              aria-label={t.key}
              className="grid size-9 place-items-center rounded-full text-ink-muted transition-colors duration-200 hover:bg-raised hover:text-ink"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-[17px]"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="8" cy="12" r="3.4" />
                <path d="M11.4 12H20M17.5 12v3M14.5 12v2.2" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6">
        {phase === "setup" ? (
          <Setup
            t={t}
            language={language}
            scenarioId={scenarioId}
            setScenarioId={setScenarioId}
            customScenario={customScenario}
            setCustomScenario={setCustomScenario}
            aiRole={aiRole}
            setAiRole={setAiRole}
            traineeRole={traineeRole}
            setTraineeRole={setTraineeRole}
            difficulty={difficulty}
            setDifficulty={setDifficulty}
            onStart={start}
            busy={busy}
            error={error}
          />
        ) : (
          <div className="flex flex-1 flex-col pb-10 pt-6">
            <ol className="flex-1 space-y-10">
              {messages.map((message) => (
                <motion.li
                  key={message.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, ease: EASE }}
                >
                  {message.role === "ai" ? (
                    // Assistant turns are just text on the page, the way the
                    // chat products do it — no bubble, nothing to box them in.
                    <p className="text-[17px] leading-[1.8] text-ink">{message.text}</p>
                  ) : (
                    <div className="flex flex-col items-end gap-3">
                      <p className="max-w-[85%] rounded-[1.3rem] bg-raised px-5 py-3.5 text-[16px] leading-[1.7] text-ink">
                        {message.text}
                      </p>
                      {typeof message.score === "number" && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.5, ease: EASE, delay: 0.1 }}
                          className="flex max-w-[85%] items-baseline gap-3"
                        >
                          <span className="tnum shrink-0 text-[13px] font-semibold text-ink">
                            {message.score}
                            <span className="text-ink-faint">{t.scoreOf}</span>
                          </span>
                          <p className="text-[14px] leading-[1.75] text-ink-muted">
                            {message.feedback}
                          </p>
                        </motion.div>
                      )}
                    </div>
                  )}
                </motion.li>
              ))}

              {busy && (
                <li>
                  <motion.span
                    className="block size-2 rounded-full bg-ink-faint"
                    animate={{ opacity: [0.25, 1, 0.25] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                </li>
              )}
            </ol>

            {error && (
              <p className="mt-8 rounded-[1rem] bg-raised px-5 py-4 text-[14px] text-ink-soft">
                {error}
              </p>
            )}

            {phase === "complete" && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: EASE }}
                className="mt-16 flex flex-col items-center gap-8"
              >
                <ResultCard
                  scenario={scripted ? SCRIPTED_SCENARIO[language] : scenarioText}
                  score={average}
                  note={t.streak}
                  slogan={t.slogan}
                />
                {wrapUp && (
                  <p className="max-w-[34rem] text-center text-[16px] leading-[1.8] text-ink-soft">
                    {wrapUp}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setPhase("setup")}
                  className="rounded-full px-5 py-2.5 text-[14.5px] text-ink-muted transition-colors duration-200 hover:bg-raised hover:text-ink"
                >
                  {t.again}
                </button>
              </motion.div>
            )}

            <div ref={transcriptEnd} />
          </div>
        )}
      </main>

      {phase === "session" && (
        <div className="sticky bottom-0 bg-gradient-to-t from-paper via-paper to-transparent pt-6">
          <div className="mx-auto w-full max-w-3xl px-6 pb-4">
            <div className="flex items-end gap-2 rounded-[1.6rem] border border-line bg-raised py-2.5 pl-5 pr-2.5 transition-colors duration-200 focus-within:border-line-strong">
              <textarea
                ref={composer}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  growComposer();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    answer();
                  }
                }}
                rows={1}
                placeholder={t.placeholder}
                className="max-h-[220px] flex-1 resize-none bg-transparent py-2 text-[16px] leading-[1.7] outline-none placeholder:text-ink-faint"
              />
              <button
                type="button"
                onClick={answer}
                disabled={busy || !draft.trim()}
                aria-label={t.send}
                className="mb-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-ink text-paper transition-opacity duration-200 hover:opacity-90 disabled:opacity-25"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-[16px]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 19V5M6 11l6-6 6 6" />
                </svg>
              </button>
            </div>

            {/* The one disclosure that has to stay visible, kept quiet. */}
            <p className="mt-3 text-center text-[12px] text-ink-faint">
              {scripted ? t.scriptedBanner : t.liveBanner}
            </p>
          </div>
        </div>
      )}

      <AnimatePresence>
        {keyOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center bg-ink/25 px-5 backdrop-blur-sm"
            onClick={() => setKeyOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.3, ease: EASE }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-[1.5rem] border border-line bg-paper p-8 shadow-float"
            >
              <h2 className="text-[18px] font-semibold tracking-[-0.02em]">{t.keyTitle}</h2>
              <p className="mt-3 text-[14px] leading-[1.75] text-ink-soft">{t.keyBody}</p>
              <input
                type="password"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder={t.keyPlaceholder}
                className="mt-6 w-full rounded-[1rem] border border-line bg-raised px-4 py-3 font-mono text-[14px] outline-none focus:border-line-strong"
              />
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={saveKey}
                  className="rounded-full bg-ink px-5 py-2.5 text-[14px] font-medium text-paper transition-opacity duration-200 hover:opacity-90"
                >
                  {t.keySave}
                </button>
                {apiKey && (
                  <button
                    type="button"
                    onClick={() => {
                      setKeyDraft("");
                      setApiKey("");
                      try {
                        localStorage.removeItem(KEY_STORAGE);
                      } catch {}
                      setKeyOpen(false);
                    }}
                    className="rounded-full px-4 py-2.5 text-[14px] text-ink-muted transition-colors duration-200 hover:bg-raised hover:text-ink"
                  >
                    {t.keyClear}
                  </button>
                )}
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-[13px] text-ink-muted underline-offset-4 hover:text-ink hover:underline"
                >
                  {t.keyGet}
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Setup({
  t,
  language,
  scenarioId,
  setScenarioId,
  customScenario,
  setCustomScenario,
  aiRole,
  setAiRole,
  traineeRole,
  setTraineeRole,
  difficulty,
  setDifficulty,
  onStart,
  busy,
  error,
}: {
  t: (typeof COPY)["en"];
  language: Language;
  scenarioId: string;
  setScenarioId: (v: string) => void;
  customScenario: string;
  setCustomScenario: (v: string) => void;
  aiRole: AiRole;
  setAiRole: (v: AiRole) => void;
  traineeRole: TraineeRole;
  setTraineeRole: (v: TraineeRole) => void;
  difficulty: Difficulty;
  setDifficulty: (v: Difficulty) => void;
  onStart: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <div className="flex flex-1 flex-col justify-center py-16 sm:py-20">
      <h1 className="display text-[clamp(2rem,4.5vw,2.7rem)]">{t.setupTitle}</h1>
      <p className="mt-5 max-w-[34rem] text-[16.5px] leading-[1.75] text-ink-soft">
        {t.setupLede}
      </p>

      <section className="mt-14">
        <div className="flex items-baseline justify-between gap-4">
          <p className="eyebrow-sm text-ink-faint">{t.scenario}</p>
          <p className="text-[12.5px] text-ink-faint">{t.scenarioHint}</p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2.5">
          {SCENARIOS.map((scenario) => {
            const selected = scenario.id === scenarioId && !customScenario.trim();
            return (
              <button
                key={scenario.id}
                type="button"
                onClick={() => {
                  setScenarioId(scenario.id);
                  setCustomScenario("");
                }}
                className={`rounded-full px-4 py-2 text-[14px] transition-colors duration-200 ${
                  selected
                    ? "bg-ink text-paper"
                    : "bg-raised text-ink-soft hover:text-ink"
                }`}
              >
                {scenario[language]}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setScenarioId(randomScenario().id);
              setCustomScenario("");
            }}
            className="rounded-full px-4 py-2 text-[14px] text-ink-faint transition-colors duration-200 hover:text-ink"
          >
            {t.surprise}
          </button>
        </div>

        <input
          value={customScenario}
          onChange={(e) => setCustomScenario(e.target.value)}
          placeholder={t.ownScenario}
          className="mt-5 w-full rounded-[1.1rem] border border-line bg-raised px-5 py-3.5 text-[15px] outline-none transition-colors duration-200 placeholder:text-ink-faint focus:border-line-strong"
        />
      </section>

      <section className="mt-14 space-y-6">
        <Segmented
          label={t.aiRole}
          options={AI_ROLES.map((r) => ({ id: r.id, label: r[language] }))}
          value={aiRole}
          onChange={(v) => setAiRole(v as AiRole)}
        />
        <Segmented
          label={t.traineeRole}
          options={TRAINEE_ROLES.map((r) => ({ id: r.id, label: r[language] }))}
          value={traineeRole}
          onChange={(v) => setTraineeRole(v as TraineeRole)}
        />
        <Segmented
          label={t.difficulty}
          options={DIFFICULTIES.map((d) => ({ id: d.id, label: d[language] }))}
          value={difficulty}
          onChange={(v) => setDifficulty(v as Difficulty)}
        />
      </section>

      {error && (
        <p className="mt-10 rounded-[1rem] bg-raised px-5 py-4 text-[14px] text-ink-soft">
          {error}
        </p>
      )}

      <div className="mt-14 flex flex-wrap items-center gap-5">
        <button
          type="button"
          onClick={onStart}
          disabled={busy}
          className="rounded-full bg-ink px-7 py-3.5 text-[15.5px] font-medium text-paper transition-opacity duration-200 hover:opacity-90 disabled:opacity-50"
        >
          {t.start}
        </button>
        <p className="max-w-[26rem] text-[12.5px] leading-relaxed text-ink-faint">
          {t.notTheApp}
        </p>
      </div>
    </div>
  );
}
