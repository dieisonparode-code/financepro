# Regras de negócio do FinancePro

> Fonte única das regras financeiras do sistema. Mudou uma regra? Muda aqui
> **e** nos testes (`frontend/src/utils/calculoFinanceiro.test.js`).
> Última revisão: 27/08/2026.

---

## 1. O que alimenta cada card do Dashboard

Cálculo centralizado em `frontend/src/utils/calculoFinanceiro.js`. Todos os
cards e telas (Dashboard, Fluxo de Caixa, Relatórios) usam as mesmas funções.

| Card | O que é | Fórmula |
|---|---|---|
| **Receitas** | Tudo que foi vendido no período (regime de competência / accrual), bruto | soma de `valor` de todas as receitas do mês/loja |
| **Despesas** | Tudo que foi gasto no período | soma de `valor` de todas as despesas do mês/loja |
| **Fluxo de Caixa** | Resultado do período | Receitas − Despesas |
| **Saldo** | Dinheiro que **já é real** agora | base conferida + receitas que já caíram − despesas − retiradas de sócios + empréstimos entre lojas (desde o ponto de âncora) |
| **Próximos Recebimentos** | Dinheiro a caminho | receitas ainda pendentes (prazo futuro, não conciliadas), em valor líquido |

**Receitas conta bruto no dia da venda; Saldo só soma quando o dinheiro cai.**
É intencional — não unificar.

---

## 2. "Esta receita já caiu na conta?" — `receitaJaCaiu(item, hoje)`

A decisão que separa Saldo de Próximos Recebimentos. Regra única:

1. Receita **sem** `data_prevista_recebimento` (Pix/dinheiro na hora) → **já caiu**.
2. Receita com `status_conciliacao === "conciliado"` → **já caiu** (conferida na mão), qualquer data.
3. Receita com prazo, não conciliada → caiu **quando o prazo chega** (`data_prevista_recebimento <= hoje`). Enquanto o prazo é futuro, fica só em Próximos Recebimentos.

`hoje` = data no fuso fixo `America/Sao_Paulo` (`hojeLocal()`), nunca o relógio do aparelho.

Histórico: de 26 a 27/08/2026 a regra exigia conciliação manual pra QUALQUER
venda com prazo — como nada era conciliado, nenhuma venda entrava no Saldo e
ele só caía. Corrigido (commit `95a0519`).

---

## 3. Âncora do Saldo — tabela `saldo_conferido` (Etapa 3)

O Saldo **não** acumula desde o começo dos tempos. Ele parte de um ponto
conferido contra o extrato real do banco e soma pra frente.

- Tela **🏦 Conferência de Saldo** (só admin): você digita o saldo REAL do
  banco de uma loja numa data.
- O card usa o registro **mais recente de cada loja** como `valor_real`
  (base) e `data_referencia` (corte). Tudo antes do corte já está embutido.
- Sem registro pra uma loja → cai no fallback das constantes
  `SALDO_INICIAL_VALOR` / `SALDO_INICIAL_DATA` em `App.jsx`.
- **Reancorar = cadastrar um registro novo pela tela.** Nunca mais editar
  código pra isso.

Semente atual: loja 4 (Uberlândia), 26/08/2026, R$ 70.303,83 — reconstrói o
saldo real de R$ 73.976,15 conferido em 27/08.

---

## 4. Divergência do Saldo (Etapa 4)

Sem integração bancária, a segurança do Saldo vem de **reconferir na mão**.

- **Banner no Dashboard**: mostra há quantos dias o Saldo não é conferido e
  quanto o sistema diz que ele andou desde então. Azul até 3 dias, âmbar
  4–7, vermelho 8+.
- **Na tela de Conferência**: ao salvar um saldo novo, mostra o que o
  sistema previa pra aquela data e a diferença. Verde se `|dif| < R$ 200`,
  vermelho acima — nesse caso é **despesa não lançada ou taxa errada** no
  período.

---

## 5. Taxas e prazos por forma de pagamento

Configurável em **Contas a Receber → Formas de Pagamento**. Valores em uso
(loja Uberlândia, confirmados até 10/08/2026):

| Forma | Taxa | Prazo |
|---|---|---|
| Cartão de Débito (PagSeguro) | 0,99% | D+1 |
| Cartão de Crédito (PagSeguro) | 2,50% | D+1 |
| PIX (qualquer canal — balcão, iFood, Brendi) | 0,90% | D+0 (cai na hora) |
| iFood (crédito/pago online) | **12,16%** | semana fechada seg–dom, paga na **quarta da semana seguinte** |
| Brendi (crédito online) | 3,99% | D+1 |
| Funcionário (venda a prazo) | 0% | 1º dia útil do mês seguinte |

**Taxa do iFood — como foi definida (27/08/2026):** conferido com repasse
real. Semana 17–23/08: bruto R$ 7.115,91, caiu na conta em 26/08 (quarta)
R$ 6.250,65. `taxa = 1 − (6.250,65 ÷ 7.115,91) = 12,16%`. Registrado no
`log_auditoria`. A taxa efetiva do iFood **varia de semana pra semana**
(promoção, incentivo, mix) — já deu 10,7% e 11,7% em semanas de agosto.
**Reconferir 1×/mês** com um repasse real; ajustar pela tela Formas de
Pagamento (tem calculadora: bruto vendido × valor que caiu → %).
Lançamentos já importados **não** recalculam — só as importações
seguintes usam a taxa nova.

**Pendências conhecidas:**
- **Brendi**: a taxa fixa de R$ 0,40/pedido + 0,5% do Pix da Brendi **não**
  está modelada (usa o balde genérico "PIX" 0,90%). Aproximação aceita.

**Regra do repasse semanal (iFood)**: `proximaDataSemanalAposFechamento()` —
replicada em `backend/server.js` e `frontend/src/App.jsx`. Assume janela
seg–dom paga na quarta seguinte. Se outra forma usar `dia_semana_pagamento`
com janela diferente, generalizar a função.

---

## 6. Importação automática da Saipos

- Roda a cada minuto (`rodarImportacaoAutomaticaDiariaSaipos` em
  `server.js`), importa o **dia anterior** por volta das **05h** (Brasília),
  pra toda loja com `saipos_id_store`.
- **Idempotente**: marca `[SAIPOS:idloja:data:canal]` no campo `observacao`
  pra reconhecer o que já foi importado e atualizar em vez de duplicar.
- Só marca o dia como concluído se **todas** as lojas importarem sem erro
  (senão fica sem tentar de novo por horas).
- Agrupa por **canal** (iFood, Brendi) ou, no balcão, por forma de
  pagamento. Pix de qualquer canal cai como D+0 separado do repasse.
- Voucher/desconto de parceiro **não** conta como receita.
- Débito/Crédito cobrado na entrega (motoboy) segue a taxa/prazo da própria
  forma, imediato — não entra no repasse semanal do canal.

---

## 7. Travas e permissões

- **Receita manual**: só o perfil `administrador` cria/edita/exclui
  lançamento de `tipo = "receita"`. Backend bloqueia com 403; frontend
  esconde os botões.
- **Mês fechado**: lançamento com `data` de um mês anterior ao atual
  (fuso Brasília) não pode ser editado/excluído. Exceção: o administrador
  consegue, confirmando a própria senha de login. Tudo vai pro Log de
  Auditoria.
- **Despesa paga com o Cofre** (fundo de retirada): a parte
  `valor_pago_cofre` **não** desconta o Saldo de novo (o dinheiro já saiu
  do caixa na retirada).
- **Toda mudança de taxa/prazo** ou valor sensível vai pro
  `log_auditoria` — inclusive ajustes feitos por script direto no Supabase.

---

## 8. Regras que o usuário confirmou e NÃO devem mudar sem avisar

- Nunca misturar dados de uma loja com outra. Todo total exibido por loja
  não pode incluir dado de outra.
- Receitas = competência (quanto vendi). Saldo = caixa (quanto já tenho).
- O modelo do Saldo é `base conferida + entradas − saídas`, **sem
  integração bancária**. A segurança vem de reconferir contra o extrato de
  vez em quando (Etapa 4) e da disciplina de lançar **toda** saída como
  despesa.
- Expansão pras outras lojas (Sinop/Sorriso/Rondonópolis) só depois do
  Saldo de Uberlândia bater consistente com o banco por ~1–2 semanas.

---

## 9. Antes de publicar (checklist)

1. `cd frontend && npm test` — 19 testes verdes (trava o cálculo do dinheiro).
2. `npm run build` — sem erro.
3. `npm run lint` — sem **erro** novo (warnings pré-existentes ok).
4. Se mexeu em regra de dinheiro: conferir contra dado real que o Saldo de
   Uberlândia continua batendo (hoje: R$ 73.976,15).
5. `git push` → Vercel (frontend) e Render (backend) publicam sozinhos.
6. Depois do push importante: conferir no bundle publicado (curl numa
   string única do commit) antes de dizer "testa agora" — o Vercel às
   vezes atrasa.
