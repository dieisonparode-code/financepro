-- Correção de um erro meu (19/08/2026): ao corrigir a trava de
-- "comandas_canceladas" mais cedo hoje, recriei o check constraint
-- olhando só pros tipos que JÁ existiam no banco até aquele momento — e
-- esqueci "funcionario", que o próprio código do servidor já previa como
-- tipo válido (só nunca tinha sido usado ainda). Corrigindo antes que dê
-- erro pra alguém.
alter table fechamentos_caixa
  drop constraint if exists fechamentos_caixa_tipo_check;

alter table fechamentos_caixa
  add constraint fechamentos_caixa_tipo_check
  check (tipo in (
    'caixa',
    'boy',
    'cozinha',
    'venda_prazo',
    'funcionario',
    'pago_dinheiro_caixa',
    'comandas_canceladas'
  ));
