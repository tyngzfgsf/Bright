"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";

type Ripple = { id: number; x: number; y: number };

const INTERACTIVE = 'a, button, [role="button"], summary, label, [data-cursor]';

/**
 * A dot that tracks the pointer exactly and a ring that follows a beat behind.
 * Both are drawn with `mix-blend-difference`, so one white shape stays legible
 * on paper, on the near-black dark theme and on the black result card alike.
 *
 * Mouse only: the native cursor is hidden by a class this adds after a real
 * pointer moves, so touch devices and a broken script both keep the default.
 */
export default function Cursor() {
  const reduceMotion = useReducedMotion();

  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const ringX = useSpring(x, { stiffness: 520, damping: 42, mass: 0.55 });
  const ringY = useSpring(y, { stiffness: 520, damping: 42, mass: 0.55 });

  const [active, setActive] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const rippleId = useRef(0);

  useEffect(() => {
    if (reduceMotion) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const root = document.documentElement;

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      x.set(event.clientX);
      y.set(event.clientY);
      if (!root.classList.contains("has-cursor")) {
        root.classList.add("has-cursor");
        setActive(true);
      }
      const target = event.target as Element | null;
      setHovering(!!target?.closest?.(INTERACTIVE));
    };

    const onDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      setPressed(true);
      const id = rippleId.current++;
      setRipples((current) => [...current, { id, x: event.clientX, y: event.clientY }]);
      window.setTimeout(
        () => setRipples((current) => current.filter((r) => r.id !== id)),
        700,
      );
    };

    const onUp = () => setPressed(false);
    const onLeave = () => setActive(false);
    const onEnter = () => setActive(true);

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    document.addEventListener("pointerenter", onEnter);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("pointerenter", onEnter);
      root.classList.remove("has-cursor");
    };
  }, [reduceMotion, x, y]);

  if (reduceMotion) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[200] mix-blend-difference">
      {/* The ring: grows over anything clickable, tightens while pressed. */}
      <motion.div
        style={{ x: ringX, y: ringY }}
        animate={{
          width: hovering ? 44 : 28,
          height: hovering ? 44 : 28,
          opacity: active ? (hovering ? 0.9 : 0.55) : 0,
          scale: pressed ? 0.82 : 1,
        }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        className="absolute -left-[14px] -top-[14px] rounded-full border border-white"
      />

      {/* The dot: no lag, so aiming still feels exact. */}
      <motion.div
        style={{ x, y }}
        animate={{
          scale: pressed ? 1.7 : hovering ? 0.4 : 1,
          opacity: active ? 1 : 0,
        }}
        transition={{ type: "spring", stiffness: 600, damping: 34 }}
        className="absolute -left-[3px] -top-[3px] size-[6px] rounded-full bg-white"
      />

      {/* Click ripples. */}
      <AnimatePresence>
        {ripples.map((ripple) => (
          <motion.span
            key={ripple.id}
            initial={{ opacity: 0.5, scale: 0 }}
            animate={{ opacity: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            style={{ left: ripple.x, top: ripple.y }}
            className="absolute -ml-[40px] -mt-[40px] size-20 rounded-full border border-white"
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
