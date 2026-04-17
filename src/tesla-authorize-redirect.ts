import { resolveTeslaOAuthConfig } from './tesla-oauth-config';
import { TESLA_OAUTH_REDIRECT_SESSION_KEY } from './tesla-redirect-uri';

const SCOPES = 'openid offline_access vehicle_device_data vehicle_cmds';
const AUTH_URL = 'https://auth.tesla.com/oauth2/v3/authorize';

function generateState(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (x) => chars[x % chars.length]).join('');
}

export type StartTeslaAuthorizeResult = { ok: true } | { ok: false; message: string };

/**
 * Navigates to Tesla /authorize with prompt=login after storing oauth state + redirect_uri for the callback exchange.
 */
export function startTeslaAuthorizeRedirectWithConfig(config: {
  clientId: string;
  redirectUri: string;
}): void {
  const state = generateState();
  sessionStorage.setItem('tesla_oauth_state', state);
  sessionStorage.setItem(TESLA_OAUTH_REDIRECT_SESSION_KEY, config.redirectUri);
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: SCOPES,
    state,
    prompt: 'login',
  });
  window.location.href = `${AUTH_URL}?${params}`;
}

export async function startTeslaAuthorizeRedirect(): Promise<StartTeslaAuthorizeResult> {
  const resolved = await resolveTeslaOAuthConfig();
  if (!resolved.ok) {
    return { ok: false, message: resolved.message };
  }
  startTeslaAuthorizeRedirectWithConfig({
    clientId: resolved.clientId,
    redirectUri: resolved.redirectUri,
  });
  return { ok: true };
}
