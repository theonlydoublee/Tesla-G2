import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: '.',
  plugins: [react()],
  appType: 'spa',
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 5173,
  },
});
