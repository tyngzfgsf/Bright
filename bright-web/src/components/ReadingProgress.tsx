"use client";

import { motion, useReducedMotion, useScroll, useSpring } from "framer-motion";

/** Hairline progress bar under the header — orientation on a long document. */
export default function ReadingProgress() {
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 180,
    damping: 32,
    restDelta: 0.001,
  });

  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX: reduceMotion ? scrollYProgress : scaleX }}
      className="fixed inset-x-0 top-16 z-40 h-px origin-left bg-ink/60"
    />
  );
}
