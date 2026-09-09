"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { EASE } from "@/lib/motion";

type DemoMessage = { role: "scene" | "ai" | "user"; text: string };

const STEP_MS = 2300;
const HOLD_MS = 3600;

/**
 * A stylised loop of the roleplay interaction. Illustrative only — it is not a
 * live session and not a screen recording, and the caption says so.
 */
export default function ChatDemo() {
  const t = useTranslations("demo");
  const messages = t.raw("messages") as DemoMessage[];
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(reduceMotion ? messages.length : 1);

  useEffect(() => {
    if (reduceMotion) {
      setVisible(messages.length);
      return;
    }
    const done = visible >= messages.length;
    const timer = window.setTimeout(
      () => setVisible(done ? 1 : visible + 1),
      done ? HOLD_MS : STEP_MS,
    );
    return () => window.clearTimeout(timer);
  }, [visible, messages.length, reduceMotion]);

  const shown = messages.slice(0, visible);
  const pendingRole = messages[visible]?.role;

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
                <span className="tnum text-[11px] font-medium text-ink">9:41</span>
                <span
                  aria-hidden="true"
                  className="absolute left-1/2 top-2 h-[18px] w-[62px] -translate-x-1/2 rounded-full bg-ink"
                />
                <span aria-hidden="true" className="flex items-center gap-1">
                  <svg viewBox="0 0 20 12" className="h-[9px] w-[15px] fill-ink">
                    <rect x="0" y="7" width="3" height="5" rx="1" />
                    <rect x="4.5" y="5" width="3" height="7" rx="1" />
                    <rect x="9" y="2.5" width="3" height="9.5" rx="1" />
                    <rect x="13.5" y="0" width="3" height="12" rx="1" opacity="0.35" />
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

              {/* Transcript */}
              <div className="chat-mask flex flex-1 flex-col justify-end gap-2.5 overflow-hidden p-3.5">
                <AnimatePresence initial={false}>
                  {shown.map((message, i) => (
                    <motion.div
                      // Stable per message so a step only mounts the new bubble;
                      // on loop reset the rest animate out instead of all of them.
                      key={`${i}-${message.role}`}
                      layout={!reduceMotion}
                      initial={
                        reduceMotion ? false : { opacity: 0, y: 14, scale: 0.97 }
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
                      pendingRole === "user" ? "flex justify-end" : "flex justify-start"
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
                      animate={reduceMotion ? undefined : { opacity: [1, 0, 1] }}
                      transition={{ duration: 1.15, repeat: Infinity, ease: "linear" }}
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
