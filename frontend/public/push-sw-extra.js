// Pedido do usuário (25/08/2026): notificação push de verdade (estilo
// WhatsApp), mesmo com o app fechado. Esse arquivo é injetado dentro do
// Service Worker gerado automaticamente (via workbox.importScripts no
// vite.config.js) — só ADICIONA os eventos de push, não muda nada do
// mecanismo de cache/atualização já existente (aquele que já foi
// bastante ajustado antes, com cuidado, pra não travar/dar tela branca).
self.addEventListener("push", function (evento) {
  let dados = {};

  try {
    dados = evento.data ? evento.data.json() : {};
  } catch (erro) {
    dados = {};
  }

  const titulo = dados.title || "FinancePro";
  const opcoes = {
    body: dados.body || "",
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    data: { url: dados.url || "/" },
    tag: dados.tag || undefined,
  };

  evento.waitUntil(self.registration.showNotification(titulo, opcoes));
});

self.addEventListener("notificationclick", function (evento) {
  evento.notification.close();

  const url = evento.notification.data?.url || "/";

  evento.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (listaDeClientes) {
        for (const cliente of listaDeClientes) {
          if (cliente.url.includes(self.location.origin) && "focus" in cliente) {
            cliente.navigate(url);
            return cliente.focus();
          }
        }

        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
