# Tesla Auth API

Token exchange backend for Tesla OAuth on `even.thedevcave.xyz`. Runs directly on the Linux machine (no Docker).

## Prerequisites

- Node.js 18+ (or 20+)
- Tesla Developer Portal app (Client ID, Client Secret)
- Domain `even.thedevcave.xyz` pointing to this machine

## Tesla Developer Portal

1. Go to [Tesla Developer Portal](https://developer.tesla.com/)
2. Create a Developer Application
3. Add Redirect URI: `https://even.thedevcave.xyz/auth/callback`
4. Copy Client ID and Client Secret

## Environment

```bash
cd Docker
cp .env.example .env
# Edit .env with your values:
# TESLA_CLIENT_ID=xxx
# TESLA_CLIENT_SECRET=xxx
# TESLA_REDIRECT_URI=https://even.thedevcave.xyz/auth/callback
# ALLOWED_ORIGIN=https://even.thedevcave.xyz
```

## Build and run

### 1. Build the Vite app (from project root)

```bash
npm run build
```

### 2. Install API dependencies and run (from project root)

```bash
cd Docker
npm install
npm start
```

Or from project root in one go:

```bash
npm run build && cd Docker && npm install && npm start
```

The API listens on port 3000 and serves the static app plus `/api/tesla/exchange-token`, `/api/tesla/config`, and vehicle command proxy.

**Vehicle commands (lock, unlock, etc.) return 403** unless you set up Tesla's Vehicle Command Proxy. See [COMMAND_SETUP.md](COMMAND_SETUP.md).

### Run in background (e.g. with pm2)

```bash
cd Docker
npm install
pm2 start server.js --name tesla-auth
pm2 save
pm2 startup
```

Or with `nohup`:

```bash
cd Docker
npm install
nohup node server.js > tesla-auth.log 2>&1 &
```

## Reverse proxy (HTTPS)

Configure Nginx or Caddy so that `https://even.thedevcave.xyz` proxies to `http://localhost:3000`.

Example Caddy (auto HTTPS):

```
even.thedevcave.xyz {
  reverse_proxy localhost:3000
}
```

Example Nginx:

```nginx
server {
  listen 443 ssl;
  server_name even.thedevcave.xyz;
  ssl_certificate /path/to/cert.pem;
  ssl_certificate_key /path/to/key.pem;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## DNS

Point `even.thedevcave.xyz` A record to your Linux machine's public IP.
