import { useTranslations } from "next-intl";
import Wordmark from "./Wordmark";
import PageLink from "./PageLink";
import type { Page } from "@/lib/site-nav";
import { site } from "@/lib/site";

type Column = {
  title: string;
  links: { label: string; to: Page; section?: string }[];
  external?: { label: string; href: string }[];
};

export default function Footer() {
  const t = useTranslations("footer");

  const columns: Column[] = [
    {
      title: t("groups.app"),
      links: [
        { label: t("links.download"), to: "download" },
        { label: t("links.releases"), to: "releases" },
        { label: t("links.faq"), to: "faq" },
      ],
    },
    {
      title: t("groups.project"),
      links: [
        { label: t("links.drill"), to: "home", section: "what" },
        { label: t("links.progress"), to: "home", section: "progress" },
      ],
      external: [{ label: t("links.releasesRepo"), href: site.releasesRepo }],
    },
    {
      title: t("groups.legal"),
      links: [
        { label: t("links.privacy"), to: "privacy" },
        { label: t("links.terms"), to: "terms" },
      ],
    },
  ];

  return (
    <footer className="band-primary">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-[1.5fr_repeat(3,1fr)]">
          <div>
            <Wordmark />
            <p className="mt-4 text-[14.5px] tracking-[-0.01em] text-ink-soft">
              {t("tagline")}
            </p>
          </div>

          {columns.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <p className="eyebrow-sm text-ink-faint">{column.title}</p>
              <ul className="mt-5 space-y-3 text-[14px]">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <PageLink
                      to={link.to}
                      section={link.section}
                      className="link-sweep text-ink-soft transition-colors duration-200 hover:text-ink"
                    >
                      {link.label}
                    </PageLink>
                  </li>
                ))}
                {column.external?.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-sweep text-ink-soft transition-colors duration-200 hover:text-ink"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="rule-soft mt-16 flex flex-col gap-4 pt-7 text-[13px] text-ink-faint sm:flex-row sm:items-start sm:justify-between">
          <p className="max-w-2xl leading-relaxed">{t("disclaimer")}</p>
          {/* Year passed as a string so it isn't formatted as "2,026". */}
          <p className="tnum shrink-0">
            {t("rights", { year: String(new Date().getFullYear()) })}
          </p>
        </div>
      </div>
    </footer>
  );
}
