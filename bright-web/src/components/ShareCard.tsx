import { useTranslations } from "next-intl";

/**
 * The result card the app produces at the end of a session, as an illustration.
 *
 * It is always black with white text, in both site themes, because the real one
 * is: the app renders it outside `MaterialTheme.colorScheme` so a shared image
 * looks the same wherever it lands. Wording comes from the app's own strings
 * (app_slogan, home_streak_days, chat_share_result).
 */
export default function ShareCard({ score = "8.4" }: { score?: string }) {
  const t = useTranslations("demo.result");

  return (
    // The hairline ring isn't in the app's card; it's here because a black card
    // on the site's dark scrim would otherwise have no edge at all.
    <div className="w-[14.5rem] rounded-[1.25rem] bg-[#000000] px-6 py-7 text-center text-white shadow-float ring-1 ring-white/12">
      <p className="text-[15px] font-bold tracking-[-0.02em]">Bright</p>

      <p className="mt-6 text-[11px] text-white/70">{t("scenario")}</p>

      <p className="mt-1.5 flex items-end justify-center gap-1">
        <span className="tnum text-[2.6rem] font-bold leading-none tracking-[-0.04em]">
          {score}
        </span>
        <span className="mb-1 text-[13px] text-white/70">{t("outOf")}</span>
      </p>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-[12px] font-semibold">
        <span aria-hidden="true">🔥</span>
        {t("streak")}
      </p>

      <p className="mt-6 text-[10px] text-white/50">{t("slogan")}</p>
    </div>
  );
}
