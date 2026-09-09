"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

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
          hidden: { opacity: 0, y: 18 },
          shown: { opacity: 1, y: 0, transition: { duration: 0.65, ease: EASE, delay } },
        };

  return (
    <section className="hero-wash border-b border-line">
      <motion.div
        initial="hidden"
        animate="shown"
        className="mx-auto w-full max-w-6xl px-5 pb-14 pt-14 sm:px-8 sm:pb-20 sm:pt-20"
      >
        <motion.p data-reveal="" variants={item(0)} className="eyebrow text-ink-faint">
          {eyebrow}
        </motion.p>
        <motion.h1
          data-reveal=""
          variants={item(0.08)}
          className="mt-5 max-w-3xl text-[clamp(2.2rem,5.5vw,3.6rem)] font-semibold leading-[1.05] tracking-[-0.04em]"
        >
          {title}
        </motion.h1>
        {lede && (
          <motion.p
            data-reveal=""
            variants={item(0.16)}
            className="mt-6 max-w-2xl text-[17px] leading-relaxed text-ink-soft"
          >
            {lede}
          </motion.p>
        )}
        {meta && (
          <motion.p
            data-reveal=""
            variants={item(0.22)}
            className="mt-6 text-[13px] text-ink-faint"
          >
            {meta}
          </motion.p>
        )}
        {children && (
          <motion.div data-reveal="" variants={item(0.28)} className="mt-8">
            {children}
          </motion.div>
        )}
      </motion.div>
    </section>
  );
}
