import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';

const EXTERNALS = ['electron', 'ffmpeg-static', 'tiktok-live-connector', '@anthropic-ai/sdk'];

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            // Estos paquetes se cargan desde node_modules en tiempo de ejecución
            // (ffmpeg-static necesita su ruta real para encontrar el binario).
            rolldownOptions: { external: EXTERNALS },
          },
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: { build: { outDir: 'dist-electron' } },
      },
    }),
  ],
  build: { outDir: 'dist' },
});
