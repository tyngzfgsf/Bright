// Recursive source guards over EVERYTHING under supabase/functions (the Phase 1 scans are not recursive, so they
// do not see sim/). These pin the security rules for the new code at the source level.
import { assertEquals, assertFalse } from "@std/assert";

async function sources(dir: URL, out: { path: string; text: string }[] = []) {
  for await (const e of Deno.readDir(dir)) {
    if (e.name === "node_modules") continue;
    if (e.isDirectory) await sources(new URL(`${e.name}/`, dir), out);
    else if (e.name.endsWith(".ts") && !e.name.endsWith("_test.ts") && e.name !== "testkit.ts") {
      out.push({ path: new URL(e.name, dir).pathname.split("/supabase/functions/")[1], text: await Deno.readTextFile(new URL(e.name, dir)) });
    }
  }
  return out;
}
const all = await sources(new URL("../../", import.meta.url));

Deno.test("guard sanity: the scan really covers the sim code", () => {
  const names = all.map((s) => s.path);
  for (const n of ["_shared/sim/handler.ts", "_shared/sim/engine.ts", "sim/index.ts", "chat/index.ts"]) assertEquals(names.includes(n), true, n);
});

Deno.test("no legacy Supabase keys and no per-request getUser() anywhere (rule 2/3)", () => {
  for (const s of all) for (const re of [/SUPABASE_ANON_KEY/, /SUPABASE_SERVICE_ROLE_KEY/, /auth\.getUser\(/, /\banon_key\b/i, /service_role_key/i]) {
    assertFalse(re.test(s.text), `${s.path} matches ${re}`);
  }
});

Deno.test("the engine and its helpers are pure: no env, network, clock, randomness or logging", () => {
  const pure = ["engine.ts", "simconfig.ts", "safety.ts", "classify.ts", "narrate.ts", "rubric.ts", "types.ts", "seedgen.ts"];
  for (const s of all.filter((x) => x.path.startsWith("_shared/sim/") && pure.some((p) => x.path.endsWith(p)))) {
    for (const re of [/Deno\./, /\bfetch\(/, /Date\.now|new Date\(/, /Math\.random/, /console\./, /performance\.now/]) {
      assertFalse(re.test(s.text), `${s.path} matches ${re}`);
    }
  }
});

Deno.test("sim code never reads environment secrets and never calls console (logging goes through deps.log metadata only)", () => {
  for (const s of all.filter((x) => x.path.startsWith("_shared/sim/") || x.path === "sim/index.ts")) {
    assertFalse(/Deno\.env/.test(s.text), `${s.path} reads env`);
    assertFalse(/LLM_API_KEY|SECRET_KEYS|JWKS/.test(s.text), `${s.path} mentions a secret name`);
    assertFalse(/console\./.test(s.text), `${s.path} uses console`);
  }
});

Deno.test("logging is structurally metadata-only: the sim handler only logs through finish(), and LogEntry has no free-text field", () => {
  const h = all.find((x) => x.path === "_shared/sim/handler.ts")!.text;
  assertFalse(/deps\.log\(|\.log\(/.test(h), "the handler must not call the logger directly");
  const types = all.find((x) => x.path === "_shared/types.ts")!.text;
  const block = /export interface LogEntry \{([\s\S]*?)\n\}/.exec(types)![1];
  const fields = [...block.matchAll(/^\s*([a-z_]+)\??:\s*([^;]+);/gm)].map((m) => [m[1], m[2].trim()]);
  const allowed: Record<string, string> = {
    fn: '"chat" | "grade" | "sim" | "start_session" | "get_questions" | "answer_question" | "review_queue" | "report_question"',
    uid: "string", status: "number", code: "string", latency_ms: "number",
    input_tokens: "number", output_tokens: "number", cost_usd: "number", calls: "number", turn: "number",
    rejected_actions: "number", narration_filtered: "string", served: "number", correct: "boolean",
  };
  assertEquals(Object.fromEntries(fields), allowed); // adding any other field (e.g. `message: string`) fails this test on purpose
});

Deno.test("no hardcoded provider reference (provider-neutral)", () => {
  for (const s of all) assertFalse(/groq/i.test(s.text), `${s.path} mentions groq`);
});
