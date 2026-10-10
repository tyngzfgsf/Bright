"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

/** Characters a second. Fast enough not to be a wait, slow enough to read. */
const RATE = 340;

/**
 * Reveals a reply as if it were arriving, with a caret trailing the last
 * character. The turn actually lands whole — the model isn't streamed — but a
 * paragraph appearing all at once is the single most app-like thing left in a
 * chat window, so it gets played out.
 *
 * The full text is rendered underneath at `invisible` and the revealed slice
 * sits over it, so the paragraph takes its final height on the first frame:
 * nothing below it jumps, and the scroll anchor doesn't have to chase.
 */
export default function StreamedText({
  text,
  stream,
  onDone,
}: {
  text: string;
  stream: boolean;
  onDone?: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const instant = !stream || reduceMotion;
  const [shown, setShown] = useState(() => (instant ? text.length : 0));

  // Held in a ref so a parent that re-renders mid-reveal doesn't restart it.
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (instant) {
      setShown(text.length);
      done.current?.();
      return;
    }

    let frame = 0;
    let start: number | null = null;

    const tick = (now: number) => {
      if (start === null) start = now;
      const revealed = Math.min(text.length, Math.round(((now - start) / 1000) * RATE));
      setShown(revealed);
      if (revealed < text.length) frame = requestAnimationFrame(tick);
      else done.current?.();
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, instant]);

  if (instant || shown >= text.length) return <>{text}</>;

  return (
    <span className="relative">
      <span className="invisible" aria-hidden="true">
        {text}
      </span>
      <span className="absolute inset-0">
        {text.slice(0, shown)}
        <span className="caret" aria-hidden="true" />
      </span>
    </span>
  );
}
