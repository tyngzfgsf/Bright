/** CORS for the website only. The mobile app sends no Origin header and needs none. */
export function corsHeaders(req: Request, allowed: string[]): { headers: Headers; originOk: boolean } {
  const headers = new Headers({ "vary": "Origin" });
  const origin = req.headers.get("origin");
  if (!origin) return { headers, originOk: true };
  if (!allowed.includes(origin)) return { headers, originOk: false };
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-headers", "authorization, content-type, apikey, x-client-info");
  headers.set("access-control-allow-methods", "POST, OPTIONS");
  headers.set("access-control-max-age", "600");
  return { headers, originOk: true };
}
