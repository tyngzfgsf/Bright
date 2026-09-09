import { getTranslations } from "next-intl/server";
import LinkButton from "@/components/LinkButton";

export default async function NotFound() {
  const t = await getTranslations("notFound");

  return (
    <div className="hero-wash grid min-h-[70vh] place-items-center px-6 py-20 text-center">
      <div>
        <p className="font-mono text-[13px] text-ink-faint">{t("code")}</p>
        <h1 className="display mt-4 text-[clamp(2.2rem,6vw,3.4rem)]">
          {t("title")}
        </h1>
        <p className="mx-auto mt-4 max-w-md text-[16px] leading-relaxed text-ink-soft">
          {t("lede")}
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <LinkButton href="/" size="lg">
            {t("cta")}
          </LinkButton>
          <LinkButton href="/download" variant="outline" size="lg">
            {t("secondary")}
          </LinkButton>
        </div>
      </div>
    </div>
  );
}
