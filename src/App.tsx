/**
 * Tesla – Even G2 app root. Manages bridge, tokens, and glasses flow.
 */

import { useState, useEffect } from 'react';
import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import {
  startGlassesApp,
  startGlassesCredentialsMessage,
  switchToMainPage,
} from './glasses-app';
import { setTokenDisplay } from './pages/main';
import { SignInView } from './components/SignInView';
import { DashboardView } from './components/DashboardView';
import { AuthCallbackView } from './components/AuthCallbackView';
import './App.css';

const STORAGE_KEY_ACCESS_TOKEN = 'tesla_access_token';
const STORAGE_KEY_REFRESH_TOKEN = 'tesla_refresh_token';

function isAuthCallback(): boolean {
  const pathname = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  return pathname === '/auth/callback' && !!params.get('code');
}

export function App() {
  const [bridge, setBridge] = useState<EvenAppBridge | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
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
        const hasTokens = access && refresh;

        setAccessToken(access ?? null);
        setRefreshToken(refresh ?? null);

        if (!hasTokens) {
          await startGlassesCredentialsMessage(b);
        } else {
          setTokenDisplay(access, refresh);
          await startGlassesApp(b);
        }
        setInitialized(true);
      })
      .catch((err) => {
        console.error('[Tesla] init error:', err);
        setInitError(err?.message ?? 'Failed to connect to Even Hub');
        setInitialized(true);
      });
  }, []);

  async function handleTokensReceived(access: string, refresh: string) {
    if (!bridge) return;
    setTokenDisplay(access, refresh);
    setAccessToken(access);
    setRefreshToken(refresh);
    await switchToMainPage(bridge);
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
      />
    </div>
  );
}
