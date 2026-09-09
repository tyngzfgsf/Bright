import { setRequestLocale } from "next-intl/server";
import DesignPhilosophy from "@/components/DesignPhilosophy";
import GetApp from "@/components/GetApp";
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

  return (
    <>
      <Hero />
      <WhatItDoes />
      <HowItWorks />
      <DesignPhilosophy />
      <Roadmap />
      <GetApp />
    </>
  );
}
