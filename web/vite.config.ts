import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import pkg from './package.json' with { type: 'json' };

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // dev/preview: forward /api to the Flask server (python api/run.py), so the app and API share one origin
  const proxy = { '/api': { target: env.VITE_API_PROXY || 'http://127.0.0.1:8080', changeOrigin: true } };
  return {
    plugins: [react()],
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    worker: { format: 'es' },
    server: { port: 5173, proxy },
    preview: { port: 4173, proxy },
  };
});
