import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 3500,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'lucide-react'],
          'supabase-vendor': ['@supabase/supabase-js'],
          'excel-vendor': ['exceljs', 'xlsx'],
        },
      },
    },
  },
});
