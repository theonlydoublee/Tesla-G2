/**
 * Tesla OAuth redirect_uri must exactly match a URI registered in the Tesla Developer Portal.
 * Even Hub .ehpk WebViews often use file:// or other origins — use VITE_TESLA_REDIRECT_URI
 * in production builds so authorize + token exchange use your public HTTPS callback.
 */

/** Session key: redirect_uri used on /authorize must be repeated on token exchange. */
export const TESLA_OAUTH_REDIRECT_SESSION_KEY = 'tesla_oauth_redirect_uri';

/** Non-empty VITE_TESLA_REDIRECT_URI only (no window fallback). */
export function getTeslaRedirectUriFromViteEnv(): string | null {
  const env = import.meta.env.VITE_TESLA_REDIRECT_URI;
  if (typeof env === 'string') {
    const t = env.trim();
    if (t) return t;
  }
  return null;
}

export function getTeslaRedirectUri(): string {
  const fromVite = getTeslaRedirectUriFromViteEnv();
  if (fromVite) return fromVite;
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/auth/callback`;
  }
  return 'https://even.thedevcave.xyz/auth/callback';
}
