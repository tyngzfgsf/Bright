import { setRequestLocale, getTranslations } from "next-intl/server";
import DesignPhilosophy from "@/components/DesignPhilosophy";
import Footer from "@/components/Footer";
import GetApp from "@/components/GetApp";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import Roadmap from "@/components/Roadmap";
import WhatItDoes from "@/components/WhatItDoes";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("nav");

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-paper"
      >
        {t("skip")}
      </a>
      <Header />
      <main id="main">
        <Hero />
        <WhatItDoes />
        <HowItWorks />
        <DesignPhilosophy />
        <Roadmap />
        <GetApp />
      </main>
      <Footer />
    </>
  );
}
