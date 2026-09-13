"use client";

import { AnimatePresence, motion } from "framer-motion";
import Dialog from "./Dialog";
import BrightMark from "./BrightMark";
import { GoogleIcon } from "./Icons";
import { EASE, PRESS } from "@/lib/motion";
import type { Copy } from "@/lib/copy";
import { useAuth } from "@/lib/auth";

/**
 * The sign-in sheet: Google sign-in through Firebase Auth — see `lib/auth.tsx`.
 */
export default function SignInDialog({
  open,
  onClose,
  t,
}: {
  open: boolean;
  onClose: () => void;
  t: Copy;
}) {
  const { signInWithGoogle, busy, error, clearError } = useAuth();

  function close() {
    clearError();
    onClose();
  }

  return (
    <Dialog open={open} onClose={close} title={t.signInTitle} closeLabel={t.close}>
      <div className="px-8 pb-8 pt-10 text-center">
        <BrightMark className="mx-auto size-[26px]" />
        <h2 className="mt-5 text-[19px] font-semibold tracking-[-0.02em]">
          {t.signInTitle}
        </h2>
        <p className="mx-auto mt-3 max-w-[24rem] text-[14px] leading-[1.75] text-ink-soft">
          {t.signInBody}
        </p>

        <motion.button
          type="button"
          onClick={signInWithGoogle}
          disabled={busy}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.98 }}
          transition={PRESS}
          className="mt-7 flex w-full items-center justify-center gap-3 rounded-full border border-line bg-paper px-5 py-3 text-[15px] font-medium text-ink transition-colors duration-200 hover:border-line-strong hover:bg-raised disabled:opacity-50"
        >
          <GoogleIcon />
          {t.continueWithGoogle}
        </motion.button>

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: "auto", marginTop: 16 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="overflow-hidden rounded-[0.9rem] bg-raised px-4 py-3 text-left text-[13px] leading-[1.7] text-ink-soft"
            >
              {t.signInFailed}
            </motion.p>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={close}
          className="mt-6 text-[13px] text-ink-muted underline-offset-4 transition-colors duration-200 hover:text-ink hover:underline"
        >
          {t.continueWithout}
        </button>
      </div>
    </Dialog>
  );
}
