import DesignPhilosophy from "@/components/DesignPhilosophy";
import GetApp from "@/components/GetApp";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import Roadmap from "@/components/Roadmap";
import WhatItDoes from "@/components/WhatItDoes";

export default function HomePage() {
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
