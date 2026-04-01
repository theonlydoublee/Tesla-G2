import { copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Optional production-only redirect: Even Hub injects `EvenAppBridge` into the plugin WebView.
 * Navigating to an external origin (e.g. your HTTPS deploy) usually breaks glasses display.
 * Default: off. Set VITE_REDIRECT_TO_HOSTED=true only if you accept that tradeoff (e.g. OAuth-only).
 */
function hostedAppRedirectPlugin() {
  return {
    name: 'hosted-app-redirect',
    transformIndexHtml(html, ctx) {
      if (ctx.server) return html;
      const raw =
        process.env.VITE_HOSTED_APP_ORIGIN?.trim() ||
        process.env.VITE_API_BASE_URL?.trim() ||
        'https://even.thedevcave.xyz';
      const hosted = raw.replace(/\/+$/, '');
      const script = `<script>(function(){var H=${JSON.stringify(hosted)};try{var o=window.location.origin;var p=window.location.pathname||'/';var q=window.location.search||'';var x=window.location.hash||'';if(window.location.protocol==='file:'||o==='null'||o!==H){window.location.replace(H+p+q+x);}}catch(e){}})();</script>`;
      return html.replace('<head>', `<head>${script}`);
    },
  };
}

const redirectToHosted =
  process.env.VITE_REDIRECT_TO_HOSTED === 'true' ||
  process.env.VITE_REDIRECT_TO_HOSTED === '1';

/** Even Hub pack resolves PNG basenames against dist root; app still fetches /icons/*.png. */
function copyIconBasenamesToDistRoot() {
  return {
    name: 'copy-icon-basenames-to-dist-root',
    closeBundle() {
      const dist = join(process.cwd(), 'dist');
      const iconsDir = join(dist, 'icons');
      if (!existsSync(iconsDir)) return;
      for (const name of readdirSync(iconsDir)) {
        if (!name.endsWith('.png')) continue;
        copyFileSync(join(iconsDir, name), join(dist, name));
      }
    },
  };
}

export default defineConfig({
  root: '.',
  plugins: [
    react(),
    ...(redirectToHosted ? [hostedAppRedirectPlugin()] : []),
    copyIconBasenamesToDistRoot(),
  ],
  appType: 'spa',
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 5173,
  },
});
