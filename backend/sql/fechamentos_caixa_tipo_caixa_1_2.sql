-- BUG REAL corrigido (24/08/2026): o botão "Fechamento de Caixa — Foto 1"
-- e "— Foto 2" salvavam com o MESMO tipo ("caixa") — depois de salvo não
-- dava pra saber qual foto era qual, toda entrada aparecia como "Foto 1"
-- na lista. Corrigido separando em "caixa_1"/"caixa_2" (ver server.js e
-- CadastroFechamentoCaixa.jsx) — só que, igual aconteceu antes com
-- "comandas_canceladas" e "funcionario", o check constraint da tabela
-- nunca foi atualizado pra aceitar os valores novos, e toda tentativa de
-- salvar um Fechamento de Caixa (as duas fotos) começou a dar erro
-- "violates check constraint fechamentos_caixa_tipo_check" sem salvar
-- nada. "caixa" continua na lista só por compatibilidade com registros
-- antigos (não é mais usado por código novo).
alter table fechamentos_caixa
  drop constraint if exists fechamentos_caixa_tipo_check;

alter table fechamentos_caixa
  add constraint fechamentos_caixa_tipo_check
  check (tipo in (
    'caixa',
    'caixa_1',
    'caixa_2',
    'boy',
    'cozinha',
    'venda_prazo',
    'funcionario',
    'pago_dinheiro_caixa',
    'comandas_canceladas'
  ));
