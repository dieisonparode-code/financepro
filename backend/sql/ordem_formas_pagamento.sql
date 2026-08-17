-- Pedido do usuário (17/08/2026): a ordem das linhas na Conciliação
-- (Esperado/Informado/Real em conta) deve seguir exatamente a ordem
-- impressa na tabela CONFERÊNCIA do comprovante da Saipos, e se ajustar
-- sozinha se a Saipos mudar a ordem — guarda a ordem lida da foto, um
-- array (não objeto JSON, que não garante ordem de chaves).
alter table fechamentos_caixa
  add column if not exists ordem_formas_pagamento text[];
