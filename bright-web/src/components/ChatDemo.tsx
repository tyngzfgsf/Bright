"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

type DemoMessage = { role: "scene" | "ai" | "user"; text: string };

const STEP_MS = 2200;
const HOLD_MS = 3400;

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
    <figure className="m-0">
      <div className="relative mx-auto w-full max-w-[19rem] rounded-[2.25rem] border border-line-strong bg-raised p-2 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.45)]">
        <div className="flex h-[30rem] flex-col overflow-hidden rounded-[1.75rem] border border-line bg-paper">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-[12px] font-medium tracking-[-0.01em]">
              {t("label")}
            </span>
            <span className="flex gap-1" aria-hidden="true">
              <i className="block size-1 rounded-full bg-ink-faint" />
              <i className="block size-1 rounded-full bg-ink-faint" />
              <i className="block size-1 rounded-full bg-ink-faint" />
            </span>
          </div>

          <div className="chat-mask flex flex-1 flex-col justify-end gap-2.5 overflow-hidden p-3.5">
            <AnimatePresence initial={false}>
              {shown.map((message, i) => (
                <motion.div
                  // Stable per message so a step only mounts the new bubble;
                  // on loop reset the rest animate out instead of all of them.
                  key={`${i}-${message.role}`}
                  layout={!reduceMotion}
                  initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className={
                    message.role === "user" ? "flex justify-end" : "flex justify-start"
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

          <div className="border-t border-line px-3.5 py-3">
            <div className="flex items-center gap-2 rounded-full border border-line px-3.5 py-2">
              <span className="text-[12px] text-ink-faint">|</span>
              <span className="h-3 flex-1" />
              <span className="grid size-5 place-items-center rounded-full bg-ink text-paper text-[10px]">
                ↑
              </span>
            </div>
          </div>
        </div>
      </div>

      <figcaption className="mt-4 text-center text-[12.5px] text-ink-faint">
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
      <span className="eyebrow-sm mx-auto rounded-full border border-line px-3 py-1 text-ink-faint">
        {children}
      </span>
    );
  }

  const isUser = role === "user";
  return (
    <span
      className={[
        "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-relaxed",
        isUser
          ? "rounded-br-md bg-ink text-paper"
          : "rounded-bl-md border border-line bg-raised text-ink",
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function Typing() {
  return (
    <span className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-line bg-raised px-3 py-3">
      {[0, 1, 2].map((i) => (
        <motion.i
          key={i}
          className="block size-1.5 rounded-full bg-ink-faint"
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{
            duration: 1.1,
            repeat: Infinity,
            delay: i * 0.18,
            ease: "easeInOut",
          }}
        />
      ))}
    </span>
  );
}
