"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import Dialog from "@/components/app/Dialog";
import LinkButton from "@/components/LinkButton";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/lib/app/auth";
import { hasPaidAccess, useAccount } from "@/lib/billing/account";
import { onPaddleEvent, openCheckout, openPaymentUpdate, paddleConfigured, previewPrices } from "@/lib/billing/paddle";
import {
  DRILL_PACK_SIZE,
  RETENTION_MONTHS,
  RETENTION_PERCENT,
  STREAK_FREEZE_PACK_SIZE,
  type AddOn,
  fallbackAddOnPrice,
} from "@/lib/billing/plans";
import { useSiteNav } from "@/lib/site-nav";

type CancelStep = "none" | "offer" | "confirm";

/**
 * "Your plan": status and dates, usage, the failed-payment banner, add-ons, and cancelling —
 * through the exit offer first. Website (Paddle) plans are managed right here; store plans can
 * only be cancelled in Google Play / the App Store, so those link out instead.
 */
export default function AccountPage() {
  const t = useTranslations("account");
  const format = useFormatter();
  const { locale } = useSiteNav();
  const { user, signInWithGoogle } = useAuth();
  const { entitlement: e, webAction, awaitChange } = useAccount(locale);
  const [step, setStep] = useState<CancelStep>("none");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});

  useEffect(() => {
    void previewPrices().then(setPrices);
  }, []);

  useEffect(
    () =>
      onPaddleEvent((ev) => {
        if (ev.name === "checkout.completed") {
          void awaitChange(() => true).then(() => setNotice(t("purchaseDone")));
        }
      }),
    [awaitChange, t],
  );

  if (!user) {
    return (
      <>
        <PageHeader eyebrow={t("eyebrow")} title={t("title")} lede={t("signedOut")} />
        <div className="mx-auto w-full max-w-xl px-5 py-12 text-center sm:px-8">
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            className="rounded-full bg-ink px-6 py-3.5 text-[15.5px] font-medium text-paper shadow-soft"
          >
            {t("signIn")}
          </button>
        </div>
      </>
    );
  }

  const paid = hasPaidAccess(e);
  const planName = t(`plans.${(e?.plan ?? "FREE").toLowerCase()}`);
  const date = (ms: number) => format.dateTime(new Date(ms), { year: "numeric", month: "long", day: "numeric" });
  const store = e?.source === "play_store" ? "Google Play" : e?.source === "app_store" ? "App Store" : null;
  const storeUrl =
    e?.managementUrl ??
    (e?.source === "play_store"
      ? "https://play.google.com/store/account/subscriptions"
      : e?.source === "app_store"
        ? "https://apps.apple.com/account/subscriptions"
        : null);

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  const cancel = (acceptOffer: boolean) =>
    run(async () => {
      setStep("none");
      const { ok } = await webAction("cancel", { acceptRetentionOffer: acceptOffer });
      if (!ok) return setNotice(t("error"));
      if (acceptOffer) setNotice(t("offerApplied", { percent: RETENTION_PERCENT, months: RETENTION_MONTHS }));
    });

  const updatePayment = () =>
    run(async () => {
      const { ok, data } = await webAction("update-payment");
      const id = (data as { transactionId?: string } | null)?.transactionId;
      if (!ok || !id || !(await openPaymentUpdate(id))) setNotice(t("error"));
    });

  const buy = (addOn: AddOn) =>
    run(async () => {
      const opened = await openCheckout({ keys: [addOn], uid: user.uid, email: user.email, locale, extra: { addOn } });
      if (!opened) setNotice(t("error"));
    });

  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />

      <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:px-8">
        <section className="rounded-[1.6rem] border border-line bg-raised p-7 shadow-soft">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="display text-[1.8rem]">Bright {planName}</h2>
            {e?.discountActive && <span className="text-[13px] text-ink-faint">{t("discount")}</span>}
          </div>
          {e && paid && (
            <p className="mt-1 text-[14.5px] text-ink-soft">
              {e.status === "TRIALING" && e.trialEndsAtMillis
                ? t("trialUntil", { date: date(e.trialEndsAtMillis) })
                : e.cancelAtPeriodEnd && e.currentPeriodEndMillis
                  ? t("ends", { date: date(e.currentPeriodEndMillis) })
                  : e.currentPeriodEndMillis
                    ? t("renews", { date: date(e.currentPeriodEndMillis) })
                    : null}
            </p>
          )}

          {/* Dunning: what happened, that it's being retried, and the one-tap fix. */}
          {e?.status === "PAST_DUE" && (
            <div className="mt-5 rounded-2xl bg-paper p-5">
              <p className="text-[14.5px]">{t("pastDue")}</p>
              {store && storeUrl ? (
                <a href={storeUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block rounded-full bg-ink px-5 py-2.5 text-[14px] font-medium text-paper">
                  {t("openStore", { store })}
                </a>
              ) : (
                <button type="button" onClick={updatePayment} disabled={busy} className="mt-3 rounded-full bg-ink px-5 py-2.5 text-[14px] font-medium text-paper">
                  {t("updatePayment")}
                </button>
              )}
            </div>
          )}

          <div className="mt-5 space-y-1 text-[14.5px] text-ink-soft">
            {e?.drillsLimit != null && <p>{t("drillsUsed", { used: e.drillsUsed, limit: e.drillsLimit })}</p>}
            {!!e?.bonusDrills && <p>{t("bonus", { n: e.bonusDrills })}</p>}
            {!!e?.streakFreezesGranted && <p>{t("freezes", { n: e.streakFreezesGranted })}</p>}
            {store && paid && <p>{t("storeNote", { store })}</p>}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <LinkButton to="pricing" variant={paid ? "outline" : "solid"}>
              {paid ? t("changePlan") : t("seePlans")}
            </LinkButton>
            {paid && store && storeUrl && (
              <a href={storeUrl} target="_blank" rel="noopener noreferrer" className="rounded-full border border-line-strong px-5 py-3 text-[14.5px] text-ink">
                {t("openStore", { store })}
              </a>
            )}
          </div>

          {paddleConfigured && (
            <div className="mt-6 flex flex-col items-start gap-1 border-t border-line-subtle pt-5">
              {!paid && (
                <button type="button" onClick={() => buy("addon_drill_pack")} disabled={busy} className="text-[14.5px] underline-offset-4 hover:underline">
                  {t("buyDrills", { n: DRILL_PACK_SIZE, price: prices.addon_drill_pack ?? fallbackAddOnPrice("addon_drill_pack") })}
                </button>
              )}
              <button type="button" onClick={() => buy("addon_streak_freezes")} disabled={busy} className="text-[14.5px] underline-offset-4 hover:underline">
                {t("buyFreezes", { n: STREAK_FREEZE_PACK_SIZE, price: prices.addon_streak_freezes ?? fallbackAddOnPrice("addon_streak_freezes") })}
              </button>
            </div>
          )}

          {paid && e?.source === "web" && (
            <div className="mt-6 border-t border-line-subtle pt-5">
              {e.cancelAtPeriodEnd ? (
                <button type="button" onClick={() => run(async () => void (await webAction("resume")))} disabled={busy} className="text-[14.5px] font-medium">
                  {t("resume")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setStep(e.retentionOfferEligible ? "offer" : "confirm")}
                  disabled={busy}
                  className="text-[14.5px] text-ink-faint hover:text-ink"
                >
                  {t("cancel")}
                </button>
              )}
            </div>
          )}

          {notice && (
            <p role="status" className="mt-4 text-[14px]">
              {notice}
            </p>
          )}
        </section>
      </div>

      <Dialog open={step === "offer"} onClose={() => setStep("none")} title={t("exitTitle")} closeLabel={t("close")}>
        <div className="p-7">
          <h3 className="display text-[1.4rem]">{t("exitTitle")}</h3>
          <p className="mt-3 text-[15px] text-ink-soft">{t("exitBody", { percent: RETENTION_PERCENT, months: RETENTION_MONTHS })}</p>
          <div className="mt-6 flex flex-col gap-2">
            <button type="button" onClick={() => cancel(true)} className="rounded-full bg-ink px-5 py-3 text-[15px] font-medium text-paper">
              {t("exitAccept", { percent: RETENTION_PERCENT })}
            </button>
            <button type="button" onClick={() => setStep("confirm")} className="rounded-full px-5 py-3 text-[14.5px] text-ink-faint">
              {t("exitDecline")}
            </button>
          </div>
        </div>
      </Dialog>

      <Dialog open={step === "confirm"} onClose={() => setStep("none")} title={t("confirmTitle")} closeLabel={t("close")}>
        <div className="p-7">
          <h3 className="display text-[1.4rem]">{t("confirmTitle")}</h3>
          <p className="mt-3 text-[15px] text-ink-soft">
            {t("confirmBody", { plan: planName, date: e?.currentPeriodEndMillis ? date(e.currentPeriodEndMillis) : "—", limit: 10 })}
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <button type="button" onClick={() => setStep("none")} className="rounded-full bg-ink px-5 py-3 text-[15px] font-medium text-paper">
              {t("confirmNo")}
            </button>
            <button type="button" onClick={() => cancel(false)} className="rounded-full px-5 py-3 text-[14.5px] text-ink-faint">
              {t("confirmYes")}
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
