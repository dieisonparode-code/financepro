-- Bug encontrado (19/08/2026): a tela "Comandas Canceladas" (adicionada
-- em 16/08/2026) manda tipo="comandas_canceladas" pro fechamentos_caixa,
-- mas o check constraint da tabela nunca foi atualizado pra aceitar esse
-- valor novo — toda foto de comanda cancelada dava erro
-- "violates check constraint fechamentos_caixa_tipo_check" e não salvava.
alter table fechamentos_caixa
  drop constraint if exists fechamentos_caixa_tipo_check;

alter table fechamentos_caixa
  add constraint fechamentos_caixa_tipo_check
  check (tipo in (
    'caixa',
    'boy',
    'cozinha',
    'venda_prazo',
    'pago_dinheiro_caixa',
    'comandas_canceladas'
  ));
