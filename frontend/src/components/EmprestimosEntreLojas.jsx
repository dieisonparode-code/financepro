import { useState } from "react";
import CampoValor, { paraNumero } from "./CampoValor";

// Pedido do usuário (21/08/2026): Empréstimo entre lojas — ex: loja A
// paga uma conta da loja B porque B estava sem saldo. A loja credora
// desconta do Saldo dela; a devedora aumenta o Saldo (recebeu ajuda) e
// fica com dívida em aberto, abatida conforme paga de volta.
function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarData(data) {
  if (!data) return "Sem data";
  return new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR");
}

function hojeLocal() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function EmprestimosEntreLojas({
  emprestimos = [],
  carregando = false,
  lojas = [],
  adicionar,
  registrarPagamento,
  remover,
}) {
  const [lojaCredoraId, setLojaCredoraId] = useState("");
  const [lojaDevedoraId, setLojaDevedoraId] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hojeLocal());
  const [descricao, setDescricao] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [pagandoId, setPagandoId] = useState(null);
  const [valorPagamento, setValorPagamento] = useState("");
  const [dataPagamento, setDataPagamento] = useState(hojeLocal());

  function limparFormulario() {
    setLojaCredoraId("");
    setLojaDevedoraId("");
    setValor("");
    setData(hojeLocal());
    setDescricao("");
  }

  function nomeLoja(id) {
    return lojas.find((loja) => String(loja.id) === String(id))?.nome || "Loja";
  }

  async function salvar(evento) {
    evento.preventDefault();

    if (!lojaCredoraId || !lojaDevedoraId) {
      alert("Escolha as duas lojas.");
      return;
    }

    if (lojaCredoraId === lojaDevedoraId) {
      alert("A loja que emprestou e a que pegou emprestado não podem ser a mesma.");
      return;
    }

    if (!valor || paraNumero(valor) <= 0) {
      alert("Informe um valor válido.");
      return;
    }

    setSalvando(true);

    try {
      await adicionar({
        loja_credora_id: lojaCredoraId,
        loja_devedora_id: lojaDevedoraId,
        valor: paraNumero(valor),
        data,
        descricao: descricao.trim(),
      });

      limparFormulario();
    } catch (erro) {
      alert(erro.message || "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  function iniciarPagamento(emprestimo) {
    setPagandoId(emprestimo.id);
    setValorPagamento("");
    setDataPagamento(hojeLocal());
  }

  async function confirmarPagamento(emprestimo) {
    const valorNumero = paraNumero(valorPagamento);

    if (!valorNumero || valorNumero <= 0) {
      alert("Informe um valor válido.");
      return;
    }

    try {
      await registrarPagamento(emprestimo.id, {
        valor: valorNumero,
        data: dataPagamento,
      });
      setPagandoId(null);
    } catch (erro) {
      alert(erro.message || "Não foi possível registrar o pagamento.");
    }
  }

  async function confirmarExclusao(emprestimo) {
    const confirmar = window.confirm(
      `Excluir esse empréstimo (${nomeLoja(emprestimo.loja_credora_id)} → ${nomeLoja(emprestimo.loja_devedora_id)}, ${formatarMoeda(emprestimo.valor)})? Isso desfaz o ajuste no Saldo das duas lojas.`
    );

    if (!confirmar) return;

    try {
      await remover(emprestimo.id);
    } catch (erro) {
      alert(erro.message || "Não foi possível excluir.");
    }
  }

  return (
    <section className="categorias-layout">
      <article className="panel categoria-form-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Empréstimo entre Lojas</span>
            <h2>Novo empréstimo</h2>
          </div>
        </div>

        <small className="foto-ajuda">
          Use quando uma loja paga uma conta de outra porque ela estava
          sem saldo. A loja que emprestou desconta do Saldo dela na hora;
          a que pegou emprestado aumenta o Saldo dela e fica com uma
          dívida em aberto, que vai sendo abatida conforme for pagando de
          volta.
        </small>

        <form onSubmit={salvar}>
          <div className="form-row">
            <label>
              Loja que emprestou (credora)
              <select
                value={lojaCredoraId}
                onChange={(evento) => setLojaCredoraId(evento.target.value)}
                required
              >
                <option value="">Escolha...</option>
                {lojas.map((loja) => (
                  <option key={loja.id} value={loja.id}>
                    {loja.nome}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Loja que pegou emprestado (devedora)
              <select
                value={lojaDevedoraId}
                onChange={(evento) => setLojaDevedoraId(evento.target.value)}
                required
              >
                <option value="">Escolha...</option>
                {lojas.map((loja) => (
                  <option key={loja.id} value={loja.id}>
                    {loja.nome}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="form-row">
            <label>
              Valor
              <CampoValor value={valor} onChange={setValor} required />
            </label>

            <label>
              Data
              <input
                type="date"
                value={data}
                onChange={(evento) => setData(evento.target.value)}
                required
              />
            </label>
          </div>

          <label>
            Observação (ex: "Pagou a conta de luz")
            <textarea
              value={descricao}
              onChange={(evento) => setDescricao(evento.target.value)}
              rows={2}
            />
          </label>

          <div className="modal-actions">
            <button type="submit" className="primary-button" disabled={salvando}>
              {salvando ? "Salvando..." : "Registrar empréstimo"}
            </button>
          </div>
        </form>
      </article>

      <article className="panel categoria-lista-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Empréstimo entre Lojas</span>
            <h2>Histórico</h2>
          </div>
          <strong>{emprestimos.length}</strong>
        </div>

        {carregando ? (
          <div className="empty-state">Carregando...</div>
        ) : emprestimos.length === 0 ? (
          <div className="empty-state">Nenhum empréstimo lançado ainda.</div>
        ) : (
          <div className="categorias-lista">
            {emprestimos.map((emprestimo) => {
              const dividaRestante = Number(
                (emprestimo.valor - (emprestimo.valor_pago || 0)).toFixed(2)
              );

              return (
                <div className="categoria-item" key={emprestimo.id}>
                  <div className="categoria-identificacao">
                    <div className="categoria-icone">🔁</div>
                    <div>
                      <strong>
                        {nomeLoja(emprestimo.loja_credora_id)} → {nomeLoja(emprestimo.loja_devedora_id)}
                        {emprestimo.status === "quitado" && (
                          <span className="badge-status badge-status-pendente">
                            ✅ Quitado
                          </span>
                        )}
                      </strong>
                      <div>
                        {formatarMoeda(emprestimo.valor)} em{" "}
                        {formatarData(emprestimo.data)}
                        {emprestimo.status === "aberto" && (
                          <> — dívida em aberto: {formatarMoeda(dividaRestante)}</>
                        )}
                      </div>
                      {emprestimo.descricao && (
                        <small style={{ color: "#9fb0c4" }}>
                          {emprestimo.descricao}
                        </small>
                      )}
                    </div>
                  </div>

                  {pagandoId === emprestimo.id ? (
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <CampoValor
                        value={valorPagamento}
                        onChange={setValorPagamento}
                        placeholder="Valor pago"
                        style={{ maxWidth: 110 }}
                      />
                      <input
                        type="date"
                        value={dataPagamento}
                        onChange={(evento) => setDataPagamento(evento.target.value)}
                        style={{ maxWidth: 150 }}
                      />
                      <button
                        type="button"
                        className="approve-button"
                        onClick={() => confirmarPagamento(emprestimo)}
                      >
                        ✅
                      </button>
                      <button
                        type="button"
                        className="delete-button"
                        onClick={() => setPagandoId(null)}
                      >
                        ✖️
                      </button>
                    </div>
                  ) : (
                    <div className="transaction-actions">
                      {emprestimo.status === "aberto" && (
                        <button
                          type="button"
                          className="edit-button"
                          onClick={() => iniciarPagamento(emprestimo)}
                        >
                          💰 Registrar pagamento
                        </button>
                      )}

                      <button
                        type="button"
                        className="delete-button"
                        onClick={() => confirmarExclusao(emprestimo)}
                      >
                        Excluir
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </article>
    </section>
  );
}

export default EmprestimosEntreLojas;
