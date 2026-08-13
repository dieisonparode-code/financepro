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

function Fornecedores({ historico = [], carregando = false, lojas = [] }) {
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
            <h2>Histórico de preços</h2>
          </div>
        </div>

        <p style={{ color: "#9fb0c4", fontSize: 13.5 }}>
          Compara o valor de cada compra lançada em Despesas (ou pago em
          Contas a Pagar) com a própria média histórica desse fornecedor —
          sinaliza quando um pagamento veio bem acima ou bem abaixo do
          normal. Só entram compras com o campo "Fornecedor" preenchido.
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
            "Fornecedor" ao lançar uma despesa ou uma conta a pagar.
          </div>
        ) : (
          <div className="categorias-lista">
            {historicoVisivel.map((item) => {
              const indicadorUltima = rotuloIndicador(
                item.ultima_compra?.indicador
              );

              return (
                <div key={item.fornecedor} className="categoria-item">
                  <div
                    className="categoria-identificacao"
                    style={{ cursor: "pointer", width: "100%" }}
                    onClick={() =>
                      setExpandido((atual) =>
                        atual === item.fornecedor ? null : item.fornecedor
                      )
                    }
                  >
                    <div className="categoria-icone">🏭</div>
                    <div style={{ width: "100%" }}>
                      <strong>{item.fornecedor}</strong>
                      <div>
                        {item.total_compras}{" "}
                        {item.total_compras === 1 ? "compra" : "compras"} —
                        média {formatarMoeda(item.valor_medio)} — total{" "}
                        {formatarMoeda(item.valor_total)}
                      </div>
                      <div>
                        Última compra: {formatarData(item.ultima_compra?.data)}{" "}
                        —{" "}
                        <strong>
                          {formatarMoeda(item.ultima_compra?.valor)}
                        </strong>{" "}
                        <span style={{ color: indicadorUltima.cor }}>
                          {indicadorUltima.texto}
                          {item.ultima_compra?.variacao_percentual
                            ? ` (${
                                item.ultima_compra.variacao_percentual > 0
                                  ? "+"
                                  : ""
                              }${item.ultima_compra.variacao_percentual}%)`
                            : ""}
                        </span>
                      </div>
                    </div>
                  </div>

                  {expandido === item.fornecedor && (
                    <div style={{ width: "100%", marginTop: 10 }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Data</th>
                            <th>Descrição</th>
                            <th>Valor</th>
                            <th>Variação vs. média</th>
                          </tr>
                        </thead>
                        <tbody>
                          {item.compras.map((compra) => {
                            const indicadorCompra = rotuloIndicador(
                              compra.indicador
                            );

                            return (
                              <tr key={compra.id}>
                                <td>{formatarData(compra.data)}</td>
                                <td>{compra.descricao}</td>
                                <td>{formatarMoeda(compra.valor)}</td>
                                <td style={{ color: indicadorCompra.cor }}>
                                  {indicadorCompra.texto}
                                  {compra.variacao_percentual
                                    ? ` (${
                                        compra.variacao_percentual > 0
                                          ? "+"
                                          : ""
                                      }${compra.variacao_percentual}%)`
                                    : ""}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </article>
    </section>
  );
}

export default Fornecedores;
