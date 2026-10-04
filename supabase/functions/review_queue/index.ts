import { makeReviewQueueHandler } from "../_shared/questions/handlers.ts";
import { productionDeps } from "../_shared/store.ts";

const handler = makeReviewQueueHandler(productionDeps());

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
