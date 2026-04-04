/**
 * Tesla controls: action definitions and icon mapping.
 * Single source of truth for the 8 glasses control actions.
 */

export interface ControlAction {
  id: string;
  icon: string;
  /** List row label on G2 (Even limit 64 chars per item). */
  glassesListLabel: string;
  command: string;
  body?: Record<string, unknown>;
}

/** Charge is a toggle - determined at runtime from vehicle_data. */
export const CHARGE_ACTION_INDEX = 5;

export const CONTROL_ACTIONS: ControlAction[] = [
  { id: 'lock', icon: '/icons/Lock.png', glassesListLabel: 'Lock1', command: 'door_lock' },
  { id: 'unlock', icon: '/icons/Unlock.png', glassesListLabel: 'Unlock', command: 'door_unlock' },
  {
    id: 'frunk',
    icon: '/icons/Frunk.png',
    glassesListLabel: 'Frunk',
    command: 'actuate_trunk',
    body: { which_trunk: 'front' },
  },
  {
    id: 'trunk',
    icon: '/icons/Trunk.png',
    glassesListLabel: 'Trunk',
    command: 'actuate_trunk',
    body: { which_trunk: 'rear' },
  },
  { id: 'climate', icon: '/icons/Climate.png', glassesListLabel: 'Climate', command: 'auto_conditioning_start' },
  { id: 'charge', icon: '/icons/Charging.png', glassesListLabel: 'Charge', command: 'charge_start' },
  { id: 'lights', icon: '/icons/FlashLights.png', glassesListLabel: 'Flash lights', command: 'flash_lights' },
  { id: 'horn', icon: '/icons/Horn.png', glassesListLabel: 'Horn', command: 'honk_horn' },
];

export const CONTROL_COUNT = CONTROL_ACTIONS.length;

/** Item names for `ListItemContainerProperty.itemName` (same order as CONTROL_ACTIONS). */
export function buildGlassesListItemNames(): string[] {
  return CONTROL_ACTIONS.map((a) => a.glassesListLabel);
}
