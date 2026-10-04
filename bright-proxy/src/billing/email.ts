/**
 * Billing emails, sent through Resend's HTTP API (works from Workers, free tier). Bilingual
 * because Bright is: the account's locale comes from the last client that called
 * GET /v1/account. Unconfigured (no RESEND_API_KEY) means emails are skipped, not errors.
 */

export type EmailKind = "trial_ending" | "payment_failed";

type Vars = { date?: number; manageHint: string };

function formatDate(epochMs: number | undefined, locale: "en" | "ko"): string {
  if (!epochMs) return "";
  return new Date(epochMs).toLocaleDateString(locale === "ko" ? "ko-KR" : "en-ZA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function render(kind: EmailKind, locale: "en" | "ko", vars: Vars): { subject: string; text: string } {
  const date = formatDate(vars.date, locale);
  if (kind === "trial_ending") {
    return locale === "ko"
      ? {
          subject: `Bright Plus 무료 체험이 ${date}에 끝납니다`,
          text:
            `Bright Plus 무료 체험이 ${date}에 종료됩니다.\n\n` +
            `별도 조치가 없으면 구독이 이어지고, 무제한 연습을 계속 이용할 수 있습니다.\n` +
            `원하지 않으시면 ${date} 전에 해지하세요. 요금이 청구되지 않습니다.\n${vars.manageHint}\n`,
        }
      : {
          subject: `Your Bright Plus trial ends on ${date}`,
          text:
            `Your free trial of Bright Plus ends on ${date}.\n\n` +
            `If you do nothing, your plan continues and you keep unlimited drills.\n` +
            `Don't want that? Cancel before ${date} and you won't be charged.\n${vars.manageHint}\n`,
        };
  }
  return locale === "ko"
    ? {
        subject: "Bright 요금제 갱신에 실패했습니다",
        text:
          "최근 Bright 결제가 처리되지 않았습니다. 카드가 만료되었거나 거절되었을 수 있습니다.\n\n" +
          "자동으로 다시 시도하며, 그동안에도 모든 기능을 그대로 이용하실 수 있습니다.\n" +
          `${vars.manageHint}\n`,
      }
    : {
        subject: "We couldn't renew your Bright plan",
        text:
          "Your latest Bright payment didn't go through — your card may have expired or been declined.\n\n" +
          "We'll retry automatically, and you keep full access in the meantime.\n" +
          `${vars.manageHint}\n`,
      };
}

/** Where to cancel or fix payment depends on where the plan was bought. */
export function manageHint(source: string | null, locale: "en" | "ko"): string {
  const ko = locale === "ko";
  switch (source) {
    case "play_store":
      return ko ? "Google Play → 결제 및 정기 결제에서 관리할 수 있습니다." : "Manage it in Google Play → Payments & subscriptions.";
    case "app_store":
      return ko ? "iPhone 설정 → Apple ID → 구독에서 관리할 수 있습니다." : "Manage it in iPhone Settings → Apple ID → Subscriptions.";
    default:
      return ko ? "Bright 웹사이트나 앱의 설정 → 요금제 및 결제에서 관리할 수 있습니다." : "Manage it in Bright → Settings → Plan & billing, in the app or on the website.";
  }
}

export async function sendEmail(
  apiKey: string | undefined,
  from: string | undefined,
  to: string,
  message: { subject: string; text: string },
): Promise<void> {
  if (!apiKey || !from) {
    console.log("Email not configured; skipping:", message.subject);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject: message.subject, text: message.text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}`);
}
