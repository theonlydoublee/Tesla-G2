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
import {
  loadAndPrepareImage,
} from './utils/image-for-glasses';
import { buildTextContentFromVehicleData } from './pages/main';

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

/** Per-image config: path, position, and size. Edit in code. */
export interface ControlImageConfig {
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const CONTROL_IMAGES: ControlImageConfig[] = [
  { url: '/icons/200x100-green.png', x: 288, y: 188, width: 200, height: 100 },
  { url: '/icons/200x100-green.png', x: 88, y: 188, width: 80, height: 80 },
];

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
      const list = (data?.response ?? []) as Array<{ vin?: string }>;
      const first = list.find((v) => v?.vin) as { vin: string; display_name?: string } | undefined;
      if (first?.vin) {
        vin = first.vin;
        storedDisplayName = first.display_name ?? null;
        await bridge.setLocalStorage(STORAGE_KEY_SELECTED_VEHICLE, JSON.stringify({
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
 * Build container-based main page: text top-right, 3 images at bottom.
 */
function buildContainerMainPageConfig(textContent: string) {
  const imageObjects = CONTROL_IMAGES.map((cfg, i) =>
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
    isEventCapture: 1,
  });

  return {
    containerTotalNum: 4,
    imageObject: imageObjects,
    textObject: [textContainer],
  };
}

export function buildContainerRebuildPage(textContent: string) {
  return new RebuildPageContainer(buildContainerMainPageConfig(textContent));
}

/**
 * Load and send CONTROL_IMAGES to glasses. G2: queue sequentially.
 */
export async function sendControlImages(bridge: EvenAppBridge): Promise<void> {
  for (let i = 0; i < CONTROL_IMAGES.length; i++) {
    const cfg = CONTROL_IMAGES[i];
    if (!cfg) continue;
    const pngBytes = await loadAndPrepareImage(cfg.url, cfg.width, cfg.height);
    if (pngBytes) {
      await bridge.updateImageRawData(
        new ImageRawDataUpdate({
          containerID: 2 + i,
          containerName: `ctrl-img-${i}`,
          imageData: pngBytes,
        })
      );
    }
  }
}

/**
 * Switch from credentials page to container main page. Call after tokens saved.
 */
export async function switchToMainPage(bridge: EvenAppBridge): Promise<void> {
  const textContent = await fetchLivePageTextContent(bridge);
  await bridge.rebuildPageContainer(buildContainerRebuildPage(textContent));
  await sendControlImages(bridge);
  setupGlassesEventHandler(bridge);
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
  setupGlassesEventHandler(bridge);
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
