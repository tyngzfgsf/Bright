import type { Metadata } from "next";
import { alternatesFor } from "@/lib/metadata";
import { getTranslations, setRequestLocale } from "next-intl/server";
import FaqList from "@/components/FaqList";
import PageHeader from "@/components/PageHeader";
import Reveal from "@/components/Reveal";
import { Link } from "@/i18n/navigation";
import { site } from "@/lib/site";

type Params = { locale: string };
type Item = { q: string; a: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "faq.meta" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: alternatesFor(locale, "/faq"),
  };
}

export default async function FaqPage({ params }: { params: Promise<Params> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("faq");
  const nav = await getTranslations("footer.links");
  const items = t.raw("items") as Item[];

  // Structured data so the questions can surface in search results.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <PageHeader eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />

      <div className="mx-auto w-full max-w-3xl px-5 py-16 sm:px-8 sm:py-20">
        <FaqList />

        <Reveal>
          <div className="mt-12 flex flex-wrap items-center gap-3">
            <Link
              href="/download"
              className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-[14.5px] font-medium tracking-[-0.01em] text-paper transition-opacity duration-200 hover:opacity-90"
            >
              {nav("download")}
            </Link>
            <a
              href={site.issues}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-full border border-line-strong px-5 py-3 text-[14.5px] font-medium tracking-[-0.01em] transition-colors duration-200 hover:border-ink"
            >
              {nav("issues")}
            </a>
          </div>
        </Reveal>
      </div>
    </>
  );
}
