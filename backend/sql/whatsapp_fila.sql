-- Integração WhatsApp (17/08/2026): fotos que chegam no grupo sem
-- legenda reconhecida (ou com legenda errada) caem aqui pra alguém
-- classificar na mão depois, em vez de se perderem.
create table if not exists whatsapp_fila (
  id bigint generated always as identity primary key,
  loja_id bigint,
  foto text not null,
  legenda_recebida text,
  remetente text,
  criado_em timestamptz not null default now()
);
