import type { ReactNode } from "react";
import Reveal from "./Reveal";

type Props = {
  id?: string;
  eyebrow: string;
  title: string;
  lede?: string;
  children: ReactNode;
  className?: string;
  /** Renders the section as a soft tonal swell instead of a flat block. */
  band?: boolean;
  /** "primary" puts the whole section on the pine band — the palette's 30%. */
  tone?: "primary";
};

export default function Section({
  id,
  eyebrow,
  title,
  lede,
  children,
  className = "",
  band = false,
  tone,
}: Props) {
  return (
    <section
      id={id}
      className={[
        "scroll-mt-24 py-24 sm:py-32",
        // A band separates itself by tone, so it doesn't also need a rule.
        tone === "primary" ? "band-primary" : band ? "band" : "rule-soft",
        className,
      ].join(" ")}
    >
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <Reveal>
          <p className="eyebrow flex items-center gap-3 text-primary-ink">
            <span aria-hidden="true" className="block h-[2px] w-6 rounded-full bg-primary-ink" />
            {eyebrow}
          </p>
          <h2 className="display mt-6 max-w-3xl text-[clamp(2rem,4.6vw,3.15rem)] text-primary-ink">
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
