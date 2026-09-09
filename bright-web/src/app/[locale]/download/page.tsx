import type { Metadata } from "next";
import { alternatesFor } from "@/lib/metadata";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import ButtonLink from "@/components/ButtonLink";
import PageHeader from "@/components/PageHeader";
import Reveal from "@/components/Reveal";
import { Link } from "@/i18n/navigation";
import { fetchReleases } from "@/lib/releases";
import { site } from "@/lib/site";

type Params = { locale: string };
type Step = { title: string; body: string };
type Requirement = { label: string; value: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "download.meta" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: alternatesFor(locale, "/download"),
  };
}

export default async function DownloadPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("download");
  const format = await getFormatter();
  const releases = await fetchReleases();
  const latest = releases?.[0] ?? null;

  const steps = t.raw("steps") as Step[];
  const requirements = t.raw("requirements") as Requirement[];

  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />

      <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        {/* Latest build, read live from the same feed the app checks. */}
        <Reveal>
          <div className="rounded-2xl border border-line bg-raised p-7 sm:p-9">
            <p className="eyebrow-sm text-ink-faint">{t("latestLabel")}</p>
            {latest ? (
              <>
                <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <h2 className="text-[clamp(1.6rem,4vw,2.1rem)] font-semibold tracking-[-0.03em]">
                    {latest.name}
                  </h2>
                  {latest.apk && (
                    <span className="font-mono text-[13px] text-ink-faint">
                      {t("sizeLabel", { size: latest.apk.sizeMb })}
                    </span>
                  )}
                </div>
                {latest.publishedAt && (
                  <p className="mt-2 text-[14px] text-ink-soft">
                    {t("publishedOn", {
                      date: format.dateTime(new Date(latest.publishedAt), {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      }),
                    })}
                  </p>
                )}
                <div className="mt-7 flex flex-wrap items-center gap-3">
                  <ButtonLink href={latest.apk?.url ?? latest.htmlUrl} external>
                    {t("cta")}
                  </ButtonLink>
                  <Link
                    href="/releases"
                    className="inline-flex items-center rounded-full border border-line-strong px-5 py-3 text-[14.5px] font-medium tracking-[-0.01em] transition-colors duration-200 hover:border-ink"
                  >
                    {t("allReleases")}
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-ink-soft">
                  {t("latestUnknown")}
                </p>
                <div className="mt-7">
                  <ButtonLink href={site.releasesLatest} external>
                    {t("cta")}
                  </ButtonLink>
                </div>
              </>
            )}
          </div>
        </Reveal>

        <div className="mt-16 grid gap-12 lg:grid-cols-[1.35fr_1fr] lg:gap-16">
          <div>
            <Reveal>
              <h2 className="text-[22px] font-semibold tracking-[-0.02em]">
                {t("stepsTitle")}
              </h2>
            </Reveal>
            <ol className="mt-7 space-y-7">
              {steps.map((step, i) => (
                <Reveal key={step.title} delay={i * 0.06} y={14}>
                  <li className="flex gap-4">
                    <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-line-strong font-mono text-[12px]">
                      {i + 1}
                    </span>
                    <div>
                      <h3 className="text-[16.5px] font-medium tracking-[-0.01em]">
                        {step.title}
                      </h3>
                      <p className="mt-1.5 max-w-lg text-[15px] leading-relaxed text-ink-soft">
                        {step.body}
                      </p>
                    </div>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>

          <div>
            <Reveal>
              <h2 className="text-[22px] font-semibold tracking-[-0.02em]">
                {t("requirementsTitle")}
              </h2>
            </Reveal>
            <Reveal delay={0.08}>
              <dl className="mt-7 border-t border-line">
                {requirements.map((requirement) => (
                  <div
                    key={requirement.label}
                    className="grid grid-cols-[7rem_1fr] gap-4 border-b border-line py-3.5"
                  >
                    <dt className="text-[13.5px] text-ink-faint">
                      {requirement.label}
                    </dt>
                    <dd className="text-[14.5px] text-ink-soft">
                      {requirement.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2">
          {[
            { title: t("noPlayTitle"), body: t("noPlayBody") },
            { title: t("iosTitle"), body: t("iosBody") },
          ].map((card, i) => (
            <Reveal key={card.title} delay={i * 0.08}>
              <div className="h-full rounded-2xl border border-line p-6 sm:p-7">
                <h2 className="text-[17px] font-semibold tracking-[-0.02em]">
                  {card.title}
                </h2>
                <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
                  {card.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </>
  );
}
