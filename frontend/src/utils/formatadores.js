export function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function formatarData(data) {
  return new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR");
}