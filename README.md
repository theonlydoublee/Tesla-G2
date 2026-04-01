# Tesla – Even G2 app

Tesla vehicle status and controls for Even G2 (Even Hub) glasses, using [@evenrealities/even_hub_sdk](https://www.npmjs.com/package/@evenrealities/even_hub_sdk) and the notes in **API-Documentation/G2.md**.

## What’s set up

- **Entry:** `index.html` loads the app; `src/main.js` is the entry module.
- **Bridge:** Waits for `waitForEvenAppBridge()`, then calls `createStartUpPageContainer` once at startup.
- **Layout:** Left status panel (vehicle info, battery, driving state) + right scrollable menu list. Two containers per page: text container (`isEventCapture: 0`) and list container (`isEventCapture: 1`).
- **Pages:** Main menu (Controls, Climate, Charging) and themed sub-pages with `rebuildPageContainer` navigation.
- **Events:** `onEvenHubEvent` handles:
  - **Click** (including `eventType === undefined` per G2.md quirk).
  - **Double-click** → `shutDownPageContainer(1)` (exit with confirmation).
  - **List selection** for menu navigation and sub-page actions.
- **Settings:** Phone-side credentials panel for Tesla API access and refresh tokens; uses `@jappyjan/even-realities-ui` design tokens.
- **Build:** Vite bundles the app for development and production.

## Run locally

```bash
npm install
npm run dev
```

Then in the Even App on your iPhone, open the URL shown (e.g. `http://<your-machine-ip>:5173`) so the WebView loads your app and the G2 glasses can display it.

## Build for production

When the UI is served as static files only (for example after `npm run pack` / `.ehpk` on the phone), Tesla API routes live on your **deployed Node server**, not on the phone. This repo includes [`.env.production`](.env.production) so `npm run build` defaults `VITE_API_BASE_URL` to `https://even.thedevcave.xyz`; change that file (or use `.env.production.local`) if your API host differs. Keep **only** `VITE_*` keys in that file; Tesla secrets and `ALLOWED_ORIGIN` belong in [Server/.env](Server/.env.example) for the Node process, not in Vite’s env (and never commit real secrets).

**Glasses + `.ehpk`:** Keep the app on the **plugin WebView origin** (no redirect). The [Even Hub bridge](https://hub.evenrealities.com/docs/getting-started/architecture) talks to the phone app over the WebView session; loading your UI from a different origin (e.g. after a full-page redirect to `https://even.thedevcave.xyz`) typically **stops display updates** on the glasses. Use `VITE_API_BASE_URL` so API calls hit your server while the UI stays on the pack URL, and register that pack **redirect URI** in the Tesla portal.

**Optional redirect:** To force the WebView to your hosted site (single OAuth origin), set `VITE_REDIRECT_TO_HOSTED=true` when building. That can break glasses until Even supports your hosted origin as a first-class plugin URL—prefer the default (no redirect) for hardware. `npm run dev` never injects this script.

You can also set variables ad hoc before building:

```bash
# Windows PowerShell
$env:VITE_API_BASE_URL="https://your-api-host.example"; npm run build

# Unix
VITE_API_BASE_URL=https://your-api-host.example npm run build
```

You can also use a root `.env` or `.env.production` with `VITE_API_BASE_URL=...` (see [.env.example](.env.example)). On the server, add the Even Hub WebView **Origin** to `ALLOWED_ORIGINS` in [Server/.env.example](Server/.env.example) so cross-origin `fetch` calls succeed.

```bash
npm run build
```

Output is in `dist/`. Deploy that folder to any static host; the Even App will load your app from that URL.

## Packaging and distribution

Use [@evenrealities/evenhub-cli](https://www.npmjs.com/package/@evenrealities/evenhub-cli) to package for Even Hub distribution:

```bash
npm run pack
```

To validate `app.json` without building:

```bash
npm run pack:check
```

To generate a QR code for sideloading onto the Even App:

```bash
npm run qr
```

## Reference

- **API and behavior:** `API-Documentation/G2.md`
- **UI/UX (App layer, gestures, layout):** `Software Design Guidelines/Glasses Interface Guidelines.pdf`
