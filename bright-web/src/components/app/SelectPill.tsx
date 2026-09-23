"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EASE, PRESS } from "@/lib/motion";
import { CheckIcon, ChevronIcon } from "./Icons";

/**
 * A compact pill that opens a list of choices — the shape the chat products
 * use for their model pickers, and what replaced this demo's stacked setup
 * form. Label lives inside the pill so a row of them reads as one control bar.
 */
export default function SelectPill({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <motion.button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        whileHover={disabled ? undefined : { y: -1 }}
        whileTap={disabled ? undefined : { scale: 0.96 }}
        transition={PRESS}
        className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[13px] text-ink-muted transition-colors duration-200 hover:border-line-strong hover:text-ink disabled:opacity-40"
      >
        <span className="text-ink-faint">{label}</span>
        <span className="text-ink">{selected?.label ?? value}</span>
        <motion.span
          aria-hidden="true"
          animate={{ rotate: open ? 180 : 0 }}
          transition={PRESS}
          className="grid place-items-center"
        >
          <ChevronIcon className="size-[13px]" />
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial="hidden"
            animate="shown"
            exit="hidden"
            variants={{
              hidden: { opacity: 0, y: 6, scale: 0.97 },
              shown: {
                opacity: 1,
                y: 0,
                scale: 1,
                transition: { duration: 0.18, ease: EASE, staggerChildren: 0.03 },
              },
            }}
            className="absolute bottom-full left-0 z-40 mb-2 min-w-[12rem] origin-bottom-left overflow-hidden rounded-[1rem] border border-line bg-paper p-1.5 shadow-raise"
          >
            {options.map((option) => (
              <motion.li
                key={option.id}
                variants={{
                  hidden: { opacity: 0, x: -6 },
                  shown: { opacity: 1, x: 0 },
                }}
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={option.id === value}
                  onClick={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-[0.7rem] px-3 py-2 text-left text-[14px] text-ink-soft transition-colors duration-150 hover:bg-raised hover:text-ink"
                >
                  {option.label}
                  {option.id === value && <CheckIcon className="size-[15px] text-ink" />}
                </button>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
