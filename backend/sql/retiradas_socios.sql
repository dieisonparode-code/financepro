-- Pedido do usuário (20/08/2026): retiradas de dinheiro pros sócios —
-- precisa dar baixa no Saldo e aparecer nos Relatórios, mas NUNCA
-- aparecer em Contas Pagas (tela que todo mundo com acesso a despesas
-- vê) nem em Despesas comuns. Por isso é uma tabela própria, separada de
-- "lancamentos" — só admin acessa essa tela inteira.
create table if not exists retiradas_socios (
  id bigint primary key,
  loja_id bigint references lojas(id),
  socio text not null,
  valor numeric not null,
  data date not null,
  observacao text default '',
  criado_por text default '',
  criado_em timestamptz default now()
);

create index if not exists retiradas_socios_data_idx on retiradas_socios (data);
create index if not exists retiradas_socios_loja_idx on retiradas_socios (loja_id);
