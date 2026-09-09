import { getTranslations } from "next-intl/server";
import Reveal from "./Reveal";
import Section from "./Section";

type Card = { title: string; body: string };

export default async function WhatItDoes() {
  const t = await getTranslations("what");
  const cards = t.raw("cards") as Card[];

  return (
    <Section id="what" eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")}>
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card, i) => (
          <Reveal key={card.title} delay={i * 0.08} className="h-full">
            <article className="group h-full rounded-2xl border border-line bg-raised p-6 transition-colors duration-300 hover:border-line-strong sm:p-7">
              <span className="block font-mono text-[12px] text-ink-faint">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-5 text-[19px] font-semibold tracking-[-0.02em]">
                {card.title}
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
                {card.body}
              </p>
            </article>
          </Reveal>
        ))}
      </div>

      <Reveal delay={0.1}>
        <p className="mt-8 max-w-2xl border-l border-line-strong pl-4 text-[14px] leading-relaxed text-ink-faint">
          {t("note")}
        </p>
      </Reveal>
    </Section>
  );
}
