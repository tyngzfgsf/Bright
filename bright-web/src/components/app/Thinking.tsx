"use client";

import { motion } from "framer-motion";

/**
 * Three dots breathing in sequence while a turn is in flight. It sits where
 * the reply will land, so the column doesn't jump when the text arrives.
 */
export default function Thinking({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-1.5" role="status" aria-label={label}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="block size-[6px] rounded-full bg-ink-faint"
          animate={{ opacity: [0.2, 1, 0.2], y: [0, -3, 0] }}
          transition={{
            duration: 1.1,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.16,
          }}
        />
      ))}
    </span>
  );
}
