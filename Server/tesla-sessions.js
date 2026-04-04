/**
 * SQLite-backed Tesla OAuth sessions: UUID on client, tokens on server.
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { discoverFleetRegion, normalizeFleetApiBase, DEFAULT_FLEET_API_BASE } from './tesla-region.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TESLA_TOKEN_URL = 'https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token';
const DEFAULT_DB_PATH = join(__dirname, 'tesla-sessions.sqlite');
const REFRESH_SKEW_MS = 5 * 60 * 1000;

const dbPath = process.env.TESLA_SESSIONS_DB || DEFAULT_DB_PATH;
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS tesla_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    refresh_token TEXT NOT NULL,
    access_token TEXT,
    access_expires_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

function migrateSessionColumns() {
  const cols = db.prepare('PRAGMA table_info(tesla_sessions)').all();
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('region')) {
    db.exec('ALTER TABLE tesla_sessions ADD COLUMN region TEXT');
  }
  if (!names.has('fleet_api_base')) {
    db.exec('ALTER TABLE tesla_sessions ADD COLUMN fleet_api_base TEXT');
  }
}

migrateSessionColumns();

function createQueue() {
  let p = Promise.resolve();
  return (fn) => {
    const result = p.then(() => fn());
    p = result.then(
      () => {},
      () => {},
    );
    return result;
  };
}

const sessionQueues = new Map();

function getSessionQueue(sessionId) {
  if (!sessionQueues.has(sessionId)) {
    sessionQueues.set(sessionId, createQueue());
  }
  return sessionQueues.get(sessionId);
}

function getRow(sessionId) {
  return db.prepare('SELECT * FROM tesla_sessions WHERE id = ?').get(sessionId);
}

function updateSessionAfterRefresh(sessionId, access_token, refresh_token, expires_in) {
  const now = Date.now();
  const access_expires_at = now + (Number(expires_in) || 0) * 1000;
  db.prepare(
    `UPDATE tesla_sessions SET refresh_token = ?, access_token = ?, access_expires_at = ?, updated_at = ? WHERE id = ?`,
  ).run(refresh_token, access_token, access_expires_at, now, sessionId);
}

/**
 * @param {{
 *   access_token: string,
 *   refresh_token: string,
 *   expires_in?: number,
 *   region?: string | null,
 *   fleet_api_base?: string | null,
 * }} tokens
 * @returns {string} session id (UUID)
 */
export function insertSession(tokens) {
  const id = randomUUID();
  const now = Date.now();
  const access_expires_at = now + (Number(tokens.expires_in) || 0) * 1000;
  const region = tokens.region != null ? tokens.region : null;
  const fleet_api_base = tokens.fleet_api_base != null ? tokens.fleet_api_base : null;
  db.prepare(
    `INSERT INTO tesla_sessions (id, refresh_token, access_token, access_expires_at, created_at, updated_at, region, fleet_api_base)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tokens.refresh_token,
    tokens.access_token,
    access_expires_at,
    now,
    now,
    region,
    fleet_api_base,
  );
  return id;
}

export function deleteSession(sessionId) {
  const r = db.prepare('DELETE FROM tesla_sessions WHERE id = ?').run(sessionId);
  sessionQueues.delete(sessionId);
  return r.changes > 0;
}

async function callTeslaRefresh(refreshToken) {
  const clientId = process.env.TESLA_CLIENT_ID;
  if (!clientId) {
    const err = new Error('TESLA_CLIENT_ID not configured');
    err.status = 500;
    throw err;
  }

  const response = await fetch(TESLA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: refreshToken,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data.error_description || data.error || 'Token refresh failed');
    err.status = response.status === 401 ? 401 : response.status;
    err.teslaBody = data;
    throw err;
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    expires_in: data.expires_in,
  };
}

/**
 * @param {string} sessionId
 * @param {boolean} [forceRefresh]
 * @returns {Promise<string>} Tesla access token
 */
export async function getAccessTokenForSession(sessionId, forceRefresh = false) {
  return getSessionQueue(sessionId)(async () => {
    const row = getRow(sessionId);
    if (!row) {
      const err = new Error('Invalid or expired session');
      err.code = 'INVALID_SESSION';
      err.status = 401;
      throw err;
    }

    const now = Date.now();
    if (
      !forceRefresh &&
      row.access_token &&
      row.access_expires_at &&
      row.access_expires_at > now + REFRESH_SKEW_MS
    ) {
      return row.access_token;
    }

    try {
      const out = await callTeslaRefresh(row.refresh_token);
      updateSessionAfterRefresh(sessionId, out.access_token, out.refresh_token, out.expires_in);
      return out.access_token;
    } catch (e) {
      if (e.status === 401) {
        deleteSession(sessionId);
      }
      throw e;
    }
  });
}

/**
 * Fleet API origin for this session (per-user region). Lazy backfill for legacy DB rows.
 * Not run inside getAccessTokenForSession queue to avoid deadlock.
 *
 * @param {string} sessionId
 * @returns {Promise<string>} Normalized https origin without trailing slash
 */
export async function getFleetApiBaseForSession(sessionId) {
  const row = getRow(sessionId);
  if (!row) {
    const err = new Error('Invalid or expired session');
    err.code = 'INVALID_SESSION';
    err.status = 401;
    throw err;
  }
  if (row.fleet_api_base) {
    return normalizeFleetApiBase(row.fleet_api_base);
  }

  const accessToken = await getAccessTokenForSession(sessionId);
  const discovered = await discoverFleetRegion(accessToken);
  const base = discovered?.fleet_api_base
    ? normalizeFleetApiBase(discovered.fleet_api_base)
    : DEFAULT_FLEET_API_BASE;
  const region = discovered?.region ?? 'unknown';
  if (!discovered) {
    console.warn('[tesla-sessions] Region discovery failed; using NA Fleet base for session', sessionId);
  }
  const now = Date.now();
  db.prepare(
    `UPDATE tesla_sessions SET region = ?, fleet_api_base = ?, updated_at = ? WHERE id = ?`,
  ).run(region, base, now, sessionId);
  return base;
}

/** Daily job: refresh every stored session (serialized per id). */
export async function refreshAllSessionsScheduled() {
  const rows = db.prepare('SELECT id FROM tesla_sessions').all();
  for (const { id } of rows) {
    try {
      await getAccessTokenForSession(id, true);
    } catch (e) {
      console.error(`[tesla-sessions] Scheduled refresh failed for session ${id}:`, e.message || e);
    }
  }
}
