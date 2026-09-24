import { useLocale, useTranslations } from "next-intl";
import Reveal from "./Reveal";
import Section from "./Section";
import { SCENARIOS } from "@/lib/app/scenarios";

type Step = { label: string; title: string; body: string };

/** What one session is: pick a case, answer it yourself, get graded on every turn. */
export default function Drill() {
  const t = useTranslations("drill");
  const locale = useLocale() === "ko" ? "ko" : "en";
  const steps = t.raw("steps") as Step[];

  return (
    <Section id="what" eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")}>
      <ol className="grid gap-x-10 gap-y-12 md:grid-cols-3">
        {steps.map((step, i) => (
          <li key={step.title}>
            <Reveal delay={i * 0.07}>
              <div className="flex items-center gap-3 border-t-2 border-accent pt-5">
                <span className="tnum font-mono text-[12px] font-semibold text-accent-ink">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="eyebrow-sm text-ink-muted">{step.label}</span>
              </div>
              <h3 className="mt-5 text-[19px] font-semibold tracking-[-0.024em]">
                {step.title}
              </h3>
              <p className="mt-3 max-w-sm text-[15px] leading-[1.68] text-ink-soft">
                {step.body}
              </p>
            </Reveal>
          </li>
        ))}
      </ol>

      <Reveal delay={0.1}>
        <div className="mt-16 rounded-[1.35rem] border border-line bg-raised px-6 py-6 sm:px-8">
          <p className="eyebrow-sm text-ink-faint">{t("scenariosLabel")}</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {SCENARIOS.map((scenario) => (
              <li
                key={scenario.id}
                className="rounded-full border border-line bg-paper px-3.5 py-1.5 text-[13.5px] text-ink-soft transition-colors duration-300 hover:border-accent/40 hover:bg-accent-soft hover:text-ink"
              >
                {scenario[locale]}
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </Section>
  );
}
