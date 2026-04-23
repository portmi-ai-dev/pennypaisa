import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, __dirname, '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      proxy: {
        // NOTE: target uses 127.0.0.1 (not 'localhost') because on macOS Node
        // resolves 'localhost' to ::1 first; uvicorn binds IPv4 by default,
        // which causes proxy ECONNREFUSED and a "Signal lost" UI.
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
        // Chat endpoint is mounted at /chat (no /api prefix) on the backend.
        // Without this rule, fetch('/chat/query') hits the Vite dev server,
        // gets a 404 HTML page, res.json() throws, and the UI shows "Signal lost".
        '/chat': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
