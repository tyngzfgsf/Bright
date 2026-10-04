import { makeStartSessionHandler } from "../_shared/start_session.ts";
import { productionDeps } from "../_shared/store.ts";

const handler = makeStartSessionHandler(productionDeps());

Deno.serve(async (req) => {
  try {
    return await handler(req);
  } catch {
    // Never surface internals to the client.
    return new Response(JSON.stringify({ error: "upstream_error" }), {
      status: 502,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
});
