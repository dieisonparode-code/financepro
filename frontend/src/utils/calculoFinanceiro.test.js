// ============================================================================
// Etapa 2 (Malha 2) do plano de confiabilidade — 27/08/2026
// ----------------------------------------------------------------------------
// Testes do cálculo do dinheiro. Rodar: `npm test` (usa o `node --test`
// nativo, sem dependência nova). Se algum quebrar, o deploy NÃO deve subir.
//
// Além dos testes de unidade, cada regressão real das últimas 2 semanas
// virou um teste nomeado abaixo ("REGRESSÃO ...") pra nunca mais voltar.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";
import {
  receitaJaCaiu,
  receitaPendente,
  valorLiquidoReceita,
  valorBrutoReceita,
  valorDespesa,
  somaReceitasAccrual,
  somaReceitasRecebidas,
  somaReceitasPendentes,
  somaDespesas,
} from "./calculoFinanceiro.js";

const HOJE = "2026-08-27";

// helpers de fixture
const receita = (o = {}) => ({ tipo: "receita", valor: 100, ...o });
const despesa = (o = {}) => ({ tipo: "despesa", valor: 100, ...o });

// ---------------------------------------------------------------------------
test("receitaJaCaiu: sem prazo (Pix/dinheiro na hora) já caiu", () => {
  assert.equal(receitaJaCaiu(receita({ data_prevista_recebimento: null }), HOJE), true);
  assert.equal(receitaJaCaiu(receita({}), HOJE), true);
});

test("receitaJaCaiu: com prazo futuro e não conciliada => ainda NÃO caiu", () => {
  assert.equal(
    receitaJaCaiu(
      receita({ data_prevista_recebimento: "2026-09-02", status_conciliacao: "pendente" }),
      HOJE
    ),
    false
  );
});

test("receitaJaCaiu: prazo == hoje => já caiu", () => {
  assert.equal(
    receitaJaCaiu(receita({ data_prevista_recebimento: HOJE, status_conciliacao: "pendente" }), HOJE),
    true
  );
});

test("receitaJaCaiu: prazo passado => já caiu", () => {
  assert.equal(
    receitaJaCaiu(
      receita({ data_prevista_recebimento: "2026-08-20", status_conciliacao: "pendente" }),
      HOJE
    ),
    true
  );
});

test("receitaJaCaiu: conciliada manualmente conta mesmo com prazo futuro", () => {
  assert.equal(
    receitaJaCaiu(
      receita({ data_prevista_recebimento: "2026-12-31", status_conciliacao: "conciliado" }),
      HOJE
    ),
    true
  );
});

test("receitaPendente é o inverso de receitaJaCaiu", () => {
  const itens = [
    receita({ data_prevista_recebimento: null }),
    receita({ data_prevista_recebimento: "2026-09-02", status_conciliacao: "pendente" }),
    receita({ data_prevista_recebimento: "2026-08-01", status_conciliacao: "pendente" }),
    receita({ data_prevista_recebimento: "2026-09-02", status_conciliacao: "conciliado" }),
  ];
  for (const it of itens) {
    assert.equal(receitaPendente(it, HOJE), !receitaJaCaiu(it, HOJE));
  }
});

// ---------------------------------------------------------------------------
test("valorLiquidoReceita usa valor_liquido_esperado quando existe, senão valor", () => {
  assert.equal(valorLiquidoReceita({ valor: 100, valor_liquido_esperado: 96.5 }), 96.5);
  assert.equal(valorLiquidoReceita({ valor: 100 }), 100);
  assert.equal(valorLiquidoReceita({ valor: 100, valor_liquido_esperado: null }), 100);
  assert.equal(valorLiquidoReceita({}), 0);
});

test("valorBrutoReceita é sempre o valor cheio", () => {
  assert.equal(valorBrutoReceita({ valor: 100, valor_liquido_esperado: 96.5 }), 100);
  assert.equal(valorBrutoReceita({}), 0);
});

test("valorDespesa: descontarCofre tira a parte paga com o Cofre", () => {
  assert.equal(valorDespesa({ valor: 300 }), 300);
  assert.equal(valorDespesa({ valor: 300, valor_pago_cofre: 120 }), 300); // sem flag: valor cheio
  assert.equal(valorDespesa({ valor: 300, valor_pago_cofre: 120 }, { descontarCofre: true }), 180);
  assert.equal(valorDespesa({ valor: 300, valor_pago_cofre: 300 }, { descontarCofre: true }), 0);
});

// ---------------------------------------------------------------------------
test("somaReceitasAccrual soma tudo, pendente ou não", () => {
  const lista = [
    receita({ valor: 100 }),
    receita({ valor: 50, data_prevista_recebimento: "2026-12-01", status_conciliacao: "pendente" }),
    despesa({ valor: 999 }),
  ];
  assert.equal(somaReceitasAccrual(lista), 150);
});

test("somaReceitasRecebidas: exclui pendentes, escolhe líquido ou bruto", () => {
  const lista = [
    receita({ valor: 100, valor_liquido_esperado: 99 }), // sem prazo -> caiu
    receita({
      valor: 200,
      valor_liquido_esperado: 190,
      data_prevista_recebimento: "2026-08-26",
      status_conciliacao: "pendente",
    }), // prazo vencido -> caiu
    receita({
      valor: 500,
      valor_liquido_esperado: 480,
      data_prevista_recebimento: "2026-09-10",
      status_conciliacao: "pendente",
    }), // prazo futuro -> NÃO caiu
  ];
  assert.equal(somaReceitasRecebidas(lista, HOJE, { liquido: true }), 99 + 190);
  assert.equal(somaReceitasRecebidas(lista, HOJE, { liquido: false }), 100 + 200);
  assert.equal(somaReceitasRecebidas(lista, HOJE), 99 + 190); // default = líquido
});

test("somaReceitasPendentes: só o que ainda não caiu, em líquido", () => {
  const lista = [
    receita({ valor: 100, valor_liquido_esperado: 99 }),
    receita({
      valor: 500,
      valor_liquido_esperado: 480,
      data_prevista_recebimento: "2026-09-10",
      status_conciliacao: "pendente",
    }),
  ];
  assert.equal(somaReceitasPendentes(lista, HOJE), 480);
});

test("somaDespesas: só despesas; descontarCofre opcional", () => {
  const lista = [
    despesa({ valor: 300 }),
    despesa({ valor: 200, valor_pago_cofre: 50 }),
    receita({ valor: 9999 }),
  ];
  assert.equal(somaDespesas(lista), 500);
  assert.equal(somaDespesas(lista, { descontarCofre: true }), 300 + 150);
});

test("accrual + pendentes == recebidas + pendentes (nada some, nada duplica)", () => {
  const lista = [
    receita({ valor: 100 }),
    receita({ valor: 80, data_prevista_recebimento: "2026-08-10", status_conciliacao: "pendente" }),
    receita({ valor: 60, data_prevista_recebimento: "2026-09-30", status_conciliacao: "pendente" }),
  ];
  // aqui líquido == bruto (sem valor_liquido_esperado), então dá pra somar direto
  assert.equal(
    somaReceitasRecebidas(lista, HOJE, { liquido: false }) + somaReceitasPendentes(lista, HOJE),
    somaReceitasAccrual(lista)
  );
});

// ---------------------------------------------------------------------------
// REGRESSÕES REAIS — cada uma quebrou o Saldo em produção nas últimas 2
// semanas. Se um destes ficar vermelho, o bug voltou.
// ---------------------------------------------------------------------------

test("REGRESSÃO 26-27/08: venda a prazo com prazo vencido e NÃO conciliada TEM que contar no Saldo", () => {
  // Bug: a regra passou a exigir status_conciliacao === 'conciliado' pra
  // QUALQUER venda com prazo. Como nada era conciliado, nenhuma venda
  // entrava no Saldo e ele só caía (67k em vez de ~82k).
  const venda = receita({
    valor: 1000,
    valor_liquido_esperado: 970,
    data_prevista_recebimento: "2026-08-26", // já venceu (hoje = 27)
    status_conciliacao: "pendente",
  });
  assert.equal(receitaJaCaiu(venda, HOJE), true);
  assert.equal(somaReceitasRecebidas([venda], HOJE), 970);
});

test("REGRESSÃO Fluxo x Dashboard: existe UMA regra só, não duas", () => {
  // Bug: a tela Fluxo de Caixa ficou com a regra antiga (só conta se
  // conciliada) e o Dashboard com a nova (conta quando o prazo chega).
  // Agora as duas telas chamam somaReceitasRecebidas — este teste trava
  // o comportamento pras duas de uma vez.
  const lista = [
    receita({ valor: 300, data_prevista_recebimento: "2026-08-25", status_conciliacao: "pendente" }),
    receita({ valor: 400, data_prevista_recebimento: "2026-09-15", status_conciliacao: "pendente" }),
  ];
  assert.equal(somaReceitasRecebidas(lista, HOJE, { liquido: false }), 300); // só a vencida
});

test("REGRESSÃO 'corte = hoje': o cálculo NUNCA descarta lançamento por data", () => {
  // Bug estrutural do SALDO_INICIAL_DATA: com corte = hoje, "27/08 > 27/08"
  // = false fazia toda despesa do próprio dia sumir. O corte por data mora
  // no App.jsx, mas o cálculo em si (aqui) não pode ter NENHUM filtro de
  // data escondido — recebe a lista já filtrada e soma o que veio.
  const hojeDespesa = despesa({ valor: 685, data: HOJE });
  assert.equal(somaDespesas([hojeDespesa]), 685);
  assert.equal(somaDespesas([hojeDespesa], { descontarCofre: true }), 685);
});

test("REGRESSÃO iFood/Voucher: valor_liquido_esperado manda no líquido (taxa aplicada)", () => {
  // Garante que o líquido nunca "esquece" a taxa e cai pro bruto quando o
  // valor_liquido_esperado está preenchido.
  const ifood = receita({
    valor: 1000,
    valor_liquido_esperado: 871, // 12,9% de taxa
    data_prevista_recebimento: "2026-08-20",
    status_conciliacao: "pendente",
  });
  assert.equal(somaReceitasRecebidas([ifood], HOJE, { liquido: true }), 871);
  assert.equal(somaReceitasRecebidas([ifood], HOJE, { liquido: false }), 1000);
});

// ---------------------------------------------------------------------------
// CENÁRIO INTEGRADO — reproduz um "dia" da loja e confere o Saldo.
// ---------------------------------------------------------------------------
test("cenário: base + recebidas líq − despesas (com cofre) = Saldo esperado", () => {
  const BASE = 70303.83;
  const lancamentos = [
    receita({ valor: 500, valor_liquido_esperado: 495, data_prevista_recebimento: "2026-08-26", status_conciliacao: "pendente" }),
    receita({ valor: 800, valor_liquido_esperado: 780, data_prevista_recebimento: HOJE, status_conciliacao: "pendente" }),
    receita({ valor: 300, valor_liquido_esperado: 285, data_prevista_recebimento: "2026-09-02", status_conciliacao: "pendente" }), // futura, fica de fora
    despesa({ valor: 685, data: HOJE }),
    despesa({ valor: 200, valor_pago_cofre: 200, data: HOJE }), // paga 100% com Cofre -> não desconta
    despesa({ valor: 126, data: HOJE }),
  ];
  const recebidasLiq = somaReceitasRecebidas(lancamentos, HOJE, { liquido: true });
  const saidas = somaDespesas(lancamentos, { descontarCofre: true });
  const saldo = Number((BASE + recebidasLiq - saidas).toFixed(2));

  assert.equal(recebidasLiq, 495 + 780); // 1275 (a futura de 285 não entra)
  assert.equal(saidas, 685 + 0 + 126); // 811
  assert.equal(saldo, Number((70303.83 + 1275 - 811).toFixed(2))); // 70767.83
});
