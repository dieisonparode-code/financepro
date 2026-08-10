import { useEffect, useRef, useState } from "react";
import { buscarFechamentoSaipos, importarReceitasSaipos } from "../services/api";

// Usa o fuso horário do próprio dispositivo (não força São Paulo) — é o que
// bate com a expectativa de quem está usando a tela, seja qual for a loja.
function hoje() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

const INTERVALO_ATUALIZACAO_MS = 60 * 1000;

function VendasSaipos({ lojas = [], ehAdministrador = false }) {
  const lojasComSaipos = lojas.filter((loja) => loja.saipos_id_store);

  const [lojaId, setLojaId] = useState(
    lojasComSaipos[0] ? String(lojasComSaipos[0].id) : ""
  );
  const [data, setData] = useState(hoje());
  const [resumo, setResumo] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [atualizadoEm, setAtualizadoEm] = useState(null);
  const [importando, setImportando] = useState(false);
  const [resultadoImportacao, setResultadoImportacao] = useState(null);
  const [erroImportacao, setErroImportacao] = useState("");

  // Acompanha qual era "hoje" da última vez que checamos — serve pra saber
  // se a pessoa está vendo o dia atual (e por isso a data deve virar sozinha
  // à meia-noite) ou se escolheu um dia antigo de propósito (e nesse caso não
  // deve mexer na data escolhida por ela).
  const diaSeguidoRef = useRef(hoje());

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

  async function importarComoReceita() {
    if (!lojaId) return;

    const confirmar = window.confirm(
      `Importar as vendas de ${data} como lançamento de receita? Isso cria/atualiza lançamentos reais no Fluxo de Caixa.`
    );

    if (!confirmar) return;

    setImportando(true);
    setErroImportacao("");
    setResultadoImportacao(null);

    try {
      const resultado = await importarReceitasSaipos(lojaId, data);
      setResultadoImportacao(resultado);
    } catch (erroImportar) {
      setErroImportacao(
        erroImportar.message || "Não foi possível importar as vendas como receita."
      );
    } finally {
      setImportando(false);
    }
  }

  useEffect(() => {
    if (!lojaId) return;

    setResultadoImportacao(null);
    setErroImportacao("");

    buscar();

    const intervalo = setInterval(() => {
      const hojeAgora = hoje();

      if (hojeAgora !== diaSeguidoRef.current) {
        const estavaSeguindoHoje = data === diaSeguidoRef.current;
        diaSeguidoRef.current = hojeAgora;

        if (estavaSeguindoHoje) {
          setData(hojeAgora);
          return; // o efeito reinicia sozinho por causa da dependência [data]
        }
      }

      buscar();
    }, INTERVALO_ATUALIZACAO_MS);

    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojaId, data]);

  const formasPagamento = Object.entries(
    resumo?.totais_por_forma_pagamento || {}
  );

  const canais = Object.entries(resumo?.totais_por_canal || {});
  const quantidadePorCanal = resumo?.quantidade_por_canal || {};

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

            {ehAdministrador && (
              <>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={importarComoReceita}
                  disabled={importando || !resumo}
                  style={{ marginTop: 12 }}
                >
                  {importando
                    ? "Importando..."
                    : "📥 Lançar vendas deste dia como receita"}
                </button>

                <small className="foto-ajuda">
                  Cria ou atualiza os lançamentos de receita a partir das
                  vendas da Saipos nesse dia (por canal — iFood, Brendi — e
                  por forma de pagamento no balcão). Pode clicar de novo no
                  mesmo dia: atualiza em vez de duplicar.
                </small>
              </>
            )}
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

            {canais.length > 0 && (
              <div className="categoria-item categoria-item-titulo">
                <strong>Por canal de venda</strong>
              </div>
            )}

            {canais.map(([canal, valor]) => (
              <div className="categoria-item" key={canal}>
                <div className="categoria-identificacao">
                  <div className="categoria-icone">📦</div>
                  <div>
                    <strong>{canal}</strong>
                    <div>
                      {formatarMoeda(valor)}
                      {quantidadePorCanal[canal] != null &&
                        ` · ${quantidadePorCanal[canal]} venda${
                          quantidadePorCanal[canal] === 1 ? "" : "s"
                        }`}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {formasPagamento.length > 0 && (
              <div className="categoria-item categoria-item-titulo">
                <strong>Por forma de pagamento</strong>
              </div>
            )}

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

      {(resultadoImportacao || erroImportacao) && (
        <article className="panel categoria-lista-panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Importação</span>
              <h2>Resultado do lançamento automático</h2>
            </div>
          </div>

          {erroImportacao ? (
            <div className="empty-state">{erroImportacao}</div>
          ) : (
            <div className="categorias-lista">
              {resultadoImportacao.criados.length === 0 &&
                resultadoImportacao.atualizados.length === 0 && (
                  <div className="empty-state">
                    Nenhum lançamento criado ou atualizado — veja abaixo o que
                    foi pulado.
                  </div>
                )}

              {resultadoImportacao.criados.map((item, indice) => (
                <div className="categoria-item" key={`criado-${indice}`}>
                  <div className="categoria-identificacao">
                    <div className="categoria-icone">✅</div>
                    <div>
                      <strong>{item.canal}</strong>
                      <div>
                        Criado — {formatarMoeda(item.valor)} ({item.quantidade}{" "}
                        venda{item.quantidade === 1 ? "" : "s"})
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {resultadoImportacao.atualizados.map((item, indice) => (
                <div className="categoria-item" key={`atualizado-${indice}`}>
                  <div className="categoria-identificacao">
                    <div className="categoria-icone">🔄</div>
                    <div>
                      <strong>{item.canal}</strong>
                      <div>
                        Atualizado — {formatarMoeda(item.valor)} (
                        {item.quantidade} venda{item.quantidade === 1 ? "" : "s"})
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {Object.keys(resultadoImportacao.pulados || {}).length > 0 && (
                <div className="categoria-item categoria-item-titulo">
                  <strong>Não importado</strong>
                </div>
              )}

              {Object.entries(resultadoImportacao.pulados || {}).map(
                ([motivo, quantidade]) => (
                  <div className="categoria-item" key={motivo}>
                    <div className="categoria-identificacao">
                      <div className="categoria-icone">⚠️</div>
                      <div>
                        <strong>{motivo}</strong>
                        <div>{quantidade} venda{quantidade === 1 ? "" : "s"}</div>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </article>
      )}
    </section>
  );
}

export default VendasSaipos;
