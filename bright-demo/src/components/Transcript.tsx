"use client";

import { useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import CountUp from "./CountUp";
import ResultCard from "./ResultCard";
import StreamedText from "./StreamedText";
import Thinking from "./Thinking";
import { EASE } from "@/lib/motion";
import type { Copy } from "@/lib/copy";
import { averageScore, type Session } from "@/lib/sessions";

/**
 * The conversation itself: assistant turns as plain text with no bubble, the
 * answer you gave in a soft bubble on the right, and the grade as a quiet
 * line under it.
 */
export default function Transcript({
  t,
  session,
  busy,
  error,
  onAgain,
}: {
  t: Copy;
  session: Session;
  busy: boolean;
  error: string | null;
  onAgain: () => void;
}) {
  const end = useRef<HTMLDivElement>(null);

  // Which replies have already played out. Reopening a session fills this with
  // everything already in it, so a stored transcript renders whole rather than
  // typing itself out again from the top.
  const played = useRef<Set<number>>(new Set());
  const openedSession = useRef<string | null>(null);
  if (openedSession.current !== session.id) {
    openedSession.current = session.id;
    played.current = new Set(session.messages.map((m) => m.id));
  }

  const markPlayed = useCallback((id: number) => {
    played.current.add(id);
  }, []);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [session.messages.length, busy, session.complete]);

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-10 pt-8 sm:px-6">
      <ol className="space-y-9">
        {session.messages.map((message) => (
          <motion.li
            key={message.id}
            layout="position"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE }}
          >
            {message.role === "ai" ? (
              <p className="text-[17px] leading-[1.8] text-ink">
                <StreamedText
                  text={message.text}
                  stream={!played.current.has(message.id)}
                  onDone={() => markPlayed(message.id)}
                />
              </p>
            ) : (
              <div className="flex flex-col items-end gap-3">
                <motion.p
                  initial={{ opacity: 0, y: 6, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.35, ease: EASE }}
                  className="max-w-[85%] rounded-[1.3rem] bg-raised px-5 py-3.5 text-[16px] leading-[1.7] text-ink"
                >
                  {message.text}
                </motion.p>

                <AnimatePresence>
                  {typeof message.score === "number" && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, ease: EASE, delay: 0.12 }}
                      className="flex max-w-[85%] items-baseline gap-3"
                    >
                      <span className="tnum shrink-0 text-[13px] font-semibold text-ink">
                        <CountUp value={message.score} />
                        <span className="text-ink-faint">{t.scoreOf}</span>
                      </span>
                      <p className="text-[14px] leading-[1.75] text-ink-muted">
                        {message.feedback}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.li>
        ))}

        <AnimatePresence>
          {busy && (
            <motion.li
              layout="position"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <Thinking label={t.thinking} />
            </motion.li>
          )}
        </AnimatePresence>
      </ol>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="mt-8 rounded-[1rem] bg-raised px-5 py-4 text-[14px] text-ink-soft"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {session.complete && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.15 }}
          className="mt-14 flex flex-col items-center gap-8"
        >
          <ResultCard
            scenario={session.config.scenario}
            score={averageScore(session.messages)}
            note={t.streak}
            slogan={t.slogan}
          />
          {session.wrapUp && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, ease: EASE, delay: 0.45 }}
              className="max-w-[34rem] text-center text-[16px] leading-[1.8] text-ink-soft"
            >
              {session.wrapUp}
            </motion.p>
          )}
          <motion.button
            type="button"
            onClick={onAgain}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className="rounded-full border border-line px-5 py-2.5 text-[14px] text-ink-muted transition-colors duration-200 hover:border-line-strong hover:text-ink"
          >
            {t.again}
          </motion.button>
        </motion.div>
      )}

      <div ref={end} />
    </div>
  );
}
