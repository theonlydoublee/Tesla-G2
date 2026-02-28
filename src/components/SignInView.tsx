/**
 * Sign-in view when no Tesla tokens are stored.
 * Single "Sign in with Tesla" button triggers OAuth redirect.
 */

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent, Button, Text } from '@jappyjan/even-realities-ui';
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';

const API_BASE = typeof window !== 'undefined' ? window.location.origin : 'https://even.thedevcave.xyz';
const REDIRECT_URI = 'https://even.thedevcave.xyz/auth/callback';
const SCOPES = 'openid offline_access vehicle_device_data';
const AUTH_URL = 'https://auth.tesla.com/oauth2/v3/authorize';

export interface SignInViewProps {
  bridge: EvenAppBridge;
}

function generateState(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (x) => chars[x % chars.length]).join('');
}

export function SignInView({ bridge }: SignInViewProps) {
  const [clientId, setClientId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/tesla/config')
      .then((r) => r.json())
      .then((data) => setClientId(data.clientId ?? null))
      .catch(() => setError('Could not load sign-in config'));
  }, []);

  if (error) {
    return (
      <Card>
        <CardContent>
          <Text variant="body-2" style={{ color: 'var(--color-tc-red)' }}>
            {error}
          </Text>
        </CardContent>
      </Card>
    );
  }

  if (!clientId) {
    return (
      <Card>
        <CardContent>
          <Text variant="body-2">Loading…</Text>
        </CardContent>
      </Card>
    );
  }
  function handleSignIn() {
    const state = generateState();
    sessionStorage.setItem('tesla_oauth_state', state);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: SCOPES,
      state,
    });

    window.location.href = `${AUTH_URL}?${params}`;
  }

  return (
    <Card>
      <CardHeader>
        <Text variant="title-1">Tesla API</Text>
      </CardHeader>
      <CardContent>
        <Text variant="body-2" style={{ marginBottom: 16, display: 'block' }}>
          Sign in with your Tesla account to access vehicle status and controls on your glasses.
        </Text>
        <Button
          type="button"
          variant="primary"
          onClick={handleSignIn}
          style={{ width: '100%' }}
        >
          Sign in with Tesla
        </Button>
      </CardContent>
    </Card>
  );
}
