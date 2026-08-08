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
                    <strong>{forma}</strong>
                    <div>{formatarMoeda(valor)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </article>

      <article className="panel categoria-lista-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Últimas vendas</span>
            <h2>Caindo na PagSeguro</h2>
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
          <div className="categorias-lista">
            {resumo.ultimas_vendas.map((venda) => (
              <div className="categoria-item" key={venda.codigo}>
                <div className="categoria-identificacao">
                  <div className="categoria-icone">💰</div>

                  <div>
                    <strong>{formatarMoeda(venda.valor_liquido)}</strong>
                    <div>{formatarDataHora(venda.data)}</div>
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

export default Conciliacao;
