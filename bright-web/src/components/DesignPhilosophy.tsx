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
      <div className="grid gap-x-12 gap-y-10 sm:grid-cols-2">
        {points.map((point, i) => (
          <Reveal key={point.title} delay={i * 0.07}>
            <div className="border-t border-line-strong pt-5">
              <h3 className="text-[17.5px] font-semibold tracking-[-0.02em]">
                {point.title}
              </h3>
              <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ink-soft">
                {point.body}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
