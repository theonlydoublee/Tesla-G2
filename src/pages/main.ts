/** Static page data for main menu. Edit variables below for testing. */

// --- Editable static variables ---
const carName = 'MyTesla';
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

function buildLeftContent(): string {
  const lines = [
    carName,
    '',
    `Battery  ${batteryPercent}%  ${batteryMileage} mi`,
    '',
    drivingState,
  ];
  if (isCharging) {
    lines.push(chargingLabel);
    lines.push(chargingTimeLeft);
    lines.push('');
    lines.push(`${chargingSpeedMph} mi/hr    ${chargingPowerKw} kW`);
  }
  if (tokenDisplayAccess || tokenDisplayRefresh) {
    lines.push('');
    lines.push('API tokens  saved');
    if (tokenDisplayAccess) lines.push(`Access   ${tokenDisplayAccess}`);
    if (tokenDisplayRefresh) lines.push(`Refresh  ${tokenDisplayRefresh}`);
  }
  return lines.join('\n');
}

export interface PageData {
  leftContent: string;
  listItems: string[];
}

export const mainPageData: PageData = {
  get leftContent() {
    return buildLeftContent();
  },
  listItems: [
    'CONTROLS  >',
    'CLIMATE   Interior 115 F  >',
    'CHARGING  >',
  ],
};
