import { getTranslations } from "next-intl/server";
import Reveal from "./Reveal";
import Section from "./Section";

type State = "available" | "building" | "planned" | "paused";
type Item = { state: State; name: string; body: string };

const marker: Record<State, string> = {
  available: "bg-ink",
  building: "bg-ink-muted",
  planned: "border border-line-strong",
  paused: "border border-dashed border-line-strong",
};

const chip: Record<State, string> = {
  available: "text-ink",
  building: "text-ink-soft",
  planned: "text-ink-faint",
  paused: "text-ink-faint",
};

export default async function Roadmap() {
  const t = await getTranslations("status");
  const items = t.raw("items") as Item[];

  return (
    <Section id="status" eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")}>
      <ul className="border-t border-line">
        {items.map((item, i) => (
          <li key={item.name} className="group border-b border-line">
            <Reveal delay={Math.min(i * 0.06, 0.24)}>
              <div className="grid gap-2 py-7 transition-colors duration-300 sm:grid-cols-[11rem_1fr] sm:gap-10 sm:py-8">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex size-2 items-center justify-center">
                    <span
                      aria-hidden="true"
                      className={`block size-2 shrink-0 rounded-full transition-transform duration-300 group-hover:scale-125 ${marker[item.state]}`}
                    />
                  </span>
                  <span className={`eyebrow-sm ${chip[item.state]}`}>
                    {t(`states.${item.state}`)}
                  </span>
                </div>
                <div>
                  <h3 className="text-[17.5px] font-semibold tracking-[-0.022em]">
                    {item.name}
                  </h3>
                  <p className="mt-2.5 max-w-2xl text-[15px] leading-[1.7] text-ink-soft">
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
