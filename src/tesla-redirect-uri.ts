/**
 * Tesla OAuth redirect_uri must exactly match a URI registered in the Tesla Developer Portal.
 * Even Hub .ehpk WebViews often use file:// or other origins — use VITE_TESLA_REDIRECT_URI
 * in production builds so authorize + token exchange use your public HTTPS callback.
 */
export function getTeslaRedirectUri(): string {
  const env = import.meta.env.VITE_TESLA_REDIRECT_URI;
  if (typeof env === 'string') {
    const t = env.trim();
    if (t) return t;
  }
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/auth/callback`;
  }
  return 'https://even.thedevcave.xyz/auth/callback';
}
