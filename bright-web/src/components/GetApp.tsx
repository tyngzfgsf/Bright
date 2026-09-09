import { getTranslations } from "next-intl/server";
import ButtonLink from "./ButtonLink";
import Reveal from "./Reveal";
import Section from "./Section";
import { site } from "@/lib/site";

export default async function GetApp() {
  const t = await getTranslations("get");
  const steps = t.raw("steps") as string[];

  return (
    <Section
      id="get"
      eyebrow={t("eyebrow")}
      title={t("title")}
      lede={t("lede")}
      className="bg-raised"
    >
      <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-start lg:gap-16">
        <Reveal>
          <ol className="space-y-5">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-4">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-line-strong font-mono text-[11.5px]">
                  {i + 1}
                </span>
                <p className="max-w-lg text-[15.5px] leading-relaxed text-ink-soft">
                  {step}
                </p>
              </li>
            ))}
          </ol>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="rounded-2xl border border-line bg-paper p-6 sm:p-7 lg:w-[22rem]">
            <p className="font-mono text-[12.5px] text-ink-faint">
              {t("repoLabel")}
            </p>
            <div className="mt-5">
              <ButtonLink href={site.releasesLatest} external className="w-full">
                {t("cta")}
              </ButtonLink>
            </div>
            <p className="mt-5 text-[13.5px] leading-relaxed text-ink-faint">
              {t("groqNote")}
            </p>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
