import { useEffect, useRef, useState } from "react";
import { buscarVendasPagSeguro } from "../services/api";

// Usa o fuso horário do próprio dispositivo (não força São Paulo) — é o que
// bate com a expectativa de quem está usando a tela, seja qual for a loja.
// A proteção contra "pedir data no futuro pra PagSeguro" fica só no backend
// (calcularPeriodoPagSeguro), que sempre usa o horário de Brasília por ser o
// que a PagSeguro exige — não precisa ser replicado aqui.
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

function formatarDataHora(dataIso) {
  if (!dataIso) return "";
  return new Date(dataIso).toLocaleString("pt-BR");
}

// Status 3 (Paga) e 4 (Disponível) são as únicas que a PagSeguro já confirmou
// como recebidas de verdade — o resto (aguardando, em análise, disputa,
// devolvida, cancelada) é dinheiro que apareceu como venda mas ainda não
// entrou (ou nunca vai entrar) no bolso.
function estaPendenteOuCancelada(venda) {
  return venda.status !== 3 && venda.status !== 4;
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

  // Acompanha qual era "hoje" da última vez que checamos — serve pra saber
  // se a pessoa está vendo o dia atual (e por isso a data deve virar sozinha
  // à meia-noite) ou se escolheu um dia antigo de propósito (e nesse caso não
  // deve mexer na data escolhida por ela).
  const diaSeguidoRef = useRef(hoje());

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
  }, [data]);

  const formasPagamento = Object.entries(
    resumo?.totais_por_forma_pagamento || {}
  );

  return (
    <section className="conciliacao-layout">
      <article className="panel">
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-end",
            gap: "1rem",
            marginBottom: resumo ? "0.3rem" : 0,
          }}
        >
          <div style={{ marginRight: "auto" }}>
            <span className="eyebrow">Conciliação de pagamentos</span>
            <h2 style={{ margin: 0 }}>PagSeguro em tempo real</h2>
          </div>

          <label style={{ margin: 0 }}>
            Data
            <input
              type="date"
              value={data}
              onChange={(evento) => setData(evento.target.value)}
            />
          </label>

          <div>
            <button
              type="button"
              className="primary-button"
              onClick={buscar}
              disabled={carregando}
            >
              {carregando ? "Buscando..." : "🔄 Atualizar agora"}
            </button>

            <small
              className="foto-ajuda"
              style={{ display: "block", marginTop: "6px" }}
            >
              Atualiza sozinho a cada 30s.{" "}
              {atualizadoEm && (
                <>
                  Última atualização: {atualizadoEm.toLocaleTimeString("pt-BR")}
                  .
                </>
              )}
            </small>
          </div>
        </div>

        {erro && <div className="empty-state">{erro}</div>}

        {resumo && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "2px",
              marginTop: "0.3rem",
              maxWidth: "320px",
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            <div className="categoria-item" style={{ padding: "6px 0" }}>
              <div className="categoria-identificacao">
                <div className="categoria-icone">💰</div>
                <div>
                  <strong>Total recebido</strong>
                  <div>{formatarMoeda(resumo.total_recebido)}</div>
                </div>
              </div>
            </div>

            <div className="categoria-item" style={{ padding: "6px 0" }}>
              <div className="categoria-identificacao">
                <div className="categoria-icone">🧾</div>
                <div>
                  <strong>Vendas</strong>
                  <div>
                    {resumo.quantidade_recebida} recebidas
                    {resumo.quantidade_pendente_ou_cancelada > 0 &&
                      ` · ${resumo.quantidade_pendente_ou_cancelada} pend./canc.`}
                  </div>
                </div>
              </div>
            </div>

            {formasPagamento.map(([forma, valor]) => (
              <div
                className="categoria-item"
                style={{ padding: "6px 0" }}
                key={forma}
              >
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

      <article className="panel categoria-lista-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Últimas vendas</span>
            <h2>Caindo na PagSeguro, por forma de pagamento</h2>
          </div>
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
                    {grupo.vendas.map((venda) => {
                      const pendenteOuCancelada =
                        estaPendenteOuCancelada(venda);

                      return (
                        <div className="categoria-item" key={venda.codigo}>
                          <div className="categoria-identificacao">
                            <div className="categoria-icone">
                              {pendenteOuCancelada ? "⚠️" : "💰"}
                            </div>

                            <div>
                              <strong
                                style={
                                  pendenteOuCancelada
                                    ? { color: "#ff4655" }
                                    : undefined
                                }
                              >
                                {formatarMoeda(venda.valor_liquido)}
                              </strong>
                              <div
                                style={
                                  pendenteOuCancelada
                                    ? { color: "#ff4655" }
                                    : undefined
                                }
                              >
                                {formatarDataHora(venda.data)}
                                {pendenteOuCancelada &&
                                  ` · ${venda.status_descricao}`}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
