import { useState } from "react";

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
}) {
  const [nome, setNome] = useState("");
  const [operadora, setOperadora] = useState("");
  const [prazoDias, setPrazoDias] = useState("0");
  const [taxaPercentual, setTaxaPercentual] = useState("0");
  const [diaSemanaPagamento, setDiaSemanaPagamento] = useState("");
  const [editandoId, setEditandoId] = useState(null);
  const [salvando, setSalvando] = useState(false);

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

  const previstos = lancamentos.filter(
    (item) =>
      item.tipo === "receita" &&
      item.data_prevista_recebimento &&
      item.status_conciliacao !== "conciliado"
  );

  const blocosPorData = previstos.reduce((acumulado, item) => {
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

          <strong>{previstos.length}</strong>
        </div>

        {datasOrdenadas.length === 0 ? (
          <div className="empty-state">
            Nenhuma previsão de recebimento. Escolha uma forma de pagamento
            ao lançar uma receita pra aparecer aqui.
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
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </article>
    </section>
  );
}

export default ContasReceber;
