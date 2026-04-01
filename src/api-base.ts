/**
 * Base URL for Tesla backend (/api/tesla/*). When unset, same-origin as the page
 * (Express serving dist + API). Set VITE_API_BASE_URL when UI is static-only (e.g. ehpk).
 */
function trimTrailingSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

export function getApiBase(): string {
  const env = import.meta.env.VITE_API_BASE_URL;
  if (typeof env === 'string' && env.trim()) {
    return trimTrailingSlash(env.trim());
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
}

export function apiUrl(path: string): string {
  const base = getApiBase();
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}
