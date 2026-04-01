/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** Public Tesla OAuth client id; optional fallback when /api/tesla/config is unreachable */
  readonly VITE_TESLA_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
