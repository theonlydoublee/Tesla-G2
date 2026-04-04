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
import { STORAGE_KEY_SESSION_ID } from './tesla-session-storage';
import {
  setupGlassesEventHandler,
  isClickEvent,
} from './utils/events';
import { buildTextContentFromVehicleData } from './pages/main';
import {
  CONTROL_ACTIONS,
  CHARGE_ACTION_INDEX,
  buildGlassesListItemNames,
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

/** Confirm step: separate IDs from main list/text. */
const CONFIRM_LIST_ID = 11;
const CONFIRM_LIST_NAME = 'tesla-confirm-list';
const CONFIRM_TEXT_ID = 12;
const CONFIRM_TEXT_NAME = 'tesla-confirm-text';

const CONFIRM_ITEM_NAMES = ['Confirm', 'Cancel'] as const;

/** createStartUpPageContainer / rebuildPageContainer text limit per Even docs */
const MAX_TEXT_CHARS_CREATE = 1000;

function clipTextForCreatePage(s: string): string {
  if (s.length <= MAX_TEXT_CHARS_CREATE) return s;
  return `${s.slice(0, MAX_TEXT_CHARS_CREATE - 2)}\n…`;
}

const STORAGE_KEY_SELECTED_VEHICLE = 'tesla_selected_vehicle';

/**
 * Cached right-pane status text for glasses main page. Written only by refreshMainPageTextFromTesla
 * (startGlassesApp). Rebuilds use getCachedMainPageText — no network. If the user changes the
 * selected vehicle on the phone, text may stay stale until the glasses app starts again.
 */
const STORAGE_KEY_GLASSES_MAIN_TEXT_CACHE = 'tesla_glasses_main_text_cache';

const FALLBACK_TEXT = 'Vehicle data unavailable';

type GlassesMainUiMode =
  | { type: 'main' }
  | { type: 'confirm'; actionIndex: number };

let glassesMainUiMode: GlassesMainUiMode = { type: 'main' };

function resetGlassesMainUiMode(): void {
  glassesMainUiMode = { type: 'main' };
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

/** Persist status text and return it (call from startGlassesApp only). */
async function refreshMainPageTextFromTesla(bridge: EvenAppBridge): Promise<string> {
  async function finalize(text: string): Promise<string> {
    await bridge.setLocalStorage(STORAGE_KEY_GLASSES_MAIN_TEXT_CACHE, text);
    return text;
  }

  const sessionId = await bridge.getLocalStorage(STORAGE_KEY_SESSION_ID);
  if (!sessionId?.trim()) return finalize(FALLBACK_TEXT);
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
      return finalize(FALLBACK_TEXT);
    }
  }

  if (!vin) return finalize(FALLBACK_TEXT);

  try {
    const res = await fetch(apiUrl(`/api/tesla/vehicle_data/${vin}`), {
      headers: { Authorization: auth },
    });
    const data = await res.json();
    if (!res.ok) return finalize(FALLBACK_TEXT);
    const vehicleData = data?.response ?? data;
    return finalize(buildTextContentFromVehicleData(vehicleData, storedDisplayName));
  } catch {
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
function buildContainerMainPageConfig(textContent: string) {
  const clipped = clipTextForCreatePage(textContent);
  const itemNames = buildGlassesListItemNames();

  const listContainer = new ListContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 192,
    height: 288,
    borderWidth: 2,
    borderColor: 5,
    borderRadius: 0,
    paddingLength: 0,
    containerID: CMD_LIST_ID,
    containerName: CMD_LIST_NAME,
    isEventCapture: 1,
    itemContainer: new ListItemContainerProperty({
      itemCount: CONTROL_ACTIONS.length,
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

function buildConfirmPageConfig(actionIndex: number) {
  const action = CONTROL_ACTIONS[actionIndex];
  const label = action?.glassesListLabel ?? 'Action';
  const clipped = clipTextForCreatePage(`Run:\n${label}?`);

  const listContainer = new ListContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 192,
    height: 288,
    borderWidth: 2,
    borderColor: 5,
    borderRadius: 0,
    paddingLength: 0,
    containerID: CONFIRM_LIST_ID,
    containerName: CONFIRM_LIST_NAME,
    isEventCapture: 1,
    itemContainer: new ListItemContainerProperty({
      itemCount: CONFIRM_ITEM_NAMES.length,
      itemName: [...CONFIRM_ITEM_NAMES],
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
    containerID: CONFIRM_TEXT_ID,
    containerName: CONFIRM_TEXT_NAME,
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
 * Map listEvent to row index for main command list.
 * G2 quirk: host may omit index/name for row 0 — defaultToFirstRowOnEmpty maps empty to row 0 (Lock).
 */
function resolveMainListRowIndex(
  listEvent: object,
  options: { defaultToFirstRowOnEmpty?: boolean } = {},
): number | null {
  const names = buildGlassesListItemNames();
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

/** Confirm list: only explicit index or name; never default row 0 on empty. */
function resolveConfirmListRowIndex(listEvent: object): number | null {
  const names: string[] = [...CONFIRM_ITEM_NAMES];
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
  if (nameTrimmed.length > 0) {
    const i = names.indexOf(nameTrimmed);
    if (i >= 0) return i;
  }
  return null;
}

export function buildContainerRebuildPage(textContent: string) {
  return new RebuildPageContainer(buildContainerMainPageConfig(textContent));
}

/**
 * Execute Tesla command for the given CONTROL_ACTIONS index (0..7).
 */
async function executeControlCommand(bridge: EvenAppBridge, index: number): Promise<void> {
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

  if (vehicleId == null) return;

  const action = CONTROL_ACTIONS[index];
  if (!action) return;

  let command = action.command;
  let body = action.body;

  if (index === CHARGE_ACTION_INDEX) {
    try {
      const vRes = await fetch(apiUrl(`/api/tesla/vehicle_data/${vin}`), {
        headers: { Authorization: auth },
      });
      const vData = await vRes.json();
      const chargeState = vData?.response?.charge_state ?? vData?.charge_state;
      const charging = chargeState?.charging_state === 'Charging' || chargeState?.charging_state === 'Starting';
      command = charging ? 'charge_stop' : 'charge_start';
      body = undefined;
    } catch (err) {
      console.warn('[Tesla] Charge state fetch failed:', err);
      await refreshGlassesMainPageUi(bridge);
      return;
    }
  }

  try {
    const reqBody = body ? { ...body, vin } : vin ? { vin } : undefined;
    const res = await fetch(apiUrl(`/api/tesla/command/${vehicleId}/${command}`), {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: reqBody ? JSON.stringify(reqBody) : undefined,
    });
    if (!res.ok) {
      console.warn('[Tesla] Command HTTP error:', command, res.status);
    }
  } catch (err) {
    console.warn('[Tesla] Command failed:', command, err);
  } finally {
    await refreshGlassesMainPageUi(bridge);
  }
}

/** Rebuild main command UI from cache (resets to main layout; no vehicle_data fetch). */
async function refreshGlassesMainPageUi(bridge: EvenAppBridge): Promise<void> {
  resetGlassesMainUiMode();
  const textContent = await getCachedMainPageText(bridge);
  await bridge.rebuildPageContainer(buildContainerRebuildPage(textContent));
}

async function showConfirmForAction(bridge: EvenAppBridge, actionIndex: number): Promise<void> {
  glassesMainUiMode = { type: 'confirm', actionIndex };
  await bridge.rebuildPageContainer(
    new RebuildPageContainer(buildConfirmPageConfig(actionIndex)),
  );
}

/** Input & Events guide: listEvent / textEvent / double-click / lifecycle. */
function attachMainPageGlassesHandlers(bridge: EvenAppBridge): void {
  setupGlassesEventHandler(bridge, {
    onForegroundEnter: () => {
      resetGlassesMainUiMode();
      void refreshGlassesMainPageUi(bridge);
    },
    onEvent: (payload) => {
      const et = payload.eventType;
      if (!isClickEvent(et) || payload.listEvent == null) return;

      if (glassesMainUiMode.type === 'confirm') {
        const row = resolveConfirmListRowIndex(payload.listEvent);
        if (row == null) return;
        const pending = glassesMainUiMode.actionIndex;
        if (row === 0) {
          resetGlassesMainUiMode();
          void executeControlCommand(bridge, pending);
          return;
        }
        if (row === 1) {
          resetGlassesMainUiMode();
          void refreshGlassesMainPageUi(bridge);
        }
        return;
      }

      const row = resolveMainListRowIndex(payload.listEvent, {
        defaultToFirstRowOnEmpty: true,
      });
      if (row == null) return;
      if (row < 0 || row >= CONTROL_ACTIONS.length) return;
      void showConfirmForAction(bridge, row);
    },
  });
}

/**
 * Switch from credentials page to container main page. Call after session is saved.
 */
export async function switchToMainPage(bridge: EvenAppBridge): Promise<void> {
  await refreshGlassesMainPageUi(bridge);
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
 */
export async function startGlassesApp(bridge: EvenAppBridge): Promise<void> {
  resetGlassesMainUiMode();
  const textContent = await refreshMainPageTextFromTesla(bridge);
  const config = new CreateStartUpPageContainer(buildContainerMainPageConfig(textContent));
  const result = await bridge.createStartUpPageContainer(config);
  const created = StartUpPageCreateResult.normalize(result);
  if (created !== StartUpPageCreateResult.success) {
    console.error('[Tesla] createStartUpPageContainer failed:', result, created);
    return;
  }

  attachMainPageGlassesHandlers(bridge);
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

  setupGlassesEventHandler(bridge);
}
