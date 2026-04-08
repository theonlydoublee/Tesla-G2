/**
 * Persisted glasses command list: ordered enabled `ControlAction.id` values.
 */

import {
  CONTROL_ACTIONS,
  type ControlAction,
} from './controls-config';
import { STORAGE_KEY_GLASSES_COMMAND_ORDER } from './tesla-session-storage';
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';

export const WAKE_COMMAND_ID = 'wake';

const KNOWN_IDS = new Set(CONTROL_ACTIONS.map((a) => a.id));

const DEFAULT_ORDER_IDS: string[] = CONTROL_ACTIONS.map((a) => a.id);

const ACTION_BY_ID: ReadonlyMap<string, ControlAction> = new Map(
  CONTROL_ACTIONS.map((a) => [a.id, a]),
);

export function getDefaultCommandOrderIds(): string[] {
  return [...DEFAULT_ORDER_IDS];
}

export function getControlActionById(id: string): ControlAction | undefined {
  return ACTION_BY_ID.get(id);
}

/**
 * Parse stored JSON; invalid / empty → default order.
 * Keeps only known ids, in saved order (enabled commands only — do not re-inject disabled ids).
 * Wake is always enabled: prepended if missing.
 */
export function normalizeCommandOrderIds(saved: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of saved) {
    if (!KNOWN_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  if (out.length === 0) {
    return getDefaultCommandOrderIds();
  }
  if (!out.includes(WAKE_COMMAND_ID)) {
    out.unshift(WAKE_COMMAND_ID);
  }
  return out;
}

export function parseStoredCommandOrderJson(raw: string | null | undefined): string[] {
  if (raw == null || !String(raw).trim()) {
    return getDefaultCommandOrderIds();
  }
  try {
    const o = JSON.parse(String(raw)) as { order?: unknown };
    const order = o?.order;
    if (!Array.isArray(order)) {
      return getDefaultCommandOrderIds();
    }
    const ids = order.filter((x): x is string => typeof x === 'string' && x.length > 0);
    const normalized = normalizeCommandOrderIds(ids);
    return normalized.length > 0 ? normalized : getDefaultCommandOrderIds();
  } catch {
    return getDefaultCommandOrderIds();
  }
}

export function visibleActionsFromOrderIds(orderIds: string[]): ControlAction[] {
  const normalized = normalizeCommandOrderIds(orderIds);
  const actions: ControlAction[] = [];
  for (const id of normalized) {
    const a = ACTION_BY_ID.get(id);
    if (a) actions.push(a);
  }
  return actions.length > 0 ? actions : [...CONTROL_ACTIONS];
}

export function serializeCommandOrder(orderIds: string[]): string {
  return JSON.stringify({ order: normalizeCommandOrderIds(orderIds) });
}

export async function readVisibleControlActions(bridge: EvenAppBridge): Promise<ControlAction[]> {
  const raw = await bridge.getLocalStorage(STORAGE_KEY_GLASSES_COMMAND_ORDER);
  const ids = parseStoredCommandOrderJson(raw);
  return visibleActionsFromOrderIds(ids);
}
