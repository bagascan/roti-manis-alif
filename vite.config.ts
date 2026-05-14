import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt', // Berubah menjadi prompt agar muncul notifikasi "Update Tersedia"
      includeAssets: ['logo.jpeg', 'logo-192x192.png', 'logo-512x512.png'],
      manifest: {
        name: 'ROTI MANIS ARIF',
        short_name: 'Arif POS',
        description: 'Aplikasi Kasir Roti Manis Arif',
        theme_color: '#f59e0b',
        background_color: '#fafaf9',
        display: 'standalone',
        icons: [
          {
            src: 'logo-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'logo-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
