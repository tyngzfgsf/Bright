import { getTranslations } from "next-intl/server";
import Reveal from "./Reveal";
import Section from "./Section";

type Point = { title: string; body: string };

export default async function DesignPhilosophy() {
  const t = await getTranslations("design");
  const points = t.raw("points") as Point[];

  return (
    <Section
      id="design"
      eyebrow={t("eyebrow")}
      title={t("title")}
      lede={t("lede")}
      className="bg-raised"
    >
      <div className="grid gap-x-16 gap-y-12 sm:grid-cols-2">
        {points.map((point, i) => (
          <Reveal key={point.title} delay={i * 0.07}>
            <div className="group relative border-t border-line-strong pt-6">
              {/* The rule fills in as you hover — a small reward for reading. */}
              <span
                aria-hidden="true"
                className="absolute -top-px left-0 h-px w-0 bg-ink transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:w-full"
              />
              <h3 className="text-[18px] font-semibold tracking-[-0.022em]">
                {point.title}
              </h3>
              <p className="mt-3.5 max-w-md text-[15px] leading-[1.7] text-ink-soft">
                {point.body}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
