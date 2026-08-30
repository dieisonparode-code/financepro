-- segredos_app — segredos de integração que hoje só viviam em variável de
-- ambiente do Render (e sumiam a cada restart/redeploy, parando a
-- importação da Saipos). O repo é público, então não dá pra commitar o
-- valor: o backend lê daqui (via service key) e usa process.env só como
-- override. Ver lerSegredoApp() em backend/server.js.

create table if not exists segredos_app (
  chave text primary key,
  valor text not null,
  atualizado_em timestamptz not null default now()
);

-- RLS ligada e SEM policy nenhuma: nem anon nem usuário logado leem esta
-- tabela pelo PostgREST. Só a service key (que o backend usa) enxerga.
alter table segredos_app enable row level security;

-- Rode UMA vez com o valor real (NÃO comitar o token preenchido):
-- insert into segredos_app (chave, valor)
-- values ('SAIPOS_TOKEN', 'COLE_O_TOKEN_AQUI')
-- on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
