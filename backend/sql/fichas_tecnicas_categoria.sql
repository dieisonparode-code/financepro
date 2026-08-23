-- Pedido do usuário (23/08/2026): agrupar as Fichas Técnicas por
-- categoria (Calotas, Calotinhas, Batatas, Bebidas, Porções) — a Saipos
-- não manda essa informação em nenhum endpoint disponível, por isso é um
-- campo próprio nosso, preenchido manualmente (ou sugerido automaticamente
-- pelo nome do produto ao importar, mas sempre editável).
alter table fichas_tecnicas add column if not exists categoria text default '';
