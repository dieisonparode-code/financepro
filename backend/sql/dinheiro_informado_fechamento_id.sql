-- Pedido do usuário (19/08/2026): o indicador "em dinheiro" do card Saldo
-- nunca somava nada porque a confirmação de "quanto sobrou no fechamento"
-- (em caixa contado − abertura) nunca estava ligada a nenhum botão — só
-- as despesas pagas em dinheiro descontavam. Agora ela é preenchida
-- sozinha toda vez que a foto do fechamento de Dinheiro é lida na
-- Conciliação. Esse fechamento_id evita duplicar: se a mesma foto for
-- lida de novo (correção), atualiza o registro em vez de somar de novo.
alter table caixa_dinheiro_informado
  add column if not exists fechamento_id bigint;

create index if not exists caixa_dinheiro_informado_fechamento_id_idx
  on caixa_dinheiro_informado (fechamento_id);
