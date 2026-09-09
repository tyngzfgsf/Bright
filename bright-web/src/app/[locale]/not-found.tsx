import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("notFound");

  return (
    <div className="hero-wash grid min-h-[70vh] place-items-center px-6 py-20 text-center">
      <div>
        <p className="font-mono text-[13px] text-ink-faint">{t("code")}</p>
        <h1 className="mt-4 text-[clamp(2rem,6vw,3.2rem)] font-semibold tracking-[-0.04em]">
          {t("title")}
        </h1>
        <p className="mx-auto mt-4 max-w-md text-[16px] leading-relaxed text-ink-soft">
          {t("lede")}
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-[14.5px] font-medium tracking-[-0.01em] text-paper transition-opacity duration-200 hover:opacity-90"
          >
            {t("cta")}
          </Link>
          <Link
            href="/download"
            className="inline-flex items-center rounded-full border border-line-strong px-5 py-3 text-[14.5px] font-medium tracking-[-0.01em] transition-colors duration-200 hover:border-ink"
          >
            {t("secondary")}
          </Link>
        </div>
      </div>
    </div>
  );
}
