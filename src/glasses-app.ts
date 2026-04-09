/**
 * Tesla – G2 glasses logic (vanilla TS).
 * Page builders, event handlers, startup. No React.
 */

import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import {
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerProperty,
  ListContainerProperty,
  ListItemContainerProperty,
  StartUpPageCreateResult,
  readNumber,
  readString,
} from '@evenrealities/even_hub_sdk';

import { apiUrl } from './api-base';
import { STORAGE_KEY_SESSION_ID, STORAGE_KEY_DISPLAY_UNITS } from './tesla-session-storage';
import { parseDisplayUnits } from './display-units';
import { readVisibleControlActions } from './command-layout';
import {
  setupGlassesEventHandler,
  isClickEvent,
} from './utils/events';
import {
  buildTextContentFromVehicleData,
  buildVehicleAsleepMainText,
  type TeslaVehicleDataResponse,
} from './pages/main';
import {
  CONTROL_ACTIONS,
  type ControlAction,
  buildConfirmListItemNames,
  buildGlassesListItemNames,
  sendingStatusLabelForAction,
} from './controls-config';

export type PageType = 'main' | 'controls' | 'climate' | 'charging';

// Container IDs/names (stable across pages)
const STATUS_TEXT_ID = 1;
const STATUS_TEXT_NAME = 'status';

/** Page types: main menu or themed sub-pages */
export const PAGE_MAIN: PageType = 'main';

// G2 canvas dimensions
const CANVAS_WIDTH = 576;
const CANVAS_HEIGHT = 288;

/** Main page: command list (single event capture). */
const CMD_LIST_ID = 1;
const CMD_LIST_NAME = 'tesla-cmd-list';

/** Main page: vehicle status text (right pane). */
const MAIN_TEXT_ID = 2;
const MAIN_TEXT_NAME = 'main-text';

/**
 * Confirm step: own container id/name (never reuse main CMD/MAIN ids).
 * Name ≤16 chars per Display guide.
 */
const CONFIRM_LIST_ID = 21;
const CONFIRM_LIST_NAME = 'tesla-cfm-lst';

/** Centered list; full canvas height (no header text). */
const CONFIRM_LIST_WIDTH = 256;
const CONFIRM_LIST_HEIGHT = 175;

/** Row 0 absorbs host quirk (empty index/name); no-op. Rows 1–2 are Confirm / Cancel. */
const CONFIRM_ROW_PROMPT = 0;
const CONFIRM_ROW_CONFIRM = 1;
const CONFIRM_ROW_CANCEL = 2;

/** One-row UI while returning from confirm (avoids stale index 2 → main list row 2 / Frunk). */
const CONFIRM_CANCELING_LABEL = 'Canceling';

/** One-row UI before real confirm (avoids stale main tap index → Confirm/Cancel row). */
const CONFIRM_LOADING_LABEL = 'Loading...';

/** createStartUpPageContainer / rebuildPageContainer text limit per Even docs */
const MAX_TEXT_CHARS_CREATE = 1000;

function clipTextForCreatePage(s: string): string {
  if (s.length <= MAX_TEXT_CHARS_CREATE) return s;
  return `${s.slice(0, MAX_TEXT_CHARS_CREATE - 2)}\n…`;
}

/** Tesla vehicle_data often lags charge/climate/door lock for a second or two after a successful command. */
const TOGGLE_STATE_REFRESH_DELAY_MS = 2500;

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const WAKE_POLL_MAX_ATTEMPTS = 35;
const WAKE_POLL_INTERVAL_MS = 2000;

async function getSelectedVehicleDisplayName(bridge: EvenAppBridge): Promise<string> {
  const stored = await bridge.getLocalStorage(STORAGE_KEY_SELECTED_VEHICLE);
  if (!stored?.trim()) return 'Vehicle';
  try {
    const parsed = JSON.parse(stored) as { name?: string };
    const n = parsed?.name?.trim();
    return n && n.length > 0 ? n : 'Vehicle';
  } catch {
    return 'Vehicle';
  }
}

function teslaResponseSuggestsVehicleAsleep(status: number, data: unknown): boolean {
  if (status === 408) return true;
  if (!data || typeof data !== 'object') return false;
  const o = data as Record<string, unknown>;
  const err = String(o.error ?? '').toLowerCase();
  const desc = String(o.error_description ?? '').toLowerCase();
  const reason = String(o.reason ?? '').toLowerCase();
  const s = `${err} ${desc} ${reason}`;
  return (
    s.includes('asleep') ||
    s.includes('offline') ||
    (s.includes('vehicle') && s.includes('unavailable')) ||
    s.includes('could not wake')
  );
}

/**
 * True when vehicle_data already returns live data (main page would load normally).
 * In that case Wake should not call wake_up — same UX (confirm → sending → main) but only refresh.
 */
async function vehicleAlreadyAwakeForWake(auth: string, vin: string): Promise<boolean> {
  try {
    const res = await fetch(apiUrl(`/api/tesla/vehicle_data/${vin}`), {
      headers: { Authorization: auth },
    });
    if (!res.ok) return false;
    let data: unknown = {};
    try {
      data = await res.json();
    } catch {
      return false;
    }
    const vehicle = (data as { response?: unknown })?.response ?? data;
    if (!vehicle || typeof vehicle !== 'object') return false;
    const v = vehicle as Record<string, unknown>;
    return v.charge_state != null || v.climate_state != null || v.vehicle_state != null;
  } catch {
    return false;
  }
}

/** Poll vehicle_data until HTTP OK (car responded after wake). */
async function pollVehicleDataUntilAwake(auth: string, vin: string): Promise<void> {
  for (let attempt = 0; attempt < WAKE_POLL_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await delayMs(WAKE_POLL_INTERVAL_MS);
    }
    try {
      const res = await fetch(apiUrl(`/api/tesla/vehicle_data/${vin}`), {
        headers: { Authorization: auth },
      });
      if (res.ok) {
        return;
      }
    } catch {
      // retry
    }
  }
  console.warn('[Tesla] vehicle_data did not succeed after wake within expected time');
}

const STORAGE_KEY_SELECTED_VEHICLE = 'tesla_selected_vehicle';

/**
 * Cached right-pane status text for glasses main page. Written by refreshMainPageTextFromTesla
 * (startup and after charge/climate/lock/unlock commands). Rebuilds use getCachedMainPageText — no network.
 * If the user changes the selected vehicle on the phone, text may stay stale until the glasses app starts again.
 */
const STORAGE_KEY_GLASSES_MAIN_TEXT_CACHE = 'tesla_glasses_main_text_cache';
/** Charge/climate booleans from last successful vehicle_data (confirm labels + toggle without re-fetch). */
const STORAGE_KEY_GLASSES_VEHICLE_SNAPSHOT = 'tesla_glasses_vehicle_snapshot';

type GlassesVehicleSnapshot = { chargingActive: boolean; climateOn: boolean };

function vehicleSnapshotFromVehicleData(vehicleData: unknown): GlassesVehicleSnapshot {
  const v =
    vehicleData && typeof vehicleData === 'object'
      ? (vehicleData as Record<string, unknown>)
      : {};
  const chargeState = v.charge_state as { charging_state?: string } | undefined;
  const climateState = v.climate_state as { is_climate_on?: boolean } | undefined;
  const chargingActive =
    chargeState?.charging_state === 'Charging' || chargeState?.charging_state === 'Starting';
  const climateOn = climateState?.is_climate_on === true;
  return { chargingActive, climateOn };
}

async function persistVehicleSnapshot(bridge: EvenAppBridge, vehicleData: unknown): Promise<void> {
  const snap = vehicleSnapshotFromVehicleData(vehicleData);
  await bridge.setLocalStorage(STORAGE_KEY_GLASSES_VEHICLE_SNAPSHOT, JSON.stringify(snap));
}

async function clearVehicleSnapshot(bridge: EvenAppBridge): Promise<void> {
  try {
    await bridge.setLocalStorage(STORAGE_KEY_GLASSES_VEHICLE_SNAPSHOT, '');
  } catch {
    // ignore
  }
}

async function readVehicleSnapshot(bridge: EvenAppBridge): Promise<GlassesVehicleSnapshot | null> {
  const raw = await bridge.getLocalStorage(STORAGE_KEY_GLASSES_VEHICLE_SNAPSHOT);
  if (!raw?.trim()) return null;
  try {
    const o = JSON.parse(raw) as Partial<GlassesVehicleSnapshot>;
    if (typeof o.chargingActive !== 'boolean' || typeof o.climateOn !== 'boolean') return null;
    return { chargingActive: o.chargingActive, climateOn: o.climateOn };
  } catch {
    return null;
  }
}

const FALLBACK_TEXT = 'Vehicle data unavailable';

/** Matches the last-built main command list (for row resolution; bridge localStorage is async). */
let mainListVisibleActionsCache: ControlAction[] = [...CONTROL_ACTIONS];

type GlassesMainUiMode =
  | { type: 'main' }
  /** One-row "Loading..." while fetching toggle labels; absorbs duplicate main-list indices. */
  | { type: 'confirm_loading'; action: ControlAction }
  | { type: 'confirm'; action: ControlAction; firstRowLabel: string }
  | { type: 'confirm_sending'; sendingLabel: string }
  /** Dismissing confirm: blocks duplicate list events (Cancel row index === main-list frunk index, etc.). */
  | { type: 'confirm_canceling' };

let glassesMainUiMode: GlassesMainUiMode = { type: 'main' };

/**
 * Double-tap calls `shutDownPageContainer(1)`, which tears down the glasses UI. `rebuildPageContainer`
 * cannot recreate it — only `createStartUpPageContainer` (see `startGlassesApp`). App-switch typically
 * only backgrounds the plugin, so the container stays alive and rebuild works.
 */
let glassesMainContainerNeedsColdStart = false;

/** Survives WebView reload so reopen after double-tap still cold-starts (in-memory flag resets on remount). */
const STORAGE_KEY_GLASSES_PAGE_SHUT_DOWN = 'tesla_glasses_page_shut_down';

/** Avoid concurrent `createStartUpPageContainer` — native side can hang if two starts overlap. */
let startGlassesAppMutex: Promise<void> | null = null;

function markGlassesPageShutDown(): void {
  glassesMainContainerNeedsColdStart = true;
  try {
    sessionStorage.setItem(STORAGE_KEY_GLASSES_PAGE_SHUT_DOWN, '1');
  } catch {
    // private mode / unavailable
  }
}

function clearGlassesPageShutDown(): void {
  glassesMainContainerNeedsColdStart = false;
  try {
    sessionStorage.removeItem(STORAGE_KEY_GLASSES_PAGE_SHUT_DOWN);
  } catch {
    // ignore
  }
}

function shouldColdStartGlassesFromStorage(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY_GLASSES_PAGE_SHUT_DOWN) === '1';
  } catch {
    return false;
  }
}

/** Prior subscription from setupGlassesEventHandler — must clear before adding another (Hub stacks callbacks). */
let glassesHubUnsubscribe: (() => void) | null = null;

function resetGlassesMainUiMode(): void {
  glassesMainUiMode = { type: 'main' };
}

async function getAuthAndVin(bridge: EvenAppBridge): Promise<{ auth: string; vin: string } | null> {
  const sessionId = await bridge.getLocalStorage(STORAGE_KEY_SESSION_ID);
  if (!sessionId?.trim()) return null;
  const stored = await bridge.getLocalStorage(STORAGE_KEY_SELECTED_VEHICLE);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as { vin?: string };
    if (!parsed?.vin) return null;
    return { auth: `Bearer ${sessionId.trim()}`, vin: parsed.vin };
  } catch {
    return null;
  }
}

async function fetchVehicleDataPayload(
  bridge: EvenAppBridge,
): Promise<{ charge_state?: unknown; climate_state?: unknown } | null> {
  const ctx = await getAuthAndVin(bridge);
  if (!ctx) return null;
  try {
    const vRes = await fetch(apiUrl(`/api/tesla/vehicle_data/${ctx.vin}`), {
      headers: { Authorization: ctx.auth },
    });
    const vData = await vRes.json();
    if (!vRes.ok) return null;
    const vehicle = vData?.response ?? vData;
    return {
      charge_state: vehicle?.charge_state,
      climate_state: vehicle?.climate_state,
    };
  } catch {
    return null;
  }
}

async function firstRowLabelForToggleAction(
  bridge: EvenAppBridge,
  action: ControlAction,
): Promise<string | null> {
  const snap = await readVehicleSnapshot(bridge);
  if (snap) {
    if (action.id === 'charge') {
      return snap.chargingActive ? 'Stop Charging:' : 'Start Charging:';
    }
    if (action.id === 'climate') {
      return snap.climateOn ? 'Turn Off Climate:' : 'Turn On Climate:';
    }
  }
  const payload = await fetchVehicleDataPayload(bridge);
  if (!payload) return null;
  if (action.id === 'charge') {
    const chargeState = payload.charge_state as { charging_state?: string } | undefined;
    const charging =
      chargeState?.charging_state === 'Charging' || chargeState?.charging_state === 'Starting';
    return charging ? 'Stop Charging:' : 'Start Charging:';
  }
  if (action.id === 'climate') {
    const climateState = payload.climate_state as { is_climate_on?: boolean } | undefined;
    const on = climateState?.is_climate_on === true;
    return on ? 'Turn Off Climate:' : 'Turn On Climate:';
  }
  return null;
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

/** Persist status text + vehicle snapshot; return text (startup and after charge/climate/lock/unlock refreshes). */
async function refreshMainPageTextFromTesla(bridge: EvenAppBridge): Promise<string> {
  async function finalize(text: string): Promise<string> {
    await bridge.setLocalStorage(STORAGE_KEY_GLASSES_MAIN_TEXT_CACHE, text);
    return text;
  }

  const sessionId = await bridge.getLocalStorage(STORAGE_KEY_SESSION_ID);
  if (!sessionId?.trim()) {
    await clearVehicleSnapshot(bridge);
    return finalize(FALLBACK_TEXT);
  }
  const auth = `Bearer ${sessionId.trim()}`;

  let vin: string | null = null;
  let storedDisplayName: string | null = null;
  const stored = await bridge.getLocalStorage(STORAGE_KEY_SELECTED_VEHICLE);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as { vin?: string; name?: string };
      if (parsed?.vin) vin = parsed.vin;
      if (parsed?.name) storedDisplayName = parsed.name;
    } catch {
      // ignore invalid stored data
    }
  }

  if (!vin) {
    try {
      const res = await fetch(apiUrl('/api/tesla/vehicles'), {
        headers: { Authorization: auth },
      });
      const data = await res.json();
      const list = (data?.response ?? []) as Array<{ id?: number; vin?: string; display_name?: string }>;
      const first = list.find((v) => v?.vin);
      if (first?.vin) {
        vin = first.vin;
        storedDisplayName = first.display_name ?? null;
        await bridge.setLocalStorage(STORAGE_KEY_SELECTED_VEHICLE, JSON.stringify({
          id: first.id,
          vin: first.vin,
          name: first.display_name ?? 'Unnamed',
          model: decodeModelFromVin(first.vin),
        }));
      }
    } catch {
      await clearVehicleSnapshot(bridge);
      return finalize(FALLBACK_TEXT);
    }
  }

  if (!vin) {
    await clearVehicleSnapshot(bridge);
    return finalize(FALLBACK_TEXT);
  }

  try {
    const res = await fetch(apiUrl(`/api/tesla/vehicle_data/${vin}`), {
      headers: { Authorization: auth },
    });
    let data: unknown = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    if (!res.ok) {
      await clearVehicleSnapshot(bridge);
      if (teslaResponseSuggestsVehicleAsleep(res.status, data)) {
        return finalize(buildVehicleAsleepMainText());
      }
      return finalize(FALLBACK_TEXT);
    }
    const vehicleData = ((data as { response?: unknown })?.response ?? data) as TeslaVehicleDataResponse;
    await persistVehicleSnapshot(bridge, vehicleData);
    const unitsRaw = await bridge.getLocalStorage(STORAGE_KEY_DISPLAY_UNITS);
    const units = parseDisplayUnits(unitsRaw);
    return finalize(buildTextContentFromVehicleData(vehicleData, storedDisplayName, units));
  } catch {
    await clearVehicleSnapshot(bridge);
    return finalize(FALLBACK_TEXT);
  }
}

/** Read cached main-pane text; no API (used for rebuilds). */
async function getCachedMainPageText(bridge: EvenAppBridge): Promise<string> {
  const cached = await bridge.getLocalStorage(STORAGE_KEY_GLASSES_MAIN_TEXT_CACHE);
  if (cached != null && String(cached).trim() !== '') {
    return String(cached);
  }
  return FALLBACK_TEXT;
}

/**
 * Main page: list (left third, event capture) + vehicle text (right two-thirds).
 * @see https://hub.evenrealities.com/docs/guides/display
 */
function buildContainerMainPageConfig(textContent: string, visibleActions: ControlAction[]) {
  const clipped = clipTextForCreatePage(textContent);
  const itemNames = buildGlassesListItemNames(visibleActions);

  const listContainer = new ListContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 192,
    height: 288,
    borderWidth: 2,
    borderColor: 5,
    borderRadius: 6,
    paddingLength: 7,
    containerID: CMD_LIST_ID,
    containerName: CMD_LIST_NAME,
    isEventCapture: 1,
    itemContainer: new ListItemContainerProperty({
      itemCount: visibleActions.length,
      itemName: itemNames,
    }),
  });

  const textContainer = new TextContainerProperty({
    xPosition: 242,
    yPosition: 0,
    width: 334,
    height: 288,
    borderWidth: 0,
    borderColor: 5,
    borderRadius: 6,
    paddingLength: 12,
    containerID: MAIN_TEXT_ID,
    containerName: MAIN_TEXT_NAME,
    content: clipped,
    isEventCapture: 0,
  });

  return {
    containerTotalNum: 2,
    listObject: [listContainer],
    textObject: [textContainer],
  };
}

/**
 * Confirm UI: single centered list (per-action prompt row + Confirm / Cancel).
 * @see https://hub.evenrealities.com/docs/guides/display
 */
function buildConfirmPageConfig(action: ControlAction, firstRowLabel: string) {
  const confirmNames = buildConfirmListItemNames(action, firstRowLabel);
  const listX = Math.floor((CANVAS_WIDTH - CONFIRM_LIST_WIDTH) / 2);
  const listY = Math.floor((CANVAS_HEIGHT - CONFIRM_LIST_HEIGHT) / 2);

  const listContainer = new ListContainerProperty({
    xPosition: listX,
    yPosition: listY,
    width: CONFIRM_LIST_WIDTH,
    height: CONFIRM_LIST_HEIGHT,
    borderWidth: 2,
    borderColor: 5,
    borderRadius: 6,
    paddingLength: 7,
    containerID: CONFIRM_LIST_ID,
    containerName: CONFIRM_LIST_NAME,
    isEventCapture: 1,
    itemContainer: new ListItemContainerProperty({
      itemCount: confirmNames.length,
      itemName: confirmNames,
    }),
  });

  return {
    containerTotalNum: 1,
    listObject: [listContainer],
  };
}

/** After Confirm: single-row list so user sees progress and cannot tap Confirm/Cancel again. */
function buildConfirmSendingPageConfig(sendingLabel: string) {
  const listX = Math.floor((CANVAS_WIDTH - CONFIRM_LIST_WIDTH) / 2);
  const listY = Math.floor((CANVAS_HEIGHT - CONFIRM_LIST_HEIGHT) / 2);
  const listContainer = new ListContainerProperty({
    xPosition: listX,
    yPosition: listY,
    width: CONFIRM_LIST_WIDTH,
    height: CONFIRM_LIST_HEIGHT,
    borderWidth: 2,
    borderColor: 5,
    borderRadius: 6,
    paddingLength: 7,
    containerID: CONFIRM_LIST_ID,
    containerName: CONFIRM_LIST_NAME,
    isEventCapture: 1,
    itemContainer: new ListItemContainerProperty({
      itemCount: 1,
      itemName: [sendingLabel],
    }),
  });

  return {
    containerTotalNum: 1,
    listObject: [listContainer],
  };
}

/**
 * Map listEvent to row index for main command list.
 * G2 quirk: host may omit index/name for row 0 — defaultToFirstRowOnEmpty maps empty to row 0 (first row).
 */
function resolveMainListRowIndex(
  listEvent: object,
  mainListItemNames: string[],
  options: { defaultToFirstRowOnEmpty?: boolean } = {},
): number | null {
  const names = mainListItemNames;
  const n = names.length;

  const idx = readNumber(
    listEvent,
    'currentSelectItemIndex',
    'CurrentSelect_ItemIndex',
  );
  if (idx !== undefined && Number.isInteger(idx) && idx >= 0 && idx < n) {
    return idx;
  }

  const nameRaw = readString(
    listEvent,
    'currentSelectItemName',
    'CurrentSelect_ItemName',
  );
  const nameTrimmed = nameRaw != null ? String(nameRaw).trim() : '';
  const hasName = nameTrimmed.length > 0;

  if (hasName) {
    const i = names.indexOf(nameTrimmed);
    if (i >= 0) return i;
    return null;
  }

  if (options.defaultToFirstRowOnEmpty) {
    return 0;
  }
  return null;
}

/**
 * Confirm list: row 0 is a no-op prompt; empty index/name from the host maps to row 0 (G2 quirk)
 * so spurious events do not trigger Confirm. Rows 1–2 are Confirm / Cancel.
 */
function resolveConfirmListRowIndex(
  listEvent: object,
  action: ControlAction,
  firstRowLabel: string,
): number | null {
  const names = buildConfirmListItemNames(action, firstRowLabel);
  const n = names.length;

  const idx = readNumber(
    listEvent,
    'currentSelectItemIndex',
    'CurrentSelect_ItemIndex',
  );
  if (idx !== undefined && Number.isInteger(idx) && idx >= 0 && idx < n) {
    return idx;
  }

  const nameRaw = readString(
    listEvent,
    'currentSelectItemName',
    'CurrentSelect_ItemName',
  );
  const nameTrimmed = nameRaw != null ? String(nameRaw).trim() : '';
  const hasName = nameTrimmed.length > 0;

  if (hasName) {
    const i = names.indexOf(nameTrimmed);
    if (i >= 0) return i;
    return null;
  }

  return CONFIRM_ROW_PROMPT;
}

export async function buildContainerRebuildPage(
  bridge: EvenAppBridge,
  textContent: string,
): Promise<RebuildPageContainer> {
  const visible = await readVisibleControlActions(bridge);
  mainListVisibleActionsCache = visible;
  return new RebuildPageContainer(buildContainerMainPageConfig(textContent, visible));
}

/**
 * Execute Tesla command for the given control action.
 */
async function executeControlCommand(bridge: EvenAppBridge, action: ControlAction): Promise<void> {
  const sessionId = await bridge.getLocalStorage(STORAGE_KEY_SESSION_ID);
  const stored = await bridge.getLocalStorage(STORAGE_KEY_SELECTED_VEHICLE);
  if (!sessionId?.trim() || !stored) return;
  const auth = `Bearer ${sessionId.trim()}`;

  let vehicleId: string | number | null = null;
  let vin: string | null = null;
  try {
    const parsed = JSON.parse(stored) as { id?: number; vin?: string };
    vehicleId = parsed?.id ?? null;
    vin = parsed?.vin ?? null;
  } catch {
    return;
  }

  if (vehicleId == null && vin) {
    const res = await fetch(apiUrl('/api/tesla/vehicles'), {
      headers: { Authorization: auth },
    });
    const data = await res.json();
    const list = (data?.response ?? []) as Array<{ id?: number; vin?: string }>;
    const v = list.find((x) => x?.vin === vin);
    if (v?.id != null) {
      vehicleId = v.id;
      try {
        const p = JSON.parse(stored) as Record<string, unknown>;
        await bridge.setLocalStorage(STORAGE_KEY_SELECTED_VEHICLE, JSON.stringify({ ...p, id: v.id }));
      } catch {
        // ignore
      }
    }
  }

  if (vehicleId == null) {
    console.warn('[Tesla] Command skipped: no vehicle id (select a vehicle on the phone and Save).');
    await refreshGlassesMainPageUi(bridge);
    return;
  }

  const refreshTextAfterCommand =
    action.id === 'wake' ||
    action.id === 'charge' ||
    action.id === 'climate' ||
    action.id === 'lock' ||
    action.id === 'unlock';

  let command = action.command;
  let body = action.body;

  if (action.id === 'charge') {
    const snapCharge = await readVehicleSnapshot(bridge);
    if (snapCharge) {
      command = snapCharge.chargingActive ? 'charge_stop' : 'charge_start';
      body = undefined;
    } else {
      try {
        const vRes = await fetch(apiUrl(`/api/tesla/vehicle_data/${vin}`), {
          headers: { Authorization: auth },
        });
        const vData = await vRes.json();
        const chargeState = vData?.response?.charge_state ?? vData?.charge_state;
        const charging =
          chargeState?.charging_state === 'Charging' || chargeState?.charging_state === 'Starting';
        command = charging ? 'charge_stop' : 'charge_start';
        body = undefined;
      } catch (err) {
        console.warn('[Tesla] Charge state fetch failed:', err);
        await refreshGlassesMainPageUi(bridge);
        return;
      }
    }
  }

  if (action.id === 'climate') {
    const snapClimate = await readVehicleSnapshot(bridge);
    if (snapClimate) {
      command = snapClimate.climateOn ? 'auto_conditioning_stop' : 'auto_conditioning_start';
      body = undefined;
    } else {
      try {
        const vRes = await fetch(apiUrl(`/api/tesla/vehicle_data/${vin}`), {
          headers: { Authorization: auth },
        });
        const vData = await vRes.json();
        const climateState = vData?.response?.climate_state ?? vData?.climate_state;
        const on = climateState?.is_climate_on === true;
        command = on ? 'auto_conditioning_stop' : 'auto_conditioning_start';
        body = undefined;
      } catch (err) {
        console.warn('[Tesla] Climate state fetch failed:', err);
        await refreshGlassesMainPageUi(bridge);
        return;
      }
    }
  }

  let toggleCommandSucceeded = false;
  try {
    if (action.id === 'wake' && vin) {
      const alreadyAwake = await vehicleAlreadyAwakeForWake(auth, vin);
      if (alreadyAwake) {
        toggleCommandSucceeded = true;
      } else {
        const reqBody = vin ? { vin } : undefined;
        const res = await fetch(apiUrl(`/api/tesla/command/${vehicleId}/${command}`), {
          method: 'POST',
          headers: {
            Authorization: auth,
            'Content-Type': 'application/json',
          },
          body: reqBody ? JSON.stringify(reqBody) : undefined,
        });
        toggleCommandSucceeded = res.ok;
        if (!res.ok) {
          console.warn('[Tesla] Command HTTP error:', command, res.status);
        } else {
          await pollVehicleDataUntilAwake(auth, vin);
        }
      }
    } else {
      const reqBody = body ? { ...body, vin } : vin ? { vin } : undefined;
      const res = await fetch(apiUrl(`/api/tesla/command/${vehicleId}/${command}`), {
        method: 'POST',
        headers: {
          Authorization: auth,
          'Content-Type': 'application/json',
        },
        body: reqBody ? JSON.stringify(reqBody) : undefined,
      });
      toggleCommandSucceeded = res.ok;
      if (!res.ok) {
        console.warn('[Tesla] Command HTTP error:', command, res.status);
      }
    }
  } catch (err) {
    console.warn('[Tesla] Command failed:', command, err);
  } finally {
    const needsVehicleStateSettleDelay =
      toggleCommandSucceeded &&
      (action.id === 'charge' ||
        action.id === 'climate' ||
        action.id === 'lock' ||
        action.id === 'unlock');
    if (refreshTextAfterCommand) {
      if (needsVehicleStateSettleDelay) {
        await delayMs(TOGGLE_STATE_REFRESH_DELAY_MS);
      }
      await refreshMainPageTextFromTesla(bridge);
    }
    await refreshGlassesMainPageUi(bridge);
  }
}

/**
 * Rebuild main command UI from last-written main text cache (resets to main layout).
 * Callers that need live drive/locked/battery lines must run refreshMainPageTextFromTesla first
 * (or await startGlassesApp while it is in flight).
 * @returns whether the host reported rebuild success (false if no active page container).
 */
async function refreshGlassesMainPageUi(bridge: EvenAppBridge): Promise<boolean> {
  resetGlassesMainUiMode();
  const textContent = await getCachedMainPageText(bridge);
  try {
    const container = await buildContainerRebuildPage(bridge, textContent);
    return await bridge.rebuildPageContainer(container);
  } catch (err) {
    console.warn('[Tesla] rebuildPageContainer failed:', err);
    return false;
  }
}

/**
 * Confirm uses rebuildPageContainer only. createStartUpPageContainer is for app launch and is
 * much slower on hardware; rebuild matches Cancel/Confirm return path and feels instant.
 */
async function showConfirmForAction(bridge: EvenAppBridge, action: ControlAction): Promise<void> {
  let firstRowLabel = action.confirmPromptLabel?.trim() || 'Action:';

  if (action.id === 'charge' || action.id === 'climate') {
    const toggled = await firstRowLabelForToggleAction(bridge, action);
    if (toggled == null) {
      console.warn('[Tesla] Could not load vehicle state for confirm sheet.');
      await refreshMainPageTextFromTesla(bridge);
      await refreshGlassesMainPageUi(bridge);
      return;
    }
    firstRowLabel = toggled;
  }

  glassesMainUiMode = { type: 'confirm', action, firstRowLabel };
  await bridge.rebuildPageContainer(
    new RebuildPageContainer(buildConfirmPageConfig(action, firstRowLabel)),
  );
}

/**
 * Input & Events: list capture → listEvent; lifecycle → sysEvent.
 * @see https://hub.evenrealities.com/docs/guides/input-events
 */
function attachMainPageGlassesHandlers(bridge: EvenAppBridge): void {
  glassesHubUnsubscribe?.();
  glassesHubUnsubscribe = setupGlassesEventHandler(bridge, {
    // Double-tap exit disabled (no longer needed). Re-enable by restoring the handler body below.
    onDoubleClick: () => {
      // Previous behavior (preserved for reference):
      // bridge.shutDownPageContainer(1);
      // markGlassesPageShutDown();
    },
    onForegroundEnter: () => {
      if (glassesMainContainerNeedsColdStart || shouldColdStartGlassesFromStorage()) {
        queueMicrotask(() => {
          void startGlassesApp(bridge);
        });
        return;
      }
      // Refresh main list when returning to the app, but do not cancel an in-progress confirm sheet
      // (some hosts emit lifecycle noise around list taps).
      if (
        glassesMainUiMode.type === 'confirm_loading' ||
        glassesMainUiMode.type === 'confirm' ||
        glassesMainUiMode.type === 'confirm_sending' ||
        glassesMainUiMode.type === 'confirm_canceling'
      ) {
        return;
      }
      resetGlassesMainUiMode();
      void (async () => {
        if (startGlassesAppMutex) {
          await startGlassesAppMutex;
        } else {
          await refreshMainPageTextFromTesla(bridge);
        }
        const rebuilt = await refreshGlassesMainPageUi(bridge);
        if (!rebuilt) {
          await startGlassesApp(bridge);
        }
      })();
    },
    onEvent: (payload) => {
      const et = payload.eventType;
      if (!isClickEvent(et) || payload.listEvent == null) return;

      if (
        glassesMainUiMode.type === 'confirm_loading' ||
        glassesMainUiMode.type === 'confirm_sending' ||
        glassesMainUiMode.type === 'confirm_canceling'
      ) {
        return;
      }

      if (glassesMainUiMode.type === 'confirm') {
        const pendingAction = glassesMainUiMode.action;
        const row = resolveConfirmListRowIndex(
          payload.listEvent,
          pendingAction,
          glassesMainUiMode.firstRowLabel,
        );
        if (row == null) return;
        if (row === CONFIRM_ROW_PROMPT) {
          return;
        }
        if (row === CONFIRM_ROW_CONFIRM) {
          const action = glassesMainUiMode.action;
          const firstRowLabel = glassesMainUiMode.firstRowLabel;
          void (async () => {
            let sendingLabel = sendingStatusLabelForAction(action, firstRowLabel);
            if (action.id === 'wake') {
              const dn = await getSelectedVehicleDisplayName(bridge);
              sendingLabel = `Waking ${dn}`;
            }
            glassesMainUiMode = { type: 'confirm_sending', sendingLabel };
            try {
              await bridge.rebuildPageContainer(
                new RebuildPageContainer(buildConfirmSendingPageConfig(sendingLabel)),
              );
            } catch (err) {
              console.warn('[Tesla] Sending-state rebuild failed:', err);
            }
            void executeControlCommand(bridge, action);
          })();
          return;
        }
        if (row === CONFIRM_ROW_CANCEL) {
          glassesMainUiMode = { type: 'confirm_canceling' };
          void (async () => {
            try {
              await bridge.rebuildPageContainer(
                new RebuildPageContainer(buildConfirmSendingPageConfig(CONFIRM_CANCELING_LABEL)),
              );
            } catch (err) {
              console.warn('[Tesla] Canceling-state rebuild failed:', err);
            }
            await refreshMainPageTextFromTesla(bridge);
            await refreshGlassesMainPageUi(bridge);
          })();
        }
        return;
      }

      const mainNames = buildGlassesListItemNames(mainListVisibleActionsCache);
      const row = resolveMainListRowIndex(payload.listEvent, mainNames, {
        defaultToFirstRowOnEmpty: true,
      });
      if (row == null) return;
      if (row < 0 || row >= mainListVisibleActionsCache.length) return;
      const action = mainListVisibleActionsCache[row];
      if (!action) return;
      glassesMainUiMode = { type: 'confirm_loading', action };
      void (async () => {
        try {
          await bridge.rebuildPageContainer(
            new RebuildPageContainer(buildConfirmSendingPageConfig(CONFIRM_LOADING_LABEL)),
          );
        } catch (err) {
          console.warn('[Tesla] Confirm loading rebuild failed:', err);
        }
        await showConfirmForAction(bridge, action);
      })();
    },
  });
}

/**
 * Switch from credentials page to container main page. Call after session is saved.
 * If there is no glasses page yet (rebuild fails), cold-start via startGlassesApp so listeners
 * are not attached without a visible page.
 */
export async function switchToMainPage(bridge: EvenAppBridge): Promise<void> {
  if (startGlassesAppMutex) {
    await startGlassesAppMutex;
  } else {
    await refreshMainPageTextFromTesla(bridge);
  }
  const rebuilt = await refreshGlassesMainPageUi(bridge);
  if (!rebuilt) {
    await startGlassesApp(bridge);
    return;
  }
  attachMainPageGlassesHandlers(bridge);
}

/** Single full-screen text container for "credentials needed" so glasses start up. */
function buildCredentialsMessagePage() {
  const msg =
    'Open your phone to sign in with Tesla.\n\nYou will be able to control and access your vehicle once authenticated.';
  const text = new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    borderWidth: 0,
    borderColor: 5,
    borderRadius: 6,
    paddingLength: 12,
    containerID: STATUS_TEXT_ID,
    containerName: STATUS_TEXT_NAME,
    content: clipTextForCreatePage(msg),
    isEventCapture: 1,
  });
  return new CreateStartUpPageContainer({
    containerTotalNum: 1,
    textObject: [text],
  });
}

/**
 * Start the glasses app (container main page and event handling). Call when session id exists.
 * Serialized: overlapping calls share one in-flight run (Hub foreground + React init).
 */
export async function startGlassesApp(bridge: EvenAppBridge): Promise<void> {
  if (startGlassesAppMutex) {
    return startGlassesAppMutex;
  }
  startGlassesAppMutex = (async () => {
    try {
      resetGlassesMainUiMode();
      const textContent = await refreshMainPageTextFromTesla(bridge);
      const visible = await readVisibleControlActions(bridge);
      mainListVisibleActionsCache = visible;
      const config = new CreateStartUpPageContainer(buildContainerMainPageConfig(textContent, visible));
      const result = await bridge.createStartUpPageContainer(config);
      const created = StartUpPageCreateResult.normalize(result);
      if (created !== StartUpPageCreateResult.success) {
        // Host still has a live container (e.g. prior shutDown(1) left it active): use rebuild only.
        console.warn('[Tesla] createStartUpPageContainer failed; falling back to rebuild:', result, created);
        try {
          const rebuildContainer = await buildContainerRebuildPage(bridge, textContent);
          const rebuilt = await bridge.rebuildPageContainer(rebuildContainer);
          if (rebuilt) {
            clearGlassesPageShutDown();
            attachMainPageGlassesHandlers(bridge);
            return;
          }
        } catch (rebuildErr) {
          console.error('[Tesla] rebuildPageContainer fallback failed:', rebuildErr);
        }
        console.error('[Tesla] glasses startup failed after create + rebuild');
        return;
      }
      clearGlassesPageShutDown();
      attachMainPageGlassesHandlers(bridge);
    } finally {
      startGlassesAppMutex = null;
    }
  })();
  return startGlassesAppMutex;
}

/**
 * Show credentials-needed message on glasses and minimal handler (double-tap to exit).
 * Call when session is missing so the glasses display starts up.
 */
export async function startGlassesCredentialsMessage(bridge: EvenAppBridge): Promise<void> {
  const result = await bridge.createStartUpPageContainer(
    buildCredentialsMessagePage()
  );

  const created = StartUpPageCreateResult.normalize(result);
  if (created !== StartUpPageCreateResult.success) {
    console.error('[Tesla] createStartUpPageContainer (credentials message) failed:', result, created);
    return;
  }

  glassesHubUnsubscribe?.();
  // Override SDK default double-tap → shutDownPageContainer(1); exit via Hub UI instead.
  glassesHubUnsubscribe = setupGlassesEventHandler(bridge, {
    onDoubleClick: () => {
      // Previous: default in events.ts called bridge.shutDownPageContainer(1).
    },
  });
}
