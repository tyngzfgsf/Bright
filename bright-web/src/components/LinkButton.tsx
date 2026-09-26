"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { PRESS } from "@/lib/motion";
import { useSiteNav, type Page } from "@/lib/site-nav";

type Props = {
  to: Page;
  /** An element id on that page to land on. */
  section?: string;
  children: ReactNode;
  variant?: "solid" | "outline";
  size?: "md" | "lg";
  className?: string;
};

const variants = {
  solid: "bg-accent text-on-accent hover:bg-accent-hover",
  outline: "border border-line-strong text-ink hover:border-primary hover:bg-primary-soft",
} as const;

const sizes = {
  md: "px-5 py-3 text-[14.5px]",
  lg: "px-6 py-3.5 text-[15.5px]",
} as const;

/** Same shape as ButtonLink, for moving to another page of the site — in place, same URL. */
export default function LinkButton({
  to,
  section,
  children,
  variant = "solid",
  size = "md",
  className = "",
}: Props) {
  const reduceMotion = useReducedMotion();
  const { go } = useSiteNav();
  const press = reduceMotion
    ? {}
    : { whileHover: { scale: 1.017, y: -1 }, whileTap: { scale: 0.985, y: 0 } };

  return (
    <motion.button
      type="button"
      onClick={() => go(to, section)}
      {...press}
      transition={PRESS}
      className={[
        "group inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-[-0.006em] transition-colors duration-200 will-change-transform",
        variants[variant],
        sizes[size],
        className,
      ].join(" ")}
    >
      <span>{children}</span>
      <svg
        viewBox="0 0 24 24"
        className="size-[15px] opacity-50 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-[2px] group-hover:opacity-80"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 12h13M12.5 6l6 6-6 6" />
      </svg>
    </motion.button>
  );
}
