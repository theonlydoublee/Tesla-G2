/** Main page data from Tesla API. Live data, no static variables. */

/** API-ready shape for canvas renderer. */
export interface MainPageData {
  carName: string;
  batteryPercent: number;
  batteryMileage: number;
  drivingState: string;
  isCharging: boolean;
  chargingInfo: {
    label: string;
    timeLeft: string;
    speedMph: number;
    powerKw: number;
  } | null;
}

export interface PageData {
  textContent: string;
  listItems: string[];
}

/** Tesla vehicle_data API response shape (subset we use). */
export interface TeslaVehicleDataResponse {
  display_name?: string | null;
  climate_state?: {
    is_climate_on?: boolean | null;
  } | null;
  charge_state?: {
    battery_level?: number | null;
    usable_battery_level?: number | null;
    battery_range?: number | null;
    est_battery_range?: number | null;
    ideal_battery_range?: number | null;
    charging_state?: string | null;
    charge_rate?: number | null;
    charger_power?: number | null;
    minutes_to_full_charge?: number | null;
    time_to_full_charge?: number | null;
    fast_charger_present?: boolean | null;
  } | null;
  drive_state?: {
    shift_state?: string | null;
  } | null;
  vehicle_state?: {
    locked?: boolean | null;
  } | null;
}

const FALLBACK_TEXT = 'Vehicle data unavailable';

/** Shown on glasses when vehicle_data returns asleep / offline (e.g. HTTP 408). */
export function buildVehicleAsleepMainText(displayName: string): string {
  const name = displayName?.trim() || 'Vehicle';
  return `${name} is asleep.\nSend wake command`;
}

function formatDriveState(shiftState: string | null | undefined): string {
  if (shiftState == null || shiftState === '') return 'Parked';
  switch (shiftState) {
    case 'D': return 'Drive';
    case 'R': return 'Reverse';
    case 'N': return 'Neutral';
    case 'P': return 'Parked';
    default: return shiftState;
  }
}

function formatChargingTime(minutes: number | null | undefined, hours: number | null | undefined): string {
  if (minutes != null && minutes > 0) {
    if (minutes >= 60) {
      const h = Math.floor(minutes / 60);
      const m = Math.round(minutes % 60);
      return m > 0 ? `${h}h ${m}m remaining` : `${h}h remaining`;
    }
    return `${Math.round(minutes)} min remaining`;
  }
  if (hours != null && hours > 0) {
    return `${hours.toFixed(1)}h remaining`;
  }
  return '';
}

/**
 * Build main page text content from Tesla vehicle_data API response.
 * Use preferredDisplayName (e.g. from locally stored selected vehicle) for the car name when provided.
 * Returns fallback text if data is missing or invalid.
 */
export function buildTextContentFromVehicleData(
  vehicleData: TeslaVehicleDataResponse | null | undefined,
  preferredDisplayName?: string | null,
): string {
  if (!vehicleData) return FALLBACK_TEXT;

  const displayName = preferredDisplayName ?? vehicleData.display_name ?? 'Tesla';
  const chargeState = vehicleData.charge_state;
  const driveState = vehicleData.drive_state;
  const batteryLevel = chargeState?.battery_level ?? chargeState?.usable_battery_level ?? 0;
  const batteryRange =
    chargeState?.battery_range ?? chargeState?.est_battery_range ?? chargeState?.ideal_battery_range ?? 0;
  const mileage = Math.round(batteryRange);
  const shiftState = driveState?.shift_state ?? null;
  const drivingStateStr = formatDriveState(shiftState);
  const locked = vehicleData.vehicle_state?.locked;
  const drivingLine =
    typeof locked === 'boolean'
      ? `${drivingStateStr} - ${locked ? 'Locked' : 'Unlocked'}`
      : drivingStateStr;
  const chargingState = chargeState?.charging_state ?? '';
  const isCharging = chargingState === 'Charging' || chargingState === 'Starting';

  const climateState = vehicleData.climate_state;
  const climateOn = climateState?.is_climate_on === true;

  const lines = [
    `${displayName} - ${batteryLevel}% - ${mileage} mi`,
    drivingLine,
    climateOn ? 'Climate: On' : 'Climate: Off',
  ];

  if (isCharging && chargeState) {
    const label = chargeState.fast_charger_present ? 'Supercharging' : 'Charging';
    lines.push(label);
    const timeLeft = formatChargingTime(
      chargeState.minutes_to_full_charge,
      chargeState.time_to_full_charge,
    );
    if (timeLeft) lines.push(timeLeft);
    const rate = chargeState.charge_rate ?? 0;
    const power = chargeState.charger_power ?? 0;
    lines.push(`${rate} mi/hr    ${power} kW`);
  }

  return lines.join('\n');
}

/** Called when a Tesla server session is active (OAuth tokens stay on server). */
export function markSessionConnected(): void {
  // No-op: session is not displayed on glasses UI.
}
