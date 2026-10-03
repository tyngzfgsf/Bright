/**
 * Transactional billing emails, queued as documents in the `mail` collection for the official
 * "Trigger Email from Firestore" Firebase extension to send (it handles SMTP, retries and
 * delivery state). Until that extension is installed, documents just accumulate unsent — nothing
 * here fails. See MONETIZATION.md.
 *
 * Bilingual because Bright is: the app reports its UI language on every status call
 * (users/{uid}.locale), and anything that isn't "ko" gets English.
 */

import { getAuth } from "firebase-admin/auth";
import { db } from "./entitlements.js";

const TEMPLATES = {
  trial_ending: {
    en: ({ date, amount }) => ({
      subject: "Your Bright Plus trial ends on " + date,
      text:
        `Your free trial of Bright Plus ends on ${date}.\n\n` +
        `If you do nothing, your plan continues at ${amount} and you keep unlimited drills.\n` +
        `Don't want that? Cancel any time before ${date} in Bright → Settings → Plan & billing, and you won't be charged.\n`,
    }),
    ko: ({ date, amount }) => ({
      subject: `Bright Plus 무료 체험이 ${date}에 끝납니다`,
      text:
        `Bright Plus 무료 체험이 ${date}에 종료됩니다.\n\n` +
        `별도 조치가 없으면 ${amount}으로 구독이 이어지고, 무제한 연습을 계속 이용할 수 있습니다.\n` +
        `원하지 않으시면 ${date} 전에 Bright → 설정 → 요금제 및 결제에서 언제든 해지하세요. 요금이 청구되지 않습니다.\n`,
    }),
  },
  payment_failed: {
    en: ({ nextAttempt }) => ({
      subject: "We couldn't renew your Bright plan",
      text:
        "Your latest Bright payment didn't go through, so your card may have expired or been declined.\n\n" +
        (nextAttempt ? `We'll try again automatically on ${nextAttempt}. ` : "") +
        "You still have full access in the meantime. To fix it now, open Bright → Settings → Plan & billing → Update payment.\n",
    }),
    ko: ({ nextAttempt }) => ({
      subject: "Bright 요금제 갱신에 실패했습니다",
      text:
        "최근 Bright 결제가 처리되지 않았습니다. 카드가 만료되었거나 거절되었을 수 있습니다.\n\n" +
        (nextAttempt ? `${nextAttempt}에 자동으로 다시 시도합니다. ` : "") +
        "그동안에도 모든 기능을 그대로 이용하실 수 있습니다. 지금 바로 해결하려면 Bright → 설정 → 요금제 및 결제 → 결제 수단 업데이트를 눌러 주세요.\n",
    }),
  },
};

function formatDate(epochSeconds, locale) {
  if (!epochSeconds) return null;
  return new Date(epochSeconds * 1000).toLocaleDateString(locale === "ko" ? "ko-KR" : "en-ZA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * @param {string} uid
 * @param {"trial_ending"|"payment_failed"} template
 * @param {object} vars  epoch-second dates are formatted here, per locale
 * @param {string} dedupeKey  one email per key, so webhook retries don't send duplicates
 */
export async function queueEmail(uid, template, vars, dedupeKey) {
  const userSnap = await db().doc(`users/${uid}`).get();
  const locale = userSnap.get("locale") === "ko" ? "ko" : "en";

  let email = userSnap.get("email");
  if (!email) {
    email = (await getAuth().getUser(uid).catch(() => null))?.email;
  }
  if (!email) {
    console.warn(`No email for uid=${uid}; skipping ${template}`);
    return;
  }

  const rendered = TEMPLATES[template][locale]({
    ...vars,
    date: formatDate(vars.date, locale),
    nextAttempt: formatDate(vars.nextAttempt, locale),
  });

  // create() fails if the id exists — that's the dedupe.
  await db()
    .doc(`mail/${template}_${dedupeKey}`)
    .create({ to: email, message: rendered, uid, template, createdAt: Date.now() })
    .catch((err) => {
      if (err.code !== 6 /* ALREADY_EXISTS */) throw err;
    });
}
