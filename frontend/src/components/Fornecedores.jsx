import { useState } from "react";

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarData(data) {
  if (!data) return "";

  const [ano, mes, dia] = data.split("-");

  return `${dia}/${mes}/${ano}`;
}

function rotuloIndicador(indicador) {
  if (indicador === "abusivo") {
    return { texto: "⚠️ Acima da média", cor: "#ef4444" };
  }

  if (indicador === "bom") {
    return { texto: "✅ Bom preço", cor: "#16ca50" };
  }

  return { texto: "Na média", cor: "#9fb0c4" };
}

function textoVariacao(compra) {
  const indicador = rotuloIndicador(compra.indicador);

  return (
    indicador.texto +
    (compra.variacao_percentual
      ? ` (${compra.variacao_percentual > 0 ? "+" : ""}${
          compra.variacao_percentual
        }%)`
      : "")
  );
}

function TabelaCompras({ compras, coluna3Titulo, valorLinha }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Data</th>
          <th>Descrição</th>
          <th>{coluna3Titulo}</th>
          <th>Variação vs. média</th>
        </tr>
      </thead>
      <tbody>
        {compras.map((compra) => {
          const indicador = rotuloIndicador(compra.indicador);

          return (
            <tr key={compra.id}>
              <td>{formatarData(compra.data)}</td>
              <td>{compra.descricao}</td>
              <td>{valorLinha(compra)}</td>
              <td style={{ color: indicador.cor }}>
                {textoVariacao(compra)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Fornecedores({ historico = [], carregando = false }) {
  const [busca, setBusca] = useState("");
  const [expandido, setExpandido] = useState(null);

  const buscaLimpa = busca.trim().toLowerCase();

  const historicoVisivel = historico.filter((item) =>
    buscaLimpa ? item.fornecedor.toLowerCase().includes(buscaLimpa) : true
  );

  return (
    <section className="categorias-layout">
      <article className="panel categoria-form-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Fornecedores</span>
            <h2>Histórico de preços por item</h2>
          </div>
        </div>

        <p style={{ color: "#9fb0c4", fontSize: 13.5 }}>
          Compara o preço por kg/litro/unidade de cada item comprado com a
          própria média histórica desse item nesse fornecedor — sinaliza
          quando um pagamento veio bem acima ou bem abaixo do normal. Pra
          entrar aqui, a despesa precisa ter "Fornecedor", "Item comprado" e
          "Quantidade" preenchidos ao lançar. Despesas sem item (aluguel,
          conta de luz etc.) aparecem à parte, comparadas pelo valor total.
        </p>

        <label>
          Pesquisar fornecedor
          <input
            type="text"
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Ex.: Frigorífico X"
          />
        </label>
      </article>

      <article className="panel categoria-lista-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">
              {historicoVisivel.length}{" "}
              {historicoVisivel.length === 1 ? "fornecedor" : "fornecedores"}
            </span>
            <h2>Comparativo</h2>
          </div>
        </div>

        {carregando ? (
          <p>Carregando...</p>
        ) : historicoVisivel.length === 0 ? (
          <div className="empty-state">
            Nenhum fornecedor encontrado. Pra aparecer aqui, preencha o campo
            "Fornecedor" ao lançar uma despesa (e, se possível, "Item
            comprado" + "Quantidade" pra comparar preço por unidade).
          </div>
        ) : (
          <div className="categorias-lista">
            {historicoVisivel.map((fornecedorItem) => (
              <div key={fornecedorItem.fornecedor} className="categoria-item">
                <div
                  className="categoria-identificacao"
                  style={{ width: "100%" }}
                >
                  <div className="categoria-icone">🏭</div>
                  <div style={{ width: "100%" }}>
                    <strong>{fornecedorItem.fornecedor}</strong>
                    <div>
                      {fornecedorItem.total_compras}{" "}
                      {fornecedorItem.total_compras === 1
                        ? "compra"
                        : "compras"}{" "}
                      no total —{" "}
                      {fornecedorItem.itens.length > 0
                        ? `${fornecedorItem.itens.length} ${
                            fornecedorItem.itens.length === 1
                              ? "item acompanhado"
                              : "itens acompanhados"
                          }`
                        : "nenhum item com quantidade preenchida ainda"}
                    </div>
                  </div>
                </div>

                <div style={{ width: "100%", marginTop: 10 }}>
                  {fornecedorItem.itens.map((itemGrupo) => {
                    const chave = `${fornecedorItem.fornecedor}|||${itemGrupo.item}`;
                    const indicadorUltima = rotuloIndicador(
                      itemGrupo.ultima_compra?.indicador
                    );

                    return (
                      <div
                        key={chave}
                        style={{
                          marginTop: 8,
                          paddingTop: 8,
                          borderTop: "1px solid rgba(159,176,196,0.15)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "row",
                            flexWrap: "wrap",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                            cursor: "pointer",
                          }}
                          onClick={() =>
                            setExpandido((atual) =>
                              atual === chave ? null : chave
                            )
                          }
                        >
                          <div>
                            <strong>📦 {itemGrupo.item}</strong>{" "}
                            <span style={{ color: "#9fb0c4" }}>
                              ({itemGrupo.total_compras}{" "}
                              {itemGrupo.total_compras === 1
                                ? "compra"
                                : "compras"}
                              , média{" "}
                              {formatarMoeda(itemGrupo.preco_medio_unidade)}/
                              {itemGrupo.unidade || "un"})
                            </span>
                          </div>

                          <div>
                            Última:{" "}
                            <strong>
                              {formatarMoeda(
                                itemGrupo.ultima_compra?.preco_unidade
                              )}
                              /{itemGrupo.unidade || "un"}
                            </strong>{" "}
                            <span style={{ color: indicadorUltima.cor }}>
                              {textoVariacao(itemGrupo.ultima_compra)}
                            </span>
                          </div>
                        </div>

                        {expandido === chave && (
                          <div style={{ marginTop: 8 }}>
                            <TabelaCompras
                              compras={itemGrupo.compras}
                              coluna3Titulo={`R$/${itemGrupo.unidade || "un"}`}
                              valorLinha={(compra) =>
                                `${formatarMoeda(compra.preco_unidade)} (${
                                  compra.quantidade
                                } ${itemGrupo.unidade || "un"} por ${formatarMoeda(
                                  compra.valor
                                )})`
                              }
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {fornecedorItem.sem_item && (
                    <div
                      style={{
                        marginTop: 8,
                        paddingTop: 8,
                        borderTop: "1px solid rgba(159,176,196,0.15)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "row",
                          flexWrap: "wrap",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                          cursor: "pointer",
                        }}
                        onClick={() =>
                          setExpandido((atual) =>
                            atual === `${fornecedorItem.fornecedor}|||semitem`
                              ? null
                              : `${fornecedorItem.fornecedor}|||semitem`
                          )
                        }
                      >
                        <div>
                          <strong>Sem item específico</strong>{" "}
                          <span style={{ color: "#9fb0c4" }}>
                            ({fornecedorItem.sem_item.total_compras}{" "}
                            {fornecedorItem.sem_item.total_compras === 1
                              ? "compra"
                              : "compras"}
                            , média {formatarMoeda(fornecedorItem.sem_item.valor_medio)})
                          </span>
                        </div>
                      </div>

                      {expandido ===
                        `${fornecedorItem.fornecedor}|||semitem` && (
                        <div style={{ marginTop: 8 }}>
                          <TabelaCompras
                            compras={fornecedorItem.sem_item.compras}
                            coluna3Titulo="Valor"
                            valorLinha={(compra) => formatarMoeda(compra.valor)}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

export default Fornecedores;
