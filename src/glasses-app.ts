/**
 * Tesla – G2 glasses logic (vanilla TS).
 * Page builders, event handlers, startup. No React.
 */

import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import {
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerProperty,
  ImageContainerProperty,
  ImageRawDataUpdate,
  StartUpPageCreateResult,
} from '@evenrealities/even_hub_sdk';

import { setupGlassesEventHandler } from './utils/events';
import { buildTextContentFromVehicleData } from './pages/main';
import {
  CONTROL_ACTIONS,
  CHARGE_ACTION_INDEX,
  STORAGE_KEY_ICON_SIZE,
  type IconSizeKey,
} from './controls-config';
import { renderControlsCanvas, iconSizeToPx } from './utils/controls-canvas';
import { OsEventTypeList } from '@evenrealities/even_hub_sdk';

export type PageType = 'main' | 'controls' | 'climate' | 'charging';

// Layout: left status block, right menu list (guidelines: 16px margin, 8px vertical)
const MARGIN = 16;
const MARGIN_V = 8;

// Container IDs/names (stable across pages)
const STATUS_TEXT_ID = 1;
const STATUS_TEXT_NAME = 'status';


/** Page types: main menu or themed sub-pages */
export const PAGE_MAIN: PageType = 'main';

// G2 canvas dimensions
const CANVAS_WIDTH = 576;
const CANVAS_HEIGHT = 288;

/** Control images layout: left half and right half of 400x100 canvas. */
const CONTROL_IMAGE_LAYOUT = [
  { x: 88, y: 188, width: 200, height: 100 },
  { x: 288, y: 188, width: 200, height: 100 },
] as const;

/** Module-level selection state for controls. */
let controlsSelectedIndex = 0;

// Container IDs for main page: text=1, images=2,3,4
const MAIN_TEXT_ID = 1;
const MAIN_TEXT_NAME = 'main-text';

const STORAGE_KEY_ACCESS_TOKEN = 'tesla_access_token';
const STORAGE_KEY_SELECTED_VEHICLE = 'tesla_selected_vehicle';

const FALLBACK_TEXT = 'Vehicle data unavailable';

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

/**
 * Fetch live vehicle data and return text content for main page.
 * Falls back to placeholder if no token, no vehicle, or API error.
 */
async function fetchLivePageTextContent(bridge: EvenAppBridge): Promise<string> {
  const accessToken = await bridge.getLocalStorage(STORAGE_KEY_ACCESS_TOKEN);
  if (!accessToken) return FALLBACK_TEXT;

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
      const res = await fetch('/api/tesla/vehicles', {
        headers: { Authorization: `Bearer ${accessToken}` },
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
      return FALLBACK_TEXT;
    }
  }

  if (!vin) return FALLBACK_TEXT;

  try {
    const res = await fetch(`/api/tesla/vehicle_data/${vin}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    if (!res.ok) return FALLBACK_TEXT;
    const vehicleData = data?.response ?? data;
    return buildTextContentFromVehicleData(vehicleData, storedDisplayName);
  } catch {
    return FALLBACK_TEXT;
  }
}

/**
 * Build container-based main page: text top-right, 2 control images at bottom.
 */
function buildContainerMainPageConfig(textContent: string) {
  const imageObjects = CONTROL_IMAGE_LAYOUT.map((cfg, i) =>
    new ImageContainerProperty({
      xPosition: cfg.x,
      yPosition: cfg.y,
      width: cfg.width,
      height: cfg.height,
      containerID: 2 + i,
      containerName: `ctrl-img-${i}`,
    })
  );

  const textContainer = new TextContainerProperty({
    xPosition: 293,
    yPosition: 8,
    width: 275,
    height: 182,
    borderWidth: 0,
    borderColor: 5,
    borderRdaius: 6,
    paddingLength: 12,
    containerID: MAIN_TEXT_ID,
    containerName: MAIN_TEXT_NAME,
    content: textContent,
    isEventCapture: 0,
  });

  const inputContainer = new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 0,
    height: 0,
    borderWidth: 0,
    borderColor: 0,
    containerID: 5,
    containerName: "inputContainer",
    content: textContent,
    isEventCapture: 1,
  });

  return {
    containerTotalNum: 4,
    imageObject: imageObjects,
    textObject: [textContainer, inputContainer],
  };
}

export function buildContainerRebuildPage(textContent: string) {
  return new RebuildPageContainer(buildContainerMainPageConfig(textContent));
}

/**
 * Render controls canvas and send both halves to glasses.
 */
export async function sendControlImages(bridge: EvenAppBridge): Promise<void> {
  const sizeKey = (await bridge.getLocalStorage(STORAGE_KEY_ICON_SIZE)) as IconSizeKey | null;
  const iconSizePx = iconSizeToPx(sizeKey ?? 'medium');

  const result = await renderControlsCanvas(iconSizePx, controlsSelectedIndex);
  if (!result) return;

  await bridge.updateImageRawData(
    new ImageRawDataUpdate({
      containerID: 2,
      containerName: 'ctrl-img-0',
      imageData: result.leftPngBytes,
    })
  );
  await bridge.updateImageRawData(
    new ImageRawDataUpdate({
      containerID: 3,
      containerName: 'ctrl-img-1',
      imageData: result.rightPngBytes,
    })
  );
}

/**
 * Execute Tesla command for the given control index.
 */
async function executeControlCommand(bridge: EvenAppBridge, index: number): Promise<void> {
  const accessToken = await bridge.getLocalStorage(STORAGE_KEY_ACCESS_TOKEN);
  const stored = await bridge.getLocalStorage(STORAGE_KEY_SELECTED_VEHICLE);
  if (!accessToken || !stored) return;

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
    const res = await fetch('/api/tesla/vehicles', {
      headers: { Authorization: `Bearer ${accessToken}` },
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
    const vRes = await fetch(`/api/tesla/vehicle_data/${vin}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const vData = await vRes.json();
    const chargeState = vData?.response?.charge_state ?? vData?.charge_state;
    const charging = chargeState?.charging_state === 'Charging' || chargeState?.charging_state === 'Starting';
    command = charging ? 'charge_stop' : 'charge_start';
    body = undefined;
  }

  try {
    const reqBody = body ? { ...body, vin } : vin ? { vin } : undefined;
    await fetch(`/api/tesla/command/${vehicleId}/${command}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: reqBody ? JSON.stringify(reqBody) : undefined,
    });
  } catch (err) {
    console.warn('[Tesla] Command failed:', command, err);
  }
}

/**
 * Switch from credentials page to container main page. Call after tokens saved.
 */
export async function switchToMainPage(bridge: EvenAppBridge): Promise<void> {
  const textContent = await fetchLivePageTextContent(bridge);
  await bridge.rebuildPageContainer(buildContainerRebuildPage(textContent));
  await sendControlImages(bridge);
  setupGlassesEventHandler(bridge, {
    onEvent: (payload) => {
      const et = payload.eventType;
      if (et === OsEventTypeList.SCROLL_TOP_EVENT) {
        controlsSelectedIndex = (controlsSelectedIndex - 1 + CONTROL_ACTIONS.length) % CONTROL_ACTIONS.length;
        void sendControlImages(bridge);
      } else if (et === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
        controlsSelectedIndex = (controlsSelectedIndex + 1) % CONTROL_ACTIONS.length;
        void sendControlImages(bridge);
      } else if (et === OsEventTypeList.CLICK_EVENT) {
        void executeControlCommand(bridge, controlsSelectedIndex);
      }
    },
  });
}

/** Single full-screen text container for "credentials needed" so glasses start up. */
function buildCredentialsMessagePage() {
  // const bgImage = new ImageContainerProperty({
  //   xPosition: 0,
  //   yPosition: 0,
  //   width: BG_IMAGE_WIDTH,
  //   height: BG_IMAGE_HEIGHT,
  //   containerID: BG_IMAGE_ID,
  //   containerName: BG_IMAGE_NAME,
  // });

  const text = new TextContainerProperty({
    xPosition: MARGIN,
    yPosition: MARGIN_V,
    width: CANVAS_WIDTH - MARGIN * 2,
    height: CANVAS_HEIGHT - MARGIN_V * 2,
    borderWidth: 0,
    borderColor: 5,
    borderRdaius: 6,
    paddingLength: 12,
    containerID: STATUS_TEXT_ID,
    containerName: STATUS_TEXT_NAME,
    content:
      'Open your phone to sign in with Tesla.\n\nUse the app on your phone to sign in with your Tesla account.',
    isEventCapture: 1,
  });
  // Draw order: first in config = back. Put image first so it renders behind text.
  return new CreateStartUpPageContainer({
    containerTotalNum: 1,
    textObject: [text],
  });
}




/**
 * Start the glasses app (container main page and event handling). Call when tokens exist.
 */
export async function startGlassesApp(bridge: EvenAppBridge): Promise<void> {
  const textContent = await fetchLivePageTextContent(bridge);
  const config = new CreateStartUpPageContainer(buildContainerMainPageConfig(textContent));
  const result = await bridge.createStartUpPageContainer(config);

  const resultCode =
    typeof result === 'number' ? result : (result as { index?: number })?.index ?? result;
  if (resultCode !== StartUpPageCreateResult.success && resultCode !== 0) {
    console.error('[Tesla] createStartUpPageContainer failed:', result);
    return;
  }

  await sendControlImages(bridge);
  setupGlassesEventHandler(bridge, {
    onEvent: (payload) => {
      const et = payload.eventType;
      if (et === OsEventTypeList.SCROLL_TOP_EVENT) {
        controlsSelectedIndex = (controlsSelectedIndex - 1 + CONTROL_ACTIONS.length) % CONTROL_ACTIONS.length;
        void sendControlImages(bridge);
      } else if (et === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
        controlsSelectedIndex = (controlsSelectedIndex + 1) % CONTROL_ACTIONS.length;
        void sendControlImages(bridge);
      } else if (et === OsEventTypeList.CLICK_EVENT) {
        void executeControlCommand(bridge, controlsSelectedIndex);
      }
    },
  });
}

/**
 * Show credentials-needed message on glasses and minimal handler (double-tap to exit).
 * Call when tokens are missing so the glasses display starts up.
 */
export async function startGlassesCredentialsMessage(bridge: EvenAppBridge): Promise<void> {
  const result = await bridge.createStartUpPageContainer(
    buildCredentialsMessagePage()
  );

  const resultCode =
    typeof result === 'number' ? result : (result as { index?: number })?.index ?? result;
  if (resultCode !== StartUpPageCreateResult.success && resultCode !== 0) {
    console.error('[Tesla] createStartUpPageContainer (credentials message) failed:', result);
    return;
  }

  setupGlassesEventHandler(bridge);
}
