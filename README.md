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
