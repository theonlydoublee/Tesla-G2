/**
 * Tesla OAuth token exchange API and Fleet proxy.
 * Sessions: UUID on client (Authorization Bearer), tokens in SQLite on server.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { Agent } from 'undici';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  insertSession,
  deleteSession,
  getAccessTokenForSession,
  refreshAllSessionsScheduled,
} from './tesla-sessions.js';

/** Dispatcher that accepts self-signed certs (for Tesla Command Proxy on localhost). */
const insecureDispatcher = new Agent({ connect: { rejectUnauthorized: false } });

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_PATH = join(__dirname, '..', 'dist');

const app = express();
const TESLA_TOKEN_URL = 'https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token';
const FLEET_AUDIENCE = 'https://fleet-api.prd.na.vn.cloud.tesla.com';

const PORT = process.env.PORT || 3000;
const DEFAULT_ORIGIN = 'https://even.thedevcave.xyz';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || DEFAULT_ORIGIN;
const ALLOWED_ORIGINS_EXTRA = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const corsOrigins = [...new Set([ALLOWED_ORIGIN, ...ALLOWED_ORIGINS_EXTRA])];
/** `*` in ALLOWED_ORIGIN or ALLOWED_ORIGINS means reflect any Origin (do not list literal "*"). */
const CORS_ALLOW_ALL =
  ALLOWED_ORIGIN === '*' ||
  ALLOWED_ORIGINS_EXTRA.includes('*') ||
  (corsOrigins.length === 1 && corsOrigins[0] === '*');

app.use(
  cors({
    origin(origin, cb) {
      if (CORS_ALLOW_ALL) return cb(null, true);
      if (!origin) return cb(null, true);
      if (corsOrigins.includes(origin)) return cb(null, true);
      cb(null, false);
    },
  }),
);
app.use(express.json());

// Prevent caching of HTML and assets so new builds are always used
app.use((req, res, next) => {
  if (req.path.endsWith('.html') || req.path.startsWith('/assets/')) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  }
  next();
});

// Serve static files (Vite build) - dist/ is in project root
app.use(express.static(DIST_PATH));

function parseBearerSessionId(req) {
  const raw = req.headers.authorization;
  if (!raw?.startsWith('Bearer ')) return null;
  const id = raw.slice(7).trim();
  return id || null;
}

async function resolveTeslaAuthorization(req, res) {
  const sessionId = parseBearerSessionId(req);
  if (!sessionId) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return null;
  }
  try {
    const access = await getAccessTokenForSession(sessionId);
    return `Bearer ${access}`;
  } catch (e) {
    const status =
      e.status === 401 || e.code === 'INVALID_SESSION' ? 401 : e.status === 500 ? 500 : 502;
    res.status(status).json({
      error: e.message || 'Session error',
      error_description: e.teslaBody?.error_description,
    });
    return null;
  }
}

// Public config (client_id is not secret)
app.get('/api/tesla/config', (req, res) => {
  const clientId = process.env.TESLA_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ error: 'Tesla client not configured' });
  }
  res.json({ clientId });
});

app.post('/api/tesla/exchange-token', async (req, res) => {
  const { code, redirect_uri } = req.body;
  const clientId = process.env.TESLA_CLIENT_ID;
  const clientSecret = process.env.TESLA_CLIENT_SECRET;
  const redirect = redirect_uri || process.env.TESLA_REDIRECT_URI;

  if (!code || !clientId || !clientSecret || !redirect) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['code'],
      hint: !clientId || !clientSecret ? 'Configure TESLA_CLIENT_ID and TESLA_CLIENT_SECRET' : undefined,
    });
  }

  try {
    const response = await fetch(TESLA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirect,
        audience: FLEET_AUDIENCE,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error || 'Token exchange failed',
        error_description: data.error_description,
      });
    }

    const session_id = insertSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
    });

    return res.json({ session_id });
  } catch (err) {
    console.error('Token exchange error:', err);
    return res.status(500).json({ error: 'Token exchange failed' });
  }
});

app.delete('/api/tesla/session', (req, res) => {
  const sessionId = parseBearerSessionId(req);
  if (!sessionId) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  deleteSession(sessionId);
  return res.status(204).end();
});

const FLEET_API_BASE = 'https://fleet-api.prd.na.vn.cloud.tesla.com';

// Proxy Fleet API requests (avoids CORS - Tesla blocks browser direct calls)
app.get('/api/tesla/vehicles', async (req, res) => {
  const auth = await resolveTeslaAuthorization(req, res);
  if (!auth) return;
  try {
    const response = await fetch(`${FLEET_API_BASE}/api/1/vehicles`, {
      headers: { Authorization: auth },
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error('Tesla vehicles proxy error:', err);
    res.status(500).json({ error: 'Failed to fetch vehicles' });
  }
});

app.get('/api/tesla/vehicle_data/:vin', async (req, res) => {
  const auth = await resolveTeslaAuthorization(req, res);
  if (!auth) return;
  const { vin } = req.params;
  if (!vin) {
    return res.status(400).json({ error: 'Missing VIN' });
  }
  try {
    const response = await fetch(`${FLEET_API_BASE}/api/1/vehicles/${vin}/vehicle_data`, {
      headers: { Authorization: auth },
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error('Tesla vehicle_data proxy error:', err);
    res.status(500).json({ error: 'Failed to fetch vehicle data' });
  }
});

const TESLA_COMMAND_PROXY_URL = process.env.TESLA_COMMAND_PROXY_URL?.replace(/\/$/, '');

// Check if virtual key is paired (for hiding the "add virtual key" note).
// Sends a harmless door_lock; 200 = key works, 403 = key not added.
app.get('/api/tesla/check-virtual-key', async (req, res) => {
  const auth = await resolveTeslaAuthorization(req, res);
  if (!auth) return;
  const { vehicleId, vin } = req.query;
  const vid = vehicleId || vin;
  if (!vid) {
    return res.status(400).json({ error: 'Missing vehicleId or vin' });
  }
  try {
    const fetchOpts = {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: '{}',
    };
    let targetUrl;
    if (TESLA_COMMAND_PROXY_URL && vin) {
      targetUrl = `${TESLA_COMMAND_PROXY_URL}/api/1/vehicles/${vin}/command/door_lock`;
      fetchOpts.dispatcher = insecureDispatcher;
    } else {
      targetUrl = `${FLEET_API_BASE}/api/1/vehicles/${vid}/command/door_lock`;
    }
    const response = await fetch(targetUrl, fetchOpts);
    const virtualKeyAdded = response.status === 200;
    res.json({ virtualKeyAdded });
  } catch (err) {
    console.error('Tesla check-virtual-key error:', err);
    res.json({ virtualKeyAdded: false });
  }
});

// Tesla Fleet API command proxy - vehicle commands (lock, unlock, frunk, etc.)
const ALLOWED_COMMANDS = new Set([
  'door_lock',
  'door_unlock',
  'actuate_trunk',
  'auto_conditioning_start',
  'auto_conditioning_stop',
  'charge_start',
  'charge_stop',
  'flash_lights',
  'honk_horn',
]);

app.post('/api/tesla/command/:vehicleId/:command', async (req, res) => {
  const auth = await resolveTeslaAuthorization(req, res);
  if (!auth) return;
  const { vehicleId, command } = req.params;
  const body = req.body;
  const vin = req.body?.vin;
  if (!vehicleId || !command) {
    return res.status(400).json({ error: 'Missing vehicleId or command' });
  }
  if (!ALLOWED_COMMANDS.has(command)) {
    return res.status(400).json({ error: `Unknown command: ${command}` });
  }
  const { vin: _vin, ...cmdBody } = body || {};
  const requestBody = Object.keys(cmdBody).length ? cmdBody : undefined;
  try {
    const fetchOpts = {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: requestBody ? JSON.stringify(requestBody) : '{}',
    };
    let targetUrl;
    if (TESLA_COMMAND_PROXY_URL && vin) {
      targetUrl = `${TESLA_COMMAND_PROXY_URL}/api/1/vehicles/${vin}/command/${command}`;
      fetchOpts.dispatcher = insecureDispatcher;
    } else {
      targetUrl = `${FLEET_API_BASE}/api/1/vehicles/${vehicleId}/command/${command}`;
    }
    const response = await fetch(targetUrl, fetchOpts);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error('Tesla command proxy error:', err);
    res.status(500).json({ error: 'Failed to send command' });
  }
});

// SPA fallback: serve index.html for non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(join(DIST_PATH, 'index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

const cronOptions = process.env.TZ ? { timezone: process.env.TZ } : {};
cron.schedule(
  '0 3 * * *',
  () => {
    refreshAllSessionsScheduled().catch((err) => console.error('[tesla-sessions] Cron:', err));
  },
  cronOptions,
);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Tesla auth API listening on port ${PORT}`);
  console.log('[tesla-sessions] Daily session refresh scheduled at 03:00 (server local time, or TZ if set)');
});
