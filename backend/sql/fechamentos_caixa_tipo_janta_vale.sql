-- Pedido do usuário (24/08/2026): 2 botões novos no Fechamento de Caixa —
-- "Jantas" (mesmo fluxo de Diária Boy/Cozinha, vira despesa em Contas a
-- Pagar) e "Vale" (dinheiro que a EMPRESA vai receber de volta do
-- funcionário, vira receita prevista em Contas a Receber).
--
-- IMPORTANTE (aprendido do incidente do "caixa_1"/"caixa_2" mais cedo
-- hoje, 24/08/2026): a tabela fechamentos_caixa tem um CHECK CONSTRAINT
-- na coluna "tipo" que trava no banco quais valores são aceitos — se o
-- código manda um tipo novo ("janta", "vale") sem esse constraint
-- atualizado ANTES, toda tentativa de salvar quebra com "violates check
-- constraint fechamentos_caixa_tipo_check", derrubando o Fechamento de
-- Caixa inteiro (Foto 1, Foto 2, tudo) até alguém rodar essa correção.
-- Rode esse SQL ANTES (ou junto) do deploy do código que usa "janta" e
-- "vale", nunca depois.
alter table fechamentos_caixa
  drop constraint if exists fechamentos_caixa_tipo_check;

alter table fechamentos_caixa
  add constraint fechamentos_caixa_tipo_check
  check (tipo in (
    'caixa',
    'caixa_1',
    'caixa_2',
    'boy',
    'cozinha',
    'janta',
    'vale',
    'venda_prazo',
    'funcionario',
    'pago_dinheiro_caixa',
    'comandas_canceladas'
  ));
