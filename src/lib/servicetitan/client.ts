/**
 * ServiceTitan API client. Server only: it reads credentials from the environment
 * and must never be imported into client components.
 *
 * Env (in .env, not committed):
 *   service_titan_client_id, service_titan_secret, service_titan_app_key, service_titan_tenant_id (optional)
 */

const TOKEN_URL = "https://auth.servicetitan.io/connect/token";
const API_BASE = "https://api.servicetitan.io";

interface Token {
  value: string;
  expiresAt: number;
  tenant: string;
}

// Kept on globalThis so the token survives hot reloads in development
const g = globalThis as typeof globalThis & { __stToken?: Token; __stTokenPending?: Promise<Token> };

function env(name: string): string {
  const v = process.env[name] ?? process.env[name.toUpperCase()];
  if (!v) throw new ServiceTitanError(`Missing ${name} in .env`, 500);
  return v;
}

export class ServiceTitanError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function fetchToken(): Promise<Token> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env("service_titan_client_id"),
      client_secret: env("service_titan_secret"),
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new ServiceTitanError(`ServiceTitan sign-in failed (HTTP ${res.status})`, 502);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  let tenant = process.env.service_titan_tenant_id ?? process.env.SERVICE_TITAN_TENANT_ID ?? "";
  if (!tenant) {
    // The tenant id is also a claim inside the access token
    const claims = JSON.parse(Buffer.from(body.access_token.split(".")[1], "base64url").toString()) as { tenant?: string | number };
    tenant = String(claims.tenant ?? "");
  }
  if (!tenant) throw new ServiceTitanError("ServiceTitan tenant id not found", 500);
  // Refresh a minute early
  return { value: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000, tenant };
}

async function token(): Promise<Token> {
  if (g.__stToken && g.__stToken.expiresAt > Date.now()) return g.__stToken;
  if (!g.__stTokenPending) {
    g.__stTokenPending = fetchToken().finally(() => {
      g.__stTokenPending = undefined;
    });
  }
  g.__stToken = await g.__stTokenPending;
  return g.__stToken;
}

/** GET a tenant-scoped ServiceTitan path, e.g. "telecom/v3/tenant/{tenant}/calls". */
export async function stGet<T>(path: string, params: Record<string, string | number>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const t = await token();
    const url = new URL(`${API_BASE}/${path.replace("{tenant}", t.tenant)}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${t.value}`, "ST-App-Key": env("service_titan_app_key") },
      cache: "no-store",
    });
    if (res.status === 401) {
      g.__stToken = undefined; // token expired early, sign in again
      continue;
    }
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new ServiceTitanError(`ServiceTitan request failed (HTTP ${res.status})`, 502);
    return (await res.json()) as T;
  }
  throw new ServiceTitanError("ServiceTitan is not responding right now", 503);
}

/** Every page of a paged ServiceTitan list. */
export async function stGetAll<T>(path: string, params: Record<string, string | number>): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 200; page++) {
    const body = await stGet<{ data: T[]; hasMore: boolean }>(path, { ...params, page, pageSize: 500 });
    out.push(...body.data);
    if (!body.hasMore) break;
  }
  return out;
}
