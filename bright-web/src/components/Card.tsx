"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { PRESS } from "@/lib/motion";

/**
 * Surface card: lifts a couple of pixels and deepens its shadow on hover.
 * Enough to feel responsive, not enough to be a bounce.
 */
export default function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      whileHover={reduceMotion ? undefined : { y: -3 }}
      transition={PRESS}
      className={[
        "sheen h-full rounded-[1.35rem] border border-line bg-raised transition-[border-color,box-shadow] duration-300 hover:border-line-strong hover:shadow-raise",
        className,
      ].join(" ")}
    >
      {children}
    </motion.div>
  );
}
