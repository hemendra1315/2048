import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { createRequire } from 'module';

const { version } = createRequire(import.meta.url)('./package.json');

// https://vitejs.dev/config/
export default defineConfig({
  // The version shown in-app (Settings, game settings) comes from here, so it can't drift from
  // the actual release like the old hardcoded "Games 2.4.0" did.
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/@supabase')) {
            return 'vendor-supabase';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-lucide';
          }
          if (id.includes('src/components/admin/')) {
            return 'feature-admin';
          }
        },
      },
    },
  },
  server: {
    port: 3000,
    host: true,
  },
});
