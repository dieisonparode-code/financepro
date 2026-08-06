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

export function criarLancamento(dados) {
  return requisicao("/lancamentos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
}

export function atualizarLancamento(id, dados) {
  return requisicao(`/lancamentos/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
}

export function excluirLancamento(id) {
  return requisicao(`/lancamentos/${id}`, {
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
