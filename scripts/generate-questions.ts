// Generates DRAFT practice questions on your machine, for you to review. Never run in production, never in CI.
//
//   scripts/generate-questions [--dry-run] [--scenario <slug>] [--lang en|ko] [--yes]
//
// The wrapper script runs this with narrow Deno permissions: read/write only scripts/questions, network only to the
// LLM host, and only the LLM_* environment variables. It therefore cannot read database credentials or reach the
// database. It also refuses to start if it was given broader permissions than that.
//
// Input:  scripts/questions/scenarios.json  (rubric items + your reference_notes per scenario and language)
// Output: scripts/questions/questions_draft.sql     (status 'draft'; review, then run in the Supabase SQL Editor)
//         scripts/questions/questions_rejected.json (every rejected attempt and why)
// Optional: scripts/questions/approved_stems.json   (["stem", ...] already in your bank, for duplicate detection)
import { type InputError, type Llm, type Message, parseScenarioFile, run, toSql } from "./questions/lib.ts";

const DIR = new URL("./questions/", import.meta.url);
const ENV_VARS = ["LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL", "LLM_VALIDATOR_MODEL"];

function arg(name: string): string | undefined {
  const i = Deno.args.indexOf(name);
  return i >= 0 ? Deno.args[i + 1] : undefined;
}
const flag = (name: string) => Deno.args.includes(name);
function die(msg: string): never {
  console.error(`generate-questions: ${msg}`);
  Deno.exit(1);
}

// Refuse broad permissions: unrestricted env would expose any database URL or secret key in the shell.
if (Deno.permissions.querySync({ name: "env" }).state === "granted") {
  die("refusing to run with unrestricted environment access. Use scripts/generate-questions (it passes --allow-env=LLM_* only).");
}
if (Deno.permissions.querySync({ name: "net" }).state === "granted") {
  die("refusing to run with unrestricted network access. Use scripts/generate-questions (it allows only the LLM host).");
}

const dryRun = flag("--dry-run");
const lang = arg("--lang");
if (lang !== undefined && lang !== "en" && lang !== "ko") die("--lang must be en or ko");

let jobs;
try {
  const raw = JSON.parse(await Deno.readTextFile(new URL("scenarios.json", DIR)));
  jobs = parseScenarioFile(raw, { slug: arg("--scenario"), lang: lang as "en" | "ko" | undefined });
} catch (e) {
  die((e as InputError).message ?? String(e));
}
if (jobs.length === 0) die("nothing to generate (check --scenario / --lang)");

const perScenario = new Map<string, number>();
for (const j of jobs) perScenario.set(`${j.slug}/${j.lang}`, (perScenario.get(`${j.slug}/${j.lang}`) ?? 0) + 1);
console.log(`Expected drafts: ${jobs.length} (one per rubric item per language; rejected attempts are retried once).`);
for (const [k, n] of perScenario) console.log(`  ${k}: ${n}`);
console.log("Each accepted draft needs your review before approval. Plan your review time accordingly.");
if (dryRun) Deno.exit(0);

const env = Object.fromEntries(ENV_VARS.map((k) => [k, Deno.env.get(k)]));
if (!env.LLM_API_KEY) die("LLM_API_KEY is not set in your shell (export it; never commit it).");
const baseUrl = (env.LLM_BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "");
if (!baseUrl.startsWith("https://")) die("LLM_BASE_URL must be https");
const model = env.LLM_MODEL ?? "openai/gpt-oss-120b";
const validatorModel = env.LLM_VALIDATOR_MODEL ?? model;

if (!flag("--yes")) {
  const answer = prompt(`Generate ${jobs.length} drafts with ${model} (validator: ${validatorModel})? [y/N]`);
  if (answer?.trim().toLowerCase() !== "y") die("cancelled");
}

function llm(modelId: string, temperature: number): Llm {
  return async (messages: Message[]) => {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify({ model: modelId, messages, temperature, max_tokens: 1500, response_format: { type: "json_object" } }),
    });
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`HTTP ${res.status}`); // status only: never echo provider bodies
    }
    const payload = await res.json();
    const content = payload?.choices?.[0]?.message?.content;
    return typeof content === "string" ? content : null;
  };
}

let existingStems: string[] = [];
try {
  const raw = JSON.parse(await Deno.readTextFile(new URL("approved_stems.json", DIR)));
  if (Array.isArray(raw)) existingStems = raw.filter((x) => typeof x === "string");
} catch { /* optional */ }

const result = await run(jobs, {
  generate: llm(model, 0.7),
  validate: llm(validatorModel, 0),
  newId: () => crypto.randomUUID(),
  rng: Math.random,
  existingStems,
  onProgress: (d, t) => console.log(`  ${d}/${t}`),
});

await Deno.writeTextFile(new URL("questions_draft.sql", DIR), toSql(result.accepted, new Date().toISOString()));
await Deno.writeTextFile(new URL("questions_rejected.json", DIR), JSON.stringify(result.rejected, null, 2) + "\n");
console.log(`Accepted ${result.accepted.length} draft(s) -> scripts/questions/questions_draft.sql`);
console.log(`Rejected ${result.rejected.length} attempt(s) -> scripts/questions/questions_rejected.json`);
const missing = jobs.length - result.accepted.length;
if (missing > 0) console.log(`${missing} rubric item(s) got no question; see the rejections, adjust reference_notes, re-run with --scenario.`);
