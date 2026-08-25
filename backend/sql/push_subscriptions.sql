-- Pedido do usuário (25/08/2026): notificação push de verdade (estilo
-- WhatsApp, mesmo com o app fechado) a cada lançamento novo. Cada
-- aparelho/navegador que ativar as notificações salva uma "inscrição"
-- aqui (endpoint + chaves de criptografia do navegador) — o servidor
-- usa isso pra mandar a notificação via Web Push, sem precisar de
-- nenhum app nativo instalado.
create table if not exists push_subscriptions (
  id bigint generated always as identity primary key,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  criado_por text,
  criado_em timestamptz not null default now()
);
