/**
 * Glasses input — aligned with Even Hub routing and event types.
 * @see https://hub.evenrealities.com/docs/guides/input-events
 *
 * List capture containers deliver input on `event.listEvent`; text on `event.textEvent`.
 * Main Tesla page uses a list capture layer, so we prefer `listEvent` when present.
 */

import type { EvenAppBridge, EvenHubEvent } from '@evenrealities/even_hub_sdk';
import { OsEventTypeList } from '@evenrealities/even_hub_sdk';

/** Parsed payload from an EvenHub glasses-oriented event. */
export interface GlassesEventPayload {
  eventType: number | string | undefined | null;
  listEvent: EvenHubEvent['listEvent'];
  textEvent: EvenHubEvent['textEvent'];
  sysEvent: EvenHubEvent['sysEvent'];
}

/**
 * Resolve `eventType` per host routing (Input & Events — Event Routing).
 * When `listEvent` is present (list capture), use `listEvent.eventType` even if `undefined` (single press).
 * Else `textEvent` (credentials page), then `sysEvent`.
 */
export function parseGlassesEvent(event: EvenHubEvent): GlassesEventPayload {
  const listEvent = event.listEvent;
  const textEvent = event.textEvent;
  const sysEvent = event.sysEvent;

  const eventType =
    listEvent != null
      ? listEvent.eventType
      : textEvent != null
        ? textEvent.eventType
        : sysEvent?.eventType;

  return { eventType, listEvent, textEvent, sysEvent };
}

/**
 * Single press: CLICK_EVENT is 0; SDK may omit `eventType` (`undefined` / null).
 * Packaged hosts sometimes send string forms (`"0"`, `"CLICK_EVENT"`) before full normalization.
 */
export function isClickEvent(eventType: number | string | undefined | null): boolean {
  if (eventType === undefined || eventType === null) return true;
  if (eventType === OsEventTypeList.CLICK_EVENT) return true;
  const normalized = OsEventTypeList.fromJson(eventType);
  return normalized === OsEventTypeList.CLICK_EVENT;
}

export function isScrollTopEvent(
  eventType: number | string | undefined | null,
): boolean {
  if (eventType === undefined || eventType === null) return false;
  if (eventType === OsEventTypeList.SCROLL_TOP_EVENT) return true;
  return OsEventTypeList.fromJson(eventType) === OsEventTypeList.SCROLL_TOP_EVENT;
}

export function isScrollBottomEvent(
  eventType: number | string | undefined | null,
): boolean {
  if (eventType === undefined || eventType === null) return false;
  if (eventType === OsEventTypeList.SCROLL_BOTTOM_EVENT) return true;
  return OsEventTypeList.fromJson(eventType) === OsEventTypeList.SCROLL_BOTTOM_EVENT;
}

export function isDoubleClickEvent(
  eventType: number | string | undefined | null,
): boolean {
  if (eventType === undefined || eventType === null) return false;
  if (eventType === OsEventTypeList.DOUBLE_CLICK_EVENT) return true;
  return OsEventTypeList.fromJson(eventType) === OsEventTypeList.DOUBLE_CLICK_EVENT;
}

export function isForegroundEnterEvent(
  eventType: number | string | undefined | null,
): boolean {
  if (eventType === undefined || eventType === null) return false;
  if (eventType === OsEventTypeList.FOREGROUND_ENTER_EVENT) return true;
  return OsEventTypeList.fromJson(eventType) === OsEventTypeList.FOREGROUND_ENTER_EVENT;
}

export function isForegroundExitEvent(
  eventType: number | string | undefined | null,
): boolean {
  if (eventType === undefined || eventType === null) return false;
  if (eventType === OsEventTypeList.FOREGROUND_EXIT_EVENT) return true;
  return OsEventTypeList.fromJson(eventType) === OsEventTypeList.FOREGROUND_EXIT_EVENT;
}

export function isAbnormalExitEvent(
  eventType: number | string | undefined | null,
): boolean {
  if (eventType === undefined || eventType === null) return false;
  if (eventType === OsEventTypeList.ABNORMAL_EXIT_EVENT) return true;
  return OsEventTypeList.fromJson(eventType) === OsEventTypeList.ABNORMAL_EXIT_EVENT;
}

export type GlassesEventHandlerOptions = {
  /** Default: bridge.shutDownPageContainer(1). */
  onDoubleClick?: () => void;
  /** App returned to foreground — refresh data / resume work. */
  onForegroundEnter?: () => void;
  /** App backgrounded — pause timers / heavy work. */
  onForegroundExit?: () => void;
  /** Bluetooth / unexpected disconnect. */
  onAbnormalExit?: () => void;
  /** Primary interaction handler (clicks, scrolls, etc.). */
  onEvent?: (payload: GlassesEventPayload) => void;
};

/**
 * Register onEvenHubEvent after the glasses page is shown.
 * Double-press is handled before onEvent (default exits page container).
 * @returns Unsubscribe — call before registering a replacement to avoid stacked listeners.
 */
export function setupGlassesEventHandler(
  bridge: EvenAppBridge,
  options: GlassesEventHandlerOptions = {},
): () => void {
  const {
    onDoubleClick,
    onForegroundEnter,
    onForegroundExit,
    onAbnormalExit,
    onEvent,
  } = options;

  return bridge.onEvenHubEvent((event) => {
    const payload = parseGlassesEvent(event);
    const { eventType } = payload;

    if (isDoubleClickEvent(eventType)) {
      if (onDoubleClick) {
        onDoubleClick();
      } else {
        bridge.shutDownPageContainer(1);
      }
    }

    if (isForegroundEnterEvent(eventType)) {
      onForegroundEnter?.();
    }
    if (isForegroundExitEvent(eventType)) {
      onForegroundExit?.();
    }
    if (isAbnormalExitEvent(eventType)) {
      onAbnormalExit?.();
    }

    onEvent?.(payload);
  });
}
