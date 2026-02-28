/**
 * Dashboard view when Tesla tokens exist.
 * Test API access and re-authorize options.
 */

import { useState } from 'react';
import { Card, CardHeader, CardContent, Button, Text } from '@jappyjan/even-realities-ui';
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';

const API_BASE = typeof window !== 'undefined' ? window.location.origin : 'https://even.thedevcave.xyz';
const REDIRECT_URI = `${API_BASE}/auth/callback`;
const SCOPES = 'openid offline_access vehicle_device_data';
const AUTH_URL = 'https://auth.tesla.com/oauth2/v3/authorize';

const STORAGE_KEY_ACCESS_TOKEN = 'tesla_access_token';
const STORAGE_KEY_REFRESH_TOKEN = 'tesla_refresh_token';
const STORAGE_KEY_TOKEN_REFRESHED_AT = 'tesla_token_refreshed_at';
const TOKEN_STALE_DAYS = 80;
const STALE_MS = TOKEN_STALE_DAYS * 24 * 60 * 60 * 1000;

function isTokenStale(refreshedAt: string | null | undefined): boolean {
  if (!refreshedAt) return false;
  return Date.now() - new Date(refreshedAt).getTime() > STALE_MS;
}

export interface DashboardViewProps {
  bridge: EvenAppBridge;
  accessToken: string;
  refreshToken: string;
  tokenRefreshedAt?: string | null;
  needsReauth?: boolean;
  onTokensRefreshed?: (access: string, refresh: string) => void | Promise<void>;
  onRefreshFailed?: () => void;
  onReAuthorize?: () => void;
}

function generateState(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (x) => chars[x % chars.length]).join('');
}

export function DashboardView({
  bridge,
  accessToken,
  refreshToken,
  tokenRefreshedAt,
  needsReauth,
  onTokensRefreshed,
  onRefreshFailed,
}: DashboardViewProps) {
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState<string>('');
  const [reAuthError, setReAuthError] = useState<string | null>(null);

  async function handleTestApi() {
    if (needsReauth) return;
    setTestStatus('loading');
    setTestMessage('');
    let tokenToUse = accessToken;
    if (isTokenStale(tokenRefreshedAt)) {
      try {
        const res = await fetch('/api/tesla/refresh-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        const data = await res.json();
        if (res.ok && data.access_token && data.refresh_token) {
          tokenToUse = data.access_token;
          await onTokensRefreshed?.(data.access_token, data.refresh_token);
        } else {
          onRefreshFailed?.();
          setTestStatus('idle');
          return;
        }
      } catch {
        onRefreshFailed?.();
        setTestStatus('idle');
        return;
      }
    }
    try {
      const res = await fetch('/api/tesla/vehicles', {
        headers: { Authorization: `Bearer ${tokenToUse}` },
      });
      const data = await res.json();
      if (res.ok) {
        const count = data?.response?.length ?? 0;
        setTestStatus('success');
        setTestMessage(`Success: ${count} vehicle(s) found`);
      } else {
        setTestStatus('error');
        setTestMessage(data?.error ?? data?.error_description ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      setTestStatus('error');
      setTestMessage(err instanceof Error ? err.message : 'Request failed');
    }
  }

  async function startReAuth() {
    setReAuthError(null);
    try {
      await bridge.setLocalStorage(STORAGE_KEY_ACCESS_TOKEN, '');
      await bridge.setLocalStorage(STORAGE_KEY_REFRESH_TOKEN, '');
      await bridge.setLocalStorage(STORAGE_KEY_TOKEN_REFRESHED_AT, '');
    } catch {
      // ignore
    }
    const r = await fetch('/api/tesla/config');
    const d = await r.json();
    const cid = d?.clientId;
    if (!cid) {
      setReAuthError('Server config missing. Retry re-authorize.');
      return;
    }
    const state = generateState();
    sessionStorage.setItem('tesla_oauth_state', state);
    const params = new URLSearchParams({
      client_id: cid,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: SCOPES,
      state,
    });
    window.location.href = `${AUTH_URL}?${params}`;
  };

  return (
    <Card>
      <CardHeader>
        <Text variant="title-1">Tesla API</Text>
      </CardHeader>
      <CardContent>
        <Button
          type="button"
          variant="primary"
          onClick={handleTestApi}
          disabled={testStatus === 'loading' || needsReauth}
          style={{ width: '100%', marginBottom: 12 }}
        >
          {needsReauth
            ? 'Please Reauthorize'
            : testStatus === 'loading'
              ? 'Testing…'
              : 'Test API Access'}
        </Button>

        {testStatus === 'success' && (
          <Text
            variant="body-2"
            style={{
              marginBottom: 12,
              padding: 12,
              borderRadius: 8,
              backgroundColor: 'var(--color-bc-accent)',
              display: 'block',
            }}
          >
            {testMessage}
          </Text>
        )}
        {testStatus === 'error' && (
          <Text
            variant="body-2"
            style={{
              marginBottom: 12,
              padding: 12,
              borderRadius: 8,
              backgroundColor: 'var(--color-bc-1st)',
              color: 'var(--color-tc-red)',
              display: 'block',
            }}
          >
            {testMessage}
          </Text>
        )}

        {reAuthError && (
          <Text
            variant="body-2"
            style={{
              marginBottom: 12,
              color: 'var(--color-tc-red)',
            }}
          >
            {reAuthError}
          </Text>
        )}

        <Button
          type="button"
          variant="accent"
          onClick={startReAuth}
          style={{ width: '100%' }}
        >
          Re-authorize
        </Button>
      </CardContent>
    </Card>
  );
}
