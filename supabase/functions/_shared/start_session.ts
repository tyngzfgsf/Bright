// POST /functions/v1/start_session   { scenario_id, language }
// Creates a bounded session and returns its id. No LLM call and no message quota. The turn cap comes from the
// scenario (sim scenarios: their engine config), never from the client.
import { DEFAULT_MAX_TURNS, MAX_BODY_BYTES } from "./config.ts";
import { errorResponse } from "./errors.ts";
import { finish, guard, jsonOk } from "./pipeline.ts";
import { initState } from "./sim/engine.ts";
import { parseSimConfig } from "./sim/simconfig.ts";
import type { Deps } from "./types.ts";
import { parseStartBody, ValidationError } from "./validate.ts";

export function makeStartSessionHandler(deps: Deps) {
  return async (req: Request): Promise<Response> => {
    const g = await guard(req, deps, "start_session", MAX_BODY_BYTES.small);
    if ("res" in g) return g.res;
    const { uid, cors, t0 } = g.ctx;
    const fail = (code: "invalid_input") => finish(deps, "start_session", t0, errorResponse(code, cors), uid, code);

    let body;
    try {
      body = parseStartBody(g.ctx.body);
    } catch (e) {
      if (!(e instanceof ValidationError)) throw e;
      return fail("invalid_input");
    }
    const scenario = await deps.store.getScenario(body.scenarioId);
    if (!scenario || scenario.language !== body.language) return fail("invalid_input");

    // A simulation scenario keeps its engine state on the session; a chat scenario stores none.
    let state: unknown = {};
    let maxTurns = Number.isInteger(scenario.max_turns) ? scenario.max_turns : DEFAULT_MAX_TURNS;
    if (scenario.sim != null) {
      const cfg = parseSimConfig(scenario.sim);
      if (!cfg) return fail("invalid_input");
      state = initState(cfg);
      maxTurns = cfg.max_turns;
    }
    const sessionId = await deps.store.createSession(uid, scenario.id, state, scenario.language, maxTurns, new Date(deps.now()));
    return finish(deps, "start_session", t0, jsonOk(cors, {
      session_id: sessionId,
      scenario_id: scenario.id,
      language: scenario.language,
      mode: scenario.sim != null ? "sim" : "chat",
      max_turns: maxTurns,
      turn_count: 0,
      status: "active",
    }), uid);
  };
}
