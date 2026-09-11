"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import BrightMark from "./BrightMark";
import ResultCard from "./ResultCard";
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
      <header className="sticky top-0 z-30 border-b border-line-subtle bg-paper/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between gap-3 px-5">
          <span className="flex items-center gap-2.5">
            <BrightMark className="size-[20px]" />
            <span className="text-[15px] font-semibold tracking-[-0.02em]">Bright</span>
            <span className="eyebrow-sm rounded-full border border-line px-2 py-0.5 text-ink-faint">
              {t.demoChip}
            </span>
          </span>

          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-full border border-line p-0.5 text-[11px] font-medium">
              {(["en", "ko"] as Language[]).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLanguage(code)}
                  aria-pressed={language === code}
                  className={`rounded-full px-2.5 py-1 transition-colors duration-200 ${
                    language === code ? "bg-ink text-paper" : "text-ink-faint hover:text-ink"
                  }`}
                >
                  {code.toUpperCase()}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setKeyDraft(apiKey);
                setKeyOpen(true);
              }}
              className="rounded-full border border-line px-3.5 py-1.5 text-[12.5px] text-ink-soft transition-colors duration-200 hover:border-line-strong hover:text-ink"
            >
              {t.key}
              <span className={`ml-2 inline-block size-1.5 rounded-full align-middle ${scripted ? "bg-ink-faint" : "bg-ink"}`} />
            </button>
            {phase === "session" && (
              <button
                type="button"
                onClick={end}
                disabled={busy}
                className="rounded-full bg-ink px-3.5 py-1.5 text-[12.5px] font-medium text-paper transition-opacity duration-200 hover:opacity-90 disabled:opacity-50"
              >
                {t.endSession}
              </button>
            )}
          </div>
        </div>

        <p
          className={`px-5 py-2 text-center text-[12px] ${
            scripted ? "bg-sunken text-ink-muted" : "bg-ink text-paper"
          }`}
        >
          {scripted ? t.scriptedBanner : t.liveBanner}
        </p>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-5">
        {phase === "setup" && (
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
        )}

        {phase !== "setup" && (
          <div className="flex flex-1 flex-col py-8">
            <ol className="flex-1 space-y-6">
              {messages.map((message) => (
                <motion.li
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: EASE }}
                  className={message.role === "user" ? "flex justify-end" : ""}
                >
                  {message.role === "ai" ? (
                    <div className="max-w-[46rem] rounded-[1.2rem] rounded-bl-md bg-raised px-5 py-4 text-[15.5px] leading-[1.7] ring-1 ring-line-subtle">
                      {message.text}
                    </div>
                  ) : (
                    <div className="max-w-[40rem]">
                      <div className="rounded-[1.2rem] rounded-br-md bg-ink px-5 py-4 text-[15.5px] leading-[1.7] text-paper">
                        {message.text}
                      </div>
                      {typeof message.score === "number" && (
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.45, ease: EASE, delay: 0.1 }}
                          className="mt-2.5 flex items-start justify-end gap-3"
                        >
                          <p className="max-w-[32rem] text-right text-[13.5px] leading-relaxed text-ink-muted">
                            {message.feedback}
                          </p>
                          <span className="tnum shrink-0 rounded-full border border-line-strong px-2.5 py-1 text-[12.5px] font-semibold">
                            {message.score}
                            <span className="text-ink-faint">{t.scoreOf}</span>
                          </span>
                        </motion.div>
                      )}
                    </div>
                  )}
                </motion.li>
              ))}

              {busy && (
                <li className="flex items-center gap-2 text-[13.5px] text-ink-faint">
                  <motion.span
                    className="block size-1.5 rounded-full bg-ink-faint"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.1, repeat: Infinity }}
                  />
                  {t.thinking}
                </li>
              )}
            </ol>

            {error && (
              <p className="mt-4 rounded-[1rem] border border-line bg-raised px-4 py-3 text-[13.5px] text-ink-soft">
                {error}
              </p>
            )}

            {phase === "complete" && (
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: EASE }}
                className="mt-10 flex flex-col items-center gap-7 border-t border-line-subtle pt-10"
              >
                <ResultCard
                  scenario={scripted ? SCRIPTED_SCENARIO[language] : scenarioText}
                  score={average}
                  note={t.streak}
                  slogan={t.slogan}
                />
                {wrapUp && (
                  <div className="max-w-[42rem] text-center">
                    <p className="eyebrow-sm text-ink-faint">{t.wrapUp}</p>
                    <p className="mt-3 text-[15.5px] leading-[1.75] text-ink-soft">
                      {wrapUp}
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setPhase("setup")}
                  className="rounded-full border border-line-strong px-5 py-3 text-[14.5px] font-medium transition-colors duration-200 hover:border-ink"
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
        <div className="sticky bottom-0 border-t border-line-subtle bg-paper/85 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-4xl items-end gap-3 px-5 py-4">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  answer();
                }
              }}
              rows={1}
              placeholder={t.placeholder}
              className="min-h-[3rem] flex-1 resize-none rounded-[1.2rem] border border-line bg-raised px-4 py-3 text-[15px] leading-[1.6] outline-none transition-colors duration-200 placeholder:text-ink-faint focus:border-line-strong"
            />
            <button
              type="button"
              onClick={answer}
              disabled={busy || !draft.trim()}
              className="rounded-full bg-ink px-5 py-3 text-[14.5px] font-medium text-paper transition-opacity duration-200 hover:opacity-90 disabled:opacity-40"
            >
              {t.send}
            </button>
          </div>
          <p className="pb-3 text-center text-[11.5px] text-ink-faint">{t.notTheApp}</p>
        </div>
      )}

      <AnimatePresence>
        {keyOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center bg-ink/30 px-5 backdrop-blur-sm"
            onClick={() => setKeyOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.99 }}
              transition={{ duration: 0.3, ease: EASE }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-[1.4rem] border border-line bg-paper p-7 shadow-float"
            >
              <h2 className="text-[18px] font-semibold tracking-[-0.02em]">{t.keyTitle}</h2>
              <p className="mt-3 text-[14px] leading-[1.7] text-ink-soft">{t.keyBody}</p>
              <input
                type="password"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder={t.keyPlaceholder}
                className="mt-5 w-full rounded-[0.9rem] border border-line bg-raised px-4 py-3 font-mono text-[14px] outline-none focus:border-line-strong"
              />
              <div className="mt-5 flex flex-wrap items-center gap-3">
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
                    className="rounded-full border border-line-strong px-5 py-2.5 text-[14px] transition-colors duration-200 hover:border-ink"
                  >
                    {t.keyClear}
                  </button>
                )}
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] text-ink-muted underline-offset-4 hover:text-ink hover:underline"
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
    <div className="py-12 sm:py-16">
      <h1 className="display text-[clamp(1.9rem,4.5vw,2.6rem)]">{t.setupTitle}</h1>
      <p className="mt-4 max-w-[38rem] text-[15.5px] leading-[1.7] text-ink-soft">
        {t.setupLede}
      </p>

      <section className="mt-10">
        <p className="eyebrow-sm text-ink-faint">{t.scenario}</p>
        <div className="mt-4 flex flex-wrap gap-2">
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
                className={`rounded-full border px-4 py-2 text-[14px] transition-colors duration-200 ${
                  selected
                    ? "border-ink bg-ink text-paper"
                    : "border-line text-ink-soft hover:border-line-strong hover:text-ink"
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
            className="rounded-full border border-dashed border-line-strong px-4 py-2 text-[14px] text-ink-muted transition-colors duration-200 hover:text-ink"
          >
            {t.surprise}
          </button>
        </div>
        <input
          value={customScenario}
          onChange={(e) => setCustomScenario(e.target.value)}
          placeholder={t.ownScenario}
          className="mt-4 w-full max-w-[32rem] rounded-[0.9rem] border border-line bg-raised px-4 py-3 text-[14.5px] outline-none transition-colors duration-200 placeholder:text-ink-faint focus:border-line-strong"
        />
      </section>

      <div className="mt-10 grid gap-8 sm:grid-cols-3">
        <Choice
          label={t.aiRole}
          options={AI_ROLES.map((r) => ({ id: r.id, label: r[language] }))}
          value={aiRole}
          onChange={(v) => setAiRole(v as AiRole)}
        />
        <Choice
          label={t.traineeRole}
          options={TRAINEE_ROLES.map((r) => ({ id: r.id, label: r[language] }))}
          value={traineeRole}
          onChange={(v) => setTraineeRole(v as TraineeRole)}
        />
        <Choice
          label={t.difficulty}
          options={DIFFICULTIES.map((d) => ({ id: d.id, label: d[language] }))}
          value={difficulty}
          onChange={(v) => setDifficulty(v as Difficulty)}
        />
      </div>

      {error && (
        <p className="mt-8 rounded-[1rem] border border-line bg-raised px-4 py-3 text-[13.5px] text-ink-soft">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={onStart}
        disabled={busy}
        className="mt-10 rounded-full bg-ink px-6 py-3.5 text-[15.5px] font-medium text-paper transition-opacity duration-200 hover:opacity-90 disabled:opacity-50"
      >
        {t.start}
      </button>

      <p className="mt-6 max-w-[34rem] text-[12.5px] leading-relaxed text-ink-faint">
        {t.notTheApp}
      </p>
    </div>
  );
}

function Choice({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div>
      <p className="eyebrow-sm text-ink-faint">{label}</p>
      <div className="mt-4 space-y-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`flex w-full items-center gap-3 rounded-[0.9rem] border px-4 py-2.5 text-left text-[14px] transition-colors duration-200 ${
              value === option.id
                ? "border-line-strong bg-raised text-ink"
                : "border-line text-ink-muted hover:text-ink"
            }`}
          >
            <span
              className={`block size-2 shrink-0 rounded-full ${
                value === option.id ? "bg-ink" : "border border-line-strong"
              }`}
            />
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
