"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";
import { REVEAL } from "@/lib/motion";

type Props = {
  children: ReactNode;
  className?: string;
  delay?: number;
  /** Vertical travel in px; set to 0 for elements that shouldn't move. */
  y?: number;
  /** Adds a slight defocus to the entrance — used sparingly, for hero-adjacent blocks. */
  blur?: boolean;
};

/**
 * Scroll-triggered entrance: fade, a short rise, and an almost-imperceptible
 * scale so blocks feel like they settle rather than slide. Collapses to a plain
 * render when the visitor asks for reduced motion.
 */
export default function Reveal({
  children,
  className,
  delay = 0,
  y = 18,
  blur = false,
}: Props) {
  const reduceMotion = useReducedMotion();

  const variants: Variants = reduceMotion
    ? { hidden: { opacity: 1 }, shown: { opacity: 1 } }
    : {
        hidden: {
          opacity: 0,
          y,
          scale: 0.994,
          filter: blur ? "blur(6px)" : "blur(0px)",
        },
        shown: {
          opacity: 1,
          y: 0,
          scale: 1,
          filter: "blur(0px)",
          transition: { ...REVEAL, delay },
        },
      };

  return (
    <motion.div
      data-reveal=""
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
    >
      {children}
    </motion.div>
  );
}
