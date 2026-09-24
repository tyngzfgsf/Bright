"use client";

import { useEffect } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { EASE } from "@/lib/motion";

/**
 * A number that runs up to its value instead of appearing at it. Used on the
 * per-answer grade and the session average — the two places where the number
 * is the point, and where watching it settle reads as it being worked out.
 */
export default function CountUp({
  value,
  decimals = 0,
  className = "",
}: {
  value: number;
  decimals?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const raw = useMotionValue(reduceMotion ? value : 0);
  const text = useTransform(raw, (v) => v.toFixed(decimals));

  useEffect(() => {
    if (reduceMotion) {
      raw.set(value);
      return;
    }
    const controls = animate(raw, value, { duration: 0.75, ease: EASE });
    return () => controls.stop();
  }, [value, reduceMotion, raw]);

  return <motion.span className={className}>{text}</motion.span>;
}
