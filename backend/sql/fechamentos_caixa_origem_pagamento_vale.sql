-- Pedido do usuário (26/08/2026): "3 checkbox pequenos e bem
-- separados, para clicar de onde foi pago o vale, dinheiro do caixa...
-- pix... ou do cofre... de cada um precisa ter o rastro e descontar de
-- cada parte marcada" — guarda de onde saiu o dinheiro do vale (usado
-- só no tipo "vale") pra decidir, na finalização do fechamento, se
-- desconta o dinheiro do caixa, o Saldo geral (Pix) ou o Cofre.
alter table fechamentos_caixa
  add column if not exists origem_pagamento text;

alter table fechamentos_caixa
  add column if not exists fundo_retirada_id bigint references fundo_retiradas_caixa(id);
