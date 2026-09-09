"use client";

import { useTranslations } from "next-intl";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type Variants,
} from "framer-motion";
import ButtonLink from "./ButtonLink";
import ChatDemo from "./ChatDemo";
import LinkButton from "./LinkButton";
import { EASE } from "@/lib/motion";
import { site } from "@/lib/site";

export default function Hero() {
  const t = useTranslations("hero");
  const nav = useTranslations("nav");
  const reduceMotion = useReducedMotion();
  const letters = t("name").split("");

  // The device drifts a little slower than the page — depth without theatrics.
  const { scrollY } = useScroll();
  const deviceY = useTransform(scrollY, [0, 700], [0, -46]);
  const deviceFade = useTransform(scrollY, [0, 620], [1, 0.72]);

  const container: Variants = {
    hidden: {},
    shown: {
      transition: { staggerChildren: reduceMotion ? 0 : 0.05, delayChildren: 0.08 },
    },
  };

  const letter: Variants = reduceMotion
    ? { hidden: { opacity: 1 }, shown: { opacity: 1 } }
    : {
        hidden: { y: "112%", opacity: 0 },
        shown: {
          y: "0%",
          opacity: 1,
          transition: { duration: 0.95, ease: EASE },
        },
      };

  const fadeUp = (delay: number): Variants =>
    reduceMotion
      ? { hidden: { opacity: 1 }, shown: { opacity: 1 } }
      : {
          hidden: { opacity: 0, y: 14 },
          shown: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.75, ease: EASE, delay },
          },
        };

  return (
    <section id="top" className="hero-wash relative overflow-hidden">
      {/* Hairline grid: structure you feel more than see. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 mx-auto hidden max-w-6xl px-5 [mask-image:linear-gradient(to_bottom,transparent,black_22%,black_72%,transparent)] sm:px-8 lg:block"
      >
        <div className="grid h-full grid-cols-2 border-x border-line-subtle">
          <div className="border-r border-line-subtle" />
        </div>
      </div>

      <div className="relative mx-auto grid w-full max-w-6xl gap-14 px-5 pb-24 pt-14 sm:px-8 sm:pb-32 sm:pt-20 lg:grid-cols-[1.06fr_0.94fr] lg:items-center lg:gap-10">
        <motion.div initial="hidden" animate="shown" variants={container}>
          <motion.div data-reveal="" variants={fadeUp(0)}>
            <span className="inline-flex items-center gap-2.5 rounded-full border border-line bg-raised/70 py-1.5 pl-2.5 pr-3.5 backdrop-blur-sm">
              <span aria-hidden="true" className="relative flex size-1.5">
                {!reduceMotion && (
                  <motion.span
                    className="absolute inset-0 rounded-full bg-ink"
                    animate={{ scale: [1, 2.6], opacity: [0.5, 0] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
                  />
                )}
                <span className="relative block size-1.5 rounded-full bg-ink" />
              </span>
              <span className="eyebrow-sm text-ink-soft">{t("eyebrow")}</span>
            </span>
          </motion.div>

          <h1 className="display mt-7 flex text-[clamp(3.6rem,12.5vw,7.5rem)]">
            <span className="sr-only">{t("name")}</span>
            <span aria-hidden="true" className="flex">
              {letters.map((char, i) => (
                <span key={i} className="overflow-hidden pb-[0.08em]">
                  <motion.span data-reveal="" className="block" variants={letter}>
                    {char}
                  </motion.span>
                </span>
              ))}
            </span>
          </h1>

          <motion.p
            data-reveal=""
            variants={fadeUp(0.42)}
            className="mt-5 text-[clamp(1.2rem,2.6vw,1.65rem)] font-medium tracking-[-0.024em]"
          >
            {t("tagline")}
          </motion.p>

          <motion.p
            data-reveal=""
            variants={fadeUp(0.54)}
            className="mt-5 max-w-[34rem] text-[16.5px] leading-[1.65] text-ink-soft"
          >
            {t("description")}
          </motion.p>

          <motion.div
            data-reveal=""
            variants={fadeUp(0.66)}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <ButtonLink href={site.releasesLatest} size="lg" external>
              {t("ctaPrimary")}
            </ButtonLink>
            <LinkButton href="/download" variant="outline" size="lg">
              {nav("download")}
            </LinkButton>
          </motion.div>

          <motion.p
            data-reveal=""
            variants={fadeUp(0.76)}
            className="mt-6 max-w-md text-[13px] leading-relaxed text-ink-faint"
          >
            {t("note")}
          </motion.p>
        </motion.div>

        <motion.div
          data-reveal=""
          style={reduceMotion ? undefined : { y: deviceY, opacity: deviceFade }}
          initial={reduceMotion ? false : { opacity: 0, y: 34, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1, ease: EASE, delay: 0.3 }}
        >
          <ChatDemo />
        </motion.div>
      </div>
    </section>
  );
}
