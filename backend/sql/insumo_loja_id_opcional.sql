-- Pedido do usuário (22/08/2026): insumo "de todas as lojas" — um
-- registro só, sem loja específica (loja_id null), que aparece em
-- qualquer loja filtrada. A coluna loja_id tinha uma trava NOT NULL que
-- não deixava isso acontecer.
alter table insumos alter column loja_id drop not null;
