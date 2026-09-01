import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/*.png', 'push-sw.js'],
      manifest: {
        name: 'AgroFlow+',
        short_name: 'AgroFlow+',
        description: 'AI-powered agricultural marketplace for Nigerian farmers',
        theme_color: '#a8d832',
        background_color: '#0f1f11',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,woff2}'],
        globIgnores: ['**/favicon.svg'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        importScripts: ['/push-sw.js'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/ai-farmer-platform-backend-code\.onrender\.com\/api\/listings/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-listings',
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
        ],
      },
    }),
  ],
})