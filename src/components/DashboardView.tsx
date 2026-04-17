/**
 * Dashboard view when a server Tesla session exists (session UUID on device).
 * Test API access, vehicle selection, and re-authorize options.
 */

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent, Button, Text } from '@jappyjan/even-realities-ui';
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { switchToMainPage } from '../glasses-app';
import { apiUrl } from '../api-base';
import { startTeslaAuthorizeRedirect } from '../tesla-authorize-redirect';
import {
  STORAGE_KEY_SESSION_ID,
  STORAGE_KEY_FLEET_REGION,
  STORAGE_KEY_FLEET_API_BASE,
  STORAGE_KEY_GLASSES_COMMAND_ORDER,
  STORAGE_KEY_DISPLAY_UNITS,
  STORAGE_KEY_GLASSES_COMMANDS_LIST_VISIBLE,
} from '../tesla-session-storage';
import { parseDisplayUnits, type DisplayUnits } from '../display-units';
import { CONTROL_ACTIONS } from '../controls-config';
import {
  parseStoredCommandOrderJson,
  serializeCommandOrder,
  getDefaultCommandOrderIds,
  WAKE_COMMAND_ID,
} from '../command-layout';
const VIRTUAL_KEY_ENROLL_URL = 'https://www.tesla.com/_ak/even.thedevcave.xyz';

const STORAGE_KEY_SELECTED_VEHICLE = 'tesla_selected_vehicle';

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

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
  const [commandOrderIds, setCommandOrderIds] = useState<string[]>(() => getDefaultCommandOrderIds());
  const [commandSaveStatus, setCommandSaveStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [glassesCommandsListVisible, setGlassesCommandsListVisible] = useState(true);
  const [displayUnits, setDisplayUnits] = useState<DisplayUnits>('imperial');
  const [unitsSaveStatus, setUnitsSaveStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const raw = await bridge.getLocalStorage(STORAGE_KEY_GLASSES_COMMAND_ORDER);
      if (cancelled) return;
      setCommandOrderIds(parseStoredCommandOrderJson(raw));
    })();
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const raw = await bridge.getLocalStorage(STORAGE_KEY_DISPLAY_UNITS);
      if (cancelled) return;
      setDisplayUnits(parseDisplayUnits(raw));
    })();
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const raw = await bridge.getLocalStorage(STORAGE_KEY_GLASSES_COMMANDS_LIST_VISIBLE);
      if (cancelled) return;
      const visible = raw !== '0' && raw !== 'false';
      setGlassesCommandsListVisible(visible);
    })();
    return () => {
      cancelled = true;
    };
  }, [bridge]);

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

  function actionForCommandId(id: string) {
    return CONTROL_ACTIONS.find((a) => a.id === id);
  }

  function moveCommandUp(index: number) {
    if (index <= 0) return;
    setCommandOrderIds((prev) => {
      const next = [...prev];
      const above = next[index - 1];
      const current = next[index];
      if (above === undefined || current === undefined) return prev;
      next[index - 1] = current;
      next[index] = above;
      return next;
    });
  }

  function moveCommandDown(index: number) {
    setCommandOrderIds((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      const current = next[index];
      const below = next[index + 1];
      if (current === undefined || below === undefined) return prev;
      next[index] = below;
      next[index + 1] = current;
      return next;
    });
  }

  function hideCommand(id: string) {
    if (id === WAKE_COMMAND_ID) return;
    setCommandOrderIds((prev) => prev.filter((x) => x !== id));
  }

  function showCommand(id: string) {
    setCommandOrderIds((prev) => {
      if (prev.includes(id)) return prev;
      return [...prev, id];
    });
  }

  async function handleSaveDisplayUnits() {
    if (needsReauth) return;
    setUnitsSaveStatus('loading');
    try {
      await bridge.setLocalStorage(STORAGE_KEY_DISPLAY_UNITS, displayUnits);
      await switchToMainPage(bridge);
      setUnitsSaveStatus('success');
      setTimeout(() => setUnitsSaveStatus('idle'), 2000);
    } catch {
      setUnitsSaveStatus('error');
      setTimeout(() => setUnitsSaveStatus('idle'), 2000);
    }
  }

  async function handleSaveCommandsToGlasses() {
    if (needsReauth) return;
    setCommandSaveStatus('loading');
    try {
      const payload = serializeCommandOrder(commandOrderIds);
      await bridge.setLocalStorage(STORAGE_KEY_GLASSES_COMMAND_ORDER, payload);
      await switchToMainPage(bridge);
      setCommandSaveStatus('success');
      setTimeout(() => setCommandSaveStatus('idle'), 2000);
    } catch {
      setCommandSaveStatus('error');
      setTimeout(() => setCommandSaveStatus('idle'), 2000);
    }
  }

  function handleRestoreDefaultCommands() {
    setCommandOrderIds(getDefaultCommandOrderIds());
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
    const started = await startTeslaAuthorizeRedirect();
    if (!started.ok) {
      setReAuthError(started.message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <Text variant="title-1">Tesla Controls</Text>
      </CardHeader>
      <CardContent style={{ minWidth: 0 }}>
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
          <div style={{ marginBottom: 12, minWidth: 0, maxWidth: '100%' }}>
            <Text
              variant="body-2"
              style={{
                marginBottom: 8,
                display: 'block',
                maxWidth: '100%',
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
              }}
            >
              To add a virtual key, which is required, open{' '}
              <span
                role="button"
                tabIndex={0}
                aria-label={`Copy ${VIRTUAL_KEY_ENROLL_URL} to clipboard`}
                onClick={() => void copyTextToClipboard(VIRTUAL_KEY_ENROLL_URL)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    void copyTextToClipboard(VIRTUAL_KEY_ENROLL_URL);
                  }
                }}
                style={{
                  color: 'var(--color-tc-accent)',
                  textDecoration: 'underline',
                  overflowWrap: 'anywhere',
                  wordBreak: 'break-word',
                  cursor: 'pointer',
                  display: 'inline',
                  verticalAlign: 'baseline',
                }}
              >
                {VIRTUAL_KEY_ENROLL_URL}
              </span>{' '}
              in a web browser on your phone with the Tesla app installed.  Tap it to copy.
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
                  ? 'Check Virtual Key'
                  : 'Check Virtual Key'}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
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

        <Text variant="title-1" style={{ marginBottom: 8, display: 'block' }}>
          Unit Preference
        </Text>
        <Text variant="body-2" style={{ marginBottom: 8, opacity: 0.85, display: 'block' }}>
          Distance and temperature on the glasses main view (miles/km, °F/°C).
        </Text>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginBottom: 12,
            padding: 10,
            borderRadius: 8,
            backgroundColor: 'var(--color-bc-1st)',
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="radio"
              name="tesla-display-units"
              checked={displayUnits === 'imperial'}
              onChange={() => setDisplayUnits('imperial')}
              disabled={needsReauth}
            />
            <Text variant="body-2">Imperial (mi, °F)</Text>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="radio"
              name="tesla-display-units"
              checked={displayUnits === 'metric'}
              onChange={() => setDisplayUnits('metric')}
              disabled={needsReauth}
            />
            <Text variant="body-2">Metric (km, °C)</Text>
          </label>
          <Button
            type="button"
            variant="primary"
            onClick={() => void handleSaveDisplayUnits()}
            disabled={unitsSaveStatus === 'loading' || needsReauth}
            style={{ marginTop: 4 }}
          >
            {unitsSaveStatus === 'loading'
              ? 'Saving…'
              : unitsSaveStatus === 'success'
                ? 'Saved'
                : unitsSaveStatus === 'error'
                  ? 'Failed'
                  : 'Save Unit Preference'}
          </Button>
        </div>

        <Text variant="title-1" style={{ marginBottom: 8, display: 'block' }}>
          Glasses Commands List
        </Text>
        <div style={{ marginBottom: 8 }}>
          <Text variant="body-2" style={{ opacity: 0.85, display: 'block', marginBottom: 6 }}>
            Choose which actions appear on the glasses list and their order. Wake stays available when the car is asleep and
            cannot be removed.
          </Text>
          <button
            type="button"
            onClick={() => {
              setGlassesCommandsListVisible((v) => {
                const next = !v;
                void bridge.setLocalStorage(
                  STORAGE_KEY_GLASSES_COMMANDS_LIST_VISIBLE,
                  next ? '1' : '0',
                );
                return next;
              });
            }}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: 'var(--color-tc-accent)',
              textDecoration: 'underline',
              font: 'inherit',
              textAlign: 'left',
            }}
          >
            {glassesCommandsListVisible ? '^ Hide Commands' : '> Show Commands'}
          </button>
        </div>
        {glassesCommandsListVisible && (
        <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {commandOrderIds.map((id, index) => {
            const action = actionForCommandId(id);
            if (!action) return null;
            const isWake = id === WAKE_COMMAND_ID;
            const rowBg =
              index % 2 === 0 ? 'var(--color-bc-1st)' : 'var(--color-bc-accent)';
            return (
              <div
                key={id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  gap: 10,
                  padding: 10,
                  borderRadius: 8,
                  backgroundColor: rowBg,
                }}
              >
                <Text variant="body-2" style={{ display: 'block', width: '100%' }}>
                  {action.glassesListLabel}
                  {isWake ? ' (always on)' : ''}
                </Text>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    alignItems: 'center',
                  }}
                >
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => moveCommandUp(index)}
                    disabled={index === 0 || needsReauth}
                    style={{ flex: '1 1 auto', minWidth: '4.5rem', padding: '8px 10px' }}
                  >
                    Up
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => moveCommandDown(index)}
                    disabled={index >= commandOrderIds.length - 1 || needsReauth}
                    style={{ flex: '1 1 auto', minWidth: '4.5rem', padding: '8px 10px' }}
                  >
                    Down
                  </Button>
                  <Button
                    type="button"
                    variant="accent"
                    onClick={() => hideCommand(id)}
                    disabled={isWake || needsReauth}
                    style={{ flex: '1 1 auto', minWidth: '4.5rem', padding: '8px 10px' }}
                  >
                    Hide
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        {CONTROL_ACTIONS.some((a) => !commandOrderIds.includes(a.id)) && (
          <div style={{ marginBottom: 12 }}>
            <Text variant="body-2" style={{ marginBottom: 6, display: 'block' }}>
              Hidden
            </Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {CONTROL_ACTIONS.filter((a) => !commandOrderIds.includes(a.id)).map((a, hiddenIndex) => {
                const rowBg =
                  hiddenIndex % 2 === 0 ? 'var(--color-bc-accent)' : 'var(--color-bc-1st)';
                return (
                  <div
                    key={a.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      padding: 10,
                      borderRadius: 8,
                      backgroundColor: rowBg,
                    }}
                  >
                    <Text variant="body-2" style={{ flex: '1 1 auto', minWidth: 0 }}>
                      {a.glassesListLabel}
                    </Text>
                    <Button
                      type="button"
                      variant="primary"
                      onClick={() => showCommand(a.id)}
                      disabled={needsReauth}
                      style={{ flexShrink: 0, padding: '8px 10px' }}
                    >
                      Show
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        </>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          <Button
            type="button"
            variant="primary"
            onClick={() => void handleSaveCommandsToGlasses()}
            disabled={commandSaveStatus === 'loading' || needsReauth}
            style={{ width: '100%' }}
          >
            {commandSaveStatus === 'loading'
              ? 'Saving…'
              : commandSaveStatus === 'success'
                ? 'Saved to glasses'
                : commandSaveStatus === 'error'
                  ? 'Save failed'
                  : 'Save Commands'}
          </Button>
          <Button
            type="button"
            variant="accent"
            onClick={handleRestoreDefaultCommands}
            disabled={needsReauth}
            style={{ width: '100%' }}
          >
            Restore Default Commands
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
