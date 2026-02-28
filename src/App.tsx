/**
 * Tesla – Even G2 app root. Manages bridge, tokens, and glasses flow.
 */

import { useState, useEffect } from 'react';
import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import {
  startGlassesApp,
  startGlassesCredentialsMessage,
} from './glasses-app';
import { setTokenDisplay } from './pages/main';
import { SignInView } from './components/SignInView';
import { DashboardView } from './components/DashboardView';
import { AuthCallbackView } from './components/AuthCallbackView';
import './App.css';

const STORAGE_KEY_ACCESS_TOKEN = 'tesla_access_token';
const STORAGE_KEY_REFRESH_TOKEN = 'tesla_refresh_token';
const STORAGE_KEY_TOKEN_REFRESHED_AT = 'tesla_token_refreshed_at';
const TOKEN_STALE_DAYS = 80;
const STALE_MS = TOKEN_STALE_DAYS * 24 * 60 * 60 * 1000;

function isTokenStale(refreshedAt: string | null): boolean {
  if (!refreshedAt) return false;
  return Date.now() - new Date(refreshedAt).getTime() > STALE_MS;
}

function isAuthCallback(): boolean {
  const pathname = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  return pathname === '/auth/callback' && !!params.get('code');
}

export function App() {
  const [bridge, setBridge] = useState<EvenAppBridge | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [tokenRefreshedAt, setTokenRefreshedAt] = useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthCallback()) {
      setInitialized(true);
      return;
    }

    setInitError(null);
    waitForEvenAppBridge()
      .then(async (b) => {
        setBridge(b);
        const access = await b.getLocalStorage(STORAGE_KEY_ACCESS_TOKEN);
        const refresh = await b.getLocalStorage(STORAGE_KEY_REFRESH_TOKEN);
        let refreshedAt = await b.getLocalStorage(STORAGE_KEY_TOKEN_REFRESHED_AT);
        const hasTokens = access && refresh;

        if (hasTokens && !refreshedAt) {
          refreshedAt = new Date().toISOString();
          await b.setLocalStorage(STORAGE_KEY_TOKEN_REFRESHED_AT, refreshedAt);
        }
        setAccessToken(access ?? null);
        setRefreshToken(refresh ?? null);
        setTokenRefreshedAt(refreshedAt ?? null);

        if (!hasTokens) {
          await startGlassesCredentialsMessage(b);
        } else {
          setTokenDisplay(access, refresh);
          await startGlassesApp(b);

          if (isTokenStale(refreshedAt ?? null)) {
            try {
              const res = await fetch('/api/tesla/refresh-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: refresh }),
              });
              const data = await res.json();
              if (res.ok && data.access_token && data.refresh_token) {
                const now = new Date().toISOString();
                await b.setLocalStorage(STORAGE_KEY_ACCESS_TOKEN, data.access_token);
                await b.setLocalStorage(STORAGE_KEY_REFRESH_TOKEN, data.refresh_token);
                await b.setLocalStorage(STORAGE_KEY_TOKEN_REFRESHED_AT, now);
                setAccessToken(data.access_token);
                setRefreshToken(data.refresh_token);
                setTokenRefreshedAt(now);
                setTokenDisplay(data.access_token, data.refresh_token);
              } else {
                setNeedsReauth(true);
              }
            } catch {
              setNeedsReauth(true);
            }
          }
        }
        setInitialized(true);
      })
      .catch((err) => {
        console.error('[Tesla] init error:', err);
        setInitError(err?.message ?? 'Failed to connect to Even Hub');
        setInitialized(true);
      });
  }, []);

  async function handleTokensRefreshed(access: string, refresh: string) {
    if (!bridge) return;
    const now = new Date().toISOString();
    await bridge.setLocalStorage(STORAGE_KEY_ACCESS_TOKEN, access);
    await bridge.setLocalStorage(STORAGE_KEY_REFRESH_TOKEN, refresh);
    await bridge.setLocalStorage(STORAGE_KEY_TOKEN_REFRESHED_AT, now);
    setTokenDisplay(access, refresh);
    setAccessToken(access);
    setRefreshToken(refresh);
    setTokenRefreshedAt(now);
    setNeedsReauth(false);
  }

  if (isAuthCallback()) {
    return (
      <div className="app-container">
        <AuthCallbackView />
      </div>
    );
  }

  if (!bridge && !initError) {
    return (
      <div className="app-container">
        <p>Connecting to Even Hub…</p>
      </div>
    );
  }

  if (initError) {
    return (
      <div className="app-container">
        <p>{initError}</p>
        <p style={{ marginTop: 8, fontSize: 14, opacity: 0.8 }}>
          Open this app from Even Hub to use Tesla on your glasses.
        </p>
      </div>
    );
  }

  if (!initialized || !bridge) {
    return (
      <div className="app-container">
        <p>Starting up…</p>
      </div>
    );
  }

  if (!accessToken || !refreshToken) {
    return (
      <div className="app-container">
        <SignInView bridge={bridge} />
      </div>
    );
  }

  return (
    <div className="app-container">
      <DashboardView
        bridge={bridge}
        accessToken={accessToken}
        refreshToken={refreshToken}
        tokenRefreshedAt={tokenRefreshedAt}
        needsReauth={needsReauth}
        onTokensRefreshed={handleTokensRefreshed}
        onRefreshFailed={() => setNeedsReauth(true)}
      />
    </div>
  );
}
