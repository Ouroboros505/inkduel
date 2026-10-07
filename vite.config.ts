import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API runs under `wrangler dev` on :8787 (npm run dev starts both); Vite
// forwards /api to it, WebSockets included. In production the Pages site does the same through
// a service binding, so the app always talks to its own origin.
const api = { '/api': { target: 'http://localhost:8787', ws: true } };

export default defineConfig({
  plugins: [react()],
  server: {
    // Every interface, so phones and Chromebooks on the same Wi-Fi can join a test game.
    host: true,
    allowedHosts: true,
    // The source tree lives on an rclone FUSE mount, where inotify is unreliable.
    watch: { usePolling: true, interval: 400 },
    proxy: api,
  },
  preview: { host: true, proxy: api },
  build: {
    rollupOptions: {
      // Built files live under assets/b2/: a new folder for these names, because the old ones
      // were cached at one Cloudflare edge as HTML (see public/_redirects) and that token can't purge.
      output: {
        entryFileNames: 'assets/b2/[name]-[hash].js',
        chunkFileNames: 'assets/b2/[name]-[hash].js',
        assetFileNames: 'assets/b2/[name]-[hash][extname]',
      },
    },
  },
});
