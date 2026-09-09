"use client";

import { useTranslations } from "next-intl";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import ButtonLink from "./ButtonLink";
import ChatDemo from "./ChatDemo";
import { site } from "@/lib/site";

const EASE = [0.22, 1, 0.36, 1] as const;

export default function Hero() {
  const t = useTranslations("hero");
  const reduceMotion = useReducedMotion();
  const letters = t("name").split("");

  const container: Variants = {
    hidden: {},
    shown: {
      transition: { staggerChildren: reduceMotion ? 0 : 0.055, delayChildren: 0.1 },
    },
  };

  const letter: Variants = reduceMotion
    ? { hidden: { opacity: 1 }, shown: { opacity: 1 } }
    : {
        hidden: { y: "110%", opacity: 0 },
        shown: {
          y: "0%",
          opacity: 1,
          transition: { duration: 0.85, ease: EASE },
        },
      };

  const fadeUp = (delay: number): Variants =>
    reduceMotion
      ? { hidden: { opacity: 1 }, shown: { opacity: 1 } }
      : {
          hidden: { opacity: 0, y: 16 },
          shown: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE, delay } },
        };

  return (
    <section id="top" className="hero-wash relative overflow-hidden">
      <div className="mx-auto grid w-full max-w-6xl gap-16 px-5 pb-20 pt-16 sm:px-8 sm:pb-28 sm:pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-12">
        <motion.div initial="hidden" animate="shown" variants={container}>
          <motion.p
            data-reveal=""
            variants={fadeUp(0)}
            className="eyebrow text-ink-faint"
          >
            {t("eyebrow")}
          </motion.p>

          <h1 className="mt-6 flex overflow-hidden text-[clamp(3.4rem,12vw,7rem)] font-semibold leading-[0.95] tracking-[-0.05em]">
            <span className="sr-only">{t("name")}</span>
            <span aria-hidden="true" className="flex">
              {letters.map((char, i) => (
                <span key={i} className="overflow-hidden pb-[0.06em]">
                  <motion.span data-reveal="" className="block" variants={letter}>
                    {char}
                  </motion.span>
                </span>
              ))}
            </span>
          </h1>

          <motion.p
            data-reveal=""
            variants={fadeUp(0.45)}
            className="mt-6 text-[clamp(1.15rem,2.6vw,1.6rem)] font-medium tracking-[-0.02em]"
          >
            {t("tagline")}
          </motion.p>

          <motion.p
            data-reveal=""
            variants={fadeUp(0.58)}
            className="mt-5 max-w-xl text-[16.5px] leading-relaxed text-ink-soft"
          >
            {t("description")}
          </motion.p>

          <motion.div
            data-reveal=""
            variants={fadeUp(0.7)}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <ButtonLink href={site.releasesLatest} external>
              {t("ctaPrimary")}
            </ButtonLink>
            <ButtonLink href="#how" variant="outline">
              {t("ctaSecondary")}
            </ButtonLink>
          </motion.div>

          <motion.p
            data-reveal=""
            variants={fadeUp(0.8)}
            className="mt-5 text-[13px] text-ink-faint"
          >
            {t("note")}
          </motion.p>
        </motion.div>

        <motion.div
          data-reveal=""
          initial={reduceMotion ? false : { opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.35 }}
        >
          <ChatDemo />
        </motion.div>
      </div>
    </section>
  );
}
