import { useEffect, useRef, useState } from "react";
import {
  buscarVendasPagSeguro,
  conferirFechamentoFoto,
  buscarFechamentosCaixa,
  buscarFotoFechamentoCaixa,
} from "../services/api";

function comprimirImagem(arquivo, larguraMaxima = 1400, qualidade = 0.85) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();

    leitor.onload = () => {
      const imagem = new Image();

      imagem.onload = () => {
        const escala = Math.min(1, larguraMaxima / imagem.width);
        const largura = Math.round(imagem.width * escala);
        const altura = Math.round(imagem.height * escala);

        const canvas = document.createElement("canvas");
        canvas.width = largura;
        canvas.height = altura;

        const contexto = canvas.getContext("2d");
        contexto.drawImage(imagem, 0, 0, largura, altura);

        resolve(canvas.toDataURL("image/jpeg", qualidade));
      };

      imagem.onerror = () =>
        reject(new Error("Não foi possível ler a imagem selecionada."));

      imagem.src = leitor.result;
    };

    leitor.onerror = () =>
      reject(new Error("Não foi possível abrir o arquivo selecionado."));

    leitor.readAsDataURL(arquivo);
  });
}

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
  const [dataInicio, setDataInicio] = useState(hoje());
  const [dataFim, setDataFim] = useState(hoje());
  const [resumo, setResumo] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [atualizadoEm, setAtualizadoEm] = useState(null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [resultadoFoto, setResultadoFoto] = useState(null);
  const [valoresInformados, setValoresInformados] = useState({
    "Cartão de crédito": "",
    "Cartão de débito": "",
    PIX: "",
  });
  const [fechamentosSalvos, setFechamentosSalvos] = useState([]);
  const [carregandoFechamentos, setCarregandoFechamentos] = useState(false);
  const [fechamentoSelecionado, setFechamentoSelecionado] = useState("");

  useEffect(() => {
    async function carregarFechamentosSalvos() {
      setCarregandoFechamentos(true);

      try {
        const dados = await buscarFechamentosCaixa();

        setFechamentosSalvos(
          (Array.isArray(dados) ? dados : [])
            .filter((item) => item.tipo === "caixa")
            .sort(
              (a, b) => new Date(b.criado_em) - new Date(a.criado_em)
            )
            .slice(0, 15)
        );
      } catch {
        // silencioso — o botão de anexar continua funcionando normal
      } finally {
        setCarregandoFechamentos(false);
      }
    }

    carregarFechamentosSalvos();
  }, []);

  async function conferirFotoDataUrl(fotoDataUrl) {
    if (!fotoDataUrl || !resumo) return;

    setEnviandoFoto(true);
    setResultadoFoto(null);

    try {
      const resultado = await conferirFechamentoFoto(
        fotoDataUrl,
        resumo.total_recebido
      );
      setResultadoFoto(resultado);
    } catch (erroFoto) {
      setResultadoFoto({
        erro_leitura:
          erroFoto.message || "Não foi possível conferir a foto.",
      });
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function conferirFoto(arquivo) {
    if (!arquivo || !resumo) return;

    const fotoComprimida = await comprimirImagem(arquivo);
    await conferirFotoDataUrl(fotoComprimida);
  }

  async function conferirFechamentoSalvo(id) {
    if (!id || !resumo) return;

    setEnviandoFoto(true);
    setResultadoFoto(null);

    try {
      const resultado = await buscarFotoFechamentoCaixa(id);
      await conferirFotoDataUrl(resultado?.foto);
    } catch (erroFoto) {
      setResultadoFoto({
        erro_leitura:
          erroFoto.message || "Não foi possível buscar essa foto.",
      });
      setEnviandoFoto(false);
    }
  }

  // Acompanha qual era "hoje" da última vez que checamos — serve pra saber
  // se a pessoa está vendo o dia atual (e por isso a data final deve virar
  // sozinha à meia-noite) ou se escolheu um período antigo de propósito (e
  // nesse caso não deve mexer nas datas escolhidas por ela).
  const diaSeguidoRef = useRef(hoje());

  async function buscar() {
    // Enquanto a pessoa está digitando/trocando a data (o campo pode passar
    // por um instante vazio), simplesmente não busca nada — sem mostrar erro.
    if (!dataInicio || !dataFim) {
      return;
    }

    setCarregando(true);
    setErro("");

    try {
      const resultado = await buscarVendasPagSeguro(dataInicio, dataFim);
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
        const diaAnterior = diaSeguidoRef.current;
        const estavaSeguindoFinal = dataFim === diaAnterior;
        diaSeguidoRef.current = hojeAgora;

        if (estavaSeguindoFinal) {
          // Se a data inicial também era "hoje" (visualização de 1 dia só),
          // ela acompanha junto pra continuar mostrando um único dia.
          if (dataInicio === diaAnterior) {
            setDataInicio(hojeAgora);
          }

          setDataFim(hojeAgora);
          return; // o efeito reinicia sozinho por causa da dependência
        }
      }

      buscar();
    }, INTERVALO_ATUALIZACAO_MS);

    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataInicio, dataFim]);

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

          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <label style={{ margin: 0 }}>
              Data inicial
              <input
                type="date"
                value={dataInicio}
                onChange={(evento) => setDataInicio(evento.target.value)}
              />
            </label>

            <label style={{ margin: 0 }}>
              Data final
              <input
                type="date"
                value={dataFim}
                onChange={(evento) => setDataFim(evento.target.value)}
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
                    Última atualização:{" "}
                    {atualizadoEm.toLocaleTimeString("pt-BR")}.
                  </>
                )}
              </small>
            </div>

            <div>
              <input
                id="foto-fechamento-conciliacao"
                type="file"
                accept="image/*"
                disabled={enviandoFoto || !resumo}
                onChange={async (evento) => {
                  const arquivo = evento.target.files?.[0];
                  await conferirFoto(arquivo);
                  evento.target.value = "";
                }}
                style={{ display: "none" }}
              />

              <label
                htmlFor="foto-fechamento-conciliacao"
                className="secondary-button"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  cursor:
                    enviandoFoto || !resumo ? "not-allowed" : "pointer",
                  opacity: enviandoFoto || !resumo ? 0.6 : 1,
                }}
              >
                {enviandoFoto
                  ? "Lendo foto..."
                  : "📸 Conferir nova foto"}
              </label>
            </div>

            {fechamentosSalvos.length > 0 && (
              <label style={{ margin: 0 }}>
                Ou usar foto já enviada
                <select
                  value={fechamentoSelecionado}
                  disabled={enviandoFoto || !resumo}
                  onChange={(evento) => {
                    const id = evento.target.value;
                    setFechamentoSelecionado(id);

                    if (id) {
                      conferirFechamentoSalvo(id);
                    }
                  }}
                >
                  <option value="">
                    {carregandoFechamentos
                      ? "Carregando..."
                      : "Selecione..."}
                  </option>
                  {fechamentosSalvos.map((item) => (
                    <option key={item.id} value={item.id}>
                      {new Date(item.criado_em).toLocaleString("pt-BR")}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>

        {resultadoFoto && (
          <div
            className="empty-state"
            style={{
              color: resultadoFoto.erro_leitura
                ? undefined
                : resultadoFoto.bateu
                ? "#16ca50"
                : "#ff4655",
              marginBottom: "10px",
            }}
          >
            {resultadoFoto.erro_leitura ? (
              resultadoFoto.erro_leitura
            ) : resultadoFoto.bateu ? (
              <>
                ✅ Bateu! Comprovante:{" "}
                {formatarMoeda(resultadoFoto.valor_lido)} · Sistema:{" "}
                {formatarMoeda(resultadoFoto.valor_esperado)}
              </>
            ) : (
              <>
                ⚠️ Não bateu — diferença de{" "}
                {formatarMoeda(Math.abs(resultadoFoto.diferenca))}.
                Comprovante: {formatarMoeda(resultadoFoto.valor_lido)} ·
                Sistema: {formatarMoeda(resultadoFoto.valor_esperado)}
              </>
            )}
          </div>
        )}

        {erro && <div className="empty-state">{erro}</div>}

        {resumo && (
          <>
            <div className="panel-header" style={{ margin: "10px 0 10px" }}>
              <div>
                <span className="eyebrow">Confronto</span>
                <h2>Sistema × Informado, por forma de pagamento</h2>
              </div>
            </div>

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
                  {["Cartão de crédito", "Cartão de débito", "PIX"].map(
                    (forma) => {
                      const valorSistema =
                        resumo.totais_por_forma_pagamento?.[forma] || 0;
                      const valorInformadoTexto =
                        valoresInformados[forma] ?? "";
                      const temInformado = valorInformadoTexto !== "";
                      const valorInformado = temInformado
                        ? Number(
                            valorInformadoTexto.replace(",", ".")
                          )
                        : null;
                      const diferenca = temInformado
                        ? Number(
                            (valorSistema - valorInformado).toFixed(2)
                          )
                        : null;
                      const bateu = temInformado && Math.abs(diferenca) < 0.01;

                      return (
                        <tr key={forma}>
                          <td style={{ color: "#16ca50", fontWeight: 700 }}>
                            {forma}
                          </td>
                          <td>{formatarMoeda(valorSistema)}</td>
                          <td>
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="0,00"
                              value={valorInformadoTexto}
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
                              color: !temInformado
                                ? undefined
                                : bateu
                                ? "#16ca50"
                                : "#ff4655",
                              fontWeight: 700,
                            }}
                          >
                            {temInformado
                              ? bateu
                                ? "✅ Bateu"
                                : formatarMoeda(diferenca)
                              : "—"}
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>
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
