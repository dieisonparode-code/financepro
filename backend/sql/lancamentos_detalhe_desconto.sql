-- Pedido do usuário (25/08/2026): Conferência do Dia precisa mostrar,
-- ao ver os detalhes de um pagamento de salário, quais vales/consumos
-- foram descontados dele. Guarda esse detalhamento (id/descrição/valor
-- de cada item descontado) junto com o próprio lançamento da despesa.
alter table lancamentos add column if not exists detalhe_desconto jsonb;
