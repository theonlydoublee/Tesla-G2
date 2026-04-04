/**
 * Tesla Fleet API region discovery via GET /api/1/users/region.
 * Wrong host returns 421; try NA then EU. China uses a separate developer program (not probed here).
 */

export const DEFAULT_FLEET_API_BASE = 'https://fleet-api.prd.na.vn.cloud.tesla.com';

const FLEET_HOST_CANDIDATES = [
  'https://fleet-api.prd.na.vn.cloud.tesla.com',
  'https://fleet-api.prd.eu.vn.cloud.tesla.com',
];

/**
 * @param {unknown} data - parsed JSON body
 * @returns {{ region: string, fleet_api_base: string } | null}
 */
function parseRegionResponse(data) {
  const r = data?.response ?? data;
  if (!r || typeof r !== 'object') return null;
  const rawBase =
    typeof r.fleet_api_base_url === 'string'
      ? r.fleet_api_base_url
      : typeof r.fleet_api_base === 'string'
        ? r.fleet_api_base
        : typeof r.uri === 'string'
          ? r.uri
          : null;
  if (!rawBase) return null;
  const fleet_api_base = String(rawBase).replace(/\/+$/, '');
  if (!fleet_api_base.startsWith('https://')) return null;
  const region =
    typeof r.region === 'string' && r.region.trim()
      ? r.region.trim()
      : typeof r.region_code === 'string' && r.region_code.trim()
        ? r.region_code.trim()
        : 'unknown';
  return { region, fleet_api_base };
}

/**
 * @param {string} accessToken
 * @returns {Promise<{ region: string, fleet_api_base: string } | null>}
 */
export async function discoverFleetRegion(accessToken) {
  for (const host of FLEET_HOST_CANDIDATES) {
    const base = host.replace(/\/+$/, '');
    try {
      const response = await fetch(`${base}/api/1/users/region`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        const parsed = parseRegionResponse(data);
        if (parsed) return parsed;
        console.warn('[tesla-region] Unexpected /users/region body:', JSON.stringify(data).slice(0, 200));
        continue;
      }
      if (response.status === 421) {
        continue;
      }
      console.warn('[tesla-region] /users/region HTTP', response.status, 'on', base);
    } catch (err) {
      console.warn('[tesla-region] /users/region fetch failed on', base, err.message);
    }
  }
  return null;
}

export function normalizeFleetApiBase(url) {
  if (!url || typeof url !== 'string') return DEFAULT_FLEET_API_BASE;
  const t = url.trim().replace(/\/+$/, '');
  return t.startsWith('https://') ? t : DEFAULT_FLEET_API_BASE;
}
