"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import Magnetic from "./Magnetic";
import { ArrowUpIcon } from "./Icons";
import { PRESS } from "@/lib/motion";

/**
 * The input box, shared by the new-session screen and a running session.
 *
 * `tools` is the row that sits inside the box under the text — the scenario
 * and role pickers on a new session, nothing once one is running. Keeping
 * them inside the composer is what stops the page needing a settings form.
 */
export default function Composer({
  value,
  onChange,
  onSubmit,
  placeholder,
  sendLabel,
  busy = false,
  autoFocus = false,
  tools,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  sendLabel: string;
  busy?: boolean;
  autoFocus?: boolean;
  tools?: React.ReactNode;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);

  function grow() {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }

  // Shrink back after a send clears the value, not just while typing.
  useEffect(grow, [value]);

  useEffect(() => {
    if (autoFocus) field.current?.focus();
  }, [autoFocus]);

  /** Feeds the .spotlight gradient so the box lights under the pointer. */
  function trackPointer(event: React.PointerEvent<HTMLDivElement>) {
    const el = box.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${event.clientX - rect.left}px`);
    el.style.setProperty("--my", `${event.clientY - rect.top}px`);
  }

  const ready = !busy && value.trim().length > 0;

  return (
    <motion.div
      ref={box}
      onPointerMove={trackPointer}
      animate={{
        boxShadow: focused
          ? "0 0 0 3px var(--glow), var(--shadow-md)"
          : "0 0 0 0px var(--glow), var(--shadow-sm)",
      }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="spotlight relative rounded-[1.65rem] border border-line bg-raised px-3 pb-2.5 pt-3 transition-colors duration-300 focus-within:border-line-strong"
    >
      <textarea
        ref={field}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
        rows={1}
        placeholder={placeholder}
        className="relative z-10 max-h-[220px] w-full resize-none bg-transparent px-2 py-1.5 text-[16px] leading-[1.7] outline-none placeholder:text-ink-faint"
      />

      <div className="relative z-10 mt-1.5 flex items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{tools}</div>

        <Magnetic strength={0.35} className="shrink-0">
          <motion.button
            type="button"
            onClick={onSubmit}
            disabled={!ready}
            aria-label={sendLabel}
            animate={{
              scale: ready ? 1 : 0.9,
              opacity: ready ? 1 : 0.25,
            }}
            whileHover={ready ? { scale: 1.08 } : undefined}
            whileTap={ready ? { scale: 0.9 } : undefined}
            transition={PRESS}
            className="grid size-9 place-items-center rounded-full bg-ink text-paper"
          >
            <ArrowUpIcon />
          </motion.button>
        </Magnetic>
      </div>
    </motion.div>
  );
}
