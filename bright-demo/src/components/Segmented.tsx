"use client";

import { motion } from "framer-motion";
import { GLIDE } from "@/lib/motion";

/**
 * A row of choices with a single sliding indicator. Takes one line instead of
 * a column of radio rows, which is what made the setup screen feel stacked.
 *
 * The indicator is a positioned sibling painted before the label rather than a
 * negative z-index: behind the track's own background, it would disappear and
 * take the selected label's contrast with it.
 */
export default function Segmented({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="grid items-center gap-x-8 gap-y-3 sm:grid-cols-[8.5rem_1fr]">
      <p className="eyebrow-sm text-ink-faint">{label}</p>

      <div className="flex w-fit items-center gap-1 rounded-full bg-raised p-1">
        {options.map((option) => {
          const selected = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              aria-pressed={selected}
              className={`relative rounded-full px-4 py-2 text-[14px] transition-colors duration-200 ${
                selected ? "text-paper" : "text-ink-muted hover:text-ink"
              }`}
            >
              {selected && (
                <motion.span
                  layoutId={`segment-${label}`}
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full bg-ink"
                  transition={GLIDE}
                />
              )}
              <span className="relative">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
