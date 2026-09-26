import type { Transition } from "framer-motion";

/** One easing curve across the whole site: fast start, long frictionless settle. */
export const EASE = [0.16, 1, 0.3, 1] as const;

/** For anything that follows a pointer or a press — snappy, no overshoot. */
export const PRESS: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 32,
  mass: 0.6,
};

/** Layout indicators (the nav underline) move a touch softer than presses. */
export const GLIDE: Transition = {
  type: "spring",
  stiffness: 320,
  damping: 34,
  mass: 0.7,
};

export const REVEAL: Transition = { duration: 0.8, ease: EASE };

export const REVEAL_FAST: Transition = { duration: 0.5, ease: EASE };
