import "server-only";

/** Error from a third-party API. The message never contains tokens or full URLs with credentials. */
export class IntegrationError extends Error {
  constructor(
    readonly provider: string,
    message: string,
    readonly status: number | null = null,
    readonly body: unknown = null,
  ) {
    super(`${provider}: ${message}`);
  }
}

const SECRET_PARAMS = /([?&](access_token|appsecret_proof|client_secret|refresh_token|key)=)[^&]+/gi;
export function redactUrl(url: string) {
  return url.replace(SECRET_PARAMS, "$1[redacted]");
}

/**
 * fetch with a timeout and JSON parsing. Throws IntegrationError on network errors and non-2xx responses.
 * `describe` turns an error body into a readable message for the owner (e.g. Meta's error.message).
 */
export async function httpJson<T = unknown>(
  provider: string,
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
  describe?: (body: unknown, status: number) => string | null,
): Promise<T> {
  const { timeoutMs = 20_000, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  } catch (e) {
    const reason = e instanceof Error && e.name === "TimeoutError" ? "timed out" : "could not be reached";
    throw new IntegrationError(provider, `${redactUrl(url.split("?")[0]!)} ${reason}`);
  }
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const msg = describe?.(body, res.status) ?? (typeof body === "string" ? body.slice(0, 200) : `HTTP ${res.status}`);
    throw new IntegrationError(provider, msg, res.status, body);
  }
  return body as T;
}

/** Base URL for a provider; tests and local mocks override it with an env var. */
export function baseUrl(envVar: string, fallback: string) {
  return (process.env[envVar] || fallback).replace(/\/$/, "");
}
