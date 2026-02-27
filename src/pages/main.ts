/** Static page data for main menu. Edit variables below for testing. */

// --- Editable static variables ---
const carName = 'MyTeslaMyTeslaMyTesla';
const batteryPercent = 80;
const batteryMileage = 217;
const drivingState = 'Parked';
const isCharging = false;
const chargingLabel = 'Supercharging';
const chargingTimeLeft = '30 min remaining';
const chargingSpeedMph = 488;
const chargingPowerKw = 118;

/** Token display on main page (set when keys are saved). Masked: last 4 chars shown. */
let tokenDisplayAccess = '';
let tokenDisplayRefresh = '';

export function setTokenDisplay(accessToken: string | undefined, refreshToken: string | undefined): void {
  tokenDisplayAccess = typeof accessToken === 'string' && accessToken.length >= 4
    ? '••••' + accessToken.slice(-4)
    : accessToken ? '••••' : '';
  tokenDisplayRefresh = typeof refreshToken === 'string' && refreshToken.length >= 4
    ? '••••' + refreshToken.slice(-4)
    : refreshToken ? '••••' : '';
}

/** API-ready shape for canvas renderer. Replace static values with Tesla API later. */
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
  tokenDisplay: { access: string; refresh: string };
}

function buildTextContent(): string {
  const lines = [
    `${carName} - ${batteryPercent}% - ${batteryMileage} mi`,
    drivingState,
  ];
  if (isCharging) {
    lines.push(chargingLabel);
    lines.push(chargingTimeLeft);
    lines.push(`${chargingSpeedMph} mi/hr    ${chargingPowerKw} kW`);
  }
  return lines.join('\n');
}

export interface PageData {
  textContent: string;
  listItems: string[];
}

export const mainPageData: PageData = {
  textContent: buildTextContent(),
  listItems: [
    'CONTROLS  >',
    'CLIMATE   Interior 115 F  >',
    'CHARGING  >',
  ],
};
