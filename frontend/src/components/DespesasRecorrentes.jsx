import { useState } from "react";

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function DespesasRecorrentes({
  recorrentes = [],
  carregando = false,
  lojas = [],
  lojaPadrao = null,
  adicionar,
  editar,
  remover,
}) {
  const [descricao, setDescricao] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [valor, setValor] = useState("");
  const [diaVencimento, setDiaVencimento] = useState("");
  const [lojaId, setLojaId] = useState(lojaPadrao ? String(lojaPadrao) : "");
  const [observacao, setObservacao] = useState("");
  const [editandoId, setEditandoId] = useState(null);
  const [salvando, setSalvando] = useState(false);

  function limparFormulario() {
    setDescricao("");
    setFornecedor("");
    setValor("");
    setDiaVencimento("");
    setLojaId(lojaPadrao ? String(lojaPadrao) : "");
    setObservacao("");
    setEditandoId(null);
  }

  function iniciarEdicao(recorrente) {
    setEditandoId(recorrente.id);
    setDescricao(recorrente.descricao || "");
    setFornecedor(recorrente.fornecedor || "");
    setValor(String(recorrente.valor ?? ""));
    setDiaVencimento(String(recorrente.dia_vencimento ?? ""));
    setLojaId(recorrente.loja_id ? String(recorrente.loja_id) : "");
    setObservacao(recorrente.observacao || "");
  }

  async function salvar(evento) {
    evento.preventDefault();

    if (!descricao.trim() || !valor || !diaVencimento) {
      alert("Preencha descrição, valor e dia do vencimento.");
      return;
    }

    setSalvando(true);

    const dados = {
      descricao: descricao.trim(),
      fornecedor: fornecedor.trim(),
      valor: Number(valor.replace(",", ".")),
      dia_vencimento: Number(diaVencimento),
      loja_id: lojaId || null,
      observacao: observacao.trim(),
    };

    try {
      if (editandoId) {
        await editar(editandoId, dados);
      } else {
        await adicionar(dados);
      }

      limparFormulario();
    } catch (erro) {
      alert(erro.message || "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(recorrente) {
    try {
      await editar(recorrente.id, {
        descricao: recorrente.descricao,
        fornecedor: recorrente.fornecedor,
        valor: recorrente.valor,
        dia_vencimento: recorrente.dia_vencimento,
        loja_id: recorrente.loja_id,
        observacao: recorrente.observacao,
        ativo: !recorrente.ativo,
      });
    } catch (erro) {
      alert(erro.message || "Não foi possível atualizar.");
    }
  }

  async function confirmarExclusao(recorrente) {
    const confirmar = window.confirm(
      `Excluir a despesa recorrente "${recorrente.descricao}"? Isso não apaga as contas a pagar já geradas, só para de gerar novas.`
    );

    if (!confirmar) return;

    try {
      await remover(recorrente.id);
    } catch (erro) {
      alert(erro.message || "Não foi possível excluir.");
    }
  }

  return (
    <section className="categorias-layout">
      <article className="panel categoria-form-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Despesas Recorrentes</span>
            <h2>{editandoId ? "Editar" : "Nova despesa recorrente"}</h2>
          </div>
        </div>

        <small className="foto-ajuda">
          Cadastre aqui contas que se repetem todo mês (aluguel, internet,
          contador...) — o sistema gera a Conta a Pagar sozinho todo mês,
          sem precisar lançar na mão de novo.
        </small>

        <form onSubmit={salvar}>
          <label>
            Descrição
            <input
              type="text"
              value={descricao}
              onChange={(evento) => setDescricao(evento.target.value)}
              placeholder="Ex: Aluguel, Internet, Contador..."
              required
            />
          </label>

          <label>
            Fornecedor
            <input
              type="text"
              value={fornecedor}
              onChange={(evento) => setFornecedor(evento.target.value)}
            />
          </label>

          <div className="form-row">
            <label>
              Valor
              <input
                type="text"
                inputMode="decimal"
                value={valor}
                onChange={(evento) => setValor(evento.target.value)}
                placeholder="0,00"
                required
              />
            </label>

            <label>
              Dia do vencimento
              <input
                type="number"
                min="1"
                max="31"
                value={diaVencimento}
                onChange={(evento) => setDiaVencimento(evento.target.value)}
                placeholder="Ex: 10"
                required
              />
            </label>
          </div>

          {lojas.length > 0 && (
            <label>
              Loja
              <select
                value={lojaId}
                onChange={(evento) => setLojaId(evento.target.value)}
              >
                <option value="">Sem loja específica</option>
                {lojas.map((loja) => (
                  <option key={loja.id} value={loja.id}>
                    {loja.nome}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            Observação
            <textarea
              value={observacao}
              onChange={(evento) => setObservacao(evento.target.value)}
              rows={2}
            />
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
              {salvando
                ? "Salvando..."
                : editandoId
                ? "Salvar alterações"
                : "Cadastrar"}
            </button>
          </div>
        </form>
      </article>

      <article className="panel categoria-lista-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Despesas Recorrentes</span>
            <h2>Cadastradas</h2>
          </div>

          <strong>{recorrentes.length}</strong>
        </div>

        {carregando ? (
          <div className="empty-state">Carregando...</div>
        ) : recorrentes.length === 0 ? (
          <div className="empty-state">
            Nenhuma despesa recorrente cadastrada ainda.
          </div>
        ) : (
          <div className="categorias-lista">
            {recorrentes.map((recorrente) => (
              <div className="categoria-item" key={recorrente.id}>
                <div className="categoria-identificacao">
                  <div className="categoria-icone">
                    {recorrente.ativo ? "🔁" : "⏸️"}
                  </div>
                  <div>
                    <strong>{recorrente.descricao}</strong>{" "}
                    {!recorrente.ativo && (
                      <small style={{ color: "#9fb0c4" }}>(pausada)</small>
                    )}
                    <div>
                      {formatarMoeda(recorrente.valor)} · todo dia{" "}
                      {recorrente.dia_vencimento}
                      {recorrente.fornecedor && ` · ${recorrente.fornecedor}`}
                    </div>
                    {recorrente.loja_id && lojas.length > 0 && (
                      <small style={{ color: "#9fb0c4" }}>
                        {
                          lojas.find(
                            (loja) =>
                              String(loja.id) === String(recorrente.loja_id)
                          )?.nome
                        }
                      </small>
                    )}
                  </div>
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => alternarAtivo(recorrente)}
                  >
                    {recorrente.ativo ? "⏸️ Pausar" : "▶️ Reativar"}
                  </button>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => iniciarEdicao(recorrente)}
                  >
                    Editar
                  </button>

                  <button
                    type="button"
                    className="delete-button"
                    onClick={() => confirmarExclusao(recorrente)}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

export default DespesasRecorrentes;
