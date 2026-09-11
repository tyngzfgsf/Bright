"use client";

import { useEffect, useRef } from "react";
import {
  motion,
  useAnimationControls,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import { EASE } from "@/lib/motion";

/**
 * The hero wordmark.
 *
 * Two layers: the letters themselves, and an inverted copy of the same letters
 * clipped to a moving edge. Sweeping that edge across reads exactly like
 * dragging a selection over the word — which is also what the site's own
 * ::selection colours do, so a real drag and this animation agree.
 *
 * Both layers are built from the same per-letter markup rather than one plain
 * string, so their metrics can't drift apart by a kerning hair.
 */
export default function HeroName({ text }: { text: string }) {
  const reduceMotion = useReducedMotion();
  const letters = text.split("");

  const highlight = useAnimationControls();
  const caret = useAnimationControls();
  const running = useRef(false);

  const letter: Variants = reduceMotion
    ? { hidden: { opacity: 1 }, shown: { opacity: 1 } }
    : {
        hidden: { y: "112%", opacity: 0 },
        shown: { y: "0%", opacity: 1, transition: { duration: 0.95, ease: EASE } },
      };

  useEffect(() => {
    if (reduceMotion) return;

    let cancelled = false;

    async function sweep() {
      if (running.current) return;
      running.current = true;

      await Promise.all([
        highlight.start({
          clipPath: "inset(-6% 0% -6% 0%)",
          transition: { duration: 0.52, ease: EASE },
        }),
        caret.start({
          left: "100%",
          opacity: 1,
          transition: { duration: 0.52, ease: EASE },
        }),
      ]);
      if (cancelled) return;

      // Hold, the way a selection sits there before you let go.
      await new Promise((resolve) => setTimeout(resolve, 620));
      if (cancelled) return;

      await Promise.all([
        highlight.start({
          clipPath: "inset(-6% 0% -6% 100%)",
          transition: { duration: 0.46, ease: EASE },
        }),
        caret.start({ opacity: 0, transition: { duration: 0.22 } }),
      ]);
      if (cancelled) return;

      highlight.set({ clipPath: "inset(-6% 100% -6% 0%)" });
      caret.set({ left: "0%" });
      running.current = false;
    }

    // Let the letters land first.
    const timer = window.setTimeout(sweep, 1350);

    const node = document.getElementById("hero-name");
    const onEnter = () => sweep();
    node?.addEventListener("pointerenter", onEnter);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      node?.removeEventListener("pointerenter", onEnter);
    };
  }, [highlight, caret, reduceMotion]);

  const Letters = ({ inverted = false }: { inverted?: boolean }) => (
    <span className="flex">
      {letters.map((char, i) => (
        <span
          key={i}
          className={[
            "overflow-hidden pb-[0.08em]",
            inverted ? "bg-ink text-paper" : "",
          ].join(" ")}
        >
          {inverted ? (
            <span className="block">{char}</span>
          ) : (
            <motion.span data-reveal="" className="block" variants={letter}>
              {char}
            </motion.span>
          )}
        </span>
      ))}
    </span>
  );

  return (
    <span id="hero-name" className="relative inline-flex">
      <span aria-hidden="true">
        <Letters />
      </span>

      {!reduceMotion && (
        <>
          <motion.span
            aria-hidden="true"
            initial={{ clipPath: "inset(-6% 100% -6% 0%)" }}
            animate={highlight}
            className="pointer-events-none absolute inset-0"
          >
            <Letters inverted />
          </motion.span>

          {/* The edge you'd be dragging. */}
          <motion.span
            aria-hidden="true"
            initial={{ left: "0%", opacity: 0 }}
            animate={caret}
            className="pointer-events-none absolute -top-[0.04em] bottom-[0.04em] w-[2px] -translate-x-1/2 bg-ink"
          />
        </>
      )}
    </span>
  );
}
