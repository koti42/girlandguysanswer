import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-helmet': ['react-helmet-async'],
          'vendor-echo': ['laravel-echo', 'pusher-js'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
})
