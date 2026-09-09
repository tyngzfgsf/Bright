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
      className={`scroll-mt-24 border-t border-line-subtle py-24 sm:py-32 ${className}`}
    >
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <Reveal>
          <p className="eyebrow flex items-center gap-3 text-ink-faint">
            <span aria-hidden="true" className="block h-px w-6 bg-line-strong" />
            {eyebrow}
          </p>
          <h2 className="display mt-6 max-w-3xl text-[clamp(2rem,4.6vw,3.15rem)]">
            {title}
          </h2>
          {lede && (
            <p className="mt-6 max-w-[38rem] text-[17px] leading-[1.65] text-ink-soft">
              {lede}
            </p>
          )}
        </Reveal>
        <div className="mt-14 sm:mt-18">{children}</div>
      </div>
    </section>
  );
}
