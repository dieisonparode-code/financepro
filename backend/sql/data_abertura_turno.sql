-- BUG REAL corrigido (17/08/2026): o sistema agrupava/buscava Saipos e
-- PagSeguro pela data de quando a FOTO foi enviada (criado_em), não pela
-- data real de abertura do caixa impressa no comprovante. Se a foto for
-- enviada bem depois do fechamento físico (ex: só de manhã seguinte),
-- o sistema procurava dinheiro no dia errado. Agora guarda a data de
-- abertura lida direto do papel, fonte de verdade pra tudo.
alter table fechamentos_caixa
  add column if not exists data_abertura_turno date;
