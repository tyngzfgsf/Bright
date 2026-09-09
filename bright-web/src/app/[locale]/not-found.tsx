import { getTranslations } from "next-intl/server";
import ButtonLink from "@/components/ButtonLink";
import { site } from "@/lib/site";

export default async function NotFound() {
  const t = await getTranslations("hero");

  return (
    <main className="hero-wash grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="font-mono text-[13px] text-ink-faint">404</p>
        <h1 className="mt-4 text-[clamp(2.4rem,8vw,4rem)] font-semibold tracking-[-0.04em]">
          {site.name}
        </h1>
        <p className="mt-3 text-[16px] text-ink-soft">{t("tagline")}</p>
        <div className="mt-8 flex justify-center">
          <ButtonLink href="/">{site.name}</ButtonLink>
        </div>
      </div>
    </main>
  );
}
