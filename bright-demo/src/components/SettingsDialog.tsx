"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Dialog from "./Dialog";
import { EASE, GLIDE, PRESS } from "@/lib/motion";
import {
  GoogleIcon,
  KeyIcon,
  MonitorIcon,
  MoonIcon,
  SettingsIcon,
  SparkIcon,
  SunIcon,
  TrashIcon,
  UserIcon,
} from "./Icons";
import type { Copy } from "@/lib/copy";
import { useAuth } from "@/lib/auth";
import { usePrefs, type Theme } from "@/lib/prefs";
import type { AiRole, Difficulty, Language, TraineeRole } from "@/lib/prompt";
import { AI_ROLES, DIFFICULTIES, TRAINEE_ROLES } from "@/lib/scenarios";

export type SettingsSection = "general" | "defaults" | "key" | "account" | "data";

/**
 * Settings as a sectioned sheet rather than a screen you navigate to — the
 * pattern every chat product landed on, and the reason the header no longer
 * needs a row of one-off toggles.
 */
export default function SettingsDialog({
  open,
  onClose,
  t,
  section,
  onSectionChange,
  onSignIn,
  onClearSessions,
  sessionCount,
}: {
  open: boolean;
  onClose: () => void;
  t: Copy;
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  onSignIn: () => void;
  onClearSessions: () => void;
  sessionCount: number;
}) {
  const prefs = usePrefs();
  const { user, signOut } = useAuth();

  const sections: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
    { id: "general", label: t.settingsGeneral, icon: <SettingsIcon className="size-[15px]" /> },
    { id: "defaults", label: t.settingsDefaults, icon: <SparkIcon className="size-[15px]" /> },
    { id: "key", label: t.settingsKey, icon: <KeyIcon className="size-[15px]" /> },
    { id: "account", label: t.settingsAccount, icon: <UserIcon className="size-[15px]" /> },
    { id: "data", label: t.settingsData, icon: <TrashIcon className="size-[15px]" /> },
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t.settings}
      closeLabel={t.close}
      width="max-w-3xl"
    >
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <div className="shrink-0 border-b border-line-subtle px-4 pb-3 pt-5 sm:w-[13.5rem] sm:border-b-0 sm:border-r sm:pb-5">
          <p className="px-2.5 pb-3 text-[15px] font-semibold tracking-[-0.02em]">
            {t.settings}
          </p>
          <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 sm:mx-0 sm:flex-col sm:overflow-visible sm:px-0">
            {sections.map((item) => (
              <motion.button
                key={item.id}
                type="button"
                onClick={() => onSectionChange(item.id)}
                whileTap={{ scale: 0.97 }}
                transition={PRESS}
                className={`relative flex shrink-0 items-center gap-2.5 rounded-[0.7rem] px-2.5 py-2 text-[13.5px] transition-colors duration-200 ${
                  section === item.id ? "text-ink" : "text-ink-muted hover:text-ink"
                }`}
              >
                {section === item.id && (
                  <motion.span
                    layoutId="settings-section"
                    aria-hidden="true"
                    transition={GLIDE}
                    className="absolute inset-0 rounded-[0.7rem] bg-raised"
                  />
                )}
                <span className="relative">{item.icon}</span>
                <span className="relative">{item.label}</span>
              </motion.button>
            ))}
          </nav>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8 sm:py-7">
          <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={section}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: EASE }}
          >
          {section === "general" && (
            <div className="space-y-7">
              <Field label={t.theme}>
                <Choice
                  name="theme"
                  value={prefs.theme}
                  onChange={(v) => prefs.set({ theme: v as Theme })}
                  options={[
                    { id: "system", label: t.themeSystem, icon: <MonitorIcon className="size-[14px]" /> },
                    { id: "light", label: t.themeLight, icon: <SunIcon className="size-[14px]" /> },
                    { id: "dark", label: t.themeDark, icon: <MoonIcon className="size-[14px]" /> },
                  ]}
                />
              </Field>

              <Field label={t.language}>
                <Choice
                  name="language"
                  value={prefs.language}
                  onChange={(v) => prefs.set({ language: v as Language })}
                  options={[
                    { id: "en", label: "English" },
                    { id: "ko", label: "한국어" },
                  ]}
                />
              </Field>
            </div>
          )}

          {section === "defaults" && (
            <div className="space-y-7">
              <p className="text-[13px] leading-[1.75] text-ink-soft">{t.defaultsNote}</p>

              <Field label={t.traineeRole}>
                <Choice
                  name="traineeRole"
                  value={prefs.traineeRole}
                  onChange={(v) => prefs.set({ traineeRole: v as TraineeRole })}
                  options={TRAINEE_ROLES.map((r) => ({ id: r.id, label: r[prefs.language] }))}
                />
              </Field>

              <Field label={t.aiRole}>
                <Choice
                  name="aiRole"
                  value={prefs.aiRole}
                  onChange={(v) => prefs.set({ aiRole: v as AiRole })}
                  options={AI_ROLES.map((r) => ({ id: r.id, label: r[prefs.language] }))}
                />
              </Field>

              <Field label={t.difficulty}>
                <Choice
                  name="difficulty"
                  value={prefs.difficulty}
                  onChange={(v) => prefs.set({ difficulty: v as Difficulty })}
                  options={DIFFICULTIES.map((d) => ({ id: d.id, label: d[prefs.language] }))}
                />
              </Field>
            </div>
          )}

          {section === "key" && <KeySection t={t} />}

          {section === "account" && (
            <div className="space-y-6">
              {user ? (
                <>
                  <div className="flex items-center gap-3.5">
                    {user.photoURL ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={user.photoURL}
                        alt=""
                        className="size-11 rounded-full object-cover"
                      />
                    ) : (
                      <span className="grid size-11 place-items-center rounded-full bg-raised text-ink-muted">
                        <UserIcon />
                      </span>
                    )}
                    <span>
                      <span className="block text-[15px] font-medium">{user.name}</span>
                      <span className="block text-[13px] text-ink-faint">{user.email}</span>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={signOut}
                    className="rounded-full border border-line px-4 py-2 text-[13.5px] text-ink-soft transition-colors duration-200 hover:border-line-strong hover:text-ink"
                  >
                    {t.signOut}
                  </button>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-[15px] font-medium">{t.signedOut}</p>
                    <p className="mt-2 max-w-[28rem] text-[13.5px] leading-[1.75] text-ink-soft">
                      {t.signInBody}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onSignIn}
                    className="flex items-center gap-3 rounded-full border border-line px-4 py-2.5 text-[14px] font-medium transition-colors duration-200 hover:border-line-strong hover:bg-raised"
                  >
                    <GoogleIcon className="size-[17px]" />
                    {t.continueWithGoogle}
                  </button>
                </>
              )}
            </div>
          )}

          {section === "data" && (
            <DataSection
              t={t}
              sessionCount={sessionCount}
              onClearSessions={onClearSessions}
            />
          )}
          </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <p className="text-[14px] text-ink">{label}</p>
      {children}
    </div>
  );
}

/** A pill group with the selection sliding between options. */
function Choice({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: string;
  onChange: (id: string) => void;
  options: { id: string; label: string; icon?: React.ReactNode }[];
}) {
  return (
    <div className="flex w-fit items-center gap-1 rounded-full bg-raised p-1">
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            aria-pressed={selected}
            className={`relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13.5px] transition-colors duration-200 ${
              selected ? "text-paper" : "text-ink-muted hover:text-ink"
            }`}
          >
            {selected && (
              <motion.span
                layoutId={`choice-${name}`}
                aria-hidden="true"
                className="absolute inset-0 rounded-full bg-ink"
                transition={GLIDE}
              />
            )}
            {option.icon && <span className="relative">{option.icon}</span>}
            <span className="relative whitespace-nowrap">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function KeySection({ t }: { t: Copy }) {
  const { apiKey, setApiKey } = usePrefs();
  const [draft, setDraft] = useState(apiKey);
  const [saved, setSaved] = useState(false);

  useEffect(() => setDraft(apiKey), [apiKey]);

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 1800);
    return () => window.clearTimeout(timer);
  }, [saved]);

  return (
    <div className="space-y-5">
      <p className="max-w-[32rem] text-[13.5px] leading-[1.8] text-ink-soft">{t.keyBody}</p>

      <input
        type="password"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={t.keyPlaceholder}
        autoComplete="off"
        spellCheck={false}
        className="w-full rounded-[0.9rem] border border-line bg-raised px-4 py-3 font-mono text-[14px] outline-none transition-colors duration-200 focus:border-line-strong"
      />

      <p className="text-[12.5px] text-ink-faint">{apiKey ? t.keySet : t.keyNoneSet}</p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setApiKey(draft);
            setSaved(true);
          }}
          className="rounded-full bg-ink px-5 py-2.5 text-[14px] font-medium text-paper transition-opacity duration-200 hover:opacity-90"
        >
          {saved ? t.keySaved : t.keySave}
        </button>
        {apiKey && (
          <button
            type="button"
            onClick={() => {
              setApiKey("");
              setDraft("");
            }}
            className="rounded-full px-4 py-2.5 text-[14px] text-ink-muted transition-colors duration-200 hover:bg-raised hover:text-ink"
          >
            {t.keyClear}
          </button>
        )}
        <a
          href="https://console.groq.com/keys"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-[13px] text-ink-muted underline-offset-4 transition-colors duration-200 hover:text-ink hover:underline"
        >
          {t.keyGet}
        </a>
      </div>
    </div>
  );
}

function DataSection({
  t,
  sessionCount,
  onClearSessions,
}: {
  t: Copy;
  sessionCount: number;
  onClearSessions: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[14px]">{t.clearData}</p>
        <p className="mt-2 max-w-[30rem] text-[13.5px] leading-[1.75] text-ink-soft">
          {t.clearDataBody}
        </p>
      </div>

      {confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              onClearSessions();
              setConfirming(false);
            }}
            className="rounded-full bg-ink px-5 py-2.5 text-[14px] font-medium text-paper transition-opacity duration-200 hover:opacity-90"
          >
            {t.clearDataConfirm}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-full px-4 py-2.5 text-[14px] text-ink-muted transition-colors duration-200 hover:bg-raised hover:text-ink"
          >
            {t.close}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={sessionCount === 0}
          className="flex items-center gap-2.5 rounded-full border border-line px-4 py-2.5 text-[14px] text-ink-soft transition-colors duration-200 hover:border-line-strong hover:text-ink disabled:opacity-40"
        >
          <TrashIcon className="size-[15px]" />
          {t.clearData}
          {sessionCount > 0 && <span className="tnum text-ink-faint">{sessionCount}</span>}
        </button>
      )}

      <p className="border-t border-line-subtle pt-5 text-[12.5px] leading-[1.8] text-ink-faint">
        {t.notTheApp}
      </p>
    </div>
  );
}
