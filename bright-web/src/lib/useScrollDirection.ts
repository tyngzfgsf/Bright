"use client";

import { useEffect, useState } from "react";

export type ScrollDirection = "up" | "down";

/**
 * Which way the page is currently moving, plus how far down it is.
 *
 * One passive listener, and the direction only flips after a few pixels of
 * travel so trackpad jitter doesn't churn it — every reveal on the page reads
 * this, and a flip re-renders all of them.
 */
export function useScrollDirection(threshold = 6) {
  const [direction, setDirection] = useState<ScrollDirection>("down");
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    let last = window.scrollY;
    let ticking = false;

    const update = () => {
      const current = window.scrollY;
      setScrollY(current);

      if (Math.abs(current - last) >= threshold) {
        setDirection(current > last ? "down" : "up");
        last = current;
      }
      ticking = false;
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return { direction, scrollY };
}
