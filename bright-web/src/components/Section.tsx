import type { ReactNode } from "react";
import Reveal from "./Reveal";

type Props = {
  id?: string;
  eyebrow: string;
  title: string;
  lede?: string;
  children: ReactNode;
  className?: string;
};

export default function Section({
  id,
  eyebrow,
  title,
  lede,
  children,
  className = "",
}: Props) {
  return (
    <section
      id={id}
      className={`scroll-mt-20 border-t border-line py-20 sm:py-28 ${className}`}
    >
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <Reveal>
          <p className="eyebrow text-ink-faint">
            {eyebrow}
          </p>
          <h2 className="mt-4 max-w-2xl text-[clamp(1.9rem,4.4vw,3rem)] font-semibold leading-[1.08] tracking-[-0.03em]">
            {title}
          </h2>
          {lede && (
            <p className="mt-5 max-w-2xl text-[16.5px] leading-relaxed text-ink-soft">
              {lede}
            </p>
          )}
        </Reveal>
        <div className="mt-12 sm:mt-16">{children}</div>
      </div>
    </section>
  );
}
