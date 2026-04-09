export type DisplayUnits = 'imperial' | 'metric';

export function parseDisplayUnits(raw: string | null | undefined): DisplayUnits {
  const s = raw != null ? String(raw).trim().toLowerCase() : '';
  if (s === 'metric') return 'metric';
  return 'imperial';
}
