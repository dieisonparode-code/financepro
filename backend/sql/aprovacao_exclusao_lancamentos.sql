-- Pedido do usuário (21/08/2026): aprovação de exclusão de lançamentos —
-- mesma trava que já existe pra CRIAR uma despesa (aprovacao_despesas_ativa),
-- agora também pra EXCLUIR. Quem não é admin não apaga direto — só pede,
-- e o admin confirma ou rejeita.
alter table lancamentos add column if not exists exclusao_solicitada_em timestamptz;
alter table lancamentos add column if not exists exclusao_solicitada_por text;
