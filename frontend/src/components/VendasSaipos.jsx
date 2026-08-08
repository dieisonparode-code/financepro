import { useEffect, useState } from "react";
import { buscarFechamentoSaipos } from "../services/api";

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

const INTERVALO_ATUALIZACAO_MS = 60 * 1000;

function VendasSaipos({ lojas = [] }) {
  const lojasComSaipos = lojas.filter((loja) => loja.saipos_id_store);

  const [lojaId, setLojaId] = useState(
    lojasComSaipos[0] ? String(lojasComSaipos[0].id) : ""
  );
  const [data, setData] = useState(hoje());
  const [resumo, setResumo] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [atualizadoEm, setAtualizadoEm] = useState(null);

  async function buscar() {
    if (!lojaId) return;

    setCarregando(true);
    setErro("");

    try {
      const resultado = await buscarFechamentoSaipos(lojaId, data);
      setResumo(resultado);
      setAtualizadoEm(new Date());
    } catch (erroBusca) {
      setErro(
        erroBusca.message || "Não foi possível buscar as vendas na Saipos."
      );
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    if (!lojaId) return;

    buscar();

    const intervalo = setInterval(buscar, INTERVALO_ATUALIZACAO_MS);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojaId, data]);

  const formasPagamento = Object.entries(
    resumo?.totais_por_forma_pagamento || {}
  );

  return (
    <section className="categorias-layout">
      <article className="panel categoria-form-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Integração Saipos</span>
            <h2>Vendas em tempo real</h2>
          </div>
        </div>

        {lojasComSaipos.length === 0 ? (
          <div className="empty-state">
            Nenhuma loja tem o ID da Saipos cadastrado ainda. Configure em
            Lojas → Editar.
          </div>
        ) : (
          <>
            <label>
              Loja
              <select
                value={lojaId}
                onChange={(evento) => setLojaId(evento.target.value)}
              >
                {lojasComSaipos.map((loja) => (
                  <option key={loja.id} value={loja.id}>
                    {loja.nome}
                  </option>
                ))}
              </select>
            </label>

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
              Atualiza sozinho a cada 1 minuto. {atualizadoEm && (
                <>Última atualização: {atualizadoEm.toLocaleTimeString("pt-BR")}.</>
              )}
            </small>
          </>
        )}
      </article>

      <article className="panel categoria-lista-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Resumo do dia</span>
            <h2>Direto da Saipos</h2>
          </div>
        </div>

        {erro ? (
          <div className="empty-state">{erro}</div>
        ) : !resumo ? (
          <div className="empty-state">
            {carregando ? "Buscando..." : "Selecione a loja e a data."}
          </div>
        ) : (
          <div className="categorias-lista">
            <div className="categoria-item">
              <div className="categoria-identificacao">
                <div className="categoria-icone">💰</div>
                <div>
                  <strong>Total vendido</strong>
                  <div>{formatarMoeda(resumo.total_vendas)}</div>
                </div>
              </div>
            </div>

            <div className="categoria-item">
              <div className="categoria-identificacao">
                <div className="categoria-icone">🧾</div>
                <div>
                  <strong>Vendas</strong>
                  <div>
                    {resumo.quantidade_vendas} válidas
                    {resumo.quantidade_canceladas > 0 &&
                      ` · ${resumo.quantidade_canceladas} canceladas`}
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

            <div className="categoria-item">
              <div className="categoria-identificacao">
                <div className="categoria-icone">📑</div>
                <div>
                  <strong>Lançamentos financeiros (saldo)</strong>
                  <div>
                    {formatarMoeda(resumo.total_lancamentos_financeiros)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </article>
    </section>
  );
}

export default VendasSaipos;
