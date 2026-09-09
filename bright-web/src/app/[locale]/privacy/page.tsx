import type { Metadata } from "next";
import { alternatesFor } from "@/lib/metadata";
import { getTranslations, setRequestLocale } from "next-intl/server";
import LegalDoc, { type LegalSection } from "@/components/LegalDoc";
import PageHeader from "@/components/PageHeader";

type Params = { locale: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "privacy.meta" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: alternatesFor(locale, "/privacy"),
  };
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("privacy");
  const common = await getTranslations("common");
  const sections = t.raw("sections") as LegalSection[];

  return (
    <>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        lede={t("lede")}
        meta={common("updated", { date: t("updated") })}
      />
      <LegalDoc sections={sections} />
    </>
  );
}
