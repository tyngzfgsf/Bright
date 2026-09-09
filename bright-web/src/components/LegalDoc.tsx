import { getTranslations } from "next-intl/server";
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
    <div className="mx-auto w-full max-w-6xl gap-16 px-5 py-16 sm:px-8 sm:py-20 lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="mb-12 lg:mb-0">
        <div className="lg:sticky lg:top-24">
          <TocNav
            label={t("onThisPage")}
            entries={sections.map(({ id, heading }) => ({ id, heading }))}
          />
        </div>
      </aside>

      <div className="min-w-0">
        {sections.map((section, i) => (
          <Reveal key={section.id} y={14}>
            <section
              id={section.id}
              className="scroll-mt-24 border-t border-line py-9 first:border-t-0 first:pt-0"
            >
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-[12px] text-ink-faint">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h2 className="text-[21px] font-semibold tracking-[-0.02em]">
                  {section.heading}
                </h2>
              </div>

              <div className="mt-4 space-y-4 text-[15.5px] leading-[1.75] text-ink-soft">
                {section.paragraphs?.map((paragraph, j) => (
                  <p key={j} className="max-w-2xl">
                    {paragraph}
                  </p>
                ))}

                {section.bullets && (
                  <ul className="max-w-2xl space-y-2.5">
                    {section.bullets.map((bullet, j) => (
                      <li key={j} className="flex gap-3">
                        <span
                          aria-hidden="true"
                          className="mt-[0.65em] block size-1 shrink-0 rounded-full bg-ink-faint"
                        />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {section.after && <p className="max-w-2xl">{section.after}</p>}
              </div>
            </section>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
