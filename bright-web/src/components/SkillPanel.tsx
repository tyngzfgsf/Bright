"use client";

import { useTranslations } from "next-intl";
import { motion, useReducedMotion } from "framer-motion";
import { EASE } from "@/lib/motion";

type Trend = "up" | "down" | "flat";
type Row = { name: string; score: number; trend: Trend };

const arrow: Record<Trend, string> = { up: "↑", down: "↓", flat: "→" };

/**
 * A drawing of the Android app's Stats screen: per-emergency averages, lowest first, with the
 * weakest one pulled out as a drill. Illustrative numbers — the caption says so.
 */
export default function SkillPanel() {
  const t = useTranslations("progress.panel");
  const reduceMotion = useReducedMotion();
  const rows = t.raw("rows") as Row[];
  const weakest = rows[0];

  return (
    <figure className="sheen rounded-[1.35rem] border border-line bg-paper p-6 shadow-soft sm:p-7">
      <p className="eyebrow-sm text-ink-faint">{t("label")}</p>

      <div className="mt-5 flex items-end justify-between gap-4 rounded-2xl bg-sunken px-5 py-4">
        <div>
          <p className="text-[12.5px] text-ink-muted">{t("weakestLabel")}</p>
          <p className="mt-1 text-[20px] font-semibold tracking-[-0.024em]">{weakest.name}</p>
        </div>
        {/* Looks like the app's button; here it's only part of the picture. */}
        <span
          aria-hidden="true"
          className="shrink-0 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-paper"
        >
          {t("drill")} →
        </span>
      </div>

      <ul className="mt-6 space-y-5">
        {rows.map((row, i) => (
          <li key={row.name}>
            <div className="flex items-baseline justify-between gap-3 text-[14px]">
              <span className="text-ink-soft">{row.name}</span>
              <span className="flex items-baseline gap-2.5">
                <span className="text-[12px] text-ink-faint">
                  <span aria-hidden="true">{arrow[row.trend]} </span>
                  {t(`trend.${row.trend}`)}
                </span>
                <span className="tnum font-mono text-[13px] text-ink">
                  {row.score.toFixed(1)}
                </span>
              </span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-line-subtle">
              <motion.div
                className="h-full origin-left rounded-full bg-ink"
                style={{ width: `${row.score * 10}%` }}
                initial={reduceMotion ? false : { scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 0.9, ease: EASE, delay: 0.15 + i * 0.08 }}
              />
            </div>
          </li>
        ))}
      </ul>

      <figcaption className="mt-6 border-t border-line-subtle pt-4 text-[12.5px] text-ink-faint">
        {t("caption")}
      </figcaption>
    </figure>
  );
}
