import { useState } from "react";

function formatarData(data) {
  if (!data) return "Sem data";
  return new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR");
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function diasAte(data) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const alvo = new Date(`${data}T00:00:00`);

  return Math.round((alvo - hoje) / (1000 * 60 * 60 * 24));
}

function situacaoConta(conta) {
  if (conta.status === "pago") {
    return { rotulo: "Pago", classe: "status-saudavel" };
  }

  const dias = diasAte(conta.data_vencimento);

  if (dias < 0) {
    return { rotulo: "Atrasado", classe: "status-critico" };
  }

  if (dias === 0) {
    return { rotulo: "Vence hoje", classe: "status-critico" };
  }

  if (dias <= 2) {
    return { rotulo: `Vence em ${dias} dia(s)`, classe: "status-atencao" };
  }

  return { rotulo: "Pendente", classe: "status-saudavel" };
}

function ContasPagar({
  contas = [],
  carregando = false,
  adicionarConta,
  editarConta,
  marcarComoPaga,
  removerConta,
  lojas = [],
  vePermissaoTotal = true,
  lojaPadrao = null,
}) {
  const [descricao, setDescricao] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [valor, setValor] = useState("");
  const [dataVencimento, setDataVencimento] = useState("");
  const [observacao, setObservacao] = useState("");
  const [lojaId, setLojaId] = useState(lojaPadrao ? String(lojaPadrao) : "");
  const [editandoId, setEditandoId] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [mostrarPagas, setMostrarPagas] = useState(false);

  function limparFormulario() {
    setDescricao("");
    setFornecedor("");
    setValor("");
    setDataVencimento("");
    setObservacao("");
    setLojaId(lojaPadrao ? String(lojaPadrao) : "");
    setEditandoId(null);
  }

  async function salvar(evento) {
    evento.preventDefault();

    if (!descricao.trim() || !dataVencimento) {
      alert("Informe a descrição e a data de vencimento.");
      return;
    }

    if (!lojaId) {
      alert(
        "Selecione uma loja no seletor do topo da tela antes de cadastrar."
      );
      return;
    }

    setSalvando(true);

    try {
      const dados = {
        descricao: descricao.trim(),
        fornecedor,
        valor,
        data_vencimento: dataVencimento,
        observacao,
        loja_id: lojaId,
      };

      if (editandoId) {
        await editarConta(editandoId, dados);
      } else {
        await adicionarConta(dados);
      }

      limparFormulario();
    } catch (erro) {
      alert(erro.message || "Não foi possível salvar a conta.");
    } finally {
      setSalvando(false);
    }
  }

  function iniciarEdicao(conta) {
    setEditandoId(conta.id);
    setDescricao(conta.descricao);
    setFornecedor(conta.fornecedor || "");
    setValor(conta.valor);
    setDataVencimento(conta.data_vencimento);
    setObservacao(conta.observacao || "");
    setLojaId(conta.loja_id ? String(conta.loja_id) : "");
  }

  async function confirmarPagamento(conta) {
    const confirmar = window.confirm(
      `Marcar "${conta.descricao}" como paga?`
    );

    if (!confirmar) return;

    try {
      await marcarComoPaga(conta.id);
    } catch (erro) {
      alert(erro.message || "Não foi possível marcar como paga.");
    }
  }

  async function confirmarExclusao(conta) {
    const confirmar = window.confirm(
      `Excluir a conta "${conta.descricao}"?`
    );

    if (!confirmar) return;

    try {
      await removerConta(conta.id);

      if (editandoId === conta.id) {
        limparFormulario();
      }
    } catch (erro) {
      alert(erro.message || "Não foi possível excluir a conta.");
    }
  }

  const contasVisiveis = contas
    .filter((conta) => mostrarPagas || conta.status !== "pago")
    .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));

  return (
    <section className="categorias-layout">
      <article className="panel categoria-form-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">
              {editandoId ? "Editar cadastro" : "Novo cadastro"}
            </span>

            <h2>{editandoId ? "Editar conta" : "Nova conta a pagar"}</h2>
          </div>
        </div>

        <form onSubmit={salvar}>
          <label>
            Descrição
            <input
              type="text"
              value={descricao}
              onChange={(evento) => setDescricao(evento.target.value)}
              placeholder="Ex.: Aluguel, energia, fornecedor..."
            />
          </label>

          <label>
            Fornecedor (opcional)
            <input
              type="text"
              value={fornecedor}
              onChange={(evento) => setFornecedor(evento.target.value)}
              placeholder="Ex.: Frigorífico X"
            />
          </label>

          <div className="form-row">
            <label>
              Valor
              <input
                type="number"
                step="0.01"
                min="0"
                value={valor}
                onChange={(evento) => setValor(evento.target.value)}
                placeholder="0,00"
              />
            </label>

            <label>
              Data de vencimento
              <input
                type="date"
                value={dataVencimento}
                onChange={(evento) =>
                  setDataVencimento(evento.target.value)
                }
              />
            </label>
          </div>

          <label>
            Observação
            <textarea
              value={observacao}
              onChange={(evento) => setObservacao(evento.target.value)}
              placeholder="Informações adicionais"
              rows="3"
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
                Cancelar edição
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
                : "Cadastrar conta"}
            </button>
          </div>
        </form>
      </article>

      <article className="panel categoria-lista-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Contas a Pagar</span>
            <h2>Vencimentos</h2>
          </div>

          <strong>{contasVisiveis.length}</strong>
        </div>

        <label className="permissao-item">
          <input
            type="checkbox"
            checked={mostrarPagas}
            onChange={(evento) => setMostrarPagas(evento.target.checked)}
          />
          Mostrar contas já pagas
        </label>

        {carregando ? (
          <div className="empty-state">Carregando...</div>
        ) : contasVisiveis.length === 0 ? (
          <div className="empty-state">Nenhuma conta a pagar.</div>
        ) : (
          <div className="categorias-lista">
            {contasVisiveis.map((conta) => {
              const situacao = situacaoConta(conta);

              return (
                <div className="categoria-item" key={conta.id}>
                  <div className="categoria-identificacao">
                    <div className="categoria-icone">💸</div>

                    <div>
                      <strong>{conta.descricao}</strong>
                      <div>
                        {conta.fornecedor ? `${conta.fornecedor} — ` : ""}
                        {formatarMoeda(conta.valor)} — vence em{" "}
                        {formatarData(conta.data_vencimento)}
                      </div>
                      {vePermissaoTotal && (
                        <span>
                          🏬{" "}
                          {lojas.find(
                            (loja) => String(loja.id) === String(conta.loja_id)
                          )?.nome || "Sem loja"}
                        </span>
                      )}
                      <span className={situacao.classe}>
                        {situacao.rotulo}
                      </span>
                    </div>
                  </div>

                  <div className="transaction-actions">
                    {conta.status !== "pago" && (
                      <button
                        type="button"
                        className="approve-button"
                        onClick={() => confirmarPagamento(conta)}
                      >
                        ✅ Pagar
                      </button>
                    )}

                    <button
                      type="button"
                      className="edit-button"
                      onClick={() => iniciarEdicao(conta)}
                    >
                      Editar
                    </button>

                    <button
                      type="button"
                      className="delete-button"
                      onClick={() => confirmarExclusao(conta)}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </article>
    </section>
  );
}

export default ContasPagar;
export { situacaoConta, diasAte };
