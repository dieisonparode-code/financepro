// ============================================================================
// Etapa 1 (Malha 1) do plano de confiabilidade — 27/08/2026
// ----------------------------------------------------------------------------
// A regra "esta receita já entrou (caiu) na conta?" estava COPIADA em 5
// lugares do App.jsx (dashboard: bruto/líquido/pendente/saldo; tela Fluxo de
// Caixa: bruto/líquido) e já divergiu na prática — a tela Fluxo ficou com a
// regra antiga (só conta se conciliada), o dashboard com a nova (conta quando
// o prazo chega). Foi exatamente o bug do dia 27/08.
//
// Agora a decisão mora AQUI, num lugar só. Todo card do sistema chama estas
// funções. Mudar a regra = mudar este arquivo (e os testes da Etapa 2).
// ============================================================================

// A DECISÃO ÚNICA: uma receita já é dinheiro que caiu na conta?
//  - Sem prazo (data_prevista_recebimento vazia) → caiu na hora (Pix/dinheiro).
//  - Com prazo, marcada "conciliado" → confirmada de verdade, conta sempre.
//  - Com prazo não conciliada → conta só quando o prazo JÁ CHEGOU (<= hoje);
//    enquanto o prazo é futuro, fica só em "Próximos Recebimentos".
export function receitaJaCaiu(item, hoje) {
  if (!item?.data_prevista_recebimento) return true;
  if (item.status_conciliacao === "conciliado") return true;
  return item.data_prevista_recebimento <= hoje;
}

// Inverso, só pra deixar o código de "Próximos Recebimentos" legível.
export function receitaPendente(item, hoje) {
  return !receitaJaCaiu(item, hoje);
}

// Valor de uma receita recebida:
//  - líquido = depois da taxa da forma de pagamento (valor_liquido_esperado);
//  - bruto = valor cheio da venda. A diferença entre os dois é o total de taxas.
export function valorLiquidoReceita(item) {
  return Number(item?.valor_liquido_esperado ?? item?.valor ?? 0);
}
export function valorBrutoReceita(item) {
  return Number(item?.valor ?? 0);
}

// Valor de uma despesa que efetivamente sai do Saldo. Quando `descontarCofre`
// é true (usado só no card Saldo), a parte paga com o Fundo de Retirada/Cofre
// não desconta de novo — o dinheiro já tinha saído do caixa na retirada.
export function valorDespesa(item, { descontarCofre = false } = {}) {
  const bruto = Number(item?.valor || 0);
  if (!descontarCofre) return bruto;
  return bruto - Number(item?.valor_pago_cofre || 0);
}

// --- Somatórios (recebem uma lista já filtrada por loja/período pelo chamador) ---

// Receitas por regime de competência (accrual): tudo que foi vendido no
// período, independente de já ter caído. Alimenta os cards "Receitas" e
// "Fluxo de Caixa".
export function somaReceitasAccrual(lista) {
  return lista
    .filter((item) => item.tipo === "receita")
    .reduce((total, item) => total + Number(item.valor || 0), 0);
}

// Receitas que JÁ CAÍRAM (regra receitaJaCaiu). `liquido` escolhe entre valor
// líquido (default, usado no Saldo) e bruto (usado pra calcular as taxas).
export function somaReceitasRecebidas(lista, hoje, { liquido = true } = {}) {
  return lista
    .filter((item) => item.tipo === "receita" && receitaJaCaiu(item, hoje))
    .reduce(
      (total, item) =>
        total + (liquido ? valorLiquidoReceita(item) : valorBrutoReceita(item)),
      0
    );
}

// Receitas ainda PENDENTES (prazo futuro, não conciliadas) — "Próximos
// Recebimentos". Sempre em valor líquido.
export function somaReceitasPendentes(lista, hoje) {
  return lista
    .filter((item) => item.tipo === "receita" && receitaPendente(item, hoje))
    .reduce((total, item) => total + valorLiquidoReceita(item), 0);
}

// Soma de despesas. `descontarCofre` só no card Saldo (ver valorDespesa).
export function somaDespesas(lista, opcoes) {
  return lista
    .filter((item) => item.tipo === "despesa")
    .reduce((total, item) => total + valorDespesa(item, opcoes), 0);
}
