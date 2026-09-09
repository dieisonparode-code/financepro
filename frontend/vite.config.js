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
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
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
        // Pedido do usuário (05/09/2026): PagSeguro compartilhava certo
        // (gera comprovante como imagem), mas o Sicredi não aparecia como
        // opção de compartilhar no Android — o accept só cobria imagem,
        // e o Sicredi provavelmente gera o comprovante como PDF (ou outro
        // tipo). Ampliado pra cobrir PDF, texto e qualquer arquivo binário,
        // assim nenhum banco fica de fora por causa do tipo do arquivo.
        share_target: {
          action: '/compartilhar-comprovante',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            files: [
              {
                name: 'comprovante',
                accept: [
                  'image/*',
                  'application/pdf',
                  'text/plain',
                  'application/*',
                ],
              },
            ],
          },
        },
      },
      workbox: {
        // Não guarda em cache as chamadas de API pro backend - o app tem
        // que sempre buscar dados financeiros direto do servidor, nunca
        // uma cópia antiga guardada no celular/navegador.
        navigateFallbackDenylist: [/^\/api\//],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Pedido do usuário (25/08/2026): notificação push de verdade a
        // cada lançamento novo (Feed do Dia). "importScripts" injeta
        // esse arquivo DENTRO do Service Worker gerado automaticamente,
        // só adicionando os eventos de push — não troca a estratégia de
        // cache/atualização já existente (evita reabrir os bugs de tela
        // branca já resolvidos antes com muito cuidado).
        //
        // share-target-sw.js (28/08/2026): mesmo esquema — só adiciona o
        // handler do "compartilhar comprovante" (Android). Não mexe em
        // cache/navegação: só intercepta o POST /compartilhar-comprovante.
        importScripts: ['push-sw-extra.js', 'share-target-sw.js'],
      },
    }),
  ],
})
