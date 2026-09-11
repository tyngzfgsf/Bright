"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { PRESS } from "@/lib/motion";

/**
 * Surface card: lifts a couple of pixels on hover, and carries a soft highlight
 * that follows the pointer across it. Enough to feel responsive, not a bounce.
 */
export default function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  function trackPointer(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty(
      "--mx",
      `${((event.clientX - rect.left) / rect.width) * 100}%`,
    );
    event.currentTarget.style.setProperty(
      "--my",
      `${((event.clientY - rect.top) / rect.height) * 100}%`,
    );
  }

  return (
    <motion.div
      onPointerMove={reduceMotion ? undefined : trackPointer}
      whileHover={reduceMotion ? undefined : { y: -3 }}
      transition={PRESS}
      className={[
        "sheen spotlight relative h-full overflow-hidden rounded-[1.35rem] border border-line bg-raised transition-[border-color,box-shadow] duration-300 hover:border-line-strong hover:shadow-raise",
        className,
      ].join(" ")}
    >
      {children}
    </motion.div>
  );
}
