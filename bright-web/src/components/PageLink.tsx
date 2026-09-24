"use client";

import type { ReactNode } from "react";
import { useSiteNav, type Page } from "@/lib/site-nav";

/**
 * A text link to another page of the site. A button underneath, because it never goes to a
 * URL: the site stays at one address and swaps the page in place (see `lib/site-nav.tsx`).
 */
export default function PageLink({
  to,
  section,
  children,
  className = "",
  onNavigate,
}: {
  to: Page;
  section?: string;
  children: ReactNode;
  className?: string;
  onNavigate?: () => void;
}) {
  const { go } = useSiteNav();
  return (
    <button
      type="button"
      onClick={() => {
        onNavigate?.();
        go(to, section);
      }}
      className={`text-left ${className}`}
    >
      {children}
    </button>
  );
}
