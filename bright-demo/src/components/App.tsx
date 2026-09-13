"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ChillPlayer from "./ChillPlayer";
import Composer from "./Composer";
import Cursor from "./Cursor";
import Sidebar from "./Sidebar";
import SettingsDialog, { type SettingsSection } from "./SettingsDialog";
import SignInDialog from "./SignInDialog";
import Transcript from "./Transcript";
import Welcome from "./Welcome";
import { PlusIcon, SidebarIcon } from "./Icons";
import { COPY } from "@/lib/copy";
import { EASE, GLIDE, PRESS } from "@/lib/motion";
import { usePrefs } from "@/lib/prefs";
import {
  END_SESSION_MARKER,
  buildSystemPrompt,
  endSessionPrompt,
  openingPrompt,
  type TurnResult,
} from "@/lib/prompt";
import { scenarioLabel } from "@/lib/scenarios";
import { SCRIPTED_SCENARIO, scriptedTurn, scriptedWrapUp } from "@/lib/script";
import {
  loadSessions,
  newSessionId,
  saveSessions,
  type ApiMessage,
  type Session,
} from "@/lib/sessions";
import { STORAGE, writeRaw } from "@/lib/storage";
import { useAuth } from "@/lib/auth";

/** bright-proxy. Baked in at build time; `wrangler dev` serves it on 8787 locally. */
const PROXY_URL = process.env.NEXT_PUBLIC_PROXY_URL ?? "http://localhost:8787";

/** What one round trip produces: the graded turn plus the session's new tail. */
type TurnOutcome = { turn: TurnResult; history: ApiMessage[]; scriptStep: number };

function nextMessageId(session: Session): number {
  return session.messages.reduce((max, m) => Math.max(max, m.id), -1) + 1;
}

function byRecency(list: Session[]): Session[] {
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
}

export default function App() {
  const prefs = usePrefs();
  const t = COPY[prefs.language];

  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("general");
  const [signInOpen, setSignInOpen] = useState(false);
  /** Chill mode's wash behind the transcript, on while something is playing. */
  const [chilling, setChilling] = useState(false);

  // Async turns read the session as it was when they started, so they need a
  // mirror that isn't a stale closure over `sessions`.
  const sessionsRef = useRef<Session[]>([]);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    setSessions(loadSessions());
  }, []);

  const active = sessions.find((s) => s.id === activeId) ?? null;
  const { user, getIdToken } = useAuth();
  // Own key → BYOK through the proxy. Signed in without one → Bright's hosted AI, metered per
  // day. Neither → the canned script.
  const scripted = prefs.apiKey.trim() === "" && !user;

  const commit = useCallback((list: Session[]) => {
    const sorted = byRecency(list);
    sessionsRef.current = sorted;
    setSessions(sorted);
    saveSessions(sorted);
  }, []);

  const patchSession = useCallback(
    (id: string, patch: (session: Session) => Session) => {
      commit(sessionsRef.current.map((s) => (s.id === id ? patch(s) : s)));
    },
    [commit],
  );

  /** One turn: the canned reply, or a real round trip through bright-proxy. */
  const takeTurn = useCallback(
    async (session: Session, userContent: string): Promise<TurnOutcome> => {
      if (session.config.scripted) {
        await new Promise((resolve) => setTimeout(resolve, 650));
        const ending = userContent.startsWith(END_SESSION_MARKER);
        const turn = ending
          ? scriptedWrapUp(session.config.language)
          : scriptedTurn(session.config.language, session.scriptStep);
        return {
          turn,
          history: session.history,
          scriptStep: ending ? session.scriptStep : session.scriptStep + 1,
        };
      }

      const sent: ApiMessage[] = [
        ...session.history,
        { role: "user", content: userContent },
      ];

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const ownKey = prefs.apiKey.trim();
      if (ownKey) {
        headers["X-Groq-Key"] = ownKey;
      } else {
        const token = await getIdToken();
        if (!token) throw new Error(t.signInRequired);
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(`${PROXY_URL}/v1/turn`, {
        method: "POST",
        headers,
        body: JSON.stringify({ messages: sent }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        if (payload?.code === "quota_exceeded") throw new Error(t.quotaExceeded);
        if (payload?.code === "unauthenticated") throw new Error(t.signInRequired);
        throw new Error(payload?.error ?? t.error);
      }

      const turn = payload.turn as TurnResult;
      return {
        turn,
        history: [...sent, { role: "assistant", content: JSON.stringify(turn) }],
        scriptStep: session.scriptStep,
      };
    },
    [prefs.apiKey, getIdToken, t.error, t.quotaExceeded, t.signInRequired],
  );

  /** Opens a session and asks the first question. */
  const start = useCallback(
    async (scenarioText: string, scenarioId: string | null) => {
      if (busy) return;

      // Without a key the transcript comes from the canned script, which is
      // its own fixed case — so that is what the session is named after.
      const displayScenario = scripted
        ? SCRIPTED_SCENARIO[prefs.language]
        : scenarioText;

      const now = Date.now();
      const session: Session = {
        id: newSessionId(),
        title: displayScenario,
        createdAt: now,
        updatedAt: now,
        config: {
          scenario: displayScenario,
          scenarioId,
          aiRole: prefs.aiRole,
          traineeRole: prefs.traineeRole,
          difficulty: prefs.difficulty,
          language: prefs.language,
          scripted,
        },
        messages: [],
        history: [
          {
            role: "system",
            content: buildSystemPrompt({
              scenarioDescription: displayScenario,
              aiRole: prefs.aiRole,
              traineeRole: prefs.traineeRole,
              difficulty: prefs.difficulty,
              language: prefs.language,
            }),
          },
        ],
        scriptStep: 0,
        complete: false,
        wrapUp: null,
      };

      commit([session, ...sessionsRef.current]);
      setActiveId(session.id);
      setDraft("");
      setError(null);
      setBusy(true);
      setDrawerOpen(false);

      try {
        const outcome = await takeTurn(session, openingPrompt(prefs.language));
        patchSession(session.id, (s) => ({
          ...s,
          messages: [
            ...s.messages,
            { id: nextMessageId(s), role: "ai", text: outcome.turn.next_prompt },
          ],
          history: outcome.history,
          scriptStep: outcome.scriptStep,
          updatedAt: Date.now(),
        }));
      } catch (e) {
        // An opening turn that never landed leaves nothing worth keeping in
        // the rail — drop it and put the request back in the composer.
        commit(sessionsRef.current.filter((s) => s.id !== session.id));
        setActiveId(null);
        if (!scenarioId) setDraft(scenarioText);
        setError(e instanceof Error ? e.message : t.error);
      } finally {
        setBusy(false);
      }
    },
    [busy, commit, patchSession, prefs, scripted, t.error, takeTurn],
  );

  /** Sends the typed answer and hangs its grade off it. */
  const answer = useCallback(async () => {
    const session = active;
    const text = draft.trim();
    if (!session || !text || busy || session.complete) return;

    setDraft("");
    setError(null);
    patchSession(session.id, (s) => ({
      ...s,
      messages: [...s.messages, { id: nextMessageId(s), role: "user", text }],
      updatedAt: Date.now(),
    }));
    setBusy(true);

    try {
      const outcome = await takeTurn(session, text);
      patchSession(session.id, (s) => {
        const last = s.messages.length - 1;
        const graded = s.messages.map((m, i) =>
          i === last
            ? { ...m, score: outcome.turn.score, feedback: outcome.turn.feedback }
            : m,
        );
        return {
          ...s,
          messages: outcome.turn.session_complete
            ? graded
            : [
                ...graded,
                {
                  id: nextMessageId(s),
                  role: "ai" as const,
                  text: outcome.turn.next_prompt,
                },
              ],
          history: outcome.history,
          scriptStep: outcome.scriptStep,
          complete: outcome.turn.session_complete,
          wrapUp: outcome.turn.session_complete ? outcome.turn.next_prompt : s.wrapUp,
          updatedAt: Date.now(),
        };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t.error);
    } finally {
      setBusy(false);
    }
  }, [active, busy, draft, patchSession, t.error, takeTurn]);

  /** Asks for the wrap-up and closes the session out. */
  const end = useCallback(async () => {
    const session = active;
    if (!session || busy || session.complete) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await takeTurn(session, endSessionPrompt(session.config.language));
      patchSession(session.id, (s) => ({
        ...s,
        history: outcome.history,
        scriptStep: outcome.scriptStep,
        complete: true,
        wrapUp: outcome.turn.next_prompt,
        updatedAt: Date.now(),
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t.error);
    } finally {
      setBusy(false);
    }
  }, [active, busy, patchSession, t.error, takeTurn]);

  function openNew() {
    if (busy) return;
    setActiveId(null);
    setDraft("");
    setError(null);
    setDrawerOpen(false);
  }

  function selectSession(id: string) {
    setActiveId(id);
    setDraft("");
    setError(null);
    setDrawerOpen(false);
  }

  function deleteSession(id: string) {
    commit(sessionsRef.current.filter((s) => s.id !== id));
    if (id === activeId) setActiveId(null);
  }

  function clearSessions() {
    commit([]);
    setActiveId(null);
    writeRaw(STORAGE.sessions, null);
  }

  function openSettings(section: SettingsSection) {
    setSettingsSection(section);
    setSettingsOpen(true);
    setDrawerOpen(false);
  }

  const rail = (instanceId: string) => (
    <Sidebar
      instanceId={instanceId}
      t={t}
      sessions={sessions}
      activeId={activeId}
      onSelect={selectSession}
      onNew={openNew}
      onDelete={deleteSession}
      onOpenSettings={() => openSettings("general")}
      onOpenAccount={() => setSignInOpen(true)}
      onCollapse={() => {
        setCollapsed(true);
        setDrawerOpen(false);
      }}
    />
  );

  const running = active !== null && !active.complete;

  return (
    <div className="flex h-dvh overflow-hidden bg-paper">
      {/* Collapsing slides the rail out rather than unmounting it, so the
          list doesn't replay its entrance every time it comes back. */}
      <motion.div
        initial={false}
        animate={{ width: collapsed ? 0 : "17.5rem" }}
        transition={GLIDE}
        className="hidden shrink-0 overflow-hidden lg:block"
      >
        <div className="h-full w-[17.5rem]">{rail("desktop")}</div>
      </motion.div>

      {/* Under lg the rail is a drawer over the page rather than beside it. */}
      <AnimatePresence>
        {drawerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 lg:hidden"
          >
            <div
              className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
              onClick={() => setDrawerOpen(false)}
            />
            <motion.div
              initial={{ x: -24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -24, opacity: 0 }}
              transition={{ duration: 0.26, ease: EASE }}
              className="absolute inset-y-0 left-0 shadow-float"
            >
              {rail("drawer")}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Chill mode lights the room the transcript sits in. */}
        <AnimatePresence>
          {chilling && (
            <motion.div
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2, ease: EASE }}
              className="chill-wash pointer-events-none absolute inset-0 z-0"
            />
          )}
        </AnimatePresence>

        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-1 bg-paper/85 px-3 backdrop-blur-xl">
          <motion.button
            type="button"
            onClick={() => {
              setDrawerOpen(true);
              setCollapsed(false);
            }}
            aria-label={t.openSidebar}
            title={t.openSidebar}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.9 }}
            transition={PRESS}
            className={`grid size-9 place-items-center rounded-[0.65rem] text-ink-faint transition-colors duration-200 hover:bg-raised hover:text-ink ${
              collapsed ? "" : "lg:hidden"
            }`}
          >
            <SidebarIcon />
          </motion.button>
          <motion.button
            type="button"
            onClick={openNew}
            aria-label={t.newSession}
            title={t.newSession}
            whileHover={{ scale: 1.08, rotate: 90 }}
            whileTap={{ scale: 0.9 }}
            transition={PRESS}
            className={`grid size-9 place-items-center rounded-[0.65rem] text-ink-faint transition-colors duration-200 hover:bg-raised hover:text-ink ${
              collapsed ? "" : "lg:hidden"
            }`}
          >
            <PlusIcon />
          </motion.button>

          <AnimatePresence mode="wait" initial={false}>
            {active && (
              <motion.span
                key={active.id}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.2, ease: EASE }}
                className="ml-2 flex min-w-0 items-center gap-2"
              >
                <span className="truncate text-[14px] font-medium">{active.title}</span>
                <span className="hidden shrink-0 rounded-full bg-raised px-2 py-0.5 text-[10.5px] text-ink-faint sm:inline">
                  {active.config.scripted ? t.scriptedChip : t.liveChip}
                </span>
              </motion.span>
            )}
          </AnimatePresence>

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <AnimatePresence>
              {running && (
                <motion.button
                  type="button"
                  onClick={end}
                  disabled={busy}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.96 }}
                  transition={PRESS}
                  className="rounded-full border border-line px-3.5 py-1.5 text-[13px] text-ink-muted transition-colors duration-200 hover:border-line-strong hover:text-ink disabled:opacity-40"
                >
                  {t.endSession}
                </motion.button>
              )}
            </AnimatePresence>

            <ChillPlayer
              t={t}
              language={prefs.language}
              onPlayingChange={setChilling}
            />
          </div>
        </header>

        <main className="relative z-[1] min-h-0 flex-1 overflow-y-auto">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={active?.id ?? "new"}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.24, ease: EASE }}
              className="flex min-h-full flex-col"
            >
              {active ? (
                <Transcript
                  t={t}
                  session={active}
                  busy={busy}
                  error={error}
                  onAgain={openNew}
                />
              ) : (
                <Welcome
                  t={t}
                  draft={draft}
                  onDraftChange={setDraft}
                  onSubmit={() => {
                    const text = draft.trim();
                    if (text) start(text, null);
                  }}
                  onPickScenario={(id) => start(scenarioLabel(id, prefs.language), id)}
                  onOpenKeySettings={() => openSettings("key")}
                  busy={busy}
                  error={error}
                  scripted={scripted}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        <AnimatePresence>
          {running && (
            <motion.div
              initial={{ y: 48, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 48, opacity: 0 }}
              transition={{ duration: 0.38, ease: EASE }}
              className="relative z-[1] shrink-0 bg-gradient-to-t from-paper via-paper to-transparent pt-5"
            >
              <div className="mx-auto w-full max-w-3xl px-5 pb-4 sm:px-6">
                <Composer
                  value={draft}
                  onChange={setDraft}
                  onSubmit={answer}
                  placeholder={t.placeholder}
                  sendLabel={t.send}
                  busy={busy}
                />
                <p className="mt-2.5 text-center text-[12px] text-ink-faint">
                  {active.config.scripted ? t.scriptedBanner : t.liveBanner}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        t={t}
        section={settingsSection}
        onSectionChange={setSettingsSection}
        onSignIn={() => {
          setSettingsOpen(false);
          setSignInOpen(true);
        }}
        onClearSessions={clearSessions}
        sessionCount={sessions.length}
      />

      <SignInDialog open={signInOpen} onClose={() => setSignInOpen(false)} t={t} />

      {/* Last, and above everything: the dot and ring that replace the
          system cursor on a real mouse. */}
      <Cursor />
    </div>
  );
}
