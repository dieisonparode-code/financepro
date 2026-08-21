import { useState } from "react";
import CampoValor, { paraNumero } from "./CampoValor";

// Pedido do usuário (20/08/2026): retirada de dinheiro pros sócios —
// tela inteira só-admin, separada de Despesas/Contas Pagas de propósito
// (informação sensível que a equipe toda não deve ver). Dá baixa no
// Saldo e aparece nos Relatórios, mas nunca em Contas Pagas.
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

function RetiradasSocios({
  retiradas = [],
  carregando = false,
  lojas = [],
  lojaPadrao = null,
  adicionar,
  remover,
}) {
  const [socio, setSocio] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hojeLocal());
  const [lojaId, setLojaId] = useState(lojaPadrao ? String(lojaPadrao) : "");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  function limparFormulario() {
    setSocio("");
    setValor("");
    setData(hojeLocal());
    setLojaId(lojaPadrao ? String(lojaPadrao) : "");
    setObservacao("");
  }

  async function salvar(evento) {
    evento.preventDefault();

    if (!socio.trim() || !valor || !data) {
      alert("Preencha o sócio, o valor e a data.");
      return;
    }

    if (lojas.length > 0 && !lojaId) {
      alert("Escolha a loja dessa retirada.");
      return;
    }

    setSalvando(true);

    try {
      await adicionar({
        socio: socio.trim(),
        // Bug real corrigido (21/08/2026): "35.000" (sem vírgula) estava
        // virando 35 — usa o paraNumero() do CampoValor, que sempre tira
        // o ponto de milhar primeiro, tenha vírgula ou não.
        valor: paraNumero(valor),
        data,
        loja_id: lojaId || null,
        observacao: observacao.trim(),
      });

      limparFormulario();
    } catch (erro) {
      alert(erro.message || "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarExclusao(retirada) {
    const confirmar = window.confirm(
      `Excluir a retirada de ${retirada.socio} (${formatarMoeda(retirada.valor)})? Isso volta esse valor pro Saldo.`
    );

    if (!confirmar) return;

    try {
      await remover(retirada.id);
    } catch (erro) {
      alert(erro.message || "Não foi possível excluir.");
    }
  }

  const totalRetirado = retiradas.reduce(
    (soma, item) => soma + Number(item.valor || 0),
    0
  );

  return (
    <section className="categorias-layout">
      <article className="panel categoria-form-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Retiradas de Sócios</span>
            <h2>Nova retirada</h2>
          </div>
        </div>

        <small className="foto-ajuda">
          Só administrador vê essa tela. A retirada desconta do Saldo e
          aparece nos Relatórios, mas nunca em Contas Pagas nem Despesas —
          fica separada de propósito, sem a equipe ter acesso.
        </small>

        <form onSubmit={salvar}>
          <label>
            Sócio
            <input
              type="text"
              value={socio}
              onChange={(evento) => setSocio(evento.target.value)}
              placeholder="Nome do sócio"
              required
            />
          </label>

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

          {lojas.length > 0 && (
            <label>
              Loja
              <select
                value={lojaId}
                onChange={(evento) => setLojaId(evento.target.value)}
                required
              >
                <option value="">Escolha a loja...</option>
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
            <button type="submit" className="primary-button" disabled={salvando}>
              {salvando ? "Salvando..." : "Lançar retirada"}
            </button>
          </div>
        </form>
      </article>

      <article className="panel categoria-lista-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Retiradas de Sócios</span>
            <h2>Histórico</h2>
          </div>

          <strong>{formatarMoeda(totalRetirado)}</strong>
        </div>

        {carregando ? (
          <div className="empty-state">Carregando...</div>
        ) : retiradas.length === 0 ? (
          <div className="empty-state">Nenhuma retirada lançada ainda.</div>
        ) : (
          <div className="categorias-lista">
            {retiradas.map((retirada) => (
              <div className="categoria-item" key={retirada.id}>
                <div className="categoria-identificacao">
                  <div className="categoria-icone">💸</div>
                  <div>
                    <strong>{retirada.socio}</strong>
                    <div>
                      {formatarMoeda(retirada.valor)} —{" "}
                      {formatarData(retirada.data)}
                    </div>
                    {retirada.loja_id && lojas.length > 0 && (
                      <small style={{ color: "#9fb0c4" }}>
                        {
                          lojas.find(
                            (loja) =>
                              String(loja.id) === String(retirada.loja_id)
                          )?.nome
                        }
                      </small>
                    )}
                    {retirada.observacao && (
                      <div>
                        <small style={{ color: "#9fb0c4" }}>
                          {retirada.observacao}
                        </small>
                      </div>
                    )}
                  </div>
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="delete-button"
                    onClick={() => confirmarExclusao(retirada)}
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

export default RetiradasSocios;
