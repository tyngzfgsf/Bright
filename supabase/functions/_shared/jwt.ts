// deno-lint-ignore-file no-import-prefix
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "npm:jose@5";

/**
 * Verifies a Supabase user access token against the project's JWKS (SUPABASE_JWKS, injected into
 * Edge Functions) and returns the user id (`sub`), or null. Nothing here calls the network.
 *  - asymmetric algorithms only (a shared-secret HS256 token can never be accepted, which also
 *    rules out algorithm-confusion attacks);
 *  - issuer must be this project's Auth endpoint, audience must be "authenticated";
 *  - anonymous users are rejected.
 */
export function makeJwtVerifier(jwksJson: string | undefined, supabaseUrl: string | undefined) {
  let jwks: ReturnType<typeof createLocalJWKSet> | null = null;
  try {
    if (jwksJson) jwks = createLocalJWKSet(JSON.parse(jwksJson) as JSONWebKeySet);
  } catch {
    jwks = null; // malformed config: fail closed (every request is unauthenticated)
  }
  const issuer = supabaseUrl ? `${supabaseUrl.replace(/\/+$/, "")}/auth/v1` : undefined;

  return async (token: string): Promise<string | null> => {
    if (!jwks || !issuer) return null;
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer,
        audience: "authenticated",
        algorithms: ["ES256", "RS256", "EdDSA"],
      });
      if (payload.role !== "authenticated" || payload.is_anonymous === true) return null;
      return typeof payload.sub === "string" && payload.sub.length > 0 ? payload.sub : null;
    } catch {
      return null;
    }
  };
}

/** Picks the server-side secret key from SUPABASE_SECRET_KEYS (a JSON dictionary: {"default": "sb_secret_..."}). */
export function pickSecretKey(raw: string | undefined, name = "default"): string | null {
  try {
    const dict = JSON.parse(raw ?? "") as Record<string, unknown>;
    const v = dict[name] ?? Object.values(dict)[0];
    return typeof v === "string" && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}
