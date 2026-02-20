/**
 * Tesla – Even G2 app root. Manages bridge, tokens, and glasses flow.
 */

import { useState, useEffect } from 'react';
import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import {
  startGlassesApp,
  startGlassesCredentialsMessage,
  setupGlassesEventHandler,
  buildRebuildPage,
  sendBackgroundImage,
  setTokenDisplay,
  PAGE_MAIN,
} from './glasses-app';
import { SettingsPanel } from './components/SettingsPanel';
import './App.css';

const STORAGE_KEY_ACCESS_TOKEN = 'tesla_access_token';
const STORAGE_KEY_REFRESH_TOKEN = 'tesla_refresh_token';

export function App() {
  const [bridge, setBridge] = useState<EvenAppBridge | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
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
      });
  }, []);

  async function handleSettingsSaved(accessToken: string, refreshToken: string) {
    if (!bridge) return;
    setTokenDisplay(accessToken, refreshToken);
    setShowSettings(false);
    await bridge.rebuildPageContainer(buildRebuildPage(PAGE_MAIN));
    await sendBackgroundImage(bridge);
    setupGlassesEventHandler(bridge);
  }

  if (!initialized || !bridge) {
    return null;
  }

  if (!showSettings) {
    return null;
  }

  return (
    <div className="app-container">
      <SettingsPanel bridge={bridge} onSaved={handleSettingsSaved} />
    </div>
  );
}
