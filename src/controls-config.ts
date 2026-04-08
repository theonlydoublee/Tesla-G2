/**
 * Tesla controls: action definitions and icon mapping.
 * Single source of truth for the glasses control actions.
 */

export interface ControlAction {
  id: string;
  icon: string;
  /** List row label on G2 (Even limit 64 chars per item). */
  glassesListLabel: string;
  /** First row on confirm sheet (no-op); G2 limit 64 chars per item. */
  confirmPromptLabel: string;
  /** One-row “sending…” text after Confirm (omit for charge/climate — use `sendingStatusLabelForAction`). */
  sendingStatusLabel?: string;
  command: string;
  body?: Record<string, unknown>;
}

const CONFIRM_SUFFIX = ['Confirm', 'Cancel'] as const;

export const CONTROL_ACTIONS: ControlAction[] = [
  {
    id: 'wake',
    icon: '/icons/Climate.png',
    glassesListLabel: 'Wake',
    confirmPromptLabel: 'Wake vehicle:',
    sendingStatusLabel: 'Waking vehicle',
    command: 'wake_up',
  },
  {
    id: 'lock',
    icon: '/icons/Lock.png',
    glassesListLabel: 'Lock',
    confirmPromptLabel: 'Lock Car:',
    sendingStatusLabel: 'Locking car',
    command: 'door_lock',
  },
  {
    id: 'unlock',
    icon: '/icons/Unlock.png',
    glassesListLabel: 'Unlock',
    confirmPromptLabel: 'Unlock Car:',
    sendingStatusLabel: 'Unlocking car',
    command: 'door_unlock',
  },
  {
    id: 'frunk',
    icon: '/icons/Frunk.png',
    glassesListLabel: 'Frunk',
    confirmPromptLabel: 'Open frunk:',
    sendingStatusLabel: 'Opening frunk',
    command: 'actuate_trunk',
    body: { which_trunk: 'front' },
  },
  {
    id: 'trunk',
    icon: '/icons/Trunk.png',
    glassesListLabel: 'Trunk',
    confirmPromptLabel: 'Open trunk:',
    sendingStatusLabel: 'Opening trunk',
    command: 'actuate_trunk',
    body: { which_trunk: 'rear' },
  },
  {
    id: 'climate',
    icon: '/icons/Climate.png',
    glassesListLabel: 'Climate',
    confirmPromptLabel: 'StartClimate:',
    command: 'auto_conditioning_start',
  },
  {
    id: 'charge',
    icon: '/icons/Charging.png',
    glassesListLabel: 'Charge',
    confirmPromptLabel: 'Charge:',
    command: 'charge_start',
  },
  {
    id: 'lights',
    icon: '/icons/FlashLights.png',
    glassesListLabel: 'Flash lights',
    confirmPromptLabel: 'Flash lights:',
    sendingStatusLabel: 'Flashing lights',
    command: 'flash_lights',
  },
  {
    id: 'horn',
    icon: '/icons/Horn.png',
    glassesListLabel: 'Horn',
    confirmPromptLabel: 'Honk horn:',
    sendingStatusLabel: 'Honking horn',
    command: 'honk_horn',
  },
];

export const CONTROL_COUNT = CONTROL_ACTIONS.length;

/** Item names for main list (same order as `visibleActions`). */
export function buildGlassesListItemNames(visibleActions: ControlAction[]): string[] {
  return visibleActions.map((a) => a.glassesListLabel);
}

/**
 * Confirm list rows: prompt (static or precomputed for charge/climate), then Confirm / Cancel.
 * When `firstRowLabel` is set (e.g. from vehicle_data), it overrides `confirmPromptLabel`.
 */
export function buildConfirmListItemNames(action: ControlAction, firstRowLabel?: string): string[] {
  const trimmed = firstRowLabel?.trim();
  if (trimmed) {
    return [trimmed, ...CONFIRM_SUFFIX];
  }
  const prompt = action.confirmPromptLabel?.trim() || 'Action:';
  return [prompt, ...CONFIRM_SUFFIX];
}

/** Status line after user taps Confirm (charge/climate from current `firstRowLabel`). */
export function sendingStatusLabelForAction(action: ControlAction, firstRowLabel: string): string {
  if (action.id === 'wake') {
    return 'Waking vehicle';
  }
  if (action.id === 'charge') {
    return firstRowLabel.startsWith('Stop') ? 'Stopping charge' : 'Starting charge';
  }
  if (action.id === 'climate') {
    return firstRowLabel.startsWith('Turn Off') ? 'Turning off climate' : 'Turning on climate';
  }
  const s = action.sendingStatusLabel?.trim();
  return s && s.length > 0 ? s : 'Sending command';
}
