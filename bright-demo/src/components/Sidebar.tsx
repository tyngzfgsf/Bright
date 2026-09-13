"use client";

import { AnimatePresence, motion } from "framer-motion";
import BrightMark from "./BrightMark";
import { PlusIcon, SettingsIcon, SidebarIcon, TrashIcon, UserIcon } from "./Icons";
import type { Copy } from "@/lib/copy";
import { EASE, GLIDE, PRESS } from "@/lib/motion";
import { useAuth } from "@/lib/auth";
import { averageScore, groupSessions, type GroupKey, type Session } from "@/lib/sessions";

/**
 * The left rail: what you're working on, everything you've run, and the two
 * account-shaped things at the bottom. It is the whole reason this stopped
 * looking like the phone app — the session is no longer the entire page.
 *
 * Rows carry `layout`, so adding or deleting a session slides the list rather
 * than snapping it, and the active row's highlight is a shared element that
 * travels between rows instead of blinking off one and onto another.
 */
export default function Sidebar({
  instanceId,
  t,
  sessions,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onOpenSettings,
  onOpenAccount,
  onCollapse,
}: {
  /** Distinguishes the desktop rail from the mobile drawer: both are mounted
      at once, and a shared `layoutId` across the two would make the active
      highlight fly between them. */
  instanceId: string;
  t: Copy;
  sessions: Session[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onOpenSettings: () => void;
  onOpenAccount: () => void;
  /** Hides the rail: collapses it on desktop, closes the drawer on mobile. */
  onCollapse: () => void;
}) {
  const { user } = useAuth();
  const groups = groupSessions(sessions);

  const groupLabel: Record<GroupKey, string> = {
    today: t.today,
    yesterday: t.yesterday,
    week: t.week,
    older: t.older,
  };

  return (
    <aside className="flex h-full w-[17.5rem] flex-col border-r border-line-subtle bg-sunken">
      <div className="flex items-center justify-between px-3 pb-1 pt-3">
        <span className="flex items-center gap-2 pl-2">
          <BrightMark className="size-[18px]" />
          <span className="text-[14.5px] font-semibold tracking-[-0.02em]">Bright</span>
          <span className="rounded-full bg-raised px-2 py-0.5 text-[10.5px] text-ink-faint">
            {t.demoChip}
          </span>
        </span>
        <motion.button
          type="button"
          onClick={onCollapse}
          aria-label={t.closeSidebar}
          title={t.closeSidebar}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.9 }}
          transition={PRESS}
          className="grid size-8 place-items-center rounded-[0.65rem] text-ink-faint transition-colors duration-200 hover:bg-raised hover:text-ink"
        >
          <SidebarIcon className="size-[17px]" />
        </motion.button>
      </div>

      <div className="px-3 pb-2 pt-2">
        <motion.button
          type="button"
          onClick={onNew}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
          transition={PRESS}
          className="flex w-full items-center gap-2.5 rounded-[0.85rem] border border-line bg-paper px-3 py-2.5 text-[14px] font-medium text-ink transition-colors duration-200 hover:border-line-strong"
        >
          <motion.span
            aria-hidden="true"
            whileHover={{ rotate: 90 }}
            transition={GLIDE}
            className="grid place-items-center"
          >
            <PlusIcon className="size-[16px]" />
          </motion.span>
          {t.newSession}
        </motion.button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {sessions.length === 0 ? (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, ease: EASE, delay: 0.1 }}
            className="px-3 py-6 text-[13px] leading-relaxed text-ink-faint"
          >
            {t.noSessions}
          </motion.p>
        ) : (
          <AnimatePresence initial={false}>
            {groups.map((group) => (
              <motion.div
                key={group.key}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.28, ease: EASE }}
                className="overflow-hidden pt-4 first:pt-2"
              >
                <p className="px-3 pb-1.5 text-[11.5px] font-medium text-ink-faint">
                  {groupLabel[group.key]}
                </p>
                <ul>
                  <AnimatePresence initial={false}>
                    {group.sessions.map((session) => {
                      const active = session.id === activeId;
                      const average = averageScore(session.messages);
                      return (
                        <motion.li
                          key={session.id}
                          layout
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, height: 0, x: -10 }}
                          transition={{ duration: 0.26, ease: EASE }}
                          className="group relative overflow-hidden"
                        >
                          <button
                            type="button"
                            onClick={() => onSelect(session.id)}
                            className={`relative flex w-full items-center gap-2 rounded-[0.7rem] py-2 pl-3 pr-9 text-left text-[13.5px] transition-colors duration-200 ${
                              active ? "text-ink" : "text-ink-soft hover:text-ink"
                            }`}
                          >
                            {/* One highlight for the whole list, so selecting
                                another session slides it there. */}
                            {active && (
                              <motion.span
                                layoutId={`rail-active-${instanceId}`}
                                aria-hidden="true"
                                transition={GLIDE}
                                className="absolute inset-0 rounded-[0.7rem] bg-raised"
                              />
                            )}
                            <span
                              aria-hidden="true"
                              className="absolute inset-0 rounded-[0.7rem] bg-raised opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                            />
                            <span className="relative min-w-0 flex-1 truncate">
                              {session.title || t.untitled}
                            </span>
                            {average !== "—" && (
                              <span className="tnum relative shrink-0 text-[11.5px] text-ink-faint transition-opacity duration-200 group-hover:opacity-0">
                                {average}
                              </span>
                            )}
                          </button>

                          {/* Sibling, not a child: a button inside a button is
                              invalid and the row would stop being clickable. */}
                          <motion.button
                            type="button"
                            onClick={() => onDelete(session.id)}
                            aria-label={t.deleteSession}
                            title={t.deleteSession}
                            whileHover={{ scale: 1.12 }}
                            whileTap={{ scale: 0.88 }}
                            transition={PRESS}
                            className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-[0.55rem] text-ink-faint opacity-0 transition-[opacity,color,background-color] duration-200 hover:bg-line-subtle hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
                          >
                            <TrashIcon className="size-[15px]" />
                          </motion.button>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </nav>

      <div className="border-t border-line-subtle p-3">
        <motion.button
          type="button"
          onClick={onOpenSettings}
          whileHover={{ x: 2 }}
          whileTap={{ scale: 0.98 }}
          transition={PRESS}
          className="flex w-full items-center gap-2.5 rounded-[0.7rem] px-3 py-2 text-left text-[13.5px] text-ink-soft transition-colors duration-200 hover:bg-raised hover:text-ink"
        >
          <motion.span
            aria-hidden="true"
            whileHover={{ rotate: 60 }}
            transition={GLIDE}
            className="grid place-items-center"
          >
            <SettingsIcon className="size-[16px]" />
          </motion.span>
          {t.settings}
        </motion.button>

        <motion.button
          type="button"
          onClick={onOpenAccount}
          whileHover={{ x: 2 }}
          whileTap={{ scale: 0.98 }}
          transition={PRESS}
          className="mt-0.5 flex w-full items-center gap-2.5 rounded-[0.7rem] px-2.5 py-2 text-left transition-colors duration-200 hover:bg-raised"
        >
          {user?.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.photoURL}
              alt=""
              className="size-7 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-raised text-ink-muted">
              <UserIcon className="size-[15px]" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] text-ink">
              {user ? user.name : t.signIn}
            </span>
            <span className="block truncate text-[11.5px] text-ink-faint">
              {user ? user.email : t.signedOutHint}
            </span>
          </span>
        </motion.button>
      </div>
    </aside>
  );
}
