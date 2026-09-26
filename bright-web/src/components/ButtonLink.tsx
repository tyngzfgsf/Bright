"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { PRESS } from "@/lib/motion";

type Props = {
  href: string;
  children: ReactNode;
  variant?: "solid" | "outline" | "ghost";
  size?: "md" | "lg";
  external?: boolean;
  className?: string;
};

const variants = {
  solid:
    "bg-accent text-on-accent hover:bg-accent-hover",
  outline:
    "border border-line-strong text-ink hover:border-primary hover:bg-primary-soft",
  ghost: "text-ink-soft hover:text-ink hover:bg-raised",
} as const;

const sizes = {
  md: "px-5 py-3 text-[14.5px]",
  lg: "px-6 py-3.5 text-[15.5px]",
} as const;

export default function ButtonLink({
  href,
  children,
  variant = "solid",
  size = "md",
  external = false,
  className = "",
}: Props) {
  const reduceMotion = useReducedMotion();
  const press = reduceMotion
    ? {}
    : { whileHover: { scale: 1.017, y: -1 }, whileTap: { scale: 0.985, y: 0 } };

  return (
    <motion.a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...press}
      transition={PRESS}
      className={[
        "group relative inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-[-0.006em] transition-colors duration-200 will-change-transform",
        variants[variant],
        sizes[size],
        className,
      ].join(" ")}
    >
      <span>{children}</span>
      {external && (
        <svg
          viewBox="0 0 24 24"
          className="size-[15px] opacity-60 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-[1.5px] group-hover:-translate-y-[1.5px] group-hover:opacity-90"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M8 16 16 8M9.5 8H16v6.5" />
        </svg>
      )}
    </motion.a>
  );
}
