import { Fragment, useState } from "react";

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

// Selo colorido simples — em vez de frase corrida, é só um retangulinho
// com a cor e o texto curto, igual um "badge" de status que já existe em
// outras telas do sistema.
function Selo({ indicador }) {
  const estilos = {
    abusivo: { cor: "#ef4444", fundo: "rgba(239,68,68,0.15)", texto: "⚠️ Acima" },
    bom: { cor: "#16ca50", fundo: "rgba(22,202,80,0.15)", texto: "✅ Bom preço" },
    normal: { cor: "#9fb0c4", fundo: "rgba(159,176,196,0.12)", texto: "Na média" },
  };

  const estilo = estilos[indicador] || estilos.normal;

  return (
    <span
      style={{
        color: estilo.cor,
        background: estilo.fundo,
        borderRadius: 6,
        padding: "3px 8px",
        fontSize: 12.5,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {estilo.texto}
    </span>
  );
}

// Achata a estrutura fornecedor > itens/sem-item numa única lista de linhas
// de tabela — é mais fácil de ler uma linha por item do que ter que abrir
// vários níveis pra achar o número que importa.
function montarLinhas(historico) {
  const linhas = [];

  historico.forEach((fornecedorItem) => {
    fornecedorItem.itens.forEach((itemGrupo) => {
      linhas.push({
        chave: `${fornecedorItem.fornecedor}|||${itemGrupo.item}`,
        fornecedor: fornecedorItem.fornecedor,
        item: itemGrupo.item,
        unidade: itemGrupo.unidade || "un",
        total_compras: itemGrupo.total_compras,
        preco_medio: itemGrupo.preco_medio_unidade,
        ultima_data: itemGrupo.ultima_compra?.data,
        ultimo_preco: itemGrupo.ultima_compra?.preco_unidade,
        ultimo_indicador: itemGrupo.ultima_compra?.indicador,
        porUnidade: true,
        historico: itemGrupo.compras.map((compra) => ({
          data: compra.data,
          valor: compra.preco_unidade,
          indicador: compra.indicador,
          detalhe: `${compra.quantidade} ${itemGrupo.unidade || "un"} — total ${formatarMoeda(
            compra.valor
          )}`,
        })),
      });
    });

    if (fornecedorItem.sem_item) {
      const semItem = fornecedorItem.sem_item;
      const ultima = semItem.compras[0]; // já vem invertido (mais recente primeiro)

      linhas.push({
        chave: `${fornecedorItem.fornecedor}|||semitem`,
        fornecedor: fornecedorItem.fornecedor,
        item: "Sem item específico (valor total)",
        unidade: "",
        total_compras: semItem.total_compras,
        preco_medio: semItem.valor_medio,
        ultima_data: ultima?.data,
        ultimo_preco: ultima?.valor,
        ultimo_indicador: ultima?.indicador,
        porUnidade: false,
        historico: semItem.compras.map((compra) => ({
          data: compra.data,
          valor: compra.valor,
          indicador: compra.indicador,
          detalhe: compra.descricao,
        })),
      });
    }
  });

  return linhas;
}

function Fornecedores({ historico = [], carregando = false }) {
  const [busca, setBusca] = useState("");
  const [expandido, setExpandido] = useState(null);

  const buscaLimpa = busca.trim().toLowerCase();

  const todasAsLinhas = montarLinhas(historico);

  const linhasVisiveis = todasAsLinhas.filter((linha) =>
    buscaLimpa
      ? linha.fornecedor.toLowerCase().includes(buscaLimpa) ||
        linha.item.toLowerCase().includes(buscaLimpa)
      : true
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
          Cada linha é um item comprado de um fornecedor. "Última compra"
          mostra o preço mais recente e um selo comparando com a média de
          todas as compras anteriores desse item.
        </p>

        <label>
          Pesquisar fornecedor ou item
          <input
            type="text"
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Ex.: Frigorífico X ou Carne moída"
          />
        </label>
      </article>

      <article className="panel categoria-lista-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">
              {linhasVisiveis.length}{" "}
              {linhasVisiveis.length === 1 ? "item" : "itens"}
            </span>
            <h2>Comparativo</h2>
          </div>
        </div>

        {carregando ? (
          <p>Carregando...</p>
        ) : linhasVisiveis.length === 0 ? (
          <div className="empty-state">
            Nenhum fornecedor encontrado ainda. Pra aparecer aqui, preencha o
            campo "Fornecedor" ao lançar uma despesa (e "Item comprado" +
            "Quantidade", se quiser comparar preço por kg/litro/unidade).
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Fornecedor</th>
                  <th>Item</th>
                  <th>Compras</th>
                  <th>Preço médio</th>
                  <th>Última compra</th>
                  <th>Situação</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {linhasVisiveis.map((linha) => (
                  <Fragment key={linha.chave}>
                    <tr>
                      <td>{linha.fornecedor}</td>
                      <td>{linha.item}</td>
                      <td>{linha.total_compras}</td>
                      <td>
                        {formatarMoeda(linha.preco_medio)}
                        {linha.porUnidade ? `/${linha.unidade}` : ""}
                      </td>
                      <td>
                        {formatarData(linha.ultima_data)} —{" "}
                        <strong>
                          {formatarMoeda(linha.ultimo_preco)}
                          {linha.porUnidade ? `/${linha.unidade}` : ""}
                        </strong>
                      </td>
                      <td>
                        <Selo indicador={linha.ultimo_indicador} />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() =>
                            setExpandido((atual) =>
                              atual === linha.chave ? null : linha.chave
                            )
                          }
                        >
                          {expandido === linha.chave
                            ? "Fechar"
                            : "Ver histórico"}
                        </button>
                      </td>
                    </tr>

                    {expandido === linha.chave && (
                      <tr>
                        <td colSpan={7} style={{ background: "rgba(159,176,196,0.06)" }}>
                          <table style={{ margin: 0 }}>
                            <thead>
                              <tr>
                                <th>Data</th>
                                <th>Preço</th>
                                <th>Detalhe</th>
                                <th>Situação</th>
                              </tr>
                            </thead>
                            <tbody>
                              {linha.historico.map((compra, indice) => (
                                <tr key={indice}>
                                  <td>{formatarData(compra.data)}</td>
                                  <td>
                                    {formatarMoeda(compra.valor)}
                                    {linha.porUnidade ? `/${linha.unidade}` : ""}
                                  </td>
                                  <td>{compra.detalhe}</td>
                                  <td>
                                    <Selo indicador={compra.indicador} />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  );
}

export default Fornecedores;
