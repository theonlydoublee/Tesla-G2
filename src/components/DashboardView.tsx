/**
 * Dashboard view when a server Tesla session exists (session UUID on device).
 * Test API access, vehicle selection, and re-authorize options.
 */

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent, Button, Text } from '@jappyjan/even-realities-ui';
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { switchToMainPage } from '../glasses-app';
import { apiUrl } from '../api-base';
import { resolveTeslaClientId } from '../tesla-client-id';
import {
  STORAGE_KEY_SESSION_ID,
  STORAGE_KEY_FLEET_REGION,
  STORAGE_KEY_FLEET_API_BASE,
} from '../tesla-session-storage';
import { getTeslaRedirectUri } from '../tesla-redirect-uri';
const SCOPES = 'openid offline_access vehicle_device_data vehicle_cmds';
const AUTH_URL = 'https://auth.tesla.com/oauth2/v3/authorize';

const STORAGE_KEY_SELECTED_VEHICLE = 'tesla_selected_vehicle';

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
  sessionId: string;
  needsReauth?: boolean;
  onSessionInvalid?: () => void;
}

function generateState(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (x) => chars[x % chars.length]).join('');
}

export function DashboardView({
  bridge,
  sessionId,
  needsReauth,
  onSessionInvalid,
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
  const [virtualKeyCheckLoading, setVirtualKeyCheckLoading] = useState(false);

  function authHeader(): string {
    return `Bearer ${sessionId}`;
  }

  function noteUnauthorized(res: Response) {
    if (res.status === 401) onSessionInvalid?.();
  }

  async function fetchVehicles() {
    if (needsReauth || !sessionId) return;
    setVehiclesLoading(true);
    setVehiclesError(null);
    try {
      const res = await fetch(apiUrl('/api/tesla/vehicles'), {
        headers: { Authorization: authHeader() },
      });
      noteUnauthorized(res);
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
    if (!sessionId || needsReauth) return;
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
      setVehiclesLoading(true);
      setVehiclesError(null);
      try {
        const res = await fetch(apiUrl('/api/tesla/vehicles'), {
          headers: { Authorization: authHeader() },
        });
        noteUnauthorized(res);
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
  }, [sessionId, needsReauth, bridge]);

  useEffect(() => {
    setVirtualKeyAdded(null);
  }, [selectedVehicle?.id, selectedVehicle?.vin]);

  async function checkVirtualKeyNow() {
    if (!selectedVehicle || needsReauth || !sessionId) return;
    setVirtualKeyCheckLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedVehicle.id != null) params.set('vehicleId', String(selectedVehicle.id));
      if (selectedVehicle.vin) params.set('vin', selectedVehicle.vin);
      const res = await fetch(apiUrl(`/api/tesla/check-virtual-key?${params}`), {
        headers: { Authorization: authHeader() },
      });
      noteUnauthorized(res);
      const data = await res.json();
      setVirtualKeyAdded(data.virtualKeyAdded === true);
    } catch {
      setVirtualKeyAdded(false);
    } finally {
      setVirtualKeyCheckLoading(false);
    }
  }

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
    if (needsReauth || !sessionId) return;
    setTestStatus('loading');
    setTestMessage('');
    try {
      const res = await fetch(apiUrl('/api/tesla/vehicles'), {
        headers: { Authorization: authHeader() },
      });
      noteUnauthorized(res);
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
      await fetch(apiUrl('/api/tesla/session'), {
        method: 'DELETE',
        headers: { Authorization: authHeader() },
      });
    } catch {
      // ignore network errors; still clear local session
    }
    try {
      await bridge.setLocalStorage(STORAGE_KEY_SESSION_ID, '');
    } catch {
      // ignore
    }
    try {
      await bridge.setLocalStorage(STORAGE_KEY_FLEET_REGION, '');
      await bridge.setLocalStorage(STORAGE_KEY_FLEET_API_BASE, '');
    } catch {
      // ignore
    }
    try {
      await bridge.setLocalStorage('tesla_access_token', '');
      await bridge.setLocalStorage('tesla_refresh_token', '');
      await bridge.setLocalStorage('tesla_token_refreshed_at', '');
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
      redirect_uri: getTeslaRedirectUri(),
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

        {virtualKeyAdded !== true && selectedVehicle && (
          <div style={{ marginBottom: 12 }}>
            <Text variant="subtitle" style={{ marginBottom: 8, display: 'block' }}>
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
            <Button
              type="button"
              variant="accent"
              onClick={() => void checkVirtualKeyNow()}
              disabled={virtualKeyCheckLoading || needsReauth}
              style={{ width: '100%' }}
            >
              {virtualKeyCheckLoading
                ? 'Checking…'
                : virtualKeyAdded === false
                  ? 'Check virtual key again'
                  : 'Check virtual key status'}
            </Button>
          </div>
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
