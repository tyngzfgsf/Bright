import type { Metadata } from "next";
import { alternatesFor } from "@/lib/metadata";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import ButtonLink from "@/components/ButtonLink";
import PageHeader from "@/components/PageHeader";
import ReleaseNotes from "@/components/ReleaseNotes";
import Reveal from "@/components/Reveal";
import { fetchReleases } from "@/lib/releases";
import { site } from "@/lib/site";

type Params = { locale: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "releases.meta" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: alternatesFor(locale, "/releases"),
  };
}

export default async function ReleasesPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("releases");
  const format = await getFormatter();
  const releases = await fetchReleases();

  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />

      <div className="mx-auto w-full max-w-4xl px-5 py-16 sm:px-8 sm:py-20">
        {releases === null && (
          <div className="sheen rounded-[1.35rem] border border-line bg-raised p-8">
            <h2 className="text-[18px] font-semibold tracking-[-0.02em]">
              {t("errorTitle")}
            </h2>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-soft">
              {t("errorBody")}
            </p>
            <div className="mt-6">
              <ButtonLink href={site.releasesLatest} external>
                {t("errorCta")}
              </ButtonLink>
            </div>
          </div>
        )}

        {releases?.length === 0 && (
          <div className="sheen rounded-[1.35rem] border border-line bg-raised p-8">
            <h2 className="text-[18px] font-semibold tracking-[-0.02em]">
              {t("emptyTitle")}
            </h2>
            <p className="mt-3 text-[15px] text-ink-soft">{t("emptyBody")}</p>
          </div>
        )}

        {releases && releases.length > 0 && (
          <ol className="border-t border-line">
            {releases.map((release, i) => (
              <li key={release.tag} className="border-b border-line">
                <Reveal y={14} delay={Math.min(i * 0.05, 0.2)}>
                  <article className="grid gap-6 py-10 sm:grid-cols-[9.5rem_1fr] sm:gap-12">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="tnum font-mono text-[15px] tracking-[-0.01em]">
                          {release.tag}
                        </h2>
                        {i === 0 && (
                          <span className="eyebrow-sm rounded-full bg-ink px-2 py-0.5 text-paper">
                            {t("latest")}
                          </span>
                        )}
                      </div>
                      {release.publishedAt && (
                        <p className="tnum mt-2 text-[13px] text-ink-faint">
                          {format.dateTime(new Date(release.publishedAt), {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </p>
                      )}
                      {release.apk && (
                        <p className="tnum mt-1 font-mono text-[12px] text-ink-faint">
                          {t("sizeLabel", { size: release.apk.sizeMb })}
                        </p>
                      )}
                    </div>

                    <div className="min-w-0">
                      <h3 className="text-[17.5px] font-semibold tracking-[-0.022em]">
                        {release.name}
                      </h3>
                      {release.body ? (
                        <ReleaseNotes body={release.body} />
                      ) : (
                        <p className="mt-3 text-[14.5px] text-ink-faint">
                          {t("noNotes")}
                        </p>
                      )}

                      <div className="mt-6 flex flex-wrap items-center gap-3">
                        {release.apk && (
                          <ButtonLink href={release.apk.url} external>
                            {t("download")}
                          </ButtonLink>
                        )}
                        <ButtonLink href={release.htmlUrl} variant="outline" external>
                          {t("viewOnGithub")}
                        </ButtonLink>
                      </div>
                    </div>
                  </article>
                </Reveal>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
