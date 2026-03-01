/**
 * Tesla controls: action definitions and icon mapping.
 * Single source of truth for the 8 glasses control actions.
 */

export interface ControlAction {
  id: string;
  icon: string;
  command: string;
  body?: Record<string, unknown>;
}

/** Charge is a toggle - determined at runtime from vehicle_data. */
export const CHARGE_ACTION_INDEX = 5;

export const CONTROL_ACTIONS: ControlAction[] = [
  { id: 'lock', icon: '/icons/Lock.png', command: 'door_lock' },
  { id: 'unlock', icon: '/icons/Unlock.png', command: 'door_unlock' },
  {
    id: 'frunk',
    icon: '/icons/Frunk.png',
    command: 'actuate_trunk',
    body: { which_trunk: 'front' },
  },
  {
    id: 'trunk',
    icon: '/icons/Trunk.png',
    command: 'actuate_trunk',
    body: { which_trunk: 'rear' },
  },
  { id: 'climate', icon: '/icons/Climate.png', command: 'auto_conditioning_start' },
  { id: 'charge', icon: '/icons/Charging.png', command: 'charge_start' }, // Toggle: charge_start or charge_stop at runtime
  { id: 'lights', icon: '/icons/FlashLights.png', command: 'flash_lights' },
  { id: 'horn', icon: '/icons/Horn.png', command: 'honk_horn' },
];

export const SELECTOR_ICON = '/icons/Selector.png';
export const CONTROL_COUNT = CONTROL_ACTIONS.length;

export type IconSizeKey = 'small' | 'medium' | 'large';
export const STORAGE_KEY_ICON_SIZE = 'tesla_controls_icon_size';

export const ICON_SIZE_MAP: Record<IconSizeKey, number> = {
  small: 20,
  medium: 30,
  large: 40,
};
