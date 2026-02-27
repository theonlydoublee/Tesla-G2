/**
 * Glasses event parsing and handler setup.
 * Centralizes EvenHub event listening so callers can react to all interaction types.
 */

import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { OsEventTypeList } from '@evenrealities/even_hub_sdk';

/** Raw event object passed to onEvenHubEvent callback. */
export interface EvenHubEvent {
  listEvent?: { eventType?: number };
  textEvent?: { eventType?: number };
  sysEvent?: { eventType?: number };
}

/** Parsed payload from a glasses event (list, text, or sys). */
export interface GlassesEventPayload {
  eventType: number | undefined;
  listEvent: unknown;
  textEvent: unknown;
  sysEvent: unknown;
}

/**
 * Extract event type and sub-events from an EvenHub event.
 * Use eventType to branch on action; use listEvent/textEvent/sysEvent for container IDs etc.
 */
export function parseGlassesEvent(event: EvenHubEvent): GlassesEventPayload {
  const listEvent = event.listEvent;
  const textEvent = event.textEvent;
  const sysEvent = event.sysEvent;
  const eventType =
    listEvent?.eventType ?? textEvent?.eventType ?? sysEvent?.eventType;
  return { eventType, listEvent, textEvent, sysEvent };
}

export function isDoubleClickEvent(eventType: number | undefined): boolean {
  return eventType === OsEventTypeList.DOUBLE_CLICK_EVENT;
}

export type GlassesEventHandlerOptions = {
  /** Called on double-tap. Default: bridge.shutDownPageContainer(1). */
  onDoubleClick?: () => void;
  /** Called for every event so you can branch on eventType / listEvent / textEvent / sysEvent. */
  onEvent?: (payload: GlassesEventPayload) => void;
};

/**
 * Register the glasses event listener. Use after the main page (or credentials page) is shown.
 * By default, double-tap calls bridge.shutDownPageContainer(1).
 * Pass onEvent to handle all interactions and do something based on the action.
 */
export function setupGlassesEventHandler(
  bridge: EvenAppBridge,
  options: GlassesEventHandlerOptions = {}
): void {
  const { onDoubleClick, onEvent } = options;


  bridge.onEvenHubEvent((event) => {
    const payload = parseGlassesEvent(event);
    const listEvent = event.listEvent;
    const textEvent = event.textEvent;
    const sysEvent = event.sysEvent;
    const eventType = listEvent?.eventType ?? textEvent?.eventType ?? sysEvent?.eventType;

    if (isDoubleClickEvent(payload.eventType)) {
      if (onDoubleClick) {
        onDoubleClick();
      } else {
        bridge.shutDownPageContainer(1);
      }
    }

    if (onEvent) {
      onEvent(payload);
    }

    
  });
}
