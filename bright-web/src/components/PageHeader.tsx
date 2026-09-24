"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";
import { EASE } from "@/lib/motion";

type Props = {
  eyebrow: string;
  title: string;
  lede?: string;
  meta?: string;
  children?: ReactNode;
};

/** Top-of-page heading for subpages; animates on mount rather than on scroll. */
export default function PageHeader({ eyebrow, title, lede, meta, children }: Props) {
  const reduceMotion = useReducedMotion();

  const item = (delay: number): Variants =>
    reduceMotion
      ? { hidden: { opacity: 1 }, shown: { opacity: 1 } }
      : {
          hidden: { opacity: 0, y: 16 },
          shown: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE, delay } },
        };

  return (
    <section className="hero-wash relative">
      <motion.div
        initial="hidden"
        animate="shown"
        className="mx-auto w-full max-w-6xl px-5 pb-16 pt-16 sm:px-8 sm:pb-24 sm:pt-24"
      >
        <motion.p
          data-reveal=""
          variants={item(0)}
          className="eyebrow flex items-center gap-3 text-ink-faint"
        >
          <span aria-hidden="true" className="block h-px w-6 bg-line-strong" />
          {eyebrow}
        </motion.p>

        <motion.h1
          data-reveal=""
          variants={item(0.08)}
          className="display mt-6 max-w-3xl text-[clamp(2.4rem,6vw,4rem)]"
        >
          {title}
        </motion.h1>

        {lede && (
          <motion.p
            data-reveal=""
            variants={item(0.16)}
            className="mt-6 max-w-[38rem] text-[17px] leading-[1.68] text-ink-soft"
          >
            {lede}
          </motion.p>
        )}

        {meta && (
          <motion.p
            data-reveal=""
            variants={item(0.22)}
            className="mt-7 inline-flex items-center gap-2 rounded-full border border-line bg-raised/60 px-3 py-1.5 text-[12.5px] text-ink-muted"
          >
            <span aria-hidden="true" className="block size-1.5 rounded-full bg-ink-faint" />
            {meta}
          </motion.p>
        )}

        {children && (
          <motion.div data-reveal="" variants={item(0.28)} className="mt-9">
            {children}
          </motion.div>
        )}
      </motion.div>

      {/* Bottom edge fades out rather than ruling off. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-line to-transparent"
      />
    </section>
  );
}
