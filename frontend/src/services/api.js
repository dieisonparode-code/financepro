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

export function buscarLancamentos() {
  return requisicao("/lancamentos");
}

export function buscarFotoLancamento(id) {
  return requisicao(`/lancamentos/${id}/foto`);
}

export function buscarFotoMercadoriaLancamento(id) {
  return requisicao(`/lancamentos/${id}/foto-mercadoria`);
}

export async function criarLancamento(dados) {
  return requisicao("/lancamentos", {
    method: "POST",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify(dados),
  });
}

export async function atualizarLancamento(id, dados) {
  return requisicao(`/lancamentos/${id}`, {
    method: "PUT",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify(dados),
  });
}

export function excluirLancamento(id) {
  return requisicao(`/lancamentos/${id}`, {
    method: "DELETE",
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

export async function atualizarConfiguracaoAprovacao(ativa) {
  return requisicao("/configuracoes/aprovacao-despesas", {
    method: "PUT",
    headers: await cabecalhoAutenticado(),
    body: JSON.stringify({ ativa }),
  });
}

export function buscarInsumos() {
  return requisicao("/insumos");
}

export function criarInsumo(dados) {
  return requisicao("/insumos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
}

export function atualizarInsumo(id, dados) {
  return requisicao(`/insumos/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
}

export function excluirInsumo(id) {
  return requisicao(`/insumos/${id}`, {
    method: "DELETE",
  });
}

export function registrarMovimentacaoEstoque(id, dados) {
  return requisicao(`/insumos/${id}/movimentacao`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
}

export function buscarMovimentacoesEstoque(id) {
  return requisicao(`/insumos/${id}/movimentacoes`);
}

export function buscarContasPagar() {
  return requisicao("/contas-pagar");
}

export function criarContaPagar(dados) {
  return requisicao("/contas-pagar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
}

export function atualizarContaPagar(id, dados) {
  return requisicao(`/contas-pagar/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
}

export function marcarContaPagarComoPaga(id) {
  return requisicao(`/contas-pagar/${id}/pagar`, {
    method: "PUT",
  });
}

export function excluirContaPagar(id) {
  return requisicao(`/contas-pagar/${id}`, {
    method: "DELETE",
  });
}

export function buscarClientes() {
  return requisicao("/clientes");
}

export function criarCliente(dados) {
  return requisicao("/clientes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
}

export function atualizarCliente(id, dados) {
  return requisicao(`/clientes/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
}

export function excluirCliente(id) {
  return requisicao(`/clientes/${id}`, {
    method: "DELETE",
  });
}

export function buscarAtendimentosCliente(id) {
  return requisicao(`/clientes/${id}/atendimentos`);
}

export function criarAtendimentoCliente(id, dados) {
  return requisicao(`/clientes/${id}/atendimentos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
}

export function excluirAtendimento(id) {
  return requisicao(`/atendimentos/${id}`, {
    method: "DELETE",
  });
}

export function buscarCategorias() {
  return requisicao("/categorias");
}

export function criarCategoria(dados) {
  return requisicao("/categorias", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
}

export function atualizarCategoria(id, dados) {
  return requisicao(`/categorias/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
}

export function excluirCategoria(id) {
  return requisicao(`/categorias/${id}`, {
    method: "DELETE",
  });
}

export function buscarFechamentosCaixa() {
  return requisicao("/fechamentos-caixa");
}

export function buscarFotoFechamentoCaixa(id) {
  return requisicao(`/fechamentos-caixa/${id}/foto`);
}

export function criarFechamentoCaixa(dados) {
  return requisicao("/fechamentos-caixa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
}

export function excluirFechamentoCaixa(id) {
  return requisicao(`/fechamentos-caixa/${id}`, {
    method: "DELETE",
  });
}

export function buscarLojas() {
  return requisicao("/lojas");
}

export function criarLoja(dados) {
  return requisicao("/lojas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
}

export function atualizarLoja(id, dados) {
  return requisicao(`/lojas/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
}

export function excluirLoja(id) {
  return requisicao(`/lojas/${id}`, {
    method: "DELETE",
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
