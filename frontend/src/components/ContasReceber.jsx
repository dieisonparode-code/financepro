import { useMemo, useState } from "react";
import CampoValor, { paraNumero } from "./CampoValor";

function hojeLocal() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

function formatarData(data) {
  if (!data) return "Sem data";
  return new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR");
}

const DIAS_SEMANA = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function ContasReceber({
  lancamentos = [],
  formasPagamento = [],
  carregandoFormas = false,
  adicionarFormaPagamento,
  editarFormaPagamento,
  removerFormaPagamento,
  buscarFoto,
}) {
  const [nome, setNome] = useState("");
  const [operadora, setOperadora] = useState("");
  const [prazoDias, setPrazoDias] = useState("0");
  const [taxaPercentual, setTaxaPercentual] = useState("0");
  const [diaSemanaPagamento, setDiaSemanaPagamento] = useState("");
  const [editandoId, setEditandoId] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [mostrarCalculadora, setMostrarCalculadora] = useState(false);
  const [calcBruto, setCalcBruto] = useState("");
  const [calcRecebido, setCalcRecebido] = useState("");
  const [fotoVisualizada, setFotoVisualizada] = useState(null);
  const [carregandoFotoId, setCarregandoFotoId] = useState(null);
  // Pedido do usuário (23/08/2026): busca por funcionário/fornecedor pra
  // achar só a previsão de uma pessoa específica, sem precisar rolar a
  // lista inteira por data.
  const [buscaReceber, setBuscaReceber] = useState("");

  async function verFoto(item) {
    if (!buscarFoto) return;

    setCarregandoFotoId(item.id);

    try {
      const resultado = await buscarFoto(item.id);
      setFotoVisualizada(resultado?.foto || "");
    } catch (erro) {
      alert(erro.message || "Não foi possível carregar a foto.");
    } finally {
      setCarregandoFotoId(null);
    }
  }

  function limparFormulario() {
    setNome("");
    setOperadora("");
    setPrazoDias("0");
    setTaxaPercentual("0");
    setDiaSemanaPagamento("");
    setEditandoId(null);
  }

  async function salvar(evento) {
    evento.preventDefault();

    if (!nome.trim()) {
      alert("Informe o nome da forma de pagamento.");
      return;
    }

    setSalvando(true);

    try {
      const dados = {
        nome: nome.trim(),
        operadora,
        prazo_dias: prazoDias,
        taxa_percentual: taxaPercentual,
        dia_semana_pagamento: diaSemanaPagamento,
      };

      if (editandoId) {
        await editarFormaPagamento(editandoId, dados);
      } else {
        await adicionarFormaPagamento(dados);
      }

      limparFormulario();
    } catch (erro) {
      alert(erro.message || "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  // Bug real corrigido (21/08/2026): "35.000" (sem vírgula) virava 35 —
  // usa o paraNumero() do CampoValor, que sempre tira o ponto de milhar
  // primeiro, tenha vírgula ou não.
  function paraNumeroBr(texto) {
    return paraNumero(texto);
  }

  const taxaCalculada = useMemo(() => {
    const bruto = paraNumeroBr(calcBruto);
    const recebido = paraNumeroBr(calcRecebido);

    if (!bruto || bruto <= 0 || !recebido || recebido < 0) {
      return null;
    }

    return ((1 - recebido / bruto) * 100).toFixed(4);
  }, [calcBruto, calcRecebido]);

  function usarTaxaCalculada() {
    if (taxaCalculada == null) return;
    setTaxaPercentual(taxaCalculada);
    setMostrarCalculadora(false);
    setCalcBruto("");
    setCalcRecebido("");
  }

  function iniciarEdicao(forma) {
    setEditandoId(forma.id);
    setNome(forma.nome);
    setOperadora(forma.operadora || "");
    setPrazoDias(String(forma.prazo_dias ?? 0));
    setTaxaPercentual(String(forma.taxa_percentual ?? 0));
    setDiaSemanaPagamento(
      forma.dia_semana_pagamento != null
        ? String(forma.dia_semana_pagamento)
        : ""
    );
  }

  async function confirmarExclusao(forma) {
    const confirmar = window.confirm(
      `Excluir a forma de pagamento "${forma.nome}"?`
    );

    if (!confirmar) return;

    try {
      await removerFormaPagamento(forma.id);

      if (editandoId === forma.id) {
        limparFormulario();
      }
    } catch (erro) {
      alert(erro.message || "Não foi possível excluir.");
    }
  }

  // Só mostra o que AINDA não caiu (data prevista no futuro) — sem isso,
  // um teste antigo (PIX/Débito de dias passados) continuava aparecendo
  // aqui pra sempre, mesmo já tendo caído de verdade há dias.
  const hoje = hojeLocal();

  const previstos = lancamentos.filter(
    (item) =>
      item.tipo === "receita" &&
      item.data_prevista_recebimento &&
      item.data_prevista_recebimento > hoje &&
      item.status_conciliacao !== "conciliado"
  );

  const buscaReceberLimpa = buscaReceber.trim().toLowerCase();

  const previstosFiltrados = buscaReceberLimpa
    ? previstos.filter((item) =>
        `${item.descricao || ""} ${nomeFormaPagamento(item.forma_pagamento_id)}`
          .toLowerCase()
          .includes(buscaReceberLimpa)
      )
    : previstos;

  const blocosPorData = previstosFiltrados.reduce((acumulado, item) => {
    const chave = item.data_prevista_recebimento;

    if (!acumulado[chave]) {
      acumulado[chave] = [];
    }

    acumulado[chave].push(item);

    return acumulado;
  }, {});

  const datasOrdenadas = Object.keys(blocosPorData).sort();

  function nomeFormaPagamento(id) {
    return formasPagamento.find((item) => item.id === id)?.nome || "—";
  }

  return (
    <section className="categorias-layout">
      <article className="panel categoria-form-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">
              {editandoId ? "Editar" : "Nova"}
            </span>

            <h2>Forma de Pagamento</h2>
          </div>
        </div>

        <form onSubmit={salvar}>
          <label>
            Nome
            <input
              type="text"
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
              placeholder="Ex.: PIX, Débito, Crédito à vista"
            />
          </label>

          <label>
            Operadora (opcional)
            <input
              type="text"
              value={operadora}
              onChange={(evento) => setOperadora(evento.target.value)}
              placeholder="Ex.: Stone, Cielo"
            />
          </label>

          <div className="form-row">
            <label>
              Prazo (dias até cair)
              <input
                type="number"
                min="0"
                value={prazoDias}
                onChange={(evento) => setPrazoDias(evento.target.value)}
                disabled={diaSemanaPagamento !== ""}
              />
            </label>

            <label>
              Taxa (%)
              <input
                type="number"
                step="0.01"
                min="0"
                value={taxaPercentual}
                onChange={(evento) =>
                  setTaxaPercentual(evento.target.value)
                }
              />
            </label>
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={() => setMostrarCalculadora((anterior) => !anterior)}
            style={{ marginBottom: 12 }}
          >
            🧮 {mostrarCalculadora ? "Fechar calculadora" : "Não sei a taxa exata — calcular"}
          </button>

          {mostrarCalculadora && (
            <div className="panel" style={{ marginBottom: 16, padding: 14 }}>
              <p style={{ marginTop: 0, fontSize: 13, opacity: 0.8 }}>
                Digite o valor bruto (o que a Saipos/sistema mostrou como
                vendido) e o valor real que caiu na conta (o que o extrato ou
                o portal da plataforma mostrou) — calculo a taxa exata pra
                você.
              </p>

              <div className="form-row">
                <label>
                  Valor bruto (vendido)
                  <CampoValor
                    placeholder="Ex.: 8335,72"
                    value={calcBruto}
                    onChange={setCalcBruto}
                  />
                </label>

                <label>
                  Valor real recebido
                  <CampoValor
                    placeholder="Ex.: 7268,94"
                    value={calcRecebido}
                    onChange={setCalcRecebido}
                  />
                </label>
              </div>

              {taxaCalculada != null ? (
                <>
                  <p style={{ fontSize: 15 }}>
                    Taxa calculada: <strong>{taxaCalculada}%</strong>
                  </p>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={usarTaxaCalculada}
                  >
                    Usar essa taxa
                  </button>
                </>
              ) : (
                <p style={{ fontSize: 13, opacity: 0.7 }}>
                  Preencha os dois valores pra calcular.
                </p>
              )}
            </div>
          )}

          <label>
            Paga sempre num dia fixo da semana? (opcional)
            <select
              value={diaSemanaPagamento}
              onChange={(evento) =>
                setDiaSemanaPagamento(evento.target.value)
              }
            >
              <option value="">Não — usa o prazo em dias acima</option>
              <option value="0">Sim, todo domingo</option>
              <option value="1">Sim, toda segunda-feira</option>
              <option value="2">Sim, toda terça-feira</option>
              <option value="3">Sim, toda quarta-feira</option>
              <option value="4">Sim, toda quinta-feira</option>
              <option value="5">Sim, toda sexta-feira</option>
              <option value="6">Sim, todo sábado</option>
            </select>
          </label>

          <div className="modal-actions">
            {editandoId && (
              <button
                type="button"
                className="secondary-button"
                onClick={limparFormulario}
                disabled={salvando}
              >
                Cancelar
              </button>
            )}

            <button
              type="submit"
              className="primary-button"
              disabled={salvando}
            >
              {salvando ? "Salvando..." : editandoId ? "Salvar" : "Adicionar"}
            </button>
          </div>
        </form>

        <hr />

        {carregandoFormas ? (
          <div className="empty-state">Carregando...</div>
        ) : formasPagamento.length === 0 ? (
          <div className="empty-state">
            Nenhuma forma de pagamento cadastrada.
          </div>
        ) : (
          <div className="categorias-lista">
            {formasPagamento.map((forma) => (
              <div className="categoria-item" key={forma.id}>
                <div className="categoria-identificacao">
                  <div className="categoria-icone">💳</div>

                  <div>
                    <strong>{forma.nome}</strong>
                    <div>
                      {forma.dia_semana_pagamento != null
                        ? `Toda ${DIAS_SEMANA[forma.dia_semana_pagamento]}`
                        : `D+${forma.prazo_dias}`}{" "}
                      — {forma.taxa_percentual}% de taxa
                    </div>
                  </div>
                </div>

                <div className="transaction-actions">
                  <button
                    type="button"
                    className="edit-button"
                    onClick={() => iniciarEdicao(forma)}
                  >
                    Editar
                  </button>

                  <button
                    type="button"
                    className="delete-button"
                    onClick={() => confirmarExclusao(forma)}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </article>

      <article className="panel categoria-lista-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Previsão</span>
            <h2>Contas a Receber</h2>
          </div>

          <strong>{previstosFiltrados.length}</strong>
        </div>

        <div style={{ margin: "0 0 12px" }}>
          <input
            type="text"
            value={buscaReceber}
            onChange={(evento) => setBuscaReceber(evento.target.value)}
            placeholder="🔍 Buscar por funcionário, fornecedor ou forma de pagamento"
          />
        </div>

        {previstos.length === 0 ? (
          <div className="empty-state">
            Nenhuma previsão de recebimento. Escolha uma forma de pagamento
            ao lançar uma receita pra aparecer aqui.
          </div>
        ) : datasOrdenadas.length === 0 ? (
          <div className="empty-state">
            Nenhum resultado pra "{buscaReceber.trim()}".
          </div>
        ) : (
          datasOrdenadas.map((data) => {
            const itens = blocosPorData[data];
            const total = itens.reduce(
              (soma, item) =>
                soma + Number(item.valor_liquido_esperado ?? item.valor),
              0
            );

            return (
              <div className="panel" key={data} style={{ marginBottom: 14 }}>
                <div className="panel-header">
                  <div>
                    <span className="eyebrow">{formatarData(data)}</span>
                    <h2>{formatarMoeda(total)}</h2>
                  </div>
                </div>

                <div className="categorias-lista">
                  {itens.map((item) => (
                    <div className="categoria-item" key={item.id}>
                      <div className="categoria-identificacao">
                        <div className="categoria-icone">💰</div>

                        <div>
                          <strong>{item.descricao}</strong>
                          <div>
                            {nomeFormaPagamento(item.forma_pagamento_id)} —{" "}
                            {formatarMoeda(
                              item.valor_liquido_esperado ?? item.valor
                            )}
                          </div>
                        </div>
                      </div>

                      {item.tem_foto && (
                        <div className="transaction-actions">
                          <button
                            type="button"
                            className="edit-button"
                            disabled={carregandoFotoId === item.id}
                            onClick={() => verFoto(item)}
                          >
                            {carregandoFotoId === item.id
                              ? "Carregando..."
                              : "Ver foto"}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </article>

      {fotoVisualizada && (
        <div
          className="modal-overlay"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget) {
              setFotoVisualizada(null);
            }
          }}
        >
          <div className="modal modal-foto">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Contas a Receber</span>
                <h2>Foto anexada</h2>
              </div>

              <button
                type="button"
                className="close-button"
                onClick={() => setFotoVisualizada(null)}
              >
                ×
              </button>
            </div>

            <img
              src={fotoVisualizada}
              alt="Foto anexada"
              className="foto-modal-imagem"
            />
          </div>
        </div>
      )}
    </section>
  );
}

export default ContasReceber;
