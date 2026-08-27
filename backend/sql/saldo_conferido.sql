-- Etapa 3 (Malha 3) do plano de confiabilidade — 27/08/2026
-- ---------------------------------------------------------------------------
-- Tira a âncora do card Saldo de dentro do código. Antes, reancorar o
-- Saldo era editar duas constantes no App.jsx (SALDO_INICIAL_VALOR /
-- SALDO_INICIAL_DATA) e fazer deploy — só o dev conseguia. Agora é um
-- registro nesta tabela, criado por uma tela (só admin).
--
-- Cada linha = "no dia X o saldo REAL da conta da loja Y era R$ Z". O card
-- Saldo pega o registro mais recente de cada loja e soma pra frente:
--   valor_real + receitas que caíram depois de data_referencia
--             - despesas com data depois de data_referencia
-- (mesma conta que as constantes faziam, só que vinda do banco e por loja).
create table if not exists saldo_conferido (
  id bigint primary key,
  loja_id bigint references lojas(id),
  data_referencia date not null,
  valor_real numeric not null,
  observacao text default '',
  informado_por text default '',
  criado_em timestamptz default now()
);

create index if not exists saldo_conferido_loja_data_idx
  on saldo_conferido (loja_id, data_referencia desc);

-- Semente: a âncora atual da Uberlândia (loja 4), migrada das constantes
-- da Etapa 0. valor_real = 70.303,83 no fim do dia 26/08 reproduz o saldo
-- real de 73.976,15 conferido em 27/08 depois de somar os movimentos de
-- 27/08. Depois desta linha, ninguém mais edita código pra reancorar.
insert into saldo_conferido
  (id, loja_id, data_referencia, valor_real, observacao, informado_por)
values
  (1756310400000, 4, '2026-08-26', 70303.83,
   'Semente da Etapa 3 — âncora migrada das constantes SALDO_INICIAL_* (saldo real 73.976,15 conferido em 27/08/2026, revertido pro fim do dia 26/08).',
   'sistema')
on conflict (id) do nothing;
