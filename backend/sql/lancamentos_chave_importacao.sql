-- Trava contra importação Saipos duplicada (01/09/2026): o dia 30/08
-- rodou 2x porque dois processos do backend rodaram a importação quase
-- ao mesmo tempo (SAIPOS_TOKEN piscando, 2 containers). A verificação
-- "olha se já existe → insere" não protege contra corrida. Agora cada
-- grupo importado carrega uma chave única e o Postgres RECUSA a 2ª
-- cópia sozinho, mesmo com processos concorrentes.
alter table lancamentos
  add column if not exists chave_importacao text;

create unique index if not exists lancamentos_chave_importacao_uidx
  on lancamentos (chave_importacao)
  where chave_importacao is not null;
