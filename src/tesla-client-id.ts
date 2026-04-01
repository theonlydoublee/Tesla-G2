import { apiUrl, getApiBase } from './api-base';

/** Optional: skip /api/tesla/config when set at build time (public OAuth client id). */
export function getTeslaClientIdFromEnv(): string | null {
  const id = import.meta.env.VITE_TESLA_CLIENT_ID;
  if (typeof id !== 'string' || !id.trim()) return null;
  return id.trim();
}

export type ResolveTeslaClientIdResult =
  | { ok: true; clientId: string }
  | { ok: false; message: string };

/**
 * Client id from VITE_TESLA_CLIENT_ID, else GET /api/tesla/config on the configured API base.
 */
export async function resolveTeslaClientId(): Promise<ResolveTeslaClientIdResult> {
  const fromEnv = getTeslaClientIdFromEnv();
  if (fromEnv) return { ok: true, clientId: fromEnv };

  const url = apiUrl('/api/tesla/config');
  try {
    const r = await fetch(url);
    const text = await r.text();
    let data: { clientId?: string; error?: string } = {};
    try {
      data = text ? (JSON.parse(text) as typeof data) : {};
    } catch {
      return {
        ok: false,
        message: `Could not load sign-in config (invalid JSON from ${url}).`,
      };
    }
    if (!r.ok) {
      return {
        ok: false,
        message:
          data.error ??
          `Could not load sign-in config (HTTP ${r.status} from ${url}). Check the server and CORS.`,
      };
    }
    const clientId = data.clientId ?? null;
    if (!clientId) {
      return {
        ok: false,
        message: `Could not load sign-in config (no clientId from ${url}).`,
      };
    }
    return { ok: true, clientId };
  } catch {
    const base = getApiBase();
    return {
      ok: false,
      message: `Could not load sign-in config (network error to ${url}). API base is "${base}". For ehpk builds, confirm .env.production has VITE_API_BASE_URL and the server allows this app in ALLOWED_ORIGINS.`,
    };
  }
}
