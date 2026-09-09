import { getTranslations } from "next-intl/server";
import { site } from "@/lib/site";

export default async function Footer() {
  const t = await getTranslations("footer");

  return (
    <footer className="border-t border-line py-14">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 sm:px-8 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[15px] font-semibold tracking-[-0.01em]">
            {site.name}
          </p>
          <p className="mt-2 text-[14px] text-ink-soft">{t("tagline")}</p>
          <p className="mt-1 text-[13px] text-ink-faint">{t("builtBy")}</p>
        </div>

        <nav className="flex flex-col gap-3 text-[14px] md:items-end">
          <a
            href={site.releasesRepo}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink-soft transition-colors duration-200 hover:text-ink"
          >
            {t("releases")}
          </a>
          <a
            href={site.sourceRepo}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink-soft transition-colors duration-200 hover:text-ink"
          >
            {t("source")}{" "}
            <span className="text-ink-faint">({t("sourceNote")})</span>
          </a>
          <p className="mt-2 text-[13px] text-ink-faint">
            {/* Passed as a string so it isn't formatted as "2,026". */}
            {t("rights", { year: String(new Date().getFullYear()) })}
          </p>
        </nav>
      </div>
    </footer>
  );
}
