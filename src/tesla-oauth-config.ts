import { apiUrl, getApiBase } from './api-base';
import { getTeslaClientIdFromEnv } from './tesla-client-id';
import { getTeslaRedirectUri, getTeslaRedirectUriFromViteEnv } from './tesla-redirect-uri';

export type ResolveTeslaOAuthConfigResult =
  | { ok: true; clientId: string; redirectUri: string }
  | { ok: false; message: string };

/**
 * Resolves client_id and redirect_uri together so they match the Tesla app registration.
 * Uses VITE_* when both are set; otherwise merges GET /api/tesla/config with env and window fallbacks.
 */
export async function resolveTeslaOAuthConfig(): Promise<ResolveTeslaOAuthConfigResult> {
  const envId = getTeslaClientIdFromEnv();
  const envRedirect = getTeslaRedirectUriFromViteEnv();

  if (envId && envRedirect) {
    return { ok: true, clientId: envId, redirectUri: envRedirect };
  }

  const url = apiUrl('/api/tesla/config');
  try {
    const r = await fetch(url);
    const text = await r.text();
    let data: { clientId?: string; redirectUri?: string; error?: string } = {};
    try {
      data = text ? (JSON.parse(text) as typeof data) : {};
    } catch {
      return {
        ok: false,
        message: `Could not load OAuth config (invalid JSON from ${url}).`,
      };
    }
    if (!r.ok) {
      return {
        ok: false,
        message:
          data.error ??
          `Could not load OAuth config (HTTP ${r.status} from ${url}). Check the server and CORS.`,
      };
    }

    const apiId = (data.clientId ?? '').trim();
    const apiRedirect = (data.redirectUri ?? '').trim();

    const clientId = envId || apiId;
    let redirectUri = (envRedirect ?? '') || apiRedirect;

    if (!redirectUri && typeof window !== 'undefined' && window.location.protocol === 'https:') {
      redirectUri = `${window.location.origin}/auth/callback`;
    }
    if (!redirectUri) {
      redirectUri = getTeslaRedirectUri();
    }

    if (!clientId) {
      return {
        ok: false,
        message: `Could not load OAuth config (no clientId from ${url}).`,
      };
    }
    return { ok: true, clientId, redirectUri };
  } catch {
    const base = getApiBase();
    return {
      ok: false,
      message: `Could not load OAuth config (network error to ${url}). API base is "${base}".`,
    };
  }
}
