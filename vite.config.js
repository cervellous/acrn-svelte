import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      registerType: false,
      injectRegister: null,
      manifest: {
        name: 'ACRN Protocol',
        short_name: 'ACRN',
        description: 'ACRN tinnitus treatment protocol',
        theme_color: '#000000',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: '/favicon.ico',
            sizes: '64x64 32x32 24x24 16x16',
            type: 'image/x-icon'
          }
        ]
      }
    }),
    viteSingleFile()
  ],
  base: './',
  build: {
    cssCodeSplit: false,
    assetsInlineLimit: 100000000
  }
})
