"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { EASE } from "@/lib/motion";

type Item = { q: string; a: string };

export default function FaqList() {
  const t = useTranslations("faq");
  const items = t.raw("items") as Item[];
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <ul className="border-t border-line">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <li key={item.q} className="border-b border-line">
            <h3>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="group flex w-full items-start justify-between gap-6 py-6 text-left"
              >
                <span
                  className={[
                    "text-[16.5px] font-medium tracking-[-0.018em] transition-colors duration-300",
                    isOpen ? "text-ink" : "text-ink-soft group-hover:text-ink",
                  ].join(" ")}
                >
                  {item.q}
                </span>
                <motion.span
                  aria-hidden="true"
                  animate={{ rotate: isOpen ? 45 : 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.3, ease: EASE }}
                  className={[
                    "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border transition-colors duration-300",
                    isOpen
                      ? "border-ink bg-ink text-paper"
                      : "border-line text-ink-faint group-hover:border-line-strong group-hover:text-ink-soft",
                  ].join(" ")}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="size-[13px]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </motion.span>
              </button>
            </h3>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  animate={reduceMotion ? { opacity: 1 } : { height: "auto", opacity: 1 }}
                  exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  transition={{ duration: 0.34, ease: EASE }}
                  className="overflow-hidden"
                >
                  <p className="max-w-[42rem] pb-7 pr-12 text-[15.5px] leading-[1.78] text-ink-soft">
                    {item.a}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </li>
        );
      })}
    </ul>
  );
}
