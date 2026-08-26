import { useMemo, useState } from "react";

// Pedido do usuário (26/08/2026): "fica somente o extrato doque foi
// pago com dinheiro do cofre, fica tudo entre entradas e saidas mas
// so do cofre" — tela dedicada só com o movimento do Cofre: entradas
// (🔒 Retirada pro Cofre, dinheiro que entrou lá) e saídas (despesas
// pagas com dinheiro do Cofre, total ou parcial). Não busca nada novo
// no backend — reaproveita "fundosRetiradas" e "lancamentos", que a
// App.jsx já mantém sincronizados.
function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarData(data) {
  if (!data) return "Sem data";
  return new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR");
}

function ExtratoCofre({ fundosRetiradas = [], lancamentos = [], lojas = [], lojaPadrao = null }) {
  const [filtroLoja, setFiltroLoja] = useState(
    lojaPadrao ? String(lojaPadrao) : "todas"
  );

  const nomeLoja = (lojaId) =>
    lojas.find((loja) => String(loja.id) === String(lojaId))?.nome;

  // Só conta como Cofre de verdade quem veio pelo botão dedicado
  // "🔒 Retirada pro Cofre" (conta_para_cofre = true) — mesma regra já
  // usada no card do Dashboard, pra não misturar com retirada genérica.
  const entradas = useMemo(() => {
    return fundosRetiradas
      .filter(
        (fundo) =>
          fundo.conta_para_cofre !== false &&
          (filtroLoja === "todas" || String(fundo.loja_id || "") === filtroLoja)
      )
      .map((fundo) => ({
        id: `entrada-${fundo.id}`,
        tipo: "entrada",
        data: fundo.data,
        criado_em: fundo.criado_em,
        valor: Number(fundo.valor || 0),
        descricao: fundo.descricao || "Retirada pro Cofre",
        loja_id: fundo.loja_id,
      }));
  }, [fundosRetiradas, filtroLoja]);

  const saidas = useMemo(() => {
    return lancamentos
      .filter(
        (item) =>
          item.tipo === "despesa" &&
          item.fundo_retirada_id &&
          Number(item.valor_pago_cofre || 0) > 0 &&
          (filtroLoja === "todas" || String(item.loja_id || "") === filtroLoja)
      )
      .map((item) => ({
        id: `saida-${item.id}`,
        tipo: "saida",
        data: item.data,
        criado_em: item.criado_em || item.created_at,
        valor: Number(item.valor_pago_cofre || 0),
        descricao: item.fornecedor || item.descricao || "Despesa paga com o Cofre",
        parcial: Number(item.valor_pago_cofre || 0) < Number(item.valor || 0) - 0.01,
        valorTotalDespesa: Number(item.valor || 0),
        loja_id: item.loja_id,
      }));
  }, [lancamentos, filtroLoja]);

  const movimento = useMemo(() => {
    return [...entradas, ...saidas].sort(
      (a, b) => new Date(b.criado_em || b.data) - new Date(a.criado_em || a.data)
    );
  }, [entradas, saidas]);

  const totalEntradas = entradas.reduce((soma, item) => soma + item.valor, 0);
  const totalSaidas = saidas.reduce((soma, item) => soma + item.valor, 0);
  const saldoCofre = totalEntradas - totalSaidas;

  return (
    <section className="categorias-layout">
      <article className="panel categoria-lista-panel" style={{ gridColumn: "1 / -1" }}>
        <div className="panel-header">
          <div>
            <span className="eyebrow">Cofre</span>
            <h2>🔒 Extrato do Cofre</h2>
          </div>

          <strong>{formatarMoeda(saldoCofre)}</strong>
        </div>

        <small className="foto-ajuda">
          Só o que entrou pelo botão "🔒 Retirada pro Cofre" (entrada) e o
          que foi pago com dinheiro do Cofre em despesas (saída) — nada de
          Saldo geral aparece aqui.
        </small>

        {lojas.length > 0 && (
          <div className="feed-filtros">
            <select
              value={filtroLoja}
              onChange={(evento) => setFiltroLoja(evento.target.value)}
            >
              <option value="todas">Todas as lojas</option>
              {lojas.map((loja) => (
                <option key={loja.id} value={String(loja.id)}>
                  {loja.nome}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="feed-resumo">
          <span>
            📥 Entradas {formatarMoeda(totalEntradas)} · 📤 Saídas{" "}
            {formatarMoeda(totalSaidas)}
          </span>
        </div>

        {movimento.length === 0 ? (
          <div className="empty-state">
            Nenhuma entrada ou saída do Cofre ainda.
          </div>
        ) : (
          <div className="categorias-lista">
            {movimento.map((item) => (
              <div className="categoria-item" key={item.id}>
                <div className="categoria-identificacao">
                  <div className="categoria-icone">
                    {item.tipo === "entrada" ? "📥" : "📤"}
                  </div>
                  <div>
                    <strong>
                      {item.tipo === "entrada" ? "+ " : "− "}
                      {formatarMoeda(item.valor)}
                    </strong>
                    <div>{item.descricao} — {formatarData(item.data)}</div>
                    {item.tipo === "saida" && item.parcial && (
                      <small style={{ color: "#9fb0c4" }}>
                        Pago parcial: {formatarMoeda(item.valor)} do Cofre +{" "}
                        {formatarMoeda(item.valorTotalDespesa - item.valor)}{" "}
                        do Saldo geral (conta de {formatarMoeda(item.valorTotalDespesa)})
                      </small>
                    )}
                    {item.loja_id && lojas.length > 0 && (
                      <div>
                        <small style={{ color: "#9fb0c4" }}>
                          {nomeLoja(item.loja_id)}
                        </small>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

export default ExtratoCofre;
