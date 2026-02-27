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
import { SettingsPanel } from './components/SettingsPanel';
import './App.css';

const STORAGE_KEY_ACCESS_TOKEN = 'tesla_access_token';
const STORAGE_KEY_REFRESH_TOKEN = 'tesla_refresh_token';

export function App() {
  const [bridge, setBridge] = useState<EvenAppBridge | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    setInitError(null);
    waitForEvenAppBridge()
      .then(async (b) => {
        setBridge(b);
        const accessToken = await b.getLocalStorage(STORAGE_KEY_ACCESS_TOKEN);
        const refreshToken = await b.getLocalStorage(STORAGE_KEY_REFRESH_TOKEN);
        const hasTokens = accessToken && refreshToken;

        if (!hasTokens) {
          await startGlassesCredentialsMessage(b);
          setShowSettings(true);
        } else {
          setTokenDisplay(accessToken, refreshToken);
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

  async function handleSettingsSaved(accessToken: string, refreshToken: string) {
    if (!bridge) return;
    setTokenDisplay(accessToken, refreshToken);
    setShowSettings(false);
    await switchToMainPage(bridge);
  }

  // Loading: waiting for bridge
  if (!bridge && !initError) {
    return (
      <div className="app-container">
        <p>Connecting to Even Hub…</p>
      </div>
    );
  }

  // Init failed (e.g. not running inside Even Hub)
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

  if (!initialized) {
    return (
      <div className="app-container">
        <p>Starting up…</p>
      </div>
    );
  }

  // if (!showSettings) {
  //   return (
  //     <div className="app-container">
  //       <GlassesPreview />
  //     </div>
  //   );
  // }

  if (!bridge) return null;

  return (
    <div className="app-container">
      <SettingsPanel bridge={bridge} onSaved={handleSettingsSaved} />
    </div>
  );
}
