"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { GLIDE } from "@/lib/motion";

type Entry = { id: string; heading: string };

/** Sticky table of contents that highlights the section currently in view. */
export default function TocNav({
  label,
  entries,
}: {
  label: string;
  entries: Entry[];
}) {
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState(entries[0]?.id ?? "");

  useEffect(() => {
    const headings = entries
      .map((entry) => document.getElementById(entry.id))
      .filter((el): el is HTMLElement => el !== null);

    const observer = new IntersectionObserver(
      (records) => {
        const visible = records
          .filter((r) => r.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      // Bias the band towards the top of the viewport so the highlight tracks
      // the section you're actually reading.
      { rootMargin: "-96px 0px -65% 0px", threshold: 0 },
    );

    headings.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [entries]);

  return (
    <nav aria-label={label} className="text-[13.5px]">
      <p className="eyebrow-sm text-ink-faint">{label}</p>
      <ul className="relative mt-5 border-l border-line">
        {entries.map((entry) => {
          const isActive = entry.id === active;
          return (
            <li key={entry.id} className="relative">
              {isActive && (
                <motion.span
                  layoutId="toc-marker"
                  aria-hidden="true"
                  className="absolute -left-px top-0 h-full w-px bg-ink"
                  transition={reduceMotion ? { duration: 0 } : GLIDE}
                />
              )}
              <a
                href={`#${entry.id}`}
                aria-current={isActive ? "true" : undefined}
                className={[
                  "block py-2 pl-5 leading-snug transition-colors duration-300",
                  isActive ? "text-ink" : "text-ink-faint hover:text-ink-soft",
                ].join(" ")}
              >
                {entry.heading}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
