"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { PRESS } from "@/lib/motion";

const MotionLink = motion.create(Link);

type Props = {
  href: string;
  children: ReactNode;
  variant?: "solid" | "outline";
  size?: "md" | "lg";
  className?: string;
};

const variants = {
  solid: "bg-ink text-paper shadow-soft hover:shadow-raise",
  outline: "border border-line-strong text-ink hover:border-ink hover:bg-raised",
} as const;

const sizes = {
  md: "px-5 py-3 text-[14.5px]",
  lg: "px-6 py-3.5 text-[15.5px]",
} as const;

/** Same shape as ButtonLink, for internal routes (keeps the locale prefix). */
export default function LinkButton({
  href,
  children,
  variant = "solid",
  size = "md",
  className = "",
}: Props) {
  const reduceMotion = useReducedMotion();
  const press = reduceMotion
    ? {}
    : { whileHover: { scale: 1.017, y: -1 }, whileTap: { scale: 0.985, y: 0 } };

  return (
    <MotionLink
      href={href}
      {...press}
      transition={PRESS}
      className={[
        "group inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-[-0.011em] transition-colors duration-300 will-change-transform",
        variants[variant],
        sizes[size],
        className,
      ].join(" ")}
    >
      <span>{children}</span>
      <svg
        viewBox="0 0 24 24"
        className="size-[15px] opacity-50 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-[2px] group-hover:opacity-80"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 12h13M12.5 6l6 6-6 6" />
      </svg>
    </MotionLink>
  );
}
