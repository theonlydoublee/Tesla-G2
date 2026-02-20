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
  ImageContainerProperty,
  ImageRawDataUpdate,
  OsEventTypeList,
  StartUpPageCreateResult,
} from '@evenrealities/even_hub_sdk';

import { loadAndPrepareBackgroundImage } from './utils/image-for-glasses';
import { mainPageData, setTokenDisplay } from './pages/main';
import { controlsPageData } from './pages/controls';
import { climatePageData } from './pages/climate';
import { chargingPageData } from './pages/charging';

export type PageType = 'main' | 'controls' | 'climate' | 'charging';

// G2 canvas (per G2.md)
const CANVAS_WIDTH = 576;
const CANVAS_HEIGHT = 288;

// Layout: left status block, right menu list (guidelines: 16px margin, 8px vertical)
const MARGIN = 16;
const MARGIN_V = 8;
const LEFT_WIDTH = 256;
const LIST_WIDTH = CANVAS_WIDTH - MARGIN * 2 - LEFT_WIDTH - 8;
const LIST_X = MARGIN + LEFT_WIDTH + 8;
const CONTENT_HEIGHT = CANVAS_HEIGHT - MARGIN_V * 2;

// Container IDs/names (stable across pages)
const BG_IMAGE_ID = 0;
const BG_IMAGE_NAME = 'bg';
const STATUS_TEXT_ID = 1;
const STATUS_TEXT_NAME = 'status';
const MENU_LIST_ID = 2;
const MENU_LIST_NAME = 'menu';

// Background image container size (G2 max 200×100)
const BG_IMAGE_WIDTH = 200;
const BG_IMAGE_HEIGHT = 100;

/** Page types: main menu or themed sub-pages */
export const PAGE_MAIN: PageType = 'main';
const PAGE_CONTROLS: PageType = 'controls';
const PAGE_CLIMATE: PageType = 'climate';
const PAGE_CHARGING: PageType = 'charging';

const PAGE_TYPES: PageType[] = [PAGE_CONTROLS, PAGE_CLIMATE, PAGE_CHARGING];

/** Themed content per page: left panel text + right list items (max 64 chars each) */
const PAGE_CONTENT: Record<PageType, { leftContent: string; listItems: string[] }> = {
  [PAGE_MAIN]: mainPageData,
  [PAGE_CONTROLS]: controlsPageData,
  [PAGE_CLIMATE]: climatePageData,
  [PAGE_CHARGING]: chargingPageData,
};

/**
 * Build a page config (left text + right list) for a given page type.
 */
function buildPageConfig(pageType: PageType) {
  const { leftContent, listItems } = PAGE_CONTENT[pageType];

  const statusText = new TextContainerProperty({
    xPosition: MARGIN,
    yPosition: MARGIN_V,
    width: LEFT_WIDTH,
    height: CONTENT_HEIGHT,
    borderWidth: 1,
    borderColor: 5,
    borderRdaius: 6,
    paddingLength: 12,
    containerID: STATUS_TEXT_ID,
    containerName: STATUS_TEXT_NAME,
    content: leftContent,
    isEventCapture: 0,
  });

  const menuList = new ListContainerProperty({
    xPosition: LIST_X,
    yPosition: MARGIN_V,
    width: LIST_WIDTH,
    height: CONTENT_HEIGHT,
    borderWidth: 1,
    borderColor: 13,
    borderRdaius: 6,
    paddingLength: 10,
    containerID: MENU_LIST_ID,
    containerName: MENU_LIST_NAME,
    isEventCapture: 1,
    itemContainer: new ListItemContainerProperty({
      itemCount: listItems.length,
      itemWidth: LIST_WIDTH - 20,
      isItemSelectBorderEn: 1,
      itemName: listItems,
    }),
  });

  const bgImage = new ImageContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: BG_IMAGE_WIDTH,
    height: BG_IMAGE_HEIGHT,
    containerID: BG_IMAGE_ID,
    containerName: BG_IMAGE_NAME,
  });

  // Draw order: first in config = back. Put image first so it renders behind text/list.
  return {
    containerTotalNum: 3,
    imageObject: [bgImage],
    listObject: [menuList],
    textObject: [statusText],
  };
}

function buildStartupPage() {
  return new CreateStartUpPageContainer(buildPageConfig(PAGE_MAIN));
}

/** Single full-screen text container for "credentials needed" so glasses start up. */
function buildCredentialsMessagePage() {
  const bgImage = new ImageContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: BG_IMAGE_WIDTH,
    height: BG_IMAGE_HEIGHT,
    containerID: BG_IMAGE_ID,
    containerName: BG_IMAGE_NAME,
  });

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
      'Open your phone to enter Tesla API tokens.\n\nUse the form on the phone to add your access token and refresh token, then tap Save.',
    isEventCapture: 1,
  });
  // Draw order: first in config = back. Put image first so it renders behind text.
  return new CreateStartUpPageContainer({
    containerTotalNum: 2,
    imageObject: [bgImage],
    listObject: [],
    textObject: [text],
  });
}

export function buildRebuildPage(pageType: PageType) {
  return new RebuildPageContainer(buildPageConfig(pageType));
}

function isClickEvent(eventType: number | undefined): boolean {
  return (
    eventType === OsEventTypeList.CLICK_EVENT ||
    eventType === undefined
  );
}

function isDoubleClickEvent(eventType: number | undefined): boolean {
  return eventType === OsEventTypeList.DOUBLE_CLICK_EVENT;
}

/**
 * Load the background image and send it to the glasses. Call after create or rebuild.
 * G2: queue image updates sequentially – await before next update.
 */
export async function sendBackgroundImage(bridge: EvenAppBridge): Promise<void> {
  const pngBytes = await loadAndPrepareBackgroundImage(BG_IMAGE_WIDTH, BG_IMAGE_HEIGHT);
  if (!pngBytes) return;

  await bridge.updateImageRawData(
    new ImageRawDataUpdate({
      containerID: BG_IMAGE_ID,
      containerName: BG_IMAGE_NAME,
      imageData: pngBytes,
    })
  );
}

/**
 * Register the full glasses event handler (main menu navigation). Use after
 * the main menu page is shown (createStartUpPageContainer or rebuildPageContainer).
 */
export function setupGlassesEventHandler(bridge: EvenAppBridge): void {
  let currentPage: PageType = PAGE_MAIN;

  async function navigateTo(pageType: PageType): Promise<void> {
    currentPage = pageType;
    await bridge.rebuildPageContainer(buildRebuildPage(pageType));
    await sendBackgroundImage(bridge);
  }

  bridge.onEvenHubEvent((event) => {
    const listEvent = event.listEvent;
    const textEvent = event.textEvent;
    const sysEvent = event.sysEvent;

    const eventType =
      listEvent?.eventType ?? textEvent?.eventType ?? sysEvent?.eventType;

    if (isDoubleClickEvent(eventType)) {
      bridge.shutDownPageContainer(1);
      return;
    }

    if (!isClickEvent(eventType) || !listEvent) return;

    const index = listEvent.currentSelectItemIndex ?? 0;
    const items = PAGE_CONTENT[currentPage].listItems;
    const name = listEvent.currentSelectItemName ?? items[index] ?? '';

    if (currentPage === PAGE_MAIN) {
      const pageType = PAGE_TYPES[index];
      if (pageType !== undefined) {
        void navigateTo(pageType);
      }
      return;
    }

    if (index === 0 || index === undefined) {
      void navigateTo(PAGE_MAIN);
      return;
    }

    console.log('[Tesla] Sub-page action:', { page: currentPage, index, name });
  });
}

/**
 * Start the glasses app (main menu and event handling). Call when tokens exist.
 */
export async function startGlassesApp(bridge: EvenAppBridge): Promise<void> {
  const result = await bridge.createStartUpPageContainer(buildStartupPage());

  const resultCode =
    typeof result === 'number' ? result : (result as { index?: number })?.index ?? result;
  if (resultCode !== StartUpPageCreateResult.success && resultCode !== 0) {
    console.error('[Tesla] createStartUpPageContainer failed:', result);
    return;
  }

  await sendBackgroundImage(bridge);
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

  await sendBackgroundImage(bridge);
  bridge.onEvenHubEvent((event) => {
    const listEvent = event.listEvent;
    const textEvent = event.textEvent;
    const sysEvent = event.sysEvent;
    const eventType =
      listEvent?.eventType ?? textEvent?.eventType ?? sysEvent?.eventType;
    if (isDoubleClickEvent(eventType)) {
      bridge.shutDownPageContainer(1);
    }
  });
}

export { setTokenDisplay };
