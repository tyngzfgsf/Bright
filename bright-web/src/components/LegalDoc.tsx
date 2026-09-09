import { getTranslations } from "next-intl/server";
import ReadingProgress from "./ReadingProgress";
import Reveal from "./Reveal";
import TocNav from "./TocNav";

export type LegalSection = {
  id: string;
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  after?: string;
};

/**
 * Long-form document layout: sticky table of contents on the left, numbered
 * sections on the right. Used by the privacy and terms pages.
 */
export default async function LegalDoc({ sections }: { sections: LegalSection[] }) {
  const t = await getTranslations("common");

  return (
    <>
      <ReadingProgress />

      <div className="mx-auto w-full max-w-6xl gap-16 px-5 py-16 sm:px-8 sm:py-24 lg:grid lg:grid-cols-[15rem_1fr]">
        <aside className="mb-14 lg:mb-0">
          <div className="lg:sticky lg:top-28">
            <TocNav
              label={t("onThisPage")}
              entries={sections.map(({ id, heading }) => ({ id, heading }))}
            />
          </div>
        </aside>

        <div className="min-w-0">
          {sections.map((section, i) => (
            <Reveal key={section.id} y={12}>
              <section
                id={section.id}
                className="scroll-mt-28 border-t border-line-subtle py-10 first:border-t-0 first:pt-0"
              >
                <div className="flex items-baseline gap-4">
                  <span className="tnum font-mono text-[11.5px] tracking-[0.06em] text-ink-faint">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h2 className="text-[21px] font-semibold tracking-[-0.025em]">
                    {section.heading}
                  </h2>
                </div>

                <div className="mt-5 space-y-4 text-[15.5px] leading-[1.78] text-ink-soft">
                  {section.paragraphs?.map((paragraph, j) => (
                    <p key={j} className="max-w-[42rem]">
                      {paragraph}
                    </p>
                  ))}

                  {section.bullets && (
                    <ul className="max-w-[42rem] space-y-3">
                      {section.bullets.map((bullet, j) => (
                        <li key={j} className="flex gap-3.5">
                          <span
                            aria-hidden="true"
                            className="mt-[0.72em] block h-px w-3 shrink-0 bg-line-strong"
                          />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {section.after && <p className="max-w-[42rem]">{section.after}</p>}
                </div>
              </section>
            </Reveal>
          ))}
        </div>
      </div>
    </>
  );
}
