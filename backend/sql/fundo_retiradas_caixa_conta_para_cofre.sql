-- Pedido do usuário (23/08/2026): nem toda "retirada de frente de caixa"
-- detectada automaticamente (ou lançada manualmente pela Conciliação, foto
-- genérica) é dinheiro que realmente foi guardado no Cofre — muitas vezes
-- é uma retirada pra pagar algo na hora (ex: comprar mercado) que a Saipos
-- só registra como "retirada" genérica, sem motivo específico reconhecido.
-- Só quando vier explicitamente pelo botão "🔒 Retirada pro Cofre" do
-- Fechamento de Caixa é que soma de verdade no saldo do Cofre mostrado no
-- Dashboard — as demais continuam sendo criadas do mesmo jeito de antes
-- (guardadas como Fundo de Retirada, disponíveis pra usar como pagamento
-- de despesa depois), só não contam mais como "Cofre" no card do topo.
alter table fundo_retiradas_caixa add column if not exists conta_para_cofre boolean not null default true;

-- Ajusta os registros que já existiam antes dessa coluna existir: só os
-- criados pelo botão dedicado "Retirada pro Cofre" (descrição própria,
-- ver server.js) continuam contando como Cofre de verdade; os detectados
-- automaticamente na leitura da foto (ou lançados pela tela de
-- Conciliação, "registrar retirada com foto" genérico) passam a não
-- contar mais.
update fundo_retiradas_caixa
set conta_para_cofre = false
where descricao ilike '%detectado automaticamente%'
   or descricao ilike '%lançado com foto de comprovante direto na Conciliação%';
