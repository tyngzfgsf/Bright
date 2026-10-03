// Regenerates supabase/seed_sim.sql from supabase/scenarios/*.json.
//   deno run --allow-read --allow-write scripts/gen-sim-seed.ts
import { type AuthoredScenario, buildSql } from "../supabase/functions/_shared/sim/seedgen.ts";

const dir = new URL("../supabase/scenarios/", import.meta.url);
const files = [...Deno.readDirSync(dir)].filter((f) => f.name.endsWith(".json")).map((f) => f.name).sort();
const scenarios: AuthoredScenario[] = files.map((n) => JSON.parse(Deno.readTextFileSync(new URL(n, dir))));
Deno.writeTextFileSync(new URL("../supabase/seed_sim.sql", import.meta.url), buildSql(scenarios));
console.log(`seed_sim.sql written from ${files.length} scenario files`);
