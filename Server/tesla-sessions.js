/**
 * SQLite-backed Tesla OAuth sessions: UUID on client, tokens on server.
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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
 * @param {{ access_token: string, refresh_token: string, expires_in?: number }} tokens
 * @returns {string} session id (UUID)
 */
export function insertSession(tokens) {
  const id = randomUUID();
  const now = Date.now();
  const access_expires_at = now + (Number(tokens.expires_in) || 0) * 1000;
  db.prepare(
    `INSERT INTO tesla_sessions (id, refresh_token, access_token, access_expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tokens.refresh_token,
    tokens.access_token,
    access_expires_at,
    now,
    now,
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
