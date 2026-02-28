/**
 * Tesla OAuth token exchange API.
 * Exchanges authorization code for access and refresh tokens.
 * Run from Docker/: npm start  (after npm run build from project root)
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_PATH = join(__dirname, '..', 'dist');

const app = express();
const TESLA_TOKEN_URL = 'https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token';
const FLEET_AUDIENCE = 'https://fleet-api.prd.na.vn.cloud.tesla.com';

const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://even.thedevcave.xyz';

app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json());

// Serve static files (Vite build) - dist/ is in project root
app.use(express.static(DIST_PATH));

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

    return res.json({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
    });
  } catch (err) {
    console.error('Token exchange error:', err);
    return res.status(500).json({ error: 'Token exchange failed' });
  }
});

const FLEET_API_BASE = 'https://fleet-api.prd.na.vn.cloud.tesla.com';

// Proxy Fleet API requests (avoids CORS - Tesla blocks browser direct calls)
app.get('/api/tesla/vehicles', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }
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

// SPA fallback: serve index.html for non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(join(DIST_PATH, 'index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Tesla auth API listening on port ${PORT}`);
});
