import { getTranslations } from "next-intl/server";
import Card from "./Card";
import Reveal from "./Reveal";
import Section from "./Section";

type CardCopy = { title: string; body: string };

export default async function WhatItDoes() {
  const t = await getTranslations("what");
  const cards = t.raw("cards") as CardCopy[];

  return (
    <Section id="what" eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, i) => (
          <Reveal key={card.title} delay={i * 0.08} className="h-full">
            <Card className="p-7 sm:p-8">
              <span className="tnum block font-mono text-[11.5px] tracking-[0.06em] text-ink-faint">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-6 text-[19.5px] font-semibold tracking-[-0.024em]">
                {card.title}
              </h3>
              <p className="mt-3.5 text-[15px] leading-[1.68] text-ink-soft">
                {card.body}
              </p>
            </Card>
          </Reveal>
        ))}
      </div>

      <Reveal delay={0.1}>
        <p className="mt-10 flex max-w-2xl gap-3.5 text-[14px] leading-relaxed text-ink-muted">
          <span
            aria-hidden="true"
            className="mt-[0.55em] block h-px w-6 shrink-0 bg-line-strong"
          />
          {t("note")}
        </p>
      </Reveal>
    </Section>
  );
}
