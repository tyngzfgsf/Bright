// deno-lint-ignore-file no-import-prefix
import { assertEquals } from "@std/assert";
import { exportJWK, generateKeyPair, type KeyLike, SignJWT } from "npm:jose@5";
import { makeJwtVerifier, pickSecretKey } from "./jwt.ts";

const URL_ = "https://abc.supabase.co";
const ISS = `${URL_}/auth/v1`;
const SUB = "11111111-1111-4111-8111-111111111111";

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "ES256", use: "sig" };
  const other = await generateKeyPair("ES256");
  const verify = makeJwtVerifier(JSON.stringify({ keys: [jwk] }), URL_);
  const sign = (claims: Record<string, unknown>, o: { key?: KeyLike; exp?: string | number; iss?: string; aud?: string } = {}) =>
    new SignJWT({ role: "authenticated", ...claims })
      .setProtectedHeader({ alg: "ES256", kid: "k1" })
      .setSubject(claims.sub === undefined ? SUB : String(claims.sub))
      .setIssuer(o.iss ?? ISS)
      .setAudience(o.aud ?? "authenticated")
      .setIssuedAt()
      .setExpirationTime(o.exp ?? "1h")
      .sign(o.key ?? privateKey);
  return { verify, sign, otherKey: other.privateKey };
}

Deno.test("valid user token -> user id from sub", async () => {
  const { verify, sign } = await setup();
  assertEquals(await verify(await sign({})), SUB);
});

Deno.test("expired token -> null", async () => {
  const { verify, sign } = await setup();
  assertEquals(await verify(await sign({}, { exp: Math.floor(Date.now() / 1000) - 60 })), null);
});

Deno.test("signed by a different key -> null", async () => {
  const { verify, sign, otherKey } = await setup();
  assertEquals(await verify(await sign({}, { key: otherKey })), null);
});

Deno.test("wrong issuer or audience -> null", async () => {
  const { verify, sign } = await setup();
  assertEquals(await verify(await sign({}, { iss: "https://evil.supabase.co/auth/v1" })), null);
  assertEquals(await verify(await sign({}, { aud: "anon" })), null);
});

Deno.test("anon / service roles and anonymous users are rejected", async () => {
  const { verify, sign } = await setup();
  assertEquals(await verify(await sign({ role: "anon" })), null);
  assertEquals(await verify(await sign({ role: "service_role" })), null);
  assertEquals(await verify(await sign({ is_anonymous: true })), null);
});

Deno.test("HS256 token and alg=none are rejected (no algorithm confusion)", async () => {
  const { verify } = await setup();
  const hs = await new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256" }).setSubject(SUB).setIssuer(ISS).setAudience("authenticated")
    .setExpirationTime("1h").sign(new TextEncoder().encode("a-shared-secret-that-is-long-enough-123456"));
  assertEquals(await verify(hs), null);
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const none = `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: SUB, role: "authenticated", iss: ISS, aud: "authenticated", exp: 9999999999 })}.`;
  assertEquals(await verify(none), null);
});

Deno.test("secret/publishable-style API keys and garbage are not JWTs -> null", async () => {
  const { verify } = await setup();
  for (const t of ["sb_secret_abcdef", "sb_publishable_abcdef", "", "a.b.c", "not-a-token"]) assertEquals(await verify(t), null);
});

Deno.test("missing or malformed JWKS / URL fails closed", async () => {
  const { sign } = await setup();
  const token = await sign({});
  assertEquals(await makeJwtVerifier(undefined, URL_)(token), null);
  assertEquals(await makeJwtVerifier("{not json", URL_)(token), null);
  assertEquals(await makeJwtVerifier('{"keys":[]}', URL_)(token), null);
  assertEquals(await makeJwtVerifier('{"keys":[]}', undefined)(token), null);
});

Deno.test("pickSecretKey reads the SUPABASE_SECRET_KEYS dictionary", () => {
  assertEquals(pickSecretKey('{"default":"sb_secret_x"}'), "sb_secret_x");
  assertEquals(pickSecretKey('{"other":"sb_secret_y"}'), "sb_secret_y");
  assertEquals(pickSecretKey('{"default":"sb_secret_x","b":"sb_secret_z"}', "b"), "sb_secret_z");
  assertEquals(pickSecretKey(undefined), null);
  assertEquals(pickSecretKey("not json"), null);
  assertEquals(pickSecretKey("{}"), null);
});

Deno.test("no legacy key variables anywhere in the functions source", async () => {
  const banned = [/SUPABASE_ANON_KEY/, /SUPABASE_SERVICE_ROLE_KEY/, /auth\.getUser\(/];
  for (const dirName of ["./", "../chat/", "../grade/"]) {
    const dir = new URL(dirName, import.meta.url);
    for await (const e of Deno.readDir(dir)) {
      if (!e.isFile || !e.name.endsWith(".ts") || e.name.endsWith("_test.ts")) continue;
      const text = await Deno.readTextFile(new URL(e.name, dir));
      for (const re of banned) assertEquals(re.test(text), false, `${e.name} matches ${re}`);
    }
  }
});
