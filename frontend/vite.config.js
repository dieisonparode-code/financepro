import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // Etiqueta de versão visível no app (rodapé do menu lateral) — pra
  // conseguir confirmar com certeza absoluta qual versão está rodando no
  // aparelho de alguém, sem depender de suposição sobre cache de
  // navegador/PWA. A Vercel já expõe o SHA do commit como variável de
  // ambiente durante o build, sozinha.
  define: {
    __COMMIT_SHA__: JSON.stringify(
      process.env.VERCEL_GIT_COMMIT_SHA || 'dev'
    ),
  },
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
