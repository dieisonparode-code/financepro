-- Pedido do usuário (19/08/2026): duas correções na Despesa Recorrente.
--
-- 1) "mes_inicio" — quando a pessoa cadastra uma recorrente DEPOIS que o
-- dia de vencimento daquele mês já passou (ex: cadastra dia 19 uma
-- recorrente com vencimento dia 10), o sistema gerava a conta desse mês
-- na hora, já "atrasada" — mesmo quando a intenção era só começar a
-- contar a partir do mês seguinte. Esse campo guarda a partir de qual
-- mês (AAAA-MM) a recorrente vale de verdade; null = sem restrição
-- (comportamento de sempre).
alter table despesas_recorrentes
  add column if not exists mes_inicio text;

-- 2) Bug real encontrado (19/08/2026): a geração automática roda tanto na
-- hora de cadastrar quanto no relógio de fundo (a cada minuto) — as duas
-- podem disparar quase juntas pra uma recorrente recém-criada, e a
-- checagem "já existe?" feita em código (SELECT depois INSERT) tem uma
-- brecha de tempo onde as duas passam pela checagem antes de qualquer
-- uma terminar de inserir, gerando duas contas iguais pro mesmo mês. Uma
-- trava única no próprio banco fecha essa brecha de vez.
alter table contas_pagar
  add column if not exists recorrente_id bigint;

alter table contas_pagar
  add column if not exists recorrente_ano_mes text;

create unique index if not exists contas_pagar_recorrente_unico_idx
  on contas_pagar (recorrente_id, recorrente_ano_mes)
  where recorrente_id is not null;
