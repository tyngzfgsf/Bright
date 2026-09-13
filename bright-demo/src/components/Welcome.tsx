"use client";

import { motion, type Variants } from "framer-motion";
import Composer from "./Composer";
import SelectPill from "./SelectPill";
import { KeyIcon } from "./Icons";
import { EASE, PRESS } from "@/lib/motion";
import type { Copy } from "@/lib/copy";
import { usePrefs } from "@/lib/prefs";
import type { AiRole, Difficulty, TraineeRole } from "@/lib/prompt";
import {
  AI_ROLES,
  DIFFICULTIES,
  SCENARIOS,
  TRAINEE_ROLES,
  randomScenario,
} from "@/lib/scenarios";

/** Everything on this screen arrives in sequence rather than at once. */
const container: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.055, delayChildren: 0.04 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 12 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

/** The chips come in one after another, quicker than the blocks above them. */
const chipRow: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.028 } },
};

const chip: Variants = {
  hidden: { opacity: 0, y: 8, scale: 0.96 },
  shown: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.34, ease: EASE } },
};

/**
 * The empty state, which is also the setup screen.
 *
 * There is no form: you either describe a case in the composer or tap one of
 * the ten the app ships with, and the three things worth changing sit inside
 * the composer as pills. Everything else moved into Settings.
 */
export default function Welcome({
  t,
  draft,
  onDraftChange,
  onSubmit,
  onPickScenario,
  onOpenKeySettings,
  busy,
  error,
  scripted,
}: {
  t: Copy;
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  onPickScenario: (id: string) => void;
  onOpenKeySettings: () => void;
  busy: boolean;
  error: string | null;
  scripted: boolean;
}) {
  const prefs = usePrefs();
  const { language } = prefs;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-10 sm:px-6">
      <motion.div variants={container} initial="hidden" animate="shown">
        <motion.h1
          variants={item}
          className="display text-[clamp(1.75rem,4vw,2.4rem)]"
        >
          {t.greeting}
        </motion.h1>

        <motion.p
          variants={item}
          className="mt-4 max-w-[36rem] text-[15.5px] leading-[1.75] text-ink-soft"
        >
          {t.greetingSub}
        </motion.p>

        <motion.div variants={item} className="mt-8">
          <Composer
            value={draft}
            onChange={onDraftChange}
            onSubmit={onSubmit}
            placeholder={t.welcomePlaceholder}
            sendLabel={t.send}
            busy={busy}
            autoFocus
            tools={
              <>
                <SelectPill
                  label={t.traineeRole}
                  value={prefs.traineeRole}
                  onChange={(v) => prefs.set({ traineeRole: v as TraineeRole })}
                  options={TRAINEE_ROLES.map((r) => ({ id: r.id, label: r[language] }))}
                  disabled={busy}
                />
                <SelectPill
                  label={t.aiRole}
                  value={prefs.aiRole}
                  onChange={(v) => prefs.set({ aiRole: v as AiRole })}
                  options={AI_ROLES.map((r) => ({ id: r.id, label: r[language] }))}
                  disabled={busy}
                />
                <SelectPill
                  label={t.difficulty}
                  value={prefs.difficulty}
                  onChange={(v) => prefs.set({ difficulty: v as Difficulty })}
                  options={DIFFICULTIES.map((d) => ({ id: d.id, label: d[language] }))}
                  disabled={busy}
                />
              </>
            }
          />
        </motion.div>

        {error && (
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="mt-5 rounded-[1rem] bg-raised px-5 py-4 text-[14px] text-ink-soft"
          >
            {error}
          </motion.p>
        )}

        <motion.p variants={item} className="mt-9 text-[12.5px] text-ink-faint">
          {t.pickOne}
        </motion.p>

        <motion.div variants={chipRow} className="mt-3.5 flex flex-wrap gap-2">
          {SCENARIOS.map((scenario) => (
            <motion.button
              key={scenario.id}
              variants={chip}
              type="button"
              disabled={busy}
              onClick={() => onPickScenario(scenario.id)}
              whileHover={busy ? undefined : { y: -3, scale: 1.03 }}
              whileTap={busy ? undefined : { scale: 0.96 }}
              transition={PRESS}
              className="rounded-full border border-line px-3.5 py-1.5 text-[13.5px] text-ink-soft transition-colors duration-200 hover:border-line-strong hover:bg-raised hover:text-ink disabled:opacity-40"
            >
              {scenario[language]}
            </motion.button>
          ))}
          <motion.button
            variants={chip}
            type="button"
            disabled={busy}
            onClick={() => onPickScenario(randomScenario().id)}
            whileHover={busy ? undefined : { y: -3 }}
            whileTap={busy ? undefined : { scale: 0.96 }}
            transition={PRESS}
            className="rounded-full px-3.5 py-1.5 text-[13.5px] text-ink-faint transition-colors duration-200 hover:text-ink disabled:opacity-40"
          >
            {t.surprise}
          </motion.button>
        </motion.div>

        {/* The scripted/live disclosure, in the tense that fits a session that
            hasn't started — and a way straight to the key that changes it, so
            there is no hunting for Settings. */}
        <motion.button
          variants={item}
          type="button"
          onClick={onOpenKeySettings}
          whileHover={{ x: 2 }}
          transition={PRESS}
          className="mt-10 flex items-center gap-2 text-[12.5px] text-ink-faint underline-offset-4 transition-colors duration-200 hover:text-ink hover:underline"
        >
          <KeyIcon className="size-[14px]" />
          {scripted ? t.keyNoneSet : t.keySet}
        </motion.button>
      </motion.div>
    </div>
  );
}
