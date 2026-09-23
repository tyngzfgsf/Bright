import { useTranslations } from "next-intl";
import DocsFooter from "@/components/DocsFooter";
import LegalDoc, { type LegalSection } from "@/components/LegalDoc";
import PageHeader from "@/components/PageHeader";

export default function PrivacyPage() {
  const t = useTranslations("privacy");
  const common = useTranslations("common");
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
      <DocsFooter related="terms" />
    </>
  );
}
