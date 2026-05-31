import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    open: false,
    proxy: {
      '/api': {
        target: 'http://192.168.27.156:8081',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'http://192.168.27.156:8081', // ✅ FIX: was 192.168.27.150
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
});