"use client";

import { useEffect, useState } from "react";

type Entry = { id: string; heading: string };

/** Sticky table of contents that highlights the section currently in view. */
export default function TocNav({
  label,
  entries,
}: {
  label: string;
  entries: Entry[];
}) {
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
      { rootMargin: "-88px 0px -65% 0px", threshold: 0 },
    );

    headings.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [entries]);

  return (
    <nav aria-label={label} className="text-[13.5px]">
      <p className="eyebrow-sm text-ink-faint">{label}</p>
      <ul className="mt-4 space-y-1 border-l border-line">
        {entries.map((entry) => {
          const isActive = entry.id === active;
          return (
            <li key={entry.id}>
              <a
                href={`#${entry.id}`}
                aria-current={isActive ? "true" : undefined}
                className={[
                  "-ml-px block border-l py-1.5 pl-4 transition-colors duration-200",
                  isActive
                    ? "border-ink text-ink"
                    : "border-transparent text-ink-faint hover:text-ink-soft",
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
