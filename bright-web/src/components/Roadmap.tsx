import { getTranslations } from "next-intl/server";
import Reveal from "./Reveal";
import Section from "./Section";

type State = "available" | "building" | "planned" | "paused";
type Item = { state: State; name: string; body: string };

const dot: Record<State, string> = {
  available: "bg-ink",
  building: "bg-ink-soft",
  planned: "border border-line-strong",
  paused: "border border-dashed border-line-strong",
};

export default async function Roadmap() {
  const t = await getTranslations("status");
  const items = t.raw("items") as Item[];

  return (
    <Section id="status" eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")}>
      <ul className="border-t border-line">
        {items.map((item, i) => (
          <li key={item.name} className="border-b border-line">
            <Reveal delay={Math.min(i * 0.06, 0.24)}>
              <div className="grid gap-2 py-6 sm:grid-cols-[10rem_1fr] sm:gap-8 sm:py-7">
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className={`block size-2 shrink-0 rounded-full ${dot[item.state]}`}
                  />
                  <span className="eyebrow-sm text-ink-faint">
                    {t(`states.${item.state}`)}
                  </span>
                </div>
                <div>
                  <h3 className="text-[17px] font-semibold tracking-[-0.02em]">
                    {item.name}
                  </h3>
                  <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
                    {item.body}
                  </p>
                </div>
              </div>
            </Reveal>
          </li>
        ))}
      </ul>
    </Section>
  );
}
