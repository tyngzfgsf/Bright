import { getTranslations } from "next-intl/server";
import Reveal from "./Reveal";
import Section from "./Section";

type Step = { title: string; body: string };

export default async function HowItWorks() {
  const t = await getTranslations("how");
  const steps = t.raw("steps") as Step[];

  return (
    <Section id="how" eyebrow={t("eyebrow")} title={t("title")}>
      <ol className="grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, i) => (
          <li key={step.title} className="relative">
            <Reveal delay={i * 0.07}>
              {/* The rail continues between steps, so the four read as a sequence. */}
              <div className="flex items-center gap-3">
                <span className="tnum grid size-9 shrink-0 place-items-center rounded-full border border-line-strong font-mono text-[12.5px]">
                  {i + 1}
                </span>
                <span
                  aria-hidden="true"
                  className={`h-px flex-1 ${
                    i === steps.length - 1
                      ? "bg-gradient-to-r from-line to-transparent"
                      : "bg-line"
                  }`}
                />
              </div>
              <h3 className="mt-6 text-[17.5px] font-semibold tracking-[-0.022em]">
                {step.title}
              </h3>
              <p className="mt-2.5 text-[14.5px] leading-[1.68] text-ink-soft">
                {step.body}
              </p>
            </Reveal>
          </li>
        ))}
      </ol>
    </Section>
  );
}
