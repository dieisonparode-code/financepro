import { useEffect, useState } from "react";
import { buscarVendasPagSeguro } from "../services/api";

// Não usar toISOString() aqui: ele converte pra UTC, e depois das 21h no
// horário de Brasília (UTC-3) isso já vira o dia seguinte. Calculamos a data
// direto no horário de Brasília, independente do fuso do dispositivo.
function hoje() {
  const formatador = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const partes = formatador.formatToParts(new Date());
  const obter = (tipo) => partes.find((parte) => parte.type === tipo)?.value;

  return `${obter("year")}-${obter("month")}-${obter("day")}`;
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarDataHora(dataIso) {
  if (!dataIso) return "";
  return new Date(dataIso).toLocaleString("pt-BR");
}

const ORDEM_FORMAS_PAGAMENTO = ["Cartão de crédito", "Cartão de débito", "PIX"];

function agruparVendasPorFormaPagamento(vendas) {
  const grupos = new Map();

  vendas.forEach((venda) => {
    const forma = venda.forma_pagamento || "Outro";

    if (!grupos.has(forma)) {
      grupos.set(forma, []);
    }

    grupos.get(forma).push(venda);
  });

  const formasOrdenadas = [
    ...ORDEM_FORMAS_PAGAMENTO.filter((forma) => grupos.has(forma)),
    ...[...grupos.keys()].filter(
      (forma) => !ORDEM_FORMAS_PAGAMENTO.includes(forma)
    ),
  ];

  return formasOrdenadas.map((forma) => ({
    forma,
    vendas: grupos.get(forma),
  }));
}

const INTERVALO_ATUALIZACAO_MS = 30 * 1000;

function Conciliacao() {
  const [data, setData] = useState(hoje());
  const [resumo, setResumo] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [atualizadoEm, setAtualizadoEm] = useState(null);

  async function buscar() {
    setCarregando(true);
    setErro("");

    try {
      const resultado = await buscarVendasPagSeguro(data);
      setResumo(resultado);
      setAtualizadoEm(new Date());
    } catch (erroBusca) {
      setErro(
        erroBusca.message || "Não foi possível buscar as vendas na PagSeguro."
      );
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    buscar();

    const intervalo = setInterval(buscar, INTERVALO_ATUALIZACAO_MS);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const formasPagamento = Object.entries(
    resumo?.totais_por_forma_pagamento || {}
  );

  return (
    <section className="categorias-layout">
      <article className="panel categoria-form-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Conciliação de pagamentos</span>
            <h2>PagSeguro em tempo real</h2>
          </div>
        </div>

        <label>
          Data
          <input
            type="date"
            value={data}
            onChange={(evento) => setData(evento.target.value)}
          />
        </label>

        <button
          type="button"
          className="primary-button"
          onClick={buscar}
          disabled={carregando}
        >
          {carregando ? "Buscando..." : "🔄 Atualizar agora"}
        </button>

        <small className="foto-ajuda">
          Atualiza sozinho a cada 30 segundos, mostrando o que já está
          disponível no extrato da PagSeguro.{" "}
          {atualizadoEm && (
            <>Última atualização: {atualizadoEm.toLocaleTimeString("pt-BR")}.</>
          )}
        </small>

        {erro && <div className="empty-state">{erro}</div>}

        {resumo && (
          <div className="categorias-lista">
            <div className="categoria-item">
              <div className="categoria-identificacao">
                <div className="categoria-icone">💰</div>
                <div>
                  <strong>Total recebido</strong>
                  <div>{formatarMoeda(resumo.total_recebido)}</div>
                </div>
              </div>
            </div>

            <div className="categoria-item">
              <div className="categoria-identificacao">
                <div className="categoria-icone">🧾</div>
                <div>
                  <strong>Vendas</strong>
                  <div>
                    {resumo.quantidade_recebida} recebidas
                    {resumo.quantidade_pendente_ou_cancelada > 0 &&
                      ` · ${resumo.quantidade_pendente_ou_cancelada} pendentes/canceladas`}
                  </div>
                </div>
              </div>
            </div>

            {formasPagamento.map(([forma, valor]) => (
              <div className="categoria-item" key={forma}>
                <div className="categoria-identificacao">
                  <div className="categoria-icone">💳</div>
                  <div>
                    <strong style={{ color: "#16ca50" }}>{forma}</strong>
                    <div>{formatarMoeda(valor)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </article>

      <article
        className="panel categoria-lista-panel"
        style={{ gridColumn: "1 / -1" }}
      >
        <div className="panel-header">
          <div>
            <span className="eyebrow">Últimas vendas</span>
            <h2>Caindo na PagSeguro, por forma de pagamento</h2>
          </div>

          <strong>{resumo?.ultimas_vendas?.length || 0}</strong>
        </div>

        {!resumo || resumo.ultimas_vendas?.length === 0 ? (
          <div className="empty-state">
            {carregando
              ? "Buscando..."
              : "Nenhuma venda encontrada nessa data."}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "1rem",
            }}
          >
            {agruparVendasPorFormaPagamento(resumo.ultimas_vendas).map(
              (grupo) => (
                <div key={grupo.forma}>
                  <div className="panel-header">
                    <strong style={{ color: "#16ca50" }}>
                      {grupo.forma}
                    </strong>
                    <span>{grupo.vendas.length}</span>
                  </div>

                  <div className="categorias-lista">
                    {grupo.vendas.map((venda) => (
                      <div className="categoria-item" key={venda.codigo}>
                        <div className="categoria-identificacao">
                          <div className="categoria-icone">💰</div>

                          <div>
                            <strong>
                              {formatarMoeda(venda.valor_liquido)}
                            </strong>
                            <div>{formatarDataHora(venda.data)}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </article>
    </section>
  );
}

export default Conciliacao;
