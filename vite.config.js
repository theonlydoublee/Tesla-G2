import { copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
  plugins: [react(), copyIconBasenamesToDistRoot()],
  appType: 'spa',
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 5173,
  },
});
