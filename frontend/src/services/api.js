import { supabase } from "./supabaseClient";

const API_URL =
  import.meta.env.VITE_API_URL ||
  `http://${window.location.hostname}:3001`;

async function cabecalhoAutenticado() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function requisicao(caminho, opcoes = {}) {
  let resposta;

  try {
    resposta = await fetch(`${API_URL}${caminho}`, opcoes);
  } catch {
    throw new Error(`Não foi possível conectar à API em ${API_URL}.`);
  }

  if (!resposta.ok) {
    let detalhes = "";

    try {
      const corpo = await resposta.json();
      detalhes = corpo.detalhes || corpo.erro || "";
    } catch {
      detalhes = await resposta.text();
    }

    throw new Error(
      detalhes || `Erro na comunicação com o servidor: ${resposta.status}`
    );
  }

  if (resposta.status === 204) {
    return null;
  }

  return resposta.json();
}

export function obterApiUrl() {
  return API_URL;
}

export async function buscarLancamentos() {
  return requisicao("/lancamentos", { headers: await cabecalhoAutenticado() });
}

export async function baixarBackupCompleto() {
  return requisicao("/backup/exportar", {
    headers: await cabecalhoAutenticado(),
  });
}

export async function listarBackupsAutomaticos() {
  return requisicao("/backup/automaticos", {
    headers: await cabecalhoAutenticado(),
  });
}

export async function baixarBackupAutomatico(id) {
  return requisicao(`/backup/automaticos/${id}`, {
    headers: await cabecalhoAutenticado(),
  });
}

export async function buscarFotoLancamento(id) {
  return requisicao(`/lancamentos/${id}/foto`, {
    headers: await cabecalhoAutenticado(),
  });
}

export async function buscarFotoMercadoriaLancamento(id) {
  return requisicao(`/lancamentos/${id}/foto-mercadoria`, {
    headers: await cabecalhoAutenticado(),
  });
}

export async function lerNotaFiscal(foto) {
  return requisicao("/lancamentos/ler-nota", {
    method: "POST",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify({ foto }),
  });
}

// Pedido do usuário (23/08/2026): quando a nota lida acima for de compra
// de insumo (vem com "itens"), casa cada item pelo nome com um insumo já
// cadastrado e preenche o custo unitário — só enquanto ainda estiver
// R$0,00 (nunca sobrescreve um valor já definido, manual ou automático).
export async function atualizarCustosPorCompra(lojaId, itens) {
  return requisicao("/insumos/atualizar-custos-por-compra", {
    method: "POST",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify({ loja_id: lojaId, itens }),
  });
}

export async function criarLancamento(dados) {
  return requisicao("/lancamentos", {
    method: "POST",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify(dados),
  });
}

export async function atualizarLancamento(id, dados, senhaConfirmacao) {
  return requisicao(`/lancamentos/${id}`, {
    method: "PUT",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify(
      senhaConfirmacao
        ? { ...dados, senha_confirmacao: senhaConfirmacao }
        : dados
    ),
  });
}

export async function excluirLancamento(id, senhaConfirmacao) {
  return requisicao(`/lancamentos/${id}`, {
    method: "DELETE",
    headers: await cabecalhoAutenticado(),
    body: senhaConfirmacao
      ? JSON.stringify({ senha_confirmacao: senhaConfirmacao })
      : undefined,
  });
}

// Pedido do usuário (21/08/2026): aprovação de exclusão de lançamento.
export async function aprovarExclusaoLancamento(id) {
  return requisicao(`/lancamentos/${id}/aprovar-exclusao`, {
    method: "PUT",
    headers: await cabecalhoAutenticado(),
  });
}

export async function rejeitarExclusaoLancamento(id) {
  return requisicao(`/lancamentos/${id}/rejeitar-exclusao`, {
    method: "PUT",
    headers: await cabecalhoAutenticado(),
  });
}

export async function aprovarLancamento(id) {
  return requisicao(`/lancamentos/${id}/aprovar`, {
    method: "PUT",
    headers: await cabecalhoAutenticado(),
  });
}

export async function rejeitarLancamento(id) {
  return requisicao(`/lancamentos/${id}/rejeitar`, {
    method: "PUT",
    headers: await cabecalhoAutenticado(),
  });
}

export async function aprovarTrocaFoto(id) {
  return requisicao(`/lancamentos/${id}/aprovar-foto`, {
    method: "PUT",
    headers: await cabecalhoAutenticado(),
  });
}

export async function rejeitarTrocaFoto(id) {
  return requisicao(`/lancamentos/${id}/rejeitar-foto`, {
    method: "PUT",
    headers: await cabecalhoAutenticado(),
  });
}

export async function atualizarConfiguracaoAprovacao(ativa) {
  return requisicao("/configuracoes/aprovacao-despesas", {
    method: "PUT",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify({ ativa }),
  });
}

export async function buscarInsumos() {
  return requisicao("/insumos", { headers: await cabecalhoAutenticado() });
}

export async function criarInsumo(dados) {
  return requisicao("/insumos", {
    method: "POST",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify(dados),
  });
}

export async function atualizarInsumo(id, dados) {
  return requisicao(`/insumos/${id}`, {
    method: "PUT",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify(dados),
  });
}

export async function excluirInsumo(id) {
  return requisicao(`/insumos/${id}`, {
    method: "DELETE",
    headers: await cabecalhoAutenticado(),
  });
}

// Pedido do usuário (23/08/2026): insumo "feito na casa" (ex: maionese)
// — custo calculado por receita (outros insumos + rendimento) em vez de
// digitado direto.
export async function buscarReceitaInsumo(id) {
  return requisicao(`/insumos/${id}/receita`, {
    headers: await cabecalhoAutenticado(),
  });
}

export async function salvarReceitaInsumo(id, rendimento, itens) {
  return requisicao(`/insumos/${id}/receita`, {
    method: "PUT",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify({ rendimento, itens }),
  });
}

export async function recalcularReceitaInsumo(id) {
  return requisicao(`/insumos/${id}/receita/recalcular`, {
    method: "POST",
    headers: await cabecalhoAutenticado(),
  });
}

export async function registrarMovimentacaoEstoque(id, dados) {
  return requisicao(`/insumos/${id}/movimentacao`, {
    method: "POST",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify(dados),
  });
}

export async function buscarMovimentacoesEstoque(id) {
  return requisicao(`/insumos/${id}/movimentacoes`, {
    headers: await cabecalhoAutenticado(),
  });
}

export async function buscarLogAuditoria() {
  return requisicao("/log-auditoria", {
    headers: await cabecalhoAutenticado(),
  });
}

// Pedido do usuário (21/08/2026): notificação em tempo real de venda
// cancelada — todas as lojas, só o dia de hoje.
export async function buscarVendasCanceladasHoje() {
  return requisicao("/vendas-canceladas-hoje", {
    headers: await cabecalhoAutenticado(),
  });
}

export async function buscarFechamentoSaipos(lojaId, data) {
  return requisicao(
    `/fechamento-saipos/${lojaId}?data=${encodeURIComponent(data)}`,
    { headers: await cabecalhoAutenticado() }
  );
}

export async function importarReceitasSaipos(lojaId, data) {
  return requisicao(`/fechamento-saipos/${lojaId}/importar-receitas`, {
    method: "POST",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify({ data }),
  });
}

export async function conferirFechamentoFoto(foto, lojaId) {
  return requisicao("/pagseguro/conferir-fechamento", {
    method: "POST",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify({ foto, loja_id: lojaId || null }),
  });
}

export async function buscarVendasPagSeguro(dataInicio, dataFim) {
  return requisicao(
    `/pagseguro/vendas?dataInicio=${encodeURIComponent(
      dataInicio
    )}&dataFim=${encodeURIComponent(dataFim)}`,
    { headers: await cabecalhoAutenticado() }
  );
}

export async function buscarFormasPagamento() {
  return requisicao("/formas-pagamento", {
    headers: await cabecalhoAutenticado(),
  });
}

export async function criarFormaPagamento(dados) {
  return requisicao("/formas-pagamento", {
    method: "POST",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify(dados),
  });
}

export async function atualizarFormaPagamento(id, dados) {
  return requisicao(`/formas-pagamento/${id}`, {
    method: "PUT",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify(dados),
  });
}

export async function excluirFormaPagamento(id) {
  return requisicao(`/formas-pagamento/${id}`, {
    method: "DELETE",
    headers: await cabecalhoAutenticado(),
  });
}

export async function buscarContasPagar() {
  return requisicao("/contas-pagar", { headers: await cabecalhoAutenticado() });
}

export async function criarContaPagar(dados) {
  return requisicao("/contas-pagar", {
    method: "POST",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify(dados),
  });
}

export async function atualizarContaPagar(id, dados) {
  return requisicao(`/contas-pagar/${id}`, {
    method: "PUT",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify(dados),
  });
}

export async function marcarContaPagarComoPaga(id, lojaCredoraId) {
  return requisicao(`/contas-pagar/${id}/pagar`, {
    method: "PUT",
    headers: await cabecalhoAutenticado(),
    body: lojaCredoraId
      ? JSON.stringify({ loja_credora_id: lojaCredoraId })
      : undefined,
  });
}

export async function excluirContaPagar(id) {
  return requisicao(`/contas-pagar/${id}`, {
    method: "DELETE",
    headers: await cabecalhoAutenticado(),
  });
}

export async function buscarHistoricoFornecedores() {
  return requisicao("/fornecedores/historico", {
    headers: await cabecalhoAutenticado(),
  });
}

export async function anexarComprovantePagamento(id, comprovante_pagamento) {
  return requisicao(`/contas-pagar/${id}/comprovante`, {
    method: "PUT",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify({ comprovante_pagamento }),
  });
}

export async function salvarDinheiroInformado(
  emCaixa,
  abertura,
  lojaId = null,
  fechamentoId = null
) {
  return requisicao("/caixa-dinheiro-informado", {
    method: "POST",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify({
      em_caixa: emCaixa,
      abertura,
      loja_id: lojaId,
      fechamento_id: fechamentoId,
    }),
  });
}

// Pedido do usuário (20/08/2026): pra avisar sozinho no Dashboard quando
// o robô do WhatsApp cair, em vez de precisar notar que fotos pararam de
// entrar.
export async function buscarStatusWhatsapp() {
  return requisicao("/integracoes/whatsapp/status", {
    headers: await cabecalhoAutenticado(),
  });
}

// Resumo (sem nome do sócio) pra recalcular o Saldo certo pra QUALQUER
// usuário que vê o card Saldo, não só admin.
export async function buscarResumoRetiradasSocios() {
  return requisicao("/retiradas-socios/resumo", {
    headers: await cabecalhoAutenticado(),
  });
}

// Retiradas de Sócios (20/08/2026) — tela e dados só-admin.
export async function buscarRetiradasSocios() {
  return requisicao("/retiradas-socios", {
    headers: await cabecalhoAutenticado(),
  });
}

export async function criarRetiradaSocio(dados) {
  return requisicao("/retiradas-socios", {
    method: "POST",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify(dados),
  });
}

export async function excluirRetiradaSocio(id) {
  return requisicao(`/retiradas-socios/${id}`, {
    method: "DELETE",
    headers: await cabecalhoAutenticado(),
  });
}

// Ficha Técnica (21/08/2026) — CMV real por prato. Reaproveita
// buscarInsumos/criarInsumo/atualizarInsumo/excluirInsumo/
// registrarMovimentacaoEstoque que já existiam pra tela Estoque — não
// duplica nada disso, só soma a Ficha Técnica (produto + insumos usados).
export async function buscarFichasTecnicas() {
  return requisicao("/fichas-tecnicas", {
    headers: await cabecalhoAutenticado(),
  });
}

export async function criarFichaTecnica(dados) {
  return requisicao("/fichas-tecnicas", {
    method: "POST",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify(dados),
  });
}

export async function editarFichaTecnica(id, dados) {
  return requisicao(`/fichas-tecnicas/${id}`, {
    method: "PUT",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify(dados),
  });
}

export async function excluirFichaTecnica(id) {
  return requisicao(`/fichas-tecnicas/${id}`, {
    method: "DELETE",
    headers: await cabecalhoAutenticado(),
  });
}

// Pedido do usuário (23/08/2026): lista de produtos que venderam de
// verdade na Saipos num período, pra facilitar o cadastro da Ficha
// Técnica (em vez de digitar o nome de cada produto na mão).
export async function buscarProdutosVendidosSaipos(lojaId, dias = 30) {
  return requisicao(`/fichas-tecnicas/produtos-vendidos/${lojaId}?dias=${dias}`, {
    headers: await cabecalhoAutenticado(),
  });
}

// Pedido do usuário (23/08/2026): "manda a foto do cardápio e você
// adiciona tudo" — lê nome/preço/categoria de cada produto do cardápio.
export async function importarCardapioFoto(foto) {
  return requisicao("/fichas-tecnicas/importar-cardapio-foto", {
    method: "POST",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify({ foto }),
  });
}

// Empréstimo entre lojas (21/08/2026).
export async function buscarResumoEmprestimosEntreLojas() {
  return requisicao("/emprestimos-entre-lojas/resumo", {
    headers: await cabecalhoAutenticado(),
  });
}

export async function buscarEmprestimosEntreLojas() {
  return requisicao("/emprestimos-entre-lojas", {
    headers: await cabecalhoAutenticado(),
  });
}

export async function criarEmprestimoEntreLojas(dados) {
  return requisicao("/emprestimos-entre-lojas", {
    method: "POST",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify(dados),
  });
}

export async function registrarPagamentoEmprestimo(id, dados) {
  return requisicao(`/emprestimos-entre-lojas/${id}/pagamento`, {
    method: "POST",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify(dados),
  });
}

export async function excluirEmprestimoEntreLojas(id) {
  return requisicao(`/emprestimos-entre-lojas/${id}`, {
    method: "DELETE",
    headers: await cabecalhoAutenticado(),
  });
}

// Fundo de Retirada de Caixa (22/08/2026).
export async function buscarFundoRetiradasCaixa() {
  return requisicao("/fundo-retiradas-caixa", {
    headers: await cabecalhoAutenticado(),
  });
}

export async function criarFundoRetiradaCaixa(dados) {
  return requisicao("/fundo-retiradas-caixa", {
    method: "POST",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify(dados),
  });
}

export async function buscarFotoFundoRetiradaCaixa(id) {
  return requisicao(`/fundo-retiradas-caixa/${id}/foto`, {
    headers: await cabecalhoAutenticado(),
  });
}

export async function buscarDinheiroInformado() {
  return requisicao("/caixa-dinheiro-informado", {
    headers: await cabecalhoAutenticado(),
  });
}

export async function buscarNotasFiscais() {
  return requisicao("/notas-fiscais", { headers: await cabecalhoAutenticado() });
}

export async function buscarFotoNotaFiscal(id) {
  return requisicao(`/notas-fiscais/${id}/foto`, {
    headers: await cabecalhoAutenticado(),
  });
}

export async function criarNotaFiscal(dados) {
  return requisicao("/notas-fiscais", {
    method: "POST",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify(dados),
  });
}

export async function excluirNotaFiscal(id) {
  return requisicao(`/notas-fiscais/${id}`, {
    method: "DELETE",
    headers: await cabecalhoAutenticado(),
  });
}

export async function lerFotoContaPagar(foto) {
  return requisicao("/contas-pagar/ler-foto", {
    method: "POST",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify({ foto }),
  });
}

export async function buscarClientes() {
  return requisicao("/clientes", { headers: await cabecalhoAutenticado() });
}

export async function criarCliente(dados) {
  return requisicao("/clientes", {
    method: "POST",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify(dados),
  });
}

export async function atualizarCliente(id, dados) {
  return requisicao(`/clientes/${id}`, {
    method: "PUT",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify(dados),
  });
}

export async function excluirCliente(id) {
  return requisicao(`/clientes/${id}`, {
    method: "DELETE",
    headers: await cabecalhoAutenticado(),
  });
}

export async function buscarAtendimentosCliente(id) {
  return requisicao(`/clientes/${id}/atendimentos`, {
    headers: await cabecalhoAutenticado(),
  });
}

export async function criarAtendimentoCliente(id, dados) {
  return requisicao(`/clientes/${id}/atendimentos`, {
    method: "POST",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify(dados),
  });
}

export async function excluirAtendimento(id) {
  return requisicao(`/atendimentos/${id}`, {
    method: "DELETE",
    headers: await cabecalhoAutenticado(),
  });
}

export async function buscarCategorias() {
  return requisicao("/categorias", { headers: await cabecalhoAutenticado() });
}

export async function criarCategoria(dados) {
  return requisicao("/categorias", {
    method: "POST",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify(dados),
  });
}

export async function atualizarCategoria(id, dados) {
  return requisicao(`/categorias/${id}`, {
    method: "PUT",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify(dados),
  });
}

export async function excluirCategoria(id) {
  return requisicao(`/categorias/${id}`, {
    method: "DELETE",
    headers: await cabecalhoAutenticado(),
  });
}

export async function buscarFechamentosCaixa() {
  return requisicao("/fechamentos-caixa", {
    headers: await cabecalhoAutenticado(),
  });
}

export async function buscarFotoFechamentoCaixa(id) {
  return requisicao(`/fechamentos-caixa/${id}/foto`, {
    headers: await cabecalhoAutenticado(),
  });
}

export async function trocarFotoFechamentoCaixa(id, foto) {
  return requisicao(`/fechamentos-caixa/${id}/foto`, {
    method: "PUT",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify({ foto }),
  });
}

export async function finalizarConciliacaoFechamento(id) {
  return requisicao(`/fechamentos-caixa/${id}/finalizar-conciliacao`, {
    method: "PUT",
    headers: await cabecalhoAutenticado(),
  });
}

export async function salvarValoresInformadosFechamento(
  id,
  valores,
  sistema,
  ordem,
  dataAbertura
) {
  return requisicao(`/fechamentos-caixa/${id}/valores-informados`, {
    method: "PUT",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify({
      valores,
      sistema,
      ordem,
      data_abertura: dataAbertura,
    }),
  });
}

export async function criarFechamentoCaixa(dados) {
  return requisicao("/fechamentos-caixa", {
    method: "POST",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify(dados),
  });
}

export async function excluirFechamentoCaixa(id) {
  return requisicao(`/fechamentos-caixa/${id}`, {
    method: "DELETE",
    headers: await cabecalhoAutenticado(),
  });
}

export async function buscarFinalizacoesFechamentoCaixa() {
  return requisicao("/fechamento-caixa-finalizacoes", {
    headers: await cabecalhoAutenticado(),
  });
}

export async function finalizarFechamentoCaixa() {
  return requisicao("/fechamento-caixa-finalizacoes", {
    method: "POST",
    headers: await cabecalhoAutenticado(),
  });
}

// Só admin: reabre o último fechamento de caixa finalizado (apaga só a
// marca de "finalizado", não mexe nas fotos/lançamentos) pra deixar o
// operador corrigir um lançamento equivocado e fechar de novo.
export async function reabrirFechamentoCaixa(id) {
  return requisicao(`/fechamento-caixa-finalizacoes/${id}`, {
    method: "DELETE",
    headers: await cabecalhoAutenticado(),
  });
}

// Corrige só o valor de um registro já salvo (Diária Boy/Cozinha, Venda a
// Prazo Funcionário etc) sem precisar excluir e reanexar a foto — esse
// valor é só de exibição na lista, ver comentário no backend.
export async function corrigirValorFechamentoCaixa(id, valor) {
  return requisicao(`/fechamentos-caixa/${id}/valor`, {
    method: "PUT",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify({ valor }),
  });
}

export async function lerValorFechamentoCaixa(foto) {
  return requisicao("/fechamentos-caixa/ler-foto", {
    method: "POST",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify({ foto }),
  });
}

// Pedido do usuário (22/08/2026): retirada de frente de caixa não tem
// confronto, é só uma foto — a IA lê o valor e já lança a despesa.
export async function registrarRetiradaComFoto(foto, lojaId, data, descricao) {
  return requisicao("/fechamentos-caixa/registrar-retirada-foto", {
    method: "POST",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify({ foto, loja_id: lojaId, data, descricao }),
  });
}

// Fila de fotos do WhatsApp que o robô não conseguiu classificar sozinho
// (legenda não reconhecida) — só admin.
export async function buscarWhatsappFila() {
  return requisicao("/whatsapp-fila", {
    headers: await cabecalhoAutenticado(),
  });
}

export async function removerItemWhatsappFila(id) {
  return requisicao(`/whatsapp-fila/${id}`, {
    method: "DELETE",
    headers: await cabecalhoAutenticado(),
  });
}

export async function buscarLojas() {
  return requisicao("/lojas", { headers: await cabecalhoAutenticado() });
}

export async function buscarDespesasRecorrentes() {
  return requisicao("/despesas-recorrentes", {
    headers: await cabecalhoAutenticado(),
  });
}

export async function criarDespesaRecorrente(dados) {
  return requisicao("/despesas-recorrentes", {
    method: "POST",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify(dados),
  });
}

export async function editarDespesaRecorrente(id, dados) {
  return requisicao(`/despesas-recorrentes/${id}`, {
    method: "PUT",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify(dados),
  });
}

export async function excluirDespesaRecorrente(id) {
  return requisicao(`/despesas-recorrentes/${id}`, {
    method: "DELETE",
    headers: await cabecalhoAutenticado(),
  });
}

export async function criarLoja(dados) {
  return requisicao("/lojas", {
    method: "POST",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify(dados),
  });
}

export async function atualizarLoja(id, dados) {
  return requisicao(`/lojas/${id}`, {
    method: "PUT",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify(dados),
  });
}

export async function excluirLoja(id) {
  return requisicao(`/lojas/${id}`, {
    method: "DELETE",
    headers: await cabecalhoAutenticado(),
  });
}

export async function buscarUsuarios() {
  return requisicao("/usuarios", {
    headers: await cabecalhoAutenticado(),
  });
}

export async function criarUsuario(dados) {
  return requisicao("/usuarios", {
    method: "POST",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify(dados),
  });
}

export async function atualizarUsuario(id, dados) {
  return requisicao(`/usuarios/${id}`, {
    method: "PUT",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify(dados),
  });
}

export async function excluirUsuario(id) {
  return requisicao(`/usuarios/${id}`, {
    method: "DELETE",
    headers: await cabecalhoAutenticado(),
  });
}
