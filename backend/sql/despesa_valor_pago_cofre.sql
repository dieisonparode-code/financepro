-- Pedido do usuário (22/08/2026): despesa paga PARCIALMENTE com o
-- Cofre — ex: conta de R$600, R$200 vem do Cofre e R$400 desconta do
-- Saldo geral normal. Guarda quanto exatamente veio do Cofre (pode ser
-- menor que o valor total da despesa).
alter table lancamentos add column if not exists valor_pago_cofre numeric default 0;
