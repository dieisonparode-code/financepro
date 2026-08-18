-- Pedido do usuário (18/08/2026): a tela Contas Pagas mostrava só a
-- DATA do pagamento (sem horário) — quando várias contas eram pagas no
-- mesmo dia, a ordem entre elas ficava sem sentido (não dava pra saber
-- qual foi paga primeiro). Guarda o momento exato do pagamento.
alter table contas_pagar
  add column if not exists pago_em timestamptz;
