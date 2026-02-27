# Tesla Auth API (Docker)

Token exchange backend for Tesla OAuth on `even.thedevcave.xyz`.

## Prerequisites

- Docker
- Docker Compose
- Tesla Developer Portal app (Client ID, Client Secret)
- Domain `even.thedevcave.xyz` pointing to this machine

## Tesla Developer Portal

1. Go to [Tesla Developer Portal](https://developer.tesla.com/)
2. Create a Developer Application
3. Add Redirect URI: `https://even.thedevcave.xyz/auth/callback`
4. Copy Client ID and Client Secret

## Environment

```bash
cp .env.example .env
# Edit .env with your values:
# TESLA_CLIENT_ID=xxx
# TESLA_CLIENT_SECRET=xxx
# TESLA_REDIRECT_URI=https://even.thedevcave.xyz/auth/callback
# ALLOWED_ORIGIN=https://even.thedevcave.xyz
```

## Build and run

From the `Docker` directory (context is project root; Dockerfile builds the app in-stage):

```bash
cd Docker
docker compose build
docker compose up -d
```

The API listens on port 3000 and serves the static app and `/api/tesla/exchange-token`.

## Reverse proxy (HTTPS)

Configure Nginx or Caddy so that `https://even.thedevcave.xyz`:

- Proxies all traffic to `http://localhost:3000`, OR
- Proxies `/api/*` to `http://localhost:3000` and serves static files from `dist/`

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
