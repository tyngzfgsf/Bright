"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";
import { REVEAL } from "@/lib/motion";
import { useScrollDirection } from "@/lib/useScrollDirection";

type Props = {
  children: ReactNode;
  className?: string;
  delay?: number;
  /** Travel distance in px; set to 0 for elements that shouldn't move. */
  y?: number;
  /** Adds a slight defocus to the entrance — used sparingly. */
  blur?: boolean;
  /**
   * Animate only the first time. Long-form documents pass this: re-animating
   * paragraphs every time you scroll back over them is distracting to read.
   */
  once?: boolean;
};

/**
 * Scroll entrance that works in both directions: blocks rise into place on the
 * way down and drop into place on the way up, and settle back out once they're
 * fully past the viewport. Collapses to a plain render under reduced motion.
 */
export default function Reveal({
  children,
  className,
  delay = 0,
  y = 18,
  blur = false,
  once = false,
}: Props) {
  const reduceMotion = useReducedMotion();
  const { direction } = useScrollDirection();

  // Content arrives from the side of the screen it's actually coming from.
  const from = direction === "down" ? y : -y;

  const variants: Variants = reduceMotion
    ? { hidden: { opacity: 1 }, shown: { opacity: 1 } }
    : {
        hidden: {
          opacity: 0,
          y: from,
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
      // The bottom margin means a block waits until it's properly on screen
      // before arriving; the zero top margin means it only leaves once it's
      // fully past, so nothing fades while you can still read it.
      viewport={{ once, margin: "0px 0px -12% 0px" }}
    >
      {children}
    </motion.div>
  );
}
