-- Pedido do usuário (25/08/2026): Feed do Dia / Lançamentos ao Vivo —
-- cada card do feed precisa mostrar QUEM lançou. A tabela lancamentos
-- não guardava isso até agora (nenhuma coluna de autor).
alter table lancamentos
  add column if not exists criado_por text;
