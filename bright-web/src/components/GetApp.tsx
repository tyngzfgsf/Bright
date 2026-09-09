import { getTranslations } from "next-intl/server";
import ButtonLink from "./ButtonLink";
import LinkButton from "./LinkButton";
import Reveal from "./Reveal";
import Section from "./Section";
import { site } from "@/lib/site";

export default async function GetApp() {
  const t = await getTranslations("get");
  const nav = await getTranslations("nav");
  const steps = t.raw("steps") as string[];

  return (
    <Section
      id="get"
      eyebrow={t("eyebrow")}
      title={t("title")}
      lede={t("lede")}
      band
    >
      <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-start lg:gap-20">
        <Reveal>
          <ol className="space-y-6">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-4">
                <span className="tnum mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-line-strong font-mono text-[11.5px]">
                  {i + 1}
                </span>
                <p className="max-w-lg text-[15.5px] leading-[1.7] text-ink-soft">
                  {step}
                </p>
              </li>
            ))}
          </ol>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="sheen rounded-[1.35rem] border border-line bg-paper p-7 shadow-soft sm:p-8 lg:w-[23rem]">
            <p className="font-mono text-[12px] tracking-[-0.01em] text-ink-faint">
              {t("repoLabel")}
            </p>
            <div className="mt-6 space-y-3">
              <ButtonLink href={site.releasesLatest} external className="w-full">
                {t("cta")}
              </ButtonLink>
              <LinkButton href="/download" variant="outline" className="w-full">
                {nav("download")}
              </LinkButton>
            </div>
            <p className="mt-6 border-t border-line-subtle pt-5 text-[13.5px] leading-[1.65] text-ink-muted">
              {t("groqNote")}
            </p>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
