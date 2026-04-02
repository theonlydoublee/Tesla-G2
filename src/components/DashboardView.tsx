/**
 * Dashboard view when Tesla tokens exist.
 * Test API access, vehicle selection, and re-authorize options.
 */

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent, Button, Text } from '@jappyjan/even-realities-ui';
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { switchToMainPage } from '../glasses-app';
import { apiUrl } from '../api-base';
import { resolveTeslaClientId } from '../tesla-client-id';

const API_BASE = typeof window !== 'undefined' ? window.location.origin : 'https://even.thedevcave.xyz';
// const API_BASE = 'https://even.thedevcave.xyz';
const REDIRECT_URI = `${API_BASE}/auth/callback`;
const SCOPES = 'openid offline_access vehicle_device_data vehicle_cmds';
const AUTH_URL = 'https://auth.tesla.com/oauth2/v3/authorize';

const STORAGE_KEY_ACCESS_TOKEN = 'tesla_access_token';
const STORAGE_KEY_REFRESH_TOKEN = 'tesla_refresh_token';
const STORAGE_KEY_TOKEN_REFRESHED_AT = 'tesla_token_refreshed_at';
const STORAGE_KEY_SELECTED_VEHICLE = 'tesla_selected_vehicle';
const TOKEN_STALE_DAYS = 80;
const STALE_MS = TOKEN_STALE_DAYS * 24 * 60 * 60 * 1000;

interface TeslaVehicle {
  id?: number;
  vin: string;
  display_name: string;
  model?: string;
}

interface SelectedVehicle {
  id?: number;
  vin: string;
  name: string;
  model: string;
}

function isTokenStale(refreshedAt: string | null | undefined): boolean {
  if (!refreshedAt) return false;
  return Date.now() - new Date(refreshedAt).getTime() > STALE_MS;
}

function decodeModelFromVin(vin: string): string {
  if (!vin || vin.length < 4) return 'Tesla';
  const c = vin[3];
  if (!c) return 'Tesla';
  switch (c.toUpperCase()) {
    case 'S': return 'Model S';
    case 'X': return 'Model X';
    case '3': return 'Model 3';
    case 'Y': return 'Model Y';
    default: return 'Tesla';
  }
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
  const [vehicles, setVehicles] = useState<TeslaVehicle[] | null>(null);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [vehiclesError, setVehiclesError] = useState<string | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<SelectedVehicle | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [virtualKeyAdded, setVirtualKeyAdded] = useState<boolean | null>(null);

  async function getValidToken(): Promise<string | null> {
    if (needsReauth) return null;
    let tokenToUse = accessToken;
    if (isTokenStale(tokenRefreshedAt)) {
      try {
        const res = await fetch(apiUrl('/api/tesla/refresh-token'), {
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
          return null;
        }
      } catch {
        onRefreshFailed?.();
        return null;
      }
    }
    return tokenToUse;
  }

  async function fetchVehicles() {
    const tokenToUse = await getValidToken();
    if (!tokenToUse) return;
    setVehiclesLoading(true);
    setVehiclesError(null);
    try {
      const res = await fetch(apiUrl('/api/tesla/vehicles'), {
        headers: { Authorization: `Bearer ${tokenToUse}` },
      });
      const data = await res.json();
      if (res.ok) {
        const raw = (data?.response ?? []) as Array<{ id?: number; vin?: string; display_name?: string }>;
        const list: TeslaVehicle[] = raw
          .filter((v): v is { id?: number; vin: string; display_name?: string } => !!v?.vin)
          .map((v) => ({
            id: v.id,
            vin: v.vin,
            display_name: v.display_name ?? 'Unnamed',
            model: decodeModelFromVin(v.vin),
          }));
        setVehicles(list);
      } else {
        setVehiclesError(data?.error ?? data?.error_description ?? `HTTP ${res.status}`);
        setVehicles([]);
      }
    } catch (err) {
      setVehiclesError(err instanceof Error ? err.message : 'Request failed');
      setVehicles([]);
    } finally {
      setVehiclesLoading(false);
    }
  }

  useEffect(() => {
    if (!accessToken || needsReauth) return;
    let cancelled = false;
    (async () => {
      const stored = await bridge.getLocalStorage(STORAGE_KEY_SELECTED_VEHICLE);
      if (cancelled) return;
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as SelectedVehicle;
          if (parsed?.vin && parsed?.name) {
            setSelectedVehicle({
              id: parsed.id,
              vin: parsed.vin,
              name: parsed.name,
              model: parsed.model ?? decodeModelFromVin(parsed.vin),
            });
          }
        } catch {
          // ignore invalid stored data
        }
      }
      const tokenToUse = await getValidToken();
      if (cancelled || !tokenToUse) return;
      setVehiclesLoading(true);
      setVehiclesError(null);
      try {
        const res = await fetch(apiUrl('/api/tesla/vehicles'), {
          headers: { Authorization: `Bearer ${tokenToUse}` },
        });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) {
          const raw = (data?.response ?? []) as Array<{ id?: number; vin?: string; display_name?: string }>;
          const list: TeslaVehicle[] = raw
            .filter((v): v is { id?: number; vin: string; display_name?: string } => !!v?.vin)
            .map((v) => ({
              id: v.id,
              vin: v.vin,
              display_name: v.display_name ?? 'Unnamed',
              model: decodeModelFromVin(v.vin),
            }));
          setVehicles(list);
          await switchToMainPage(bridge);
          const firstVehicle = list[0];
          if (firstVehicle && !stored) {
            const selected: SelectedVehicle = {
              id: firstVehicle.id,
              vin: firstVehicle.vin,
              name: firstVehicle.display_name,
              model: firstVehicle.model ?? decodeModelFromVin(firstVehicle.vin),
            };
            await bridge.setLocalStorage(STORAGE_KEY_SELECTED_VEHICLE, JSON.stringify(selected));
            setSelectedVehicle(selected);
          }
        } else {
          setVehiclesError(data?.error ?? data?.error_description ?? `HTTP ${res.status}`);
          setVehicles([]);
        }
      } catch (err) {
        if (!cancelled) {
          setVehiclesError(err instanceof Error ? err.message : 'Request failed');
          setVehicles([]);
        }
      } finally {
        if (!cancelled) setVehiclesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [accessToken, needsReauth, bridge]);

  useEffect(() => {
    if (!selectedVehicle || needsReauth) {
      setVirtualKeyAdded(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setVirtualKeyAdded(null);
      const tokenToUse = await getValidToken();
      if (cancelled || !tokenToUse) return;
      try {
        const params = new URLSearchParams();
        if (selectedVehicle.id != null) params.set('vehicleId', String(selectedVehicle.id));
        if (selectedVehicle.vin) params.set('vin', selectedVehicle.vin);
        const res = await fetch(apiUrl(`/api/tesla/check-virtual-key?${params}`), {
          headers: { Authorization: `Bearer ${tokenToUse}` },
        });
        const data = await res.json();
        if (!cancelled) setVirtualKeyAdded(data.virtualKeyAdded === true);
      } catch {
        if (!cancelled) setVirtualKeyAdded(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedVehicle?.id, selectedVehicle?.vin, needsReauth]);

  async function handleSelectVehicle(vehicle: TeslaVehicle) {
    const selected: SelectedVehicle = {
      id: vehicle.id,
      vin: vehicle.vin,
      name: vehicle.display_name,
      model: vehicle.model ?? decodeModelFromVin(vehicle.vin),
    };
    await bridge.setLocalStorage(STORAGE_KEY_SELECTED_VEHICLE, JSON.stringify(selected));
    setSelectedVehicle(selected);
  }

  async function handleRefreshAndSendToGlasses() {
    if (needsReauth) return;
    setSaveStatus('loading');
    try {
      await switchToMainPage(bridge);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  }

  async function handleTestApi() {
    if (needsReauth) return;
    setTestStatus('loading');
    setTestMessage('');
    const tokenToUse = await getValidToken();
    if (!tokenToUse) {
      setTestStatus('idle');
      return;
    }
    try {
      const res = await fetch(apiUrl('/api/tesla/vehicles'), {
        headers: { Authorization: `Bearer ${tokenToUse}` },
      });
      const data = await res.json();
      if (res.ok) {
        const count = data?.response?.length ?? 0;
        setTestStatus('success');
        setTestMessage(`Success: ${count} vehicle(s) found`);
        await switchToMainPage(bridge);
        await fetchVehicles();
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
    const resolved = await resolveTeslaClientId();
    if (!resolved.ok) {
      setReAuthError(resolved.message);
      return;
    }
    const cid = resolved.clientId;
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
        <div style={{ display: 'flex', flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Button
              type="button"
              variant="primary"
              onClick={handleTestApi}
              disabled={testStatus === 'loading' || needsReauth}
              style={{ width: '100%' }}
            >
              {needsReauth
                ? 'Please Reauthorize'
                : testStatus === 'loading'
                  ? 'Testing…'
                  : 'Test API'}
            </Button>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Button
              type="button"
              variant="accent"
              onClick={startReAuth}
              style={{ width: '100%' }}
            >
              Re-authorize
            </Button>
          </div>
        </div>

        {virtualKeyAdded !== true && (
          <Text
            variant="subtitle"
            style={{ marginBottom: 12, display: 'block' }}
          >
            To add a virtual key, which is required, open{' '}
            <a
              href="https://www.tesla.com/_ak/even.thedevcave.xyz"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--color-tc-accent)', textDecoration: 'underline' }}
            >
              https://www.tesla.com/_ak/even.thedevcave.xyz
            </a>{' '}
            in a web browser on your phone with the Tesla app installed.
          </Text>
        )}

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

        <Text
          variant="title-1"
          style={{
            marginBottom: 8,
            display: 'block',
            textAlign: 'center',
          }}
        >
          {selectedVehicle
            ? `Selected: ${selectedVehicle.name} - ${selectedVehicle.model}`
            : 'No car selected'}
        </Text>

        {vehiclesLoading && (
          <Text variant="body-2" style={{ marginBottom: 8, opacity: 0.8 }}>
            Loading vehicles…
          </Text>
        )}
        {vehiclesError && (
          <Text
            variant="body-2"
            style={{
              marginBottom: 8,
              color: 'var(--color-tc-red)',
            }}
          >
            {vehiclesError}
          </Text>
        )}
        {vehicles && vehicles.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {vehicles.map((v) => (
              <div
                key={v.vin}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 8,
                  borderRadius: 8,
                  backgroundColor: 'var(--color-bc-1st)',
                }}
              >
                <Text variant="body-2">
                  {v.display_name} - {v.model ?? decodeModelFromVin(v.vin)}
                </Text>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => handleSelectVehicle(v)}
                  style={{ flexShrink: 0, marginLeft: 8 }}
                >
                  Select
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="primary"
              onClick={handleRefreshAndSendToGlasses}
              disabled={saveStatus === 'loading' || needsReauth}
              style={{ marginTop: 8 }}
            >
              {saveStatus === 'loading'
                ? 'Refreshing…'
                : saveStatus === 'success'
                  ? 'Saved'
                  : saveStatus === 'error'
                    ? 'Failed'
                    : 'Save'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
