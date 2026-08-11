import { useEffect, useMemo, useState } from "react";
import {
  buscarVendasPagSeguro,
  conferirFechamentoFoto,
  buscarFechamentosCaixa,
  buscarFotoFechamentoCaixa,
} from "../services/api";
import ConciliacaoDespesas from "./ConciliacaoDespesas";

// Converte o horário de um registro (o momento em que um fechamento foi
// salvo) pro formato de data que a PagSeguro espera.
function hojeDoRegistro(dataIso) {
  const data = new Date(dataIso);
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

// Sempre mostra no horário de Uberlândia (onde a loja fica), não no fuso do
// dispositivo de quem está olhando — senão parece que a venda foi em outro
// horário do que realmente foi (ex: alguém acessando de Mato Grosso, que é
// 1 hora atrás de Uberlândia).
function formatarDataHora(dataIso) {
  if (!dataIso) return "";
  return new Date(dataIso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
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

// Sem seletor de loja aqui de propósito — a pedido do usuário, essa tela
// usa a loja em que a pessoa já está logada (ou a selecionada no topo,
// pra administrador), não precisa escolher de novo.
function Conciliacao({ lojaId }) {
  const [abaAtiva, setAbaAtiva] = useState("caixa");
  const [resumo, setResumo] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [resultadoFoto, setResultadoFoto] = useState(null);
  const [valoresInformados, setValoresInformados] = useState({
    "Cartão de crédito": "",
    "Cartão de débito": "",
    PIX: "",
    Dinheiro: "",
    "A prazo": "",
    "Pago Online": "",
    Vale: "",
    "Voucher Parceiro": "",
  });
  const [fotoPreview, setFotoPreview] = useState(null);
  const [carregandoPreview, setCarregandoPreview] = useState(false);
  const [fechamentosDisponiveis, setFechamentosDisponiveis] = useState([]);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [fechamentoEscolhido, setFechamentoEscolhido] = useState(null);

  // Pedido do usuário: mostra a lista de Fechamentos de Caixa dessa loja
  // pra ele escolher qual conciliar — não é mais só "o último" sozinho.
  useEffect(() => {
    if (!lojaId) {
      setFechamentosDisponiveis([]);
      return;
    }

    setCarregandoLista(true);

    buscarFechamentosCaixa()
      .then((dados) => {
        const daLoja = (Array.isArray(dados) ? dados : [])
          .filter(
            (item) =>
              item.tipo === "caixa" &&
              String(item.loja_id) === String(lojaId)
          )
          .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))
          .slice(0, 20);

        setFechamentosDisponiveis(daLoja);
      })
      .catch(() => setFechamentosDisponiveis([]))
      .finally(() => setCarregandoLista(false));
  }, [lojaId]);

  // Pedido do usuário: essa tela não é mais "tempo real" — uma vez
  // conciliado o fechamento, não tem por que ficar rodando de novo. Depois
  // de escolher qual Fechamento de Caixa usar, um botão busca a PagSeguro
  // só daquele dia e já lê a foto sozinho.
  async function conciliarAgora() {
    if (!fechamentoEscolhido) return;

    setCarregando(true);
    setErro("");
    setResultadoFoto(null);
    setResumo(null);

    try {
      const dataFechamento = hojeDoRegistro(fechamentoEscolhido.criado_em);
      const resultadoVendas = await buscarVendasPagSeguro(
        dataFechamento,
        dataFechamento
      );

      setResumo(resultadoVendas);

      const fotoResultado = await buscarFotoFechamentoCaixa(
        fechamentoEscolhido.id
      );
      await conferirFotoDataUrl(fotoResultado?.foto);
    } catch (erroBusca) {
      setErro(
        erroBusca.message ||
          "Não foi possível buscar esse fechamento."
      );
    } finally {
      setCarregando(false);
    }
  }

  async function conferirFotoDataUrl(fotoDataUrl) {
    if (!fotoDataUrl) return;

    setEnviandoFoto(true);
    setResultadoFoto(null);

    try {
      const resultado = await conferirFechamentoFoto(fotoDataUrl);

      if (resultado.erro_leitura || !resultado.valores) {
        setResultadoFoto({
          erro_leitura:
            resultado.erro_leitura ||
            "Não foi possível ler os valores dessa foto.",
          debugRespostaIa: resultado.debug_resposta_ia,
        });
        return;
      }

      // Preenche a tabela de confronto sozinha com o que a foto trouxe —
      // inclui TODAS as categorias que a foto tiver (Dinheiro, Vale, Voucher,
      // etc), não só as 3 fixas (Crédito/Débito/PIX).
      setValoresInformados((anterior) => {
        const novo = { ...anterior };

        Object.entries(resultado.valores).forEach(([forma, valor]) => {
          if (valor != null) {
            novo[forma] = valor.toFixed(2);
          }
        });

        return novo;
      });

      const formasNaoLidas = Object.entries(resultado.valores)
        .filter(([, valor]) => valor == null)
        .map(([forma]) => forma);

      setResultadoFoto({
        sucesso: true,
        formasNaoLidas,
      });
    } catch (erroFoto) {
      setResultadoFoto({
        erro_leitura:
          erroFoto.message || "Não foi possível conferir a foto.",
      });
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function verFotoSelecionada(id) {
    if (!id) return;

    setCarregandoPreview(true);

    try {
      const resultado = await buscarFotoFechamentoCaixa(id);
      setFotoPreview(resultado?.foto || null);
    } catch (erroFoto) {
      alert(erroFoto.message || "Não foi possível carregar a foto.");
    } finally {
      setCarregandoPreview(false);
    }
  }

  const formasPagamento = Object.entries(
    resumo?.totais_por_forma_pagamento || {}
  );

  // Confronto Sistema × Informado calculado aqui (não só dentro da tabela)
  // pra poder mostrar um aviso no topo da tela quando tiver diferença,
  // igual o aviso de CMV alto do Dashboard.
  const confrontoCalculado = useMemo(() => {
    const totaisBrutos = resumo?.totais_brutos_por_forma_pagamento || {};

    const linhas = Object.keys(valoresInformados).map((forma) => {
      const temSistema = forma in totaisBrutos;
      const valorSistema = totaisBrutos[forma] || 0;
      const valorInformadoTexto = valoresInformados[forma] ?? "";
      const temInformado = valorInformadoTexto !== "";
      const valorInformado = temInformado
        ? Number(valorInformadoTexto.replace(",", "."))
        : null;
      const diferenca =
        temInformado && temSistema
          ? Number((valorSistema - valorInformado).toFixed(2))
          : null;
      const bateu = diferenca != null && Math.abs(diferenca) < 0.01;

      return {
        forma,
        valorSistema,
        temSistema,
        temInformado,
        diferenca,
        bateu,
      };
    });

    const diferencaTotal = linhas
      .filter((linha) => linha.temInformado && linha.temSistema)
      .reduce((soma, linha) => soma + linha.diferenca, 0);
    const algumInformado = linhas.some(
      (linha) => linha.temInformado && linha.temSistema
    );

    return { linhas, diferencaTotal, algumInformado };
  }, [resumo, valoresInformados]);

  const temDiferencaNoConfronto =
    confrontoCalculado.algumInformado &&
    Math.abs(confrontoCalculado.diferencaTotal) >= 0.01;

  return (
    <>
      <div className="conciliacao-abas">
        <button
          type="button"
          className={abaAtiva === "caixa" ? "aba-ativa" : ""}
          onClick={() => setAbaAtiva("caixa")}
        >
          Fechamento de Caixa
        </button>
        <button
          type="button"
          className={abaAtiva === "despesas" ? "aba-ativa" : ""}
          onClick={() => setAbaAtiva("despesas")}
        >
          Despesas (Extrato Bancário)
        </button>
      </div>

      {abaAtiva === "despesas" ? (
        <ConciliacaoDespesas />
      ) : (
    <section className="conciliacao-layout">
      {temDiferencaNoConfronto && (
        <div
          className="fp-alerta-cmv fp-alerta-cmv-critico"
          style={{ marginBottom: "16px" }}
        >
          <span className="fp-alerta-cmv-icone">🚨</span>

          <div>
            <strong>
              Diferença no confronto:{" "}
              {confrontoCalculado.diferencaTotal > 0
                ? `falta ${formatarMoeda(confrontoCalculado.diferencaTotal)}`
                : `sobra ${formatarMoeda(
                    Math.abs(confrontoCalculado.diferencaTotal)
                  )}`}
            </strong>
            <span>
              O que o sistema esperava não bateu com o que foi informado no
              fechamento. Confira a tabela de confronto abaixo antes de
              fechar o caixa.
            </span>
          </div>
        </div>
      )}

      <article className="panel">
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            marginBottom: "0.3rem",
          }}
        >
          <div>
            <span className="eyebrow">Conciliação de pagamentos</span>
            <h2 style={{ margin: 0 }}>PagSeguro em tempo real</h2>
          </div>

          {resumo && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: "1px",
                lineHeight: 1.4,
                fontSize: "14px",
              }}
            >
              <div>
                <span style={{ display: "inline-block", width: "20px" }}>
                  💰
                </span>{" "}
                Total recebido:{" "}
                <strong>{formatarMoeda(resumo.total_recebido)}</strong>
              </div>

              <div>
                <span style={{ display: "inline-block", width: "20px" }}>
                  🧾
                </span>{" "}
                Vendas: <strong>{resumo.quantidade_recebida} recebidas</strong>
                {resumo.quantidade_pendente_ou_cancelada > 0 &&
                  ` · ${resumo.quantidade_pendente_ou_cancelada} pend./canc.`}
              </div>

              {formasPagamento.map(([forma, valor]) => (
                <div key={forma}>
                  <span style={{ display: "inline-block", width: "20px" }}>
                    💳
                  </span>{" "}
                  <strong style={{ color: "#16ca50" }}>{forma}</strong>:{" "}
                  <strong>{formatarMoeda(valor)}</strong>
                </div>
              ))}
            </div>
          )}

          <div
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            {!lojaId ? (
              <small className="foto-ajuda">
                Selecione uma loja no seletor do topo da tela.
              </small>
            ) : (
              <>
                <strong style={{ fontSize: "13px" }}>
                  1. Escolha o fechamento
                </strong>

                {carregandoLista ? (
                  <small className="foto-ajuda">Carregando...</small>
                ) : fechamentosDisponiveis.length === 0 ? (
                  <small className="foto-ajuda">
                    Nenhum Fechamento de Caixa encontrado ainda pra essa
                    loja.
                  </small>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "8px",
                    }}
                  >
                    {fechamentosDisponiveis.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={
                          fechamentoEscolhido?.id === item.id
                            ? "primary-button"
                            : "secondary-button"
                        }
                        onClick={() => setFechamentoEscolhido(item)}
                      >
                        📅{" "}
                        {new Date(item.criado_em).toLocaleString("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </button>
                    ))}
                  </div>
                )}

                {fechamentoEscolhido && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "1rem",
                      flexWrap: "wrap",
                      marginTop: "4px",
                    }}
                  >
                    <strong style={{ fontSize: "13px" }}>
                      2. Gerar a conciliação
                    </strong>

                    <button
                      type="button"
                      className="approve-button"
                      style={{ fontSize: "15px", padding: "10px 18px" }}
                      onClick={conciliarAgora}
                      disabled={carregando || enviandoFoto}
                    >
                      {carregando || enviandoFoto
                        ? "Conciliando..."
                        : "✅ Conciliar agora"}
                    </button>

                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        verFotoSelecionada(fechamentoEscolhido.id)
                      }
                      disabled={carregandoPreview}
                    >
                      {carregandoPreview ? "Carregando..." : "👁️ Ver foto"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {resultadoFoto && (
          <div
            className="empty-state"
            style={{
              color: resultadoFoto.erro_leitura ? undefined : "#16ca50",
              marginBottom: "10px",
            }}
          >
            {resultadoFoto.erro_leitura ? (
              <>
                {resultadoFoto.erro_leitura}
                {resultadoFoto.debugRespostaIa != null && (
                  <div
                    style={{
                      marginTop: "8px",
                      fontSize: "12px",
                      color: "#9fb0c4",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    (debug — o que a IA respondeu:){" "}
                    {resultadoFoto.debugRespostaIa}
                  </div>
                )}
              </>
            ) : (
              <>
                ✅ Valores lidos e preenchidos na tabela abaixo.
                {resultadoFoto.formasNaoLidas?.length > 0 &&
                  ` Não consegui ler: ${resultadoFoto.formasNaoLidas.join(", ")} — preencha essa(s) manualmente.`}
              </>
            )}
          </div>
        )}

        {erro && <div className="empty-state">{erro}</div>}

        {resumo && (
          <>
            <div
              className="panel-header"
              style={{
                margin: "10px 0 10px",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div>
                <span className="eyebrow">Confronto</span>
                <h2>Sistema × Informado, por forma de pagamento</h2>
              </div>
            </div>

            {(() => {
              const { linhas, diferencaTotal, algumInformado } =
                confrontoCalculado;

              return (
                <>
                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>Forma de pagamento</th>
                          <th>Sistema</th>
                          <th>Informado</th>
                          <th>Diferença</th>
                        </tr>
                      </thead>
                      <tbody>
                        {linhas.map(
                          ({
                            forma,
                            valorSistema,
                            temSistema,
                            temInformado,
                            diferenca,
                            bateu,
                          }) => (
                            <tr key={forma}>
                              <td style={{ color: "#16ca50", fontWeight: 700 }}>
                                {forma}
                              </td>
                              <td>
                                {temSistema ? formatarMoeda(valorSistema) : "—"}
                              </td>
                              <td>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="0,00"
                                  value={valoresInformados[forma] ?? ""}
                                  onChange={(evento) =>
                                    setValoresInformados((anterior) => ({
                                      ...anterior,
                                      [forma]: evento.target.value,
                                    }))
                                  }
                                  style={{ maxWidth: "120px" }}
                                />
                              </td>
                              <td
                                style={{
                                  color:
                                    !temInformado || !temSistema
                                      ? undefined
                                      : bateu
                                      ? "#16ca50"
                                      : diferenca > 0
                                      ? "#ff4655"
                                      : "#16ca50",
                                  fontWeight: 700,
                                }}
                              >
                                {!temSistema
                                  ? "(sem comparação ainda)"
                                  : !temInformado
                                  ? "—"
                                  : bateu
                                  ? "✅ Bateu"
                                  : diferenca > 0
                                  ? `Falta ${formatarMoeda(diferenca)}`
                                  : `Sobra ${formatarMoeda(Math.abs(diferenca))}`}
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>

                  {algumInformado && (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        marginTop: "16px",
                      }}
                    >
                    <div
                      style={{
                        padding: "14px 18px",
                        border: "2px solid",
                        borderColor:
                          Math.abs(diferencaTotal) < 0.01
                            ? "#16ca50"
                            : diferencaTotal > 0
                            ? "#ff4655"
                            : "#16ca50",
                        borderRadius: "10px",
                        fontWeight: 700,
                        fontSize: "16px",
                        textAlign: "center",
                        color:
                          Math.abs(diferencaTotal) < 0.01
                            ? "#16ca50"
                            : diferencaTotal > 0
                            ? "#ff4655"
                            : "#16ca50",
                      }}
                    >
                      {Math.abs(diferencaTotal) < 0.01
                        ? "✅ Diferença final total: bateu certinho"
                        : diferencaTotal > 0
                        ? `Diferença final total: falta ${formatarMoeda(diferencaTotal)}`
                        : `Diferença final total: sobra ${formatarMoeda(Math.abs(diferencaTotal))}`}
                    </div>
                    </div>
                  )}
                </>
              );
            })()}
          </>
        )}

        <div className="panel-header" style={{ margin: "10px 0 10px" }}>
          <div>
            <span className="eyebrow">Últimas vendas</span>
            <h2>Caindo na PagSeguro, por forma de pagamento</h2>
          </div>
        </div>

        {!resumo || resumo.ultimas_vendas?.length === 0 ? (
          <div className="empty-state">
            {carregando
              ? "Buscando..."
              : "Nenhuma venda encontrada nesse período."}
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
                  <div style={{ marginBottom: "10px" }}>
                    <strong style={{ color: "#16ca50" }}>
                      {grupo.forma}
                    </strong>{" "}
                    <span>({grupo.vendas.length})</span>
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
                              </strong>{" "}
                              <small
                                style={{ color: "#9fb0c4", fontSize: "11px" }}
                              >
                                #{venda.codigo?.slice(-8)}
                              </small>
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

      {fotoPreview && (
        <div
          className="modal-overlay"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget) {
              setFotoPreview(null);
            }
          }}
        >
          <div className="modal modal-foto">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Fechamento de caixa</span>
                <h2>Foto enviada</h2>
              </div>

              <button
                type="button"
                className="close-button"
                onClick={() => setFotoPreview(null)}
              >
                ×
              </button>
            </div>

            <img
              src={fotoPreview}
              alt="Foto do fechamento de caixa"
              className="foto-modal-imagem"
            />
          </div>
        </div>
      )}
    </section>
      )}
    </>
  );
}

export default Conciliacao;
