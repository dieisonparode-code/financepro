-- Pedido do usuário (25/08/2026): "ao lançar a folha ter a opção de
-- selecionar o funcionário e clicar em descontar vales e consumos aí
-- puxa o valor a ser descontado" — precisa marcar quando um vale
-- (despesa categoria "Vale") ou uma Venda a Prazo Funcionário (receita
-- "A prazo — NOME") JÁ foi usado numa folha de pagamento, senão o mesmo
-- valor pendente seria puxado de novo no mês seguinte.
alter table lancamentos
  add column if not exists quitado_em timestamptz;
