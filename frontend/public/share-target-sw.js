// Pedido do usuário (28/08/2026): no Android, depois de pagar uma conta no
// app do banco, dá pra usar "compartilhar" e mandar o comprovante DIRETO
// pro FinancePro — a IA lê valor/fornecedor e lança a despesa como conta
// paga, já dando baixa no Saldo.
//
// Isso é o "Web Share Target": o navegador entrega o arquivo compartilhado
// como um POST pra /compartilhar-comprovante. Esse arquivo é injetado
// DENTRO do Service Worker gerado automaticamente (via workbox.importScripts
// no vite.config.js), no mesmo esquema já usado pelo push-sw-extra.js —
// só ADICIONA esse handler, não mexe em nada do cache/atualização.
//
// Só funciona em PWA INSTALADO no Android (iOS não suporta Share Target).

self.addEventListener("fetch", function (evento) {
  let url;
  try {
    url = new URL(evento.request.url);
  } catch (erro) {
    return;
  }

  if (
    evento.request.method !== "POST" ||
    url.pathname !== "/compartilhar-comprovante"
  ) {
    return;
  }

  evento.respondWith(
    (async function () {
      try {
        const formData = await evento.request.formData();
        const arquivo =
          formData.get("comprovante") ||
          formData.get("arquivo") ||
          formData.get("file");

        if (arquivo && typeof arquivo === "object" && arquivo.size) {
          const cache = await caches.open("comprovante-compartilhado");
          await cache.put(
            "/__comprovante-compartilhado",
            new Response(arquivo, {
              headers: {
                "Content-Type": arquivo.type || "image/jpeg",
                "X-Nome-Arquivo": encodeURIComponent(arquivo.name || "comprovante"),
              },
            })
          );
        }
      } catch (erro) {
        // Mesmo se falhar em ler o arquivo, redireciona pro app — melhor
        // abrir vazio do que o compartilhamento parecer que "não fez nada".
      }

      // 303 = o navegador troca o POST por um GET nessa URL. O app, ao
      // carregar com ?comprovante=1, pega o arquivo do cache e segue o
      // fluxo. pagina=despesas só pra deixar a tela de Despesas no fundo.
      return Response.redirect("/?pagina=despesas&comprovante=1", 303);
    })()
  );
});
