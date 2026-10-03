"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import PageHeader from "@/components/PageHeader";
import Reveal from "@/components/Reveal";
import { useAuth } from "@/lib/app/auth";
import { hasPaidAccess, useAccount } from "@/lib/billing/account";
import { onPaddleEvent, openCheckout, paddleConfigured, previewPrices } from "@/lib/billing/paddle";
import {
  ANNUAL_MONTHS_FREE,
  FREE_DRILLS_PER_MONTH,
  PLANS,
  PLUS_TRIAL_DAYS,
  RECOMMENDED,
  STREAK_FREEZE_PACK_SIZE,
  type AddOn,
  type Period,
  type PlanId,
  fallbackAddOnPrice,
  fallbackPrice,
  priceKey,
  zeroPrice,
} from "@/lib/billing/plans";
import { useSiteNav } from "@/lib/site-nav";

/** Upsells at subscription checkout. Drill packs aren't offered: pointless on an unlimited plan. */
const CHECKOUT_ADD_ONS: AddOn[] = ["addon_streak_freezes"];

/**
 * The website's pricing page: the same three plans as the apps, one highlighted, outcomes
 * first, prices localised by Paddle, and Paddle's overlay checkout on top of this page.
 */
export default function PricingPage() {
  const t = useTranslations("pricing");
  const { locale, go } = useSiteNav();
  const { user, signInWithGoogle } = useAuth();
  const account = useAccount(locale);
  const [period, setPeriod] = useState<Period>("annual");
  const [selected, setSelected] = useState<PlanId>(RECOMMENDED);
  const [addOns, setAddOns] = useState<AddOn[]>([]);
  const [paddlePrices, setPaddlePrices] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void previewPrices().then(setPaddlePrices);
  }, []);

  // Paddle confirms to the page first; the plan appears once its webhook reaches bright-proxy.
  useEffect(
    () =>
      onPaddleEvent((e) => {
        if (e.name !== "checkout.completed") return;
        setNotice(t("processing"));
        void account.awaitChange((ent) => hasPaidAccess(ent)).then((done) => {
          if (done) setNotice(t("success"));
        });
      }),
    [account.awaitChange, t],
  );

  const ent = account.entitlement;
  const paid = hasPaidAccess(ent);
  const trial = selected === "plus" && (ent?.trialEligible ?? true) && !paid;

  function priceFor(plan: PlanId, p: Period) {
    if (plan === "free") return { perMonth: zeroPrice(), total: zeroPrice() };
    const key = priceKey(plan, p);
    const fallback = fallbackPrice(plan, p);
    const fromPaddle = paddlePrices[key];
    // Paddle previews the period total; the per-month figure for annual stays our own estimate.
    return fromPaddle ? { total: fromPaddle, perMonth: p === "monthly" ? fromPaddle : fallback.perMonth } : fallback;
  }

  async function subscribe() {
    if (selected === "free") return go("app");
    if (!user) return signInWithGoogle();
    if (paid) return go("account");
    const opened = await openCheckout({
      keys: [priceKey(selected, period), ...addOns],
      uid: user.uid,
      email: user.email,
      locale,
    });
    if (!opened) setNotice(t("notConfigured"));
  }

  const ctaLabel =
    selected === "free"
      ? t("ctaFree")
      : !user
        ? t("ctaSignIn")
        : paid
          ? t("ctaManage")
          : trial
            ? t("ctaTrial", { days: PLUS_TRIAL_DAYS })
            : t("ctaSubscribe", { plan: t(`plans.${selected}.name`) });

  const storeName = ent?.source === "play_store" ? "Google Play" : ent?.source === "app_store" ? "App Store" : null;

  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />

      <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
        {/* Billing period: annual first, leading with its per-month price. */}
        <div role="tablist" className="mx-auto flex w-full max-w-sm rounded-2xl bg-sunken p-1">
          {(["monthly", "annual"] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={period === p}
              onClick={() => setPeriod(p)}
              className={[
                "flex flex-1 flex-col items-center rounded-xl py-2.5 text-[14px] transition-colors duration-200",
                period === p ? "bg-paper font-medium text-ink shadow-soft" : "text-ink-muted",
              ].join(" ")}
            >
              {t(p)}
              {p === "annual" && (
                <span className="text-[11.5px] text-ink-faint">{t("annualBadge", { months: ANNUAL_MONTHS_FREE })}</span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {PLANS.map((plan, i) => {
            const recommended = plan === RECOMMENDED;
            const isSelected = selected === plan;
            const isCurrent = (ent?.plan.toLowerCase() ?? "free") === plan && (plan === "free" ? !paid : paid);
            const price = priceFor(plan, period);
            const bullets = t.raw(`plans.${plan}.bullets`) as string[];
            return (
              <Reveal key={plan} delay={i * 0.06}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setSelected(plan)}
                  className={[
                    "flex h-full w-full flex-col rounded-[1.6rem] border p-7 text-left transition-shadow duration-300",
                    recommended ? "bg-ink text-paper" : "bg-raised text-ink",
                    isSelected ? "border-ink shadow-raise ring-2 ring-ink" : "border-line shadow-soft",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="display text-[1.6rem]">{t(`plans.${plan}.name`)}</h2>
                    {recommended ? (
                      <span className="rounded-full bg-paper px-3 py-1 text-[12px] font-semibold text-ink">
                        {t("recommended")}
                      </span>
                    ) : (
                      isCurrent && <span className="text-[12.5px] opacity-70">{t("current")}</span>
                    )}
                  </div>
                  <p className="mt-1 text-[14.5px] opacity-75">{t(`plans.${plan}.outcome`)}</p>

                  <p className="tnum mt-6 text-[1.9rem] font-semibold leading-none">
                    {t("perMonth", { price: price.perMonth })}
                  </p>
                  {plan !== "free" && period === "annual" && (
                    <p className="mt-1.5 text-[13px] opacity-70">{t("billedAnnually", { price: price.total })}</p>
                  )}

                  <ul className="mt-6 space-y-2.5 text-[14.5px]">
                    {bullets.map((b) => (
                      <li key={b} className="flex gap-2.5">
                        <span aria-hidden="true">✓</span>
                        <span>{b.replace("{drills}", String(FREE_DRILLS_PER_MONTH))}</span>
                      </li>
                    ))}
                  </ul>
                </button>
              </Reveal>
            );
          })}
        </div>

        {/* Popcorn add-ons: small, unticked, optional. */}
        {selected !== "free" && !paid && (
          <div className="mx-auto mt-10 max-w-xl">
            <p className="eyebrow-sm text-ink-faint">{t("addOnsTitle")}</p>
            <div className="mt-3 space-y-2">
              {CHECKOUT_ADD_ONS.map((a) => (
                <label key={a} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-line bg-raised px-4 py-3">
                  <input
                    type="checkbox"
                    checked={addOns.includes(a)}
                    onChange={() => setAddOns((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]))}
                    className="size-4 accent-[var(--color-ink,#111)]"
                  />
                  <span className="flex-1">
                    <span className="block text-[15px] font-medium">
                      {t(`addOns.${a}.title`, { n: STREAK_FREEZE_PACK_SIZE })}
                    </span>
                    <span className="block text-[13px] text-ink-soft">{t(`addOns.${a}.body`)}</span>
                  </span>
                  <span className="tnum text-[15px]">+{paddlePrices[a] ?? fallbackAddOnPrice(a)}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="mx-auto mt-10 flex max-w-xl flex-col items-center gap-3 text-center">
          {storeName && paid ? (
            <p className="text-[14.5px] text-ink-soft">{t("storeManaged", { store: storeName })}</p>
          ) : (
            <button
              type="button"
              onClick={subscribe}
              className="w-full rounded-full bg-ink px-6 py-3.5 text-[15.5px] font-medium text-paper shadow-soft transition-shadow duration-300 hover:shadow-raise"
            >
              {ctaLabel}
            </button>
          )}
          {trial && (
            <p className="text-[12.5px] text-ink-faint">
              {t("trialNote", {
                days: PLUS_TRIAL_DAYS,
                price:
                  period === "monthly"
                    ? t("perMonth", { price: priceFor("plus", period).total })
                    : t("billedAnnually", { price: priceFor("plus", period).total }),
              })}
            </p>
          )}
          {!paddleConfigured && <p className="text-[12.5px] text-ink-faint">{t("notConfigured")}</p>}
          {notice && (
            <p role="status" className="text-[14px] font-medium">
              {notice}
            </p>
          )}
          <p className="mt-2 text-[12.5px] text-ink-faint">{t("footer")}</p>
        </div>
      </div>
    </>
  );
}
