-- Conferência do dinheiro do caixa (31/08/2026): guardar também a LISTA
-- de retiradas de frente de caixa que a foto do fechamento imprime, com a
-- linha "Conta:" de cada uma (ex: "Cofre"). Quando a Saipos marca a
-- retirada como "Conta: Cofre", dá pra conferir exatamente quanto era
-- pro Cofre × quanto foi registrado no sistema. Só leitura, não entra em
-- cálculo de Saldo.
alter table caixa_dinheiro_informado
  add column if not exists retiradas_detalhe jsonb;
