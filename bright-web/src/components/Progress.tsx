import { useTranslations } from "next-intl";
import Reveal from "./Reveal";
import Section from "./Section";
import SkillPanel from "./SkillPanel";

type Point = { title: string; body: string };

/** The skill profile: what a chatbot can't do, because it forgets you between sessions. */
export default function Progress() {
  const t = useTranslations("progress");
  const points = t.raw("points") as Point[];

  return (
    <Section id="progress" eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} band>
      <div className="grid gap-14 lg:grid-cols-[1fr_minmax(0,26rem)] lg:items-start lg:gap-20">
        <div>
          <ul className="space-y-9">
            {points.map((point, i) => (
              <li key={point.title}>
                <Reveal delay={i * 0.07}>
                  <h3 className="text-[17.5px] font-semibold tracking-[-0.022em]">
                    {point.title}
                  </h3>
                  <p className="mt-2.5 max-w-lg text-[15px] leading-[1.7] text-ink-soft">
                    {point.body}
                  </p>
                </Reveal>
              </li>
            ))}
          </ul>

          <Reveal delay={0.1}>
            <p className="mt-10 flex max-w-lg gap-3.5 text-[14px] leading-relaxed text-ink-muted">
              <span
                aria-hidden="true"
                className="mt-[0.55em] block h-px w-6 shrink-0 bg-line-strong"
              />
              {t("availability")}
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.12}>
          <SkillPanel />
        </Reveal>
      </div>
    </Section>
  );
}
