-- Pedido do usuário (23/08/2026): botão no Fechamento de Caixa pra
-- anexar/tirar foto do comprovante do valor que vai pro Cofre (Fundo de
-- Retirada) — antes só dava pra fazer isso pela tela de Conciliação, sem
-- guardar a foto (só lia o valor e descartava). Agora guarda a foto de
-- evidência junto com o registro, igual toda outra foto do sistema.
alter table fundo_retiradas_caixa add column if not exists foto text default '';

-- Coluna solta (não computada) pra listagem poder saber se tem foto sem
-- baixar a imagem inteira — mesmo padrão já usado em fechamentos_caixa.
alter table fundo_retiradas_caixa add column if not exists tem_foto boolean not null default false;
