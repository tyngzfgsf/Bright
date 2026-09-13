"use client";

import { motion } from "framer-motion";
import BrightMark from "./BrightMark";
import CountUp from "./CountUp";
import { EASE } from "@/lib/motion";

/**
 * The session result, laid out like the app's ShareResultCard: always black
 * with white text, whatever the page theme is doing.
 *
 * It springs in rather than fading, the average runs up to its value, and a
 * single sheen crosses the card once — this is the one moment in the session
 * worth a flourish.
 */
export default function ResultCard({
  scenario,
  score,
  note,
  slogan,
}: {
  scenario: string;
  /** Already formatted — "8.5", or "—" when nothing was graded. */
  score: string;
  note: string;
  slogan: string;
}) {
  const numeric = Number.parseFloat(score);
  const countable = Number.isFinite(numeric);

  return (
    <motion.div
      initial={{ opacity: 0, y: 22, scale: 0.94, rotateX: 8 }}
      animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 24, mass: 0.9 }}
      whileHover={{ y: -4, scale: 1.015 }}
      style={{ perspective: 800 }}
      className="relative w-[17rem] overflow-hidden rounded-[1.4rem] bg-[#000000] px-8 py-9 text-center text-white shadow-float ring-1 ring-white/12"
    >
      {/* One pass of light across the card, timed to land after it settles. */}
      <motion.span
        aria-hidden="true"
        initial={{ x: "-140%" }}
        animate={{ x: "140%" }}
        transition={{ duration: 1.1, ease: EASE, delay: 0.5 }}
        className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 skew-x-[-18deg] bg-gradient-to-r from-transparent via-white/12 to-transparent"
      />

      <span className="flex items-center justify-center gap-2">
        <BrightMark className="size-[17px]" />
        <span className="text-[16px] font-bold tracking-[-0.02em]">Bright</span>
      </span>

      <p className="mt-7 text-[12px] text-white/70">{scenario}</p>

      <p className="mt-2 flex items-end justify-center gap-1.5">
        <span className="tnum text-[3rem] font-bold leading-none tracking-[-0.04em]">
          {countable ? <CountUp value={numeric} decimals={1} /> : score}
        </span>
        <span className="mb-1.5 text-[14px] text-white/70">/10</span>
      </p>

      <p className="mt-5 text-[12px] font-semibold">{note}</p>

      <p className="mt-7 text-[10.5px] text-white/50">{slogan}</p>
    </motion.div>
  );
}
