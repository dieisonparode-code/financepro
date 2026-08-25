-- Pedido do usuário (25/08/2026): tela de "Pagamento de salários"
-- precisa de uma lista de funcionários pra escolher (em vez de digitar
-- o nome livre toda vez, que causa erro de digitação e não bate o
-- desconto de vale/consumo depois).
create table if not exists funcionarios (
  id bigint generated always as identity primary key,
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
