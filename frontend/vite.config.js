import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // autoUpdate: sempre que publicar uma versão nova, o app se atualiza
      // sozinho no próximo carregamento (sem precisar desinstalar/limpar
      // cache) - continua bastando um F5 normal, igual já era.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'FinancePro',
        short_name: 'FinancePro',
        description: 'Gestão financeira profissional e centralizada.',
        lang: 'pt-BR',
        theme_color: '#0753cc',
        background_color: '#040914',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Não guarda em cache as chamadas de API pro backend - o app tem
        // que sempre buscar dados financeiros direto do servidor, nunca
        // uma cópia antiga guardada no celular/navegador.
        navigateFallbackDenylist: [/^\/api\//],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
