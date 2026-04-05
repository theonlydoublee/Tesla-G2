/**
 * Tesla – Even G2 app root. Manages bridge, session id, and glasses flow.
 */

import { useState, useEffect } from 'react';
import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import {
  startGlassesApp,
  startGlassesCredentialsMessage,
} from './glasses-app';
import { markSessionConnected } from './pages/main';
import { SignInView } from './components/SignInView';
import { DashboardView } from './components/DashboardView';
import { AuthCallbackView } from './components/AuthCallbackView';
import { STORAGE_KEY_SESSION_ID } from './tesla-session-storage';
import './App.css';

const LEGACY_KEYS = ['tesla_access_token', 'tesla_refresh_token', 'tesla_token_refreshed_at'] as const;

async function clearLegacyTokenKeys(b: EvenAppBridge) {
  for (const key of LEGACY_KEYS) {
    try {
      await b.setLocalStorage(key, '');
    } catch {
      // ignore
    }
  }
}

function isAuthCallback(): boolean {
  const pathname = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  return pathname === '/auth/callback' && !!params.get('code');
}

export function App() {
  const [bridge, setBridge] = useState<EvenAppBridge | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
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
        const session = await b.getLocalStorage(STORAGE_KEY_SESSION_ID);
        const hasSession = !!session?.trim();

        if (hasSession) {
          await clearLegacyTokenKeys(b);
          setSessionId(session!.trim());
          markSessionConnected();
          // Do not block UI on glasses: concurrent native create + foreground cold-start can hang if awaited.
          setInitialized(true);
          void startGlassesApp(b).catch((err) => {
            console.error('[Tesla] startGlassesApp failed:', err);
          });
        } else {
          await clearLegacyTokenKeys(b);
          await startGlassesCredentialsMessage(b);
          setInitialized(true);
        }
      })
      .catch((err) => {
        console.error('[Tesla] init error:', err);
        setInitError(err?.message ?? 'Failed to connect to Even Hub');
        setInitialized(true);
      });
  }, []);

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

  if (!sessionId) {
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
        sessionId={sessionId}
        needsReauth={needsReauth}
        onSessionInvalid={() => setNeedsReauth(true)}
      />
    </div>
  );
}
