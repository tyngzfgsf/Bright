// Pure logic for scripts/generate-questions.ts: input validation, prompts, output schema checks, the deterministic
// source guard, the validator verdict, duplicate detection, option shuffling and SQL output. No I/O, no env, no
// network: the CLI injects the LLM call, so everything here is unit-tested offline (lib_test.ts).

export type Lang = "en" | "ko";
export const LANGS: readonly Lang[] = ["en", "ko"];
export const SKILL_TAGS = [
  "airway", "breathing", "circulation", "assessment", "medication", "communication", "escalation", "safety",
] as const;

export interface RubricItem { id: string; text: string; tags: string[] }
export interface LangBlock { title: string; reference_notes: string; rubric: RubricItem[] }
export interface ScenarioInput { slug: string; en?: LangBlock; ko?: LangBlock }

export interface Job { slug: string; lang: Lang; item: RubricItem; notes: string; title: string }

export interface Draft {
  stem: string;
  options: string[]; // exactly 4, as written by the model
  correct_index: number; // 0..3
  explanation: string;
  difficulty: number; // 1..3
}

export interface FinalQuestion {
  id: string;
  slug: string;
  language: Lang;
  rubric_item_id: string;
  skill_tag: string;
  stem: string;
  options: { id: string; text: string }[];
  correct_option_ids: string[];
  explanation: string;
  difficulty: number;
}

export interface Rejection { slug: string; language: Lang; rubric_item_id: string; reason: string; attempt: number }

export class InputError extends Error {}

const RUBRIC_ID = /^[A-Z0-9][A-Z0-9-]{0,39}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

// ------------------------------------------------------------------ input
/** Validates scenarios.json. Every scenario/language that will be generated must have reference_notes filled in. */
export function parseScenarioFile(raw: unknown, only?: { slug?: string; lang?: Lang }): Job[] {
  const root = raw as { scenarios?: unknown };
  if (typeof raw !== "object" || raw === null || !Array.isArray(root.scenarios)) throw new InputError("expected { scenarios: [...] }");
  const jobs: Job[] = [];
  const missingNotes: string[] = [];
  const seen = new Set<string>();
  for (const s of root.scenarios as ScenarioInput[]) {
    if (typeof s?.slug !== "string" || !SLUG.test(s.slug)) throw new InputError(`bad slug: ${JSON.stringify(s?.slug)}`);
    if (seen.has(s.slug)) throw new InputError(`duplicate slug ${s.slug}`);
    seen.add(s.slug);
    if (only?.slug && s.slug !== only.slug) continue;
    for (const lang of LANGS) {
      if (only?.lang && lang !== only.lang) continue;
      const b = s[lang];
      if (b === undefined) continue;
      if (typeof b !== "object" || b === null || !Array.isArray(b.rubric) || b.rubric.length === 0) {
        throw new InputError(`${s.slug}/${lang}: rubric must be a non-empty array`);
      }
      if (typeof b.title !== "string" || b.title.trim() === "") throw new InputError(`${s.slug}/${lang}: title missing`);
      if (typeof b.reference_notes !== "string" || b.reference_notes.trim().length < 40) {
        missingNotes.push(`${s.slug}/${lang}`);
        continue;
      }
      for (const item of b.rubric) {
        if (typeof item?.id !== "string" || !RUBRIC_ID.test(item.id)) throw new InputError(`${s.slug}/${lang}: bad rubric id ${JSON.stringify(item?.id)}`);
        if (typeof item.text !== "string" || item.text.trim() === "") throw new InputError(`${s.slug}/${lang}/${item.id}: text missing`);
        const tags = Array.isArray(item.tags) ? item.tags : [];
        if (tags.length === 0 || !tags.every((t) => (SKILL_TAGS as readonly string[]).includes(t))) {
          throw new InputError(`${s.slug}/${lang}/${item.id}: tags must be from ${SKILL_TAGS.join(", ")}`);
        }
        jobs.push({ slug: s.slug, lang, item: { id: item.id, text: item.text.trim(), tags }, notes: b.reference_notes.trim(), title: b.title.trim() });
      }
    }
  }
  if (missingNotes.length > 0) {
    throw new InputError(`fill in reference_notes (at least a few sentences from your source) for: ${missingNotes.join(", ")}`);
  }
  return jobs;
}

// ------------------------------------------------------------------ prompts
export interface Message { role: "system" | "user"; content: string }

const NATIVE: Record<Lang, string> = {
  en: "Write in clear, natural English as used in emergency-medicine teaching.",
  ko: "한국 응급의학 교육(국가고시·KTAS 학습)에서 쓰는 자연스러운 한국어로 직접 작성하세요. 영어 문장을 번역한 듯한 표현은 쓰지 마세요.",
};

function sourceBlock(j: Job): string {
  return `SOURCE A — rubric item ${j.item.id} (scenario: ${j.title}):\n${j.item.text}\n\nSOURCE B — reference notes:\n${j.notes}`;
}

/** Generator call. The model may use ONLY the two sources; it returns strict JSON. */
export function generatorMessages(j: Job): Message[] {
  const system = `You write ONE multiple-choice practice question for medical emergency training.
Rules (all mandatory):
- Use ONLY facts stated in SOURCE A and SOURCE B. Do not add any fact, drug name, dose, number, threshold, time or
  guideline that does not appear in them. If the sources do not support a question, still follow the sources: ask
  about what they DO state.
- Exactly 4 options. Exactly ONE option is the best answer according to the sources; the other three must be clearly
  wrong or clearly inferior according to the sources (plausible to a novice, but not defensible).
- The question tests the action or knowledge in rubric item ${j.item.id}.
- The explanation says why the key is correct and cites the rubric item id "${j.item.id}" literally.
- Options are short (under 200 characters), not "all/none of the above", and do not overlap.
- ${NATIVE[j.lang]}
Return ONLY a JSON object:
{"stem": string, "options": [string, string, string, string], "correct_index": 0|1|2|3, "explanation": string, "difficulty": 1|2|3}`;
  return [{ role: "system", content: system }, { role: "user", content: sourceBlock(j) }];
}

/** Second, independent call: is the key consistent with the sources, and is exactly one option correct? */
export function validatorMessages(j: Job, d: Draft): Message[] {
  const system = `You check a multiple-choice practice question against its sources. Be strict. Use ONLY the sources.
Answer with ONLY a JSON object:
{"key_consistent": boolean, "exactly_one_correct": boolean, "unsupported_facts": [string], "pass": boolean, "reason": string}
- key_consistent: the marked key is correct according to the sources.
- exactly_one_correct: no other option is also correct or defensible according to the sources.
- unsupported_facts: any fact, drug, dose, number or claim in the stem, options or explanation that is NOT in the sources.
- pass: true only if key_consistent and exactly_one_correct are true and unsupported_facts is empty.`;
  const letters = ["A", "B", "C", "D"];
  const q = `${sourceBlock(j)}\n\nQUESTION:\n${d.stem}\n${d.options.map((o, i) => `${letters[i]}. ${o}`).join("\n")}\n` +
    `MARKED KEY: ${letters[d.correct_index]}\nEXPLANATION: ${d.explanation}`;
  return [{ role: "system", content: system }, { role: "user", content: q }];
}

// ------------------------------------------------------------------ checks
export type Check<T> = { ok: true; value: T } | { ok: false; reason: string };

// deno-lint-ignore no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const cleanText = (v: unknown, min: number, max: number) =>
  typeof v === "string" && v.trim().length >= min && v.trim().length <= max && !CONTROL.test(v);

/** JSON-schema check of the generator output (exact keys, types, lengths). */
export function parseDraft(content: string | null): Check<Draft> {
  let raw: unknown;
  try { raw = JSON.parse(content ?? ""); } catch { return { ok: false, reason: "schema: not JSON" }; }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, reason: "schema: not an object" };
  const o = raw as Record<string, unknown>;
  const keys = ["stem", "options", "correct_index", "explanation", "difficulty"];
  const extra = Object.keys(o).filter((k) => !keys.includes(k));
  if (extra.length) return { ok: false, reason: `schema: unexpected keys ${extra.join(",")}` };
  if (!cleanText(o.stem, 10, 1000)) return { ok: false, reason: "schema: stem" };
  if (!Array.isArray(o.options) || o.options.length !== 4) return { ok: false, reason: "schema: need exactly 4 options" };
  if (!o.options.every((x) => cleanText(x, 1, 300))) return { ok: false, reason: "schema: option text" };
  const norm = o.options.map((x) => normalize(x as string));
  if (new Set(norm).size !== 4) return { ok: false, reason: "schema: duplicate options" };
  if (!Number.isInteger(o.correct_index) || (o.correct_index as number) < 0 || (o.correct_index as number) > 3) {
    return { ok: false, reason: "schema: correct_index" };
  }
  if (!cleanText(o.explanation, 10, 1500)) return { ok: false, reason: "schema: explanation" };
  if (!Number.isInteger(o.difficulty) || (o.difficulty as number) < 1 || (o.difficulty as number) > 3) return { ok: false, reason: "schema: difficulty" };
  if (o.options.some((x) => /\b(all|none) of the above\b|위의 모든|모두 정답|정답 없음/i.test(x as string))) {
    return { ok: false, reason: "schema: all/none of the above" };
  }
  return {
    ok: true,
    value: {
      stem: (o.stem as string).trim(),
      options: (o.options as string[]).map((x) => x.trim()),
      correct_index: o.correct_index as number,
      explanation: (o.explanation as string).trim(),
      difficulty: o.difficulty as number,
    },
  };
}

/** Numbers as written ("0.3", "5-15" -> "5", "15"; "100-120" -> ...), comma decimals normalized. */
export function numbersIn(text: string): string[] {
  return [...text.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => m[0].replace(",", "."));
}

/**
 * Deterministic guard, independent of the validator model: every number in the question must appear in the sources
 * (no invented doses, rates, thresholds or times), there are no links, and the explanation cites the rubric id.
 */
export function sourceGuard(j: Job, d: Draft): Check<Draft> {
  const sources = `${j.item.text}\n${j.notes}`;
  const allowed = new Set(numbersIn(sources));
  const text = [d.stem, ...d.options, d.explanation.replaceAll(j.item.id, "")].join("\n");
  const invented = numbersIn(text).filter((n) => !allowed.has(n));
  if (invented.length) return { ok: false, reason: `source guard: numbers not in sources: ${[...new Set(invented)].join(", ")}` };
  if (/https?:\/\/|www\./i.test(text)) return { ok: false, reason: "source guard: link" };
  if (!d.explanation.includes(j.item.id)) return { ok: false, reason: `source guard: explanation does not cite ${j.item.id}` };
  return { ok: true, value: d };
}

/** The validator must explicitly pass on every criterion; anything malformed is a rejection. */
export function parseVerdict(content: string | null): Check<true> {
  let v: Record<string, unknown>;
  try { v = JSON.parse(content ?? ""); } catch { return { ok: false, reason: "validator: not JSON" }; }
  if (typeof v !== "object" || v === null) return { ok: false, reason: "validator: not an object" };
  const why = typeof v.reason === "string" ? v.reason.slice(0, 200) : "";
  if (v.key_consistent !== true) return { ok: false, reason: `validator: key not consistent with source. ${why}`.trim() };
  if (v.exactly_one_correct !== true) return { ok: false, reason: `validator: not exactly one correct option. ${why}`.trim() };
  if (!Array.isArray(v.unsupported_facts) || v.unsupported_facts.length > 0) {
    return { ok: false, reason: `validator: unsupported facts: ${String(JSON.stringify(v.unsupported_facts ?? null)).slice(0, 200)}` };
  }
  if (v.pass !== true) return { ok: false, reason: `validator: did not pass. ${why}`.trim() };
  return { ok: true, value: true };
}

// ------------------------------------------------------------------ duplicates
/** Lowercase, drop punctuation and whitespace (language-neutral: works for Korean without a tokenizer). */
export function normalize(s: string): string {
  return s.toLowerCase().normalize("NFKC").replace(/[\p{P}\p{S}\s]+/gu, "");
}
function trigrams(s: string): Set<string> {
  const n = normalize(s);
  const out = new Set<string>();
  for (let i = 0; i + 3 <= n.length; i++) out.add(n.slice(i, i + 3));
  if (n.length > 0 && n.length < 3) out.add(n);
  return out;
}
export function similarity(a: string, b: string): number {
  const x = trigrams(a), y = trigrams(b);
  if (x.size === 0 && y.size === 0) return 1;
  let inter = 0;
  for (const t of x) if (y.has(t)) inter++;
  return inter / (x.size + y.size - inter);
}
export const DUPLICATE_THRESHOLD = 0.75;
export function findDuplicate(stem: string, existing: string[]): string | null {
  for (const e of existing) if (similarity(stem, e) >= DUPLICATE_THRESHOLD) return e;
  return null;
}

// ------------------------------------------------------------------ assembly
/** Shuffles options (so the key's position carries no signal), assigns stable ids a-d. */
export function finalize(j: Job, d: Draft, id: string, rng: () => number): FinalQuestion {
  const order = [0, 1, 2, 3];
  for (let i = order.length - 1; i > 0; i--) {
    const k = Math.floor(rng() * (i + 1));
    [order[i], order[k]] = [order[k], order[i]];
  }
  const ids = ["a", "b", "c", "d"];
  const options = order.map((src, pos) => ({ id: ids[pos], text: d.options[src] }));
  return {
    id, slug: j.slug, language: j.lang, rubric_item_id: j.item.id, skill_tag: j.item.tags[0],
    stem: d.stem, options, correct_option_ids: [ids[order.indexOf(d.correct_index)]], explanation: d.explanation,
    difficulty: d.difficulty,
  };
}

export type Llm = (messages: Message[]) => Promise<string | null>;

export interface RunResult { accepted: FinalQuestion[]; rejected: Rejection[] }

/**
 * One question per job. Each job gets up to `attempts` tries; every rejection (schema, source guard, validator,
 * duplicate, or a failed call) is recorded with its reason.
 */
export async function run(
  jobs: Job[],
  o: { generate: Llm; validate: Llm; newId: () => string; rng: () => number; existingStems?: string[]; attempts?: number; onProgress?: (done: number, total: number) => void },
): Promise<RunResult> {
  const accepted: FinalQuestion[] = [];
  const rejected: Rejection[] = [];
  const stems = [...(o.existingStems ?? [])];
  const attempts = o.attempts ?? 2;
  let done = 0;
  for (const j of jobs) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const reject = (reason: string) => rejected.push({ slug: j.slug, language: j.lang, rubric_item_id: j.item.id, reason, attempt });
      let content: string | null;
      try { content = await o.generate(generatorMessages(j)); } catch (e) { reject(`generator call failed: ${(e as Error).message}`); continue; }
      const draft = parseDraft(content);
      if (!draft.ok) { reject(draft.reason); continue; }
      const guarded = sourceGuard(j, draft.value);
      if (!guarded.ok) { reject(guarded.reason); continue; }
      const dup = findDuplicate(draft.value.stem, stems);
      if (dup !== null) { reject(`duplicate of: ${dup.slice(0, 80)}`); continue; }
      let verdict: Check<true>;
      try { verdict = parseVerdict(await o.validate(validatorMessages(j, draft.value))); } catch (e) { reject(`validator call failed: ${(e as Error).message}`); continue; }
      if (!verdict.ok) { reject(verdict.reason); continue; }
      accepted.push(finalize(j, draft.value, o.newId(), o.rng));
      stems.push(draft.value.stem);
      break;
    }
    o.onProgress?.(++done, jobs.length);
  }
  return { accepted, rejected };
}

// ------------------------------------------------------------------ SQL output
export const sqlString = (s: string) => `'${s.replaceAll("'", "''")}'`;
const sqlJson = (v: unknown) => `${sqlString(JSON.stringify(v))}::jsonb`;

/** questions_draft.sql: inserts as 'draft' (never approved), idempotent by id, plus an approval template. */
export function toSql(qs: FinalQuestion[], generatedAt: string): string {
  const lines = [
    `-- Generated by scripts/generate-questions.ts at ${generatedAt}. ${qs.length} draft question(s).`,
    "-- Review EVERY question against your sources before approving. Nothing here is served until approved.",
    "-- Run in the Supabase SQL Editor. Re-running is safe (on conflict do nothing).",
    "begin;",
  ];
  for (const q of qs) {
    lines.push(
      `-- ${q.slug} / ${q.language} / ${q.rubric_item_id} / ${q.skill_tag} / difficulty ${q.difficulty} / key ${q.correct_option_ids.join(",")}`,
      "insert into public.questions (id, scenario_id, rubric_item_id, skill_tag, language, type, stem, options, correct_option_ids, explanation, difficulty, status, source)",
      `select ${sqlString(q.id)}::uuid, s.id, ${sqlString(q.rubric_item_id)}, ${sqlString(q.skill_tag)}, ${sqlString(q.language)}, 'mcq',`,
      `       ${sqlString(q.stem)},`,
      `       ${sqlJson(q.options)},`,
      `       ${sqlJson(q.correct_option_ids)},`,
      `       ${sqlString(q.explanation)},`,
      `       ${q.difficulty}, 'draft', 'ai'`,
      `  from public.scenarios s where s.slug = ${sqlString(q.slug)} and s.language = ${sqlString(q.language)}`,
      "on conflict (id) do nothing;",
      "",
    );
  }
  lines.push("commit;", "");
  lines.push(
    "-- After review, approve only the ids you checked (and fix or delete the rest):",
    "-- update public.questions set status = 'approved', reviewed_at = now() where status = 'draft' and id in (",
    ...qs.map((q, i) => `--   ${sqlString(q.id)}${i < qs.length - 1 ? "," : ""}  -- ${q.slug}/${q.language}/${q.rubric_item_id}`),
    "-- );",
    "-- Retire a bad approved question later with: update public.questions set status = 'retired' where id = '...';",
    "",
  );
  return lines.join("\n");
}
