import { getTranslations } from "next-intl/server";
import Reveal from "./Reveal";
import Section from "./Section";

type Step = { title: string; body: string };

export default async function HowItWorks() {
  const t = await getTranslations("how");
  const steps = t.raw("steps") as Step[];

  return (
    <Section id="how" eyebrow={t("eyebrow")} title={t("title")}>
      <ol className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, i) => (
          <li key={step.title} className="bg-paper">
            <Reveal delay={i * 0.07}>
              <div className="flex h-full flex-col p-6 sm:p-7">
                <span className="grid size-8 place-items-center rounded-full border border-line-strong font-mono text-[12.5px]">
                  {i + 1}
                </span>
                <h3 className="mt-5 text-[17px] font-semibold tracking-[-0.02em]">
                  {step.title}
                </h3>
                <p className="mt-2.5 text-[14.5px] leading-relaxed text-ink-soft">
                  {step.body}
                </p>
              </div>
            </Reveal>
          </li>
        ))}
      </ol>
    </Section>
  );
}
