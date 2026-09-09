"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import ShareCard from "./ShareCard";
import { EASE, PRESS } from "@/lib/motion";

type DemoMessage = { role: "scene" | "ai" | "user"; text: string };

const STEP_MS = 2100;
/** Beat between the last answer and the session's result card. */
const SETTLE_MS = 1500;
/** How long the result card stays up before the loop starts over. */
const CARD_MS = 5200;

/**
 * A stylised loop of the roleplay interaction. Illustrative only — it is not a
 * live session and not a screen recording, and the caption says so.
 */
export default function ChatDemo() {
  const t = useTranslations("demo");
  const messages = t.raw("messages") as DemoMessage[];
  const reduceMotion = useReducedMotion();
  const cardPhase = messages.length + 1;
  const [phase, setPhase] = useState(reduceMotion ? cardPhase : 1);

  useEffect(() => {
    if (reduceMotion) {
      setPhase(cardPhase);
      return;
    }
    const delay =
      phase === cardPhase
        ? CARD_MS
        : phase === messages.length
          ? SETTLE_MS
          : STEP_MS;
    const timer = window.setTimeout(
      () => setPhase(phase === cardPhase ? 1 : phase + 1),
      delay,
    );
    return () => window.clearTimeout(timer);
  }, [phase, cardPhase, messages.length, reduceMotion]);

  const visible = Math.min(phase, messages.length);
  const shown = messages.slice(0, visible);
  const pendingRole =
    phase < messages.length ? messages[visible]?.role : undefined;
  const showCard = phase === cardPhase;

  return (
    <figure className="relative m-0">
      {/* Floor shadow, so the device sits on the page instead of floating. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-10 bottom-6 h-24 rounded-[50%] bg-ink/10 blur-2xl dark:bg-black/60"
      />

      <div className="relative mx-auto w-full max-w-[19.5rem]">
        {/* Outer shell: two rings read as machined metal at any size. */}
        <div className="rounded-[2.6rem] bg-gradient-to-b from-line-strong to-line p-[1.5px] shadow-float">
          <div className="sheen rounded-[2.55rem] bg-paper p-[9px]">
            <div className="relative flex h-[31rem] flex-col overflow-hidden rounded-[2.05rem] bg-paper ring-1 ring-line">
              {/* Status bar + camera pill */}
              <div className="relative flex items-center justify-between px-5 pb-1 pt-3">
                <span className="tnum text-[11px] font-medium text-ink">
                  9:41
                </span>
                <span
                  aria-hidden="true"
                  className="absolute left-1/2 top-2 h-[18px] w-[62px] -translate-x-1/2 rounded-full bg-ink"
                />
                <span aria-hidden="true" className="flex items-center gap-1">
                  <svg
                    viewBox="0 0 20 12"
                    className="h-[9px] w-[15px] fill-ink"
                  >
                    <rect x="0" y="7" width="3" height="5" rx="1" />
                    <rect x="4.5" y="5" width="3" height="7" rx="1" />
                    <rect x="9" y="2.5" width="3" height="9.5" rx="1" />
                    <rect
                      x="13.5"
                      y="0"
                      width="3"
                      height="12"
                      rx="1"
                      opacity="0.35"
                    />
                  </svg>
                  <span className="ml-0.5 block h-[9px] w-[16px] rounded-[3px] border border-ink/70 p-[1.5px]">
                    <span className="block h-full w-2/3 rounded-[1px] bg-ink" />
                  </span>
                </span>
              </div>

              {/* App bar */}
              <div className="flex items-center justify-between border-b border-line-subtle px-4 pb-2.5 pt-2">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="grid size-6 place-items-center rounded-full bg-ink text-[10px] font-semibold text-paper"
                  >
                    B
                  </span>
                  <span className="text-[12.5px] font-medium tracking-[-0.01em]">
                    {t("label")}
                  </span>
                </span>
                <span aria-hidden="true" className="flex gap-[3px]">
                  <i className="block size-[3px] rounded-full bg-ink-faint" />
                  <i className="block size-[3px] rounded-full bg-ink-faint" />
                  <i className="block size-[3px] rounded-full bg-ink-faint" />
                </span>
              </div>

              {/* Transcript + composer, with room for the result overlay */}
              <div className="relative flex min-h-0 flex-1 flex-col">
                <div className="chat-mask flex flex-1 flex-col justify-end gap-2.5 overflow-hidden p-3.5">
                  <AnimatePresence initial={false}>
                    {shown.map((message, i) => (
                      <motion.div
                        // Stable per message so a step only mounts the new bubble;
                        // on loop reset the rest animate out instead of all of them.
                        key={`${i}-${message.role}`}
                        layout={!reduceMotion}
                        initial={
                          reduceMotion
                            ? false
                            : { opacity: 0, y: 14, scale: 0.97 }
                        }
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.5, ease: EASE }}
                        className={
                          message.role === "user"
                            ? "flex justify-end"
                            : "flex justify-start"
                        }
                      >
                        <Bubble role={message.role}>{message.text}</Bubble>
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {!reduceMotion && pendingRole && (
                    <div
                      className={
                        pendingRole === "user"
                          ? "flex justify-end"
                          : "flex justify-start"
                      }
                    >
                      <Typing />
                    </div>
                  )}
                </div>

                {/* Composer */}
                <div className="px-3.5 pb-3 pt-2">
                  <div className="flex items-center gap-2 rounded-full bg-sunken px-4 py-2.5 ring-1 ring-line-subtle">
                    <span className="flex-1 text-[12px] text-ink-faint">
                      <motion.span
                        aria-hidden="true"
                        className="inline-block h-[13px] w-px translate-y-[2px] bg-ink-faint"
                        animate={
                          reduceMotion ? undefined : { opacity: [1, 0, 1] }
                        }
                        transition={{
                          duration: 1.15,
                          repeat: Infinity,
                          ease: "linear",
                        }}
                      />
                    </span>
                    <span className="grid size-6 place-items-center rounded-full bg-ink">
                      <svg
                        viewBox="0 0 24 24"
                        className="size-[13px] text-paper"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 19V5M6 11l6-6 6 6" />
                      </svg>
                    </span>
                  </div>
                  <span
                    aria-hidden="true"
                    className="mx-auto mt-2.5 block h-[3.5px] w-28 rounded-full bg-ink/25"
                  />
                </div>

                {/* The card the app makes when a session ends, plus its share
                  button. Illustration only — the button doesn't do anything. */}
                <AnimatePresence>
                  {showCard && (
                    <motion.div
                      initial={reduceMotion ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.4, ease: EASE }}
                      className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-paper/85 px-4 backdrop-blur-[3px]"
                    >
                      <motion.div
                        initial={
                          reduceMotion
                            ? false
                            : { y: 16, scale: 0.96, opacity: 0 }
                        }
                        animate={{ y: 0, scale: 1, opacity: 1 }}
                        transition={PRESS}
                      >
                        <ShareCard />
                      </motion.div>

                      <motion.span
                        initial={reduceMotion ? false : { y: 10, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ duration: 0.45, ease: EASE, delay: 0.12 }}
                        className="flex items-center gap-2 rounded-full border border-line-strong px-4 py-2 text-[12px] font-medium"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="size-[13px]"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.9"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M12 15V4M8 7.5 12 3.5l4 4" />
                          <path d="M5 14v4.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V14" />
                        </svg>
                        {t("result.share")}
                      </motion.span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>

      <figcaption className="relative mt-5 text-center text-[12.5px] text-ink-faint">
        {t("caption")}
      </figcaption>
    </figure>
  );
}

function Bubble({
  role,
  children,
}: {
  role: DemoMessage["role"];
  children: React.ReactNode;
}) {
  if (role === "scene") {
    return (
      <span className="eyebrow-sm mx-auto rounded-full bg-sunken px-3 py-1 text-ink-muted ring-1 ring-line-subtle">
        {children}
      </span>
    );
  }

  const isUser = role === "user";
  return (
    <span
      className={[
        "max-w-[86%] rounded-[1.15rem] px-3.5 py-2.5 text-[12.5px] leading-[1.55]",
        isUser
          ? "rounded-br-[0.45rem] bg-ink text-paper shadow-soft"
          : "rounded-bl-[0.45rem] bg-sunken text-ink ring-1 ring-line-subtle",
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function Typing() {
  return (
    <span className="flex items-center gap-1 rounded-[1.15rem] rounded-bl-[0.45rem] bg-sunken px-3.5 py-3 ring-1 ring-line-subtle">
      {[0, 1, 2].map((i) => (
        <motion.i
          key={i}
          className="block size-1.5 rounded-full bg-ink-faint"
          animate={{ opacity: [0.25, 1, 0.25], y: [0, -1.5, 0] }}
          transition={{
            duration: 1.15,
            repeat: Infinity,
            delay: i * 0.16,
            ease: "easeInOut",
          }}
        />
      ))}
    </span>
  );
}
