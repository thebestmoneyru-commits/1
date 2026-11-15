import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(projectRoot, '.'),
      },
    },
    server: {
      // AI Studio's preview proxy may not expose Vite's HMR WebSocket.
      // Keep HMR/file watching off by default; opt in only in environments
      // where the Vite WebSocket is known to be reachable.
      hmr: process.env.ENABLE_HMR === 'true' && process.env.DISABLE_HMR !== 'true',
      watch: process.env.ENABLE_HMR === 'true' && process.env.DISABLE_HMR !== 'true' ? {} : null,
    },
  };
});
