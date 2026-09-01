-- Conferência do dinheiro do caixa (30/08/2026): guardar também o total
-- "Retiradas (-)" que a foto do fechamento imprime, pra cruzar com o que
-- o sistema consegue explicar (cofre + frente de caixa + pagos em
-- dinheiro). Abertura e "Em caixa" já eram salvos.
alter table caixa_dinheiro_informado
  add column if not exists retiradas_caixa numeric;
