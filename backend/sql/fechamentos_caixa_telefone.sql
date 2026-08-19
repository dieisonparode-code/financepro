-- Pedido do usuário (19/08/2026): a foto de "Comandas Canceladas" agora
-- também lê nome, valor e telefone automaticamente (igual já acontece
-- com Diária Boy/Cozinha) — nome já tinha coluna (nome_pessoa) e valor
-- também, só faltava telefone.
alter table fechamentos_caixa
  add column if not exists telefone text;
