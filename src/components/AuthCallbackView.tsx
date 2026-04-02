/**
 * OAuth callback view.
 * Shown while exchanging code for tokens; redirects on success or shows error.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, Button, Text } from '@jappyjan/even-realities-ui';
import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import { apiUrl } from '../api-base';
import { STORAGE_KEY_SESSION_ID } from '../tesla-session-storage';

const REDIRECT_URI = typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : 'https://even.thedevcave.xyz/auth/callback';

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const savedState = sessionStorage.getItem('tesla_oauth_state');

    if (!code) {
      setStatus('error');
      setMessage('No authorization code received');
      return;
    }

    if (state !== savedState) {
      setStatus('error');
      setMessage('Invalid or expired state');
      return;
    }

    sessionStorage.removeItem('tesla_oauth_state');

    fetch(apiUrl('/api/tesla/exchange-token'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirect_uri: REDIRECT_URI }),
    })
      .then((r) => r.json())
      .then(async (data) => {
        if (data.session_id) {
          const bridge = await waitForEvenAppBridge();
          await clearLegacyTokenKeys(bridge);
          await bridge.setLocalStorage(STORAGE_KEY_SESSION_ID, data.session_id);
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
          <Button variant="primary" onClick={() => window.location.replace('/')}>
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
