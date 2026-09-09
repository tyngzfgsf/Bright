import { getTranslations } from "next-intl/server";
import ButtonLink from "./ButtonLink";
import Reveal from "./Reveal";
import { Link } from "@/i18n/navigation";
import { site } from "@/lib/site";

/** Closes out a legal page: a way to reach me, and the other document. */
export default async function DocsFooter({
  related,
}: {
  related: "privacy" | "terms";
}) {
  const t = await getTranslations("docsFooter");
  const links = await getTranslations("footer.links");

  return (
    <div className="mx-auto w-full max-w-6xl px-5 pb-24 sm:px-8 sm:pb-32 lg:pl-[19rem]">
      <Reveal>
        <div className="sheen rounded-[1.35rem] border border-line bg-raised p-8 sm:p-9">
          <h2 className="text-[19px] font-semibold tracking-[-0.024em]">
            {t("title")}
          </h2>
          <p className="mt-3 max-w-[38rem] text-[15px] leading-[1.7] text-ink-soft">
            {t("body")}
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-4">
            <ButtonLink href={site.issues} external>
              {t("cta")}
            </ButtonLink>
            <p className="flex items-center gap-2.5 text-[14px] text-ink-faint">
              <span className="eyebrow-sm">{t("related")}</span>
              <Link
                href={`/${related}`}
                className="link-sweep text-ink-soft transition-colors duration-300 hover:text-ink"
              >
                {links(related)}
              </Link>
            </p>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
