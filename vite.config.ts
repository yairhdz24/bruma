import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  clearScreen: false,
  server: { strictPort: true, port: 1420, host: '127.0.0.1' },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: { target: ['es2022', 'safari15'], chunkSizeWarningLimit: 700 },
});
