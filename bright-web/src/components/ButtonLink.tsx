"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

type Props = {
  href: string;
  children: ReactNode;
  variant?: "solid" | "outline";
  external?: boolean;
  className?: string;
};

const styles = {
  solid:
    "bg-ink text-paper border border-ink hover:opacity-90",
  outline:
    "border border-line-strong text-ink hover:border-ink",
} as const;

export default function ButtonLink({
  href,
  children,
  variant = "solid",
  external = false,
  className = "",
}: Props) {
  const reduceMotion = useReducedMotion();
  const press = reduceMotion ? {} : { whileHover: { scale: 1.015 }, whileTap: { scale: 0.985 } };

  return (
    <motion.a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...press}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[14.5px] font-medium tracking-[-0.01em] transition-colors duration-200",
        styles[variant],
        className,
      ].join(" ")}
    >
      {children}
      {external && (
        <svg
          viewBox="0 0 24 24"
          className="size-[15px] opacity-70"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
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
