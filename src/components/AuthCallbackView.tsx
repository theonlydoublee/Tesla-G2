/**
 * OAuth callback view.
 * Shown while exchanging code for tokens; redirects on success or shows error.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, Button, Text } from '@jappyjan/even-realities-ui';
import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import { apiUrl } from '../api-base';
import {
  STORAGE_KEY_SESSION_ID,
  STORAGE_KEY_FLEET_REGION,
  STORAGE_KEY_FLEET_API_BASE,
} from '../tesla-session-storage';
import { getTeslaRedirectUri, TESLA_OAUTH_REDIRECT_SESSION_KEY } from '../tesla-redirect-uri';
import { startTeslaAuthorizeRedirect } from '../tesla-authorize-redirect';

const LEGACY_KEYS = ['tesla_access_token', 'tesla_refresh_token', 'tesla_token_refreshed_at'] as const;

async function clearLegacyTokenKeys(bridge: Awaited<ReturnType<typeof waitForEvenAppBridge>>) {
  for (const key of LEGACY_KEYS) {
    try {
      await bridge.setLocalStorage(key, '');
    } catch {
      // ignore
    }
  }
}

export function AuthCallbackView() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState<string>('');
  const [retryBusy, setRetryBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const savedState = sessionStorage.getItem('tesla_oauth_state');

    if (!code) {
      setStatus('error');
      setMessage('No authorization code received');
      sessionStorage.removeItem(TESLA_OAUTH_REDIRECT_SESSION_KEY);
      return;
    }

    if (state !== savedState) {
      setStatus('error');
      setMessage('Invalid or expired state');
      sessionStorage.removeItem(TESLA_OAUTH_REDIRECT_SESSION_KEY);
      return;
    }

    sessionStorage.removeItem('tesla_oauth_state');

    const storedRedirect = sessionStorage.getItem(TESLA_OAUTH_REDIRECT_SESSION_KEY)?.trim();
    sessionStorage.removeItem(TESLA_OAUTH_REDIRECT_SESSION_KEY);
    const redirect_uri = storedRedirect || getTeslaRedirectUri();

    fetch(apiUrl('/api/tesla/exchange-token'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirect_uri }),
    })
      .then((r) => r.json())
      .then(async (data) => {
        if (data.session_id) {
          const bridge = await waitForEvenAppBridge();
          await clearLegacyTokenKeys(bridge);
          await bridge.setLocalStorage(STORAGE_KEY_SESSION_ID, data.session_id);
          if (typeof data.region === 'string' && data.region) {
            await bridge.setLocalStorage(STORAGE_KEY_FLEET_REGION, data.region);
          }
          if (typeof data.fleet_api_base === 'string' && data.fleet_api_base) {
            await bridge.setLocalStorage(STORAGE_KEY_FLEET_API_BASE, data.fleet_api_base);
          }
          setStatus('success');
          window.location.replace('/');
        } else {
          setStatus('error');
          setMessage(data.error_description ?? data.error ?? 'Token exchange failed');
        }
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err?.message ?? 'Request failed');
      });
  }, []);

  if (status === 'loading') {
    return (
      <Card>
        <CardContent>
          <Text variant="body-1">Completing sign-in…</Text>
        </CardContent>
      </Card>
    );
  }

  if (status === 'error') {
    return (
      <Card>
        <CardContent>
          <Text variant="body-2" style={{ marginBottom: 16, color: 'var(--color-tc-red)' }}>
            {message}
          </Text>
          <Button
            variant="primary"
            disabled={retryBusy}
            onClick={() => {
              setRetryBusy(true);
              void startTeslaAuthorizeRedirect().then((r) => {
                if (!r.ok) {
                  setMessage(r.message);
                  setRetryBusy(false);
                }
              });
            }}
          >
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Text variant="body-1">Redirecting…</Text>
      </CardContent>
    </Card>
  );
}
