// Small generic error codes. The client maps these to localized text; no upstream detail leaks.
export type ErrorCode =
  | "unauthenticated"
  | "age_required"
  | "daily_limit"
  | "budget_reached"
  | "rate_limited"
  | "invalid_input"
  | "payload_too_large"
  | "forbidden_origin"
  | "not_found"
  | "session_ended"
  | "session_busy"
  | "not_gradeable"
  | "not_graded"
  | "answer_conflict"
  | "upstream_error";

export const STATUS: Record<ErrorCode, number> = {
  unauthenticated: 401,
  age_required: 403,
  forbidden_origin: 403,
  invalid_input: 400,
  payload_too_large: 413,
  daily_limit: 429,
  rate_limited: 429,
  budget_reached: 503,
  not_found: 404,
  session_ended: 409,
  session_busy: 409,
  not_gradeable: 409,
  not_graded: 409,
  answer_conflict: 409,
  upstream_error: 502,
};

export function errorResponse(
  code: ErrorCode,
  headers: Headers,
  extra: Record<string, unknown> = {},
): Response {
  const h = new Headers(headers);
  h.set("content-type", "application/json");
  h.set("cache-control", "no-store");
  return new Response(JSON.stringify({ error: code, ...extra }), { status: STATUS[code], headers: h });
}
