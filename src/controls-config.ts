/**
 * Tesla controls: action definitions and icon mapping.
 * Single source of truth for the 8 glasses control actions.
 */

export interface ControlAction {
  id: string;
  icon: string;
  /** List row label on G2 (Even limit 64 chars per item). */
  glassesListLabel: string;
  /** First row on confirm sheet (no-op); G2 limit 64 chars per item. */
  confirmPromptLabel: string;
  command: string;
  body?: Record<string, unknown>;
}

/** Charge is a toggle - determined at runtime from vehicle_data. */
export const CHARGE_ACTION_INDEX = 5;

const CONFIRM_SUFFIX = ['Confirm', 'Cancel'] as const;

export const CONTROL_ACTIONS: ControlAction[] = [
  {
    id: 'lock',
    icon: '/icons/Lock.png',
    glassesListLabel: 'Lock',
    confirmPromptLabel: 'Lock Car:',
    command: 'door_lock',
  },
  {
    id: 'unlock',
    icon: '/icons/Unlock.png',
    glassesListLabel: 'Unlock',
    confirmPromptLabel: 'Unlock Car:',
    command: 'door_unlock',
  },
  {
    id: 'frunk',
    icon: '/icons/Frunk.png',
    glassesListLabel: 'Frunk',
    confirmPromptLabel: 'Open frunk:',
    command: 'actuate_trunk',
    body: { which_trunk: 'front' },
  },
  {
    id: 'trunk',
    icon: '/icons/Trunk.png',
    glassesListLabel: 'Trunk',
    confirmPromptLabel: 'Open trunk:',
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
    command: 'flash_lights',
  },
  {
    id: 'horn',
    icon: '/icons/Horn.png',
    glassesListLabel: 'Horn',
    confirmPromptLabel: 'Honk horn:',
    command: 'honk_horn',
  },
];

export const CONTROL_COUNT = CONTROL_ACTIONS.length;

/** Item names for `ListItemContainerProperty.itemName` (same order as CONTROL_ACTIONS). */
export function buildGlassesListItemNames(): string[] {
  return CONTROL_ACTIONS.map((a) => a.glassesListLabel);
}

/** Confirm list rows: per-action prompt, then Confirm / Cancel. */
export function buildConfirmListItemNames(actionIndex: number): string[] {
  const action = CONTROL_ACTIONS[actionIndex];
  const prompt = action?.confirmPromptLabel?.trim() || 'Action:';
  return [prompt, ...CONFIRM_SUFFIX];
}
