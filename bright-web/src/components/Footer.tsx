import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { site } from "@/lib/site";

export default async function Footer() {
  const t = await getTranslations("footer");

  const columns = [
    {
      title: t("groups.app"),
      links: [
        { label: t("links.download"), href: "/download" },
        { label: t("links.releases"), href: "/releases" },
        { label: t("links.faq"), href: "/faq" },
      ],
    },
    {
      title: t("groups.project"),
      links: [
        { label: t("links.howItWorks"), href: "/#how" },
        { label: t("links.status"), href: "/#status" },
      ],
      external: [
        { label: t("links.releasesRepo"), href: site.releasesRepo },
        { label: t("links.issues"), href: site.issues },
        {
          label: `${t("links.sourceRepo")} (${t("sourceNote")})`,
          href: site.sourceRepo,
        },
      ],
    },
    {
      title: t("groups.legal"),
      links: [
        { label: t("links.privacy"), href: "/privacy" },
        { label: t("links.terms"), href: "/terms" },
      ],
    },
  ];

  return (
    <footer className="border-t border-line bg-raised">
      <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <p className="text-[15px] font-semibold tracking-[-0.01em]">
              {site.name}
            </p>
            <p className="mt-2 text-[14px] text-ink-soft">{t("tagline")}</p>
            <p className="mt-1 text-[13px] text-ink-faint">{t("builtBy")}</p>
          </div>

          {columns.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <p className="eyebrow-sm text-ink-faint">{column.title}</p>
              <ul className="mt-4 space-y-2.5 text-[14px]">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-ink-soft transition-colors duration-200 hover:text-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
                {column.external?.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-ink-soft transition-colors duration-200 hover:text-ink"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6 text-[13px] text-ink-faint sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl">{t("disclaimer")}</p>
          {/* Year passed as a string so it isn't formatted as "2,026". */}
          <p className="shrink-0">
            {t("rights", { year: String(new Date().getFullYear()) })}
          </p>
        </div>
      </div>
    </footer>
  );
}
