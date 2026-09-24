"use client";

import { useTranslations } from "next-intl";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type Variants,
} from "framer-motion";
import ChatDemo from "./ChatDemo";
import LinkButton from "./LinkButton";
import Magnetic from "./Magnetic";
import { EASE } from "@/lib/motion";

export default function Hero() {
  const t = useTranslations("hero");
  const reduceMotion = useReducedMotion();

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
            <span className="inline-flex items-center gap-2.5 rounded-full border border-accent/25 bg-accent-soft py-1.5 pl-3 pr-3.5">
              {/* CSS pulse rather than a motion branch, so the prerendered HTML never
                  depends on the visitor's motion setting. */}
              <span aria-hidden="true" className="relative flex size-2">
                <span className="absolute inset-0 rounded-full bg-accent opacity-60 motion-safe:animate-ping" />
                <span className="relative block size-2 rounded-full bg-accent" />
              </span>
              <span className="eyebrow-sm text-accent-ink">{t("eyebrow")}</span>
            </span>
          </motion.div>

          {/* The promise leads, not the name: the header already says "Bright". */}
          <motion.h1
            data-reveal=""
            variants={fadeUp(0.12)}
            className="display mt-6 max-w-[14ch] text-[clamp(2.6rem,7vw,4.6rem)]"
          >
            {t.rich("title", {
              hl: (chunks) => <span className="accent-text">{chunks}</span>,
            })}
          </motion.h1>

          <motion.p
            data-reveal=""
            variants={fadeUp(0.3)}
            className="mt-7 max-w-[34rem] text-[17px] leading-[1.65] text-ink-soft"
          >
            {t("description")}
          </motion.p>

          <motion.div
            data-reveal=""
            variants={fadeUp(0.42)}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <Magnetic>
              <LinkButton to="app" size="lg">
                {t("ctaWeb")}
              </LinkButton>
            </Magnetic>
            <Magnetic strength={0.18}>
              <LinkButton to="download" variant="outline" size="lg">
                {t("ctaAndroid")}
              </LinkButton>
            </Magnetic>
          </motion.div>

          <motion.p
            data-reveal=""
            variants={fadeUp(0.52)}
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
