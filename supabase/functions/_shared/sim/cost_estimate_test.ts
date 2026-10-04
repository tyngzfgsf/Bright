// Cost per turn, estimated from the REAL prompts: the old single-call drill turn (chat) versus the new
// classify + narrate turn (sim). Tokens ~ bytes / 4 (English prose; Korean is denser per char but the same on both sides).
// Prices are the conservative placeholder default; the ratio is what matters, and must stay within 2x.
import { assert } from "@std/assert";
import { applyTurn, initState } from "./engine.ts";
import { buildClassifierSystemPrompt, buildClassifierUserMessage } from "./classify.ts";
import { buildNarrationPrompt } from "./narrate.ts";
import { buildRows } from "./seedgen.ts";
import { buildChatSystemPrompt } from "../prompt.ts";
import { loadAuthored } from "../testkit.ts";

const tokens = (s: string) => Math.ceil(new TextEncoder().encode(s).length / 4);
const PRICE = { input: 0.15, output: 0.6 }; // USD per 1M tokens (app_config 'default' placeholder)
const usd = (inTok: number, outTok: number) => (inTok * PRICE.input + outTok * PRICE.output) / 1e6;

const row = buildRows(loadAuthored("anaphylaxis-sim"))[0];
const cfg = row.sim;
const history = (n: number) => Array.from({ length: n }, (_, i) =>
  i % 2 === 0 ? "I check his airway and ask him to say his name, then call for help." : "My throat is so tight... I can barely get words out, please help me.");

// ---- old turn: one call, drill template + 6-item rubric + up to 10 history messages, JSON turn out
const oldSystem = buildChatSystemPrompt({ ...row, id: "x", sim: null, max_turns: 15, rubric: row.rubric.slice(0, 6) }, {
  language: "en", difficulty: "intermediate", traineeRole: "doctor", triageSystem: "ESI", aiRole: "patient",
});
const oldIn = tokens(oldSystem) + history(10).reduce((n, m) => n + tokens(m), 0);
const OLD_OUT = 120;

// ---- new turn
const result = applyTurn(cfg, initState(cfg), ["check_airway", "call_for_help"]);
const classIn = tokens(buildClassifierSystemPrompt(cfg)) + tokens(buildClassifierUserMessage(history(2)[1], history(1)[0]));
const CLASS_OUT = 20;
const narrIn = tokens(buildNarrationPrompt(cfg, "en", result.state, result.events)) + history(6).reduce((n, m) => n + tokens(m), 0);
const NARR_OUT = 80;

Deno.test("estimated cost per turn: new classify+narrate turn stays within 2x the current single-call turn", () => {
  const oldCost = usd(oldIn, OLD_OUT);
  const newCost = usd(classIn, CLASS_OUT) + usd(narrIn, NARR_OUT);
  // Reasoning models spend hidden output tokens on every call; stress both sides equally, per call.
  const REASON = 150;
  const oldStress = usd(oldIn, OLD_OUT + REASON);
  const newStress = usd(classIn, CLASS_OUT + REASON) + usd(narrIn, NARR_OUT + REASON);
  console.log(
    `  tokens  old: ${oldIn} in / ${OLD_OUT} out | new: classify ${classIn}/${CLASS_OUT} + narrate ${narrIn}/${NARR_OUT}\n` +
      `  USD/turn old $${oldCost.toFixed(6)} -> new $${newCost.toFixed(6)} (${(newCost / oldCost).toFixed(2)}x); ` +
      `with ${REASON} hidden reasoning tokens per call: ${(newStress / oldStress).toFixed(2)}x`,
  );
  assert(newCost / oldCost <= 2, `ratio ${newCost / oldCost}`);
  assert(newStress / oldStress <= 2, `stress ratio ${newStress / oldStress}`);
});

Deno.test("the classifier call stays small (it is the added cost): under 1000 input tokens", () => {
  assert(classIn < 1000, `classifier input ${classIn} tokens`);
});

Deno.test("at the placeholder price the daily budget still covers hundreds of turns", () => {
  const perTurn = usd(classIn, CLASS_OUT) + usd(narrIn, NARR_OUT);
  assert(0.30 / perTurn > 300, `${Math.floor(0.30 / perTurn)} turns per $0.30`);
});
