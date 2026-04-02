/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** Public Tesla OAuth client id; optional fallback when /api/tesla/config is unreachable */
  readonly VITE_TESLA_CLIENT_ID?: string;
  /** Full authorize/callback URL registered in Tesla portal (required for packed Even Hub builds) */
  readonly VITE_TESLA_REDIRECT_URI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
