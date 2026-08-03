const API_URL = "http://localhost:3001";

async function requisicao(caminho, opcoes = {}) {
  const resposta = await fetch(`${API_URL}${caminho}`, opcoes);

  if (!resposta.ok) {
    throw new Error(
      `Erro na comunicação com o servidor: ${resposta.status}`
    );
  }

  if (resposta.status === 204) {
    return null;
  }

  return await resposta.json();
}

export async function buscarLancamentos() {
  return await requisicao("/lancamentos");
}

export async function criarLancamento(dados) {
  return await requisicao("/lancamentos", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(dados),
  });
}

export async function atualizarLancamento(id, dados) {
  return await requisicao(`/lancamentos/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(dados),
  });
}

export async function excluirLancamento(id) {
  return await requisicao(`/lancamentos/${id}`, {
    method: "DELETE",
  });
}