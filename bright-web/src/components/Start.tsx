import { useTranslations } from "next-intl";
import Card from "./Card";
import LinkButton from "./LinkButton";
import Reveal from "./Reveal";
import Section from "./Section";
import type { Page } from "@/lib/site-nav";

type Path = { key: "web" | "android"; to: Page; variant: "solid" | "outline" };

const paths: Path[] = [
  { key: "web", to: "app", variant: "solid" },
  { key: "android", to: "download", variant: "outline" },
];

/** The two ways to use Bright, side by side, each ending in the one button it needs. */
export default function Start() {
  const t = useTranslations("start");

  return (
    <Section id="how" eyebrow={t("eyebrow")} title={t("title")}>
      <div className="grid gap-4 md:grid-cols-2">
        {paths.map((path, i) => (
          <Reveal key={path.key} delay={i * 0.08} className="h-full">
            <Card className="flex flex-col p-7 sm:p-9">
              {/* The browser is the quickest way in, so it carries the colour. */}
              {path.variant === "solid" && (
                <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-primary" />
              )}
              <h3 className="text-[22px] font-semibold tracking-[-0.026em]">
                {t(`${path.key}.name`)}
              </h3>
              <p className="mt-1.5 text-[15px] text-ink-muted">{t(`${path.key}.tagline`)}</p>

              <ul className="mt-7 flex-1 space-y-4">
                {(t.raw(`${path.key}.points`) as string[]).map((point) => (
                  <li key={point} className="flex gap-3.5 text-[15px] leading-[1.65] text-ink-soft">
                    <span
                      aria-hidden="true"
                      className="mt-[0.75em] block h-[2px] w-3 shrink-0 rounded-full bg-primary"
                    />
                    {point}
                  </li>
                ))}
              </ul>

              <LinkButton to={path.to} variant={path.variant} className="mt-9 self-start">
                {t(`${path.key}.cta`)}
              </LinkButton>
            </Card>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
