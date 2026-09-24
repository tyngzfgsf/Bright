import { useTranslations } from "next-intl";
import ButtonLink from "@/components/ButtonLink";
import FaqList from "@/components/FaqList";
import LinkButton from "@/components/LinkButton";
import PageHeader from "@/components/PageHeader";
import Reveal from "@/components/Reveal";
import { site } from "@/lib/site";

type Item = { q: string; a: string };

export default function FaqPage() {
  const t = useTranslations("faq");
  const nav = useTranslations("footer.links");
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
            <LinkButton to="download">{nav("download")}</LinkButton>
            <ButtonLink href={site.issues} variant="outline" external>
              {nav("issues")}
            </ButtonLink>
          </div>
        </Reveal>
      </div>
    </>
  );
}
