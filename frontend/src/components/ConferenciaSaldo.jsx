import { useState } from "react";
import CampoValor, { paraNumero } from "./CampoValor";

// Etapa 3 (Malha 3) do plano de confiabilidade — 27/08/2026.
// Tela só-admin pra reancorar o card Saldo sem mexer em código. Cada
// registro diz "no dia X o saldo REAL do banco da loja Y era R$ Z"; o
// Dashboard pega o mais recente de cada loja e soma os movimentos pra
// frente. Antes disso, reancorar era editar duas constantes no App.jsx
// e fazer deploy.
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
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function ConferenciaSaldo({
  saldos = [],
  lojas = [],
  lojaPadrao = null,
  saldoCalculadoAtual = null,
  adicionar,
  remover,
}) {
  const [lojaId, setLojaId] = useState(lojaPadrao ? String(lojaPadrao) : "");
  const [dataReferencia, setDataReferencia] = useState(hojeLocal());
  const [valorReal, setValorReal] = useState("");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  function limparFormulario() {
    setLojaId(lojaPadrao ? String(lojaPadrao) : "");
    setDataReferencia(hojeLocal());
    setValorReal("");
    setObservacao("");
  }

  async function salvar(evento) {
    evento.preventDefault();

    if (lojas.length > 0 && !lojaId) {
      alert("Escolha a loja.");
      return;
    }

    if (!valorReal || !dataReferencia) {
      alert("Informe o saldo real do banco e a data.");
      return;
    }

    setSalvando(true);

    try {
      await adicionar({
        loja_id: lojaId ? Number(lojaId) : null,
        data_referencia: dataReferencia,
        valor_real: paraNumero(valorReal),
        observacao: observacao.trim(),
      });

      limparFormulario();
    } catch (erro) {
      alert(erro.message || "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarExclusao(registro) {
    const confirmar = window.confirm(
      `Excluir o saldo conferido de ${formatarData(
        registro.data_referencia
      )} (${formatarMoeda(
        registro.valor_real
      )})? O card Saldo volta a usar o registro anterior dessa loja.`
    );

    if (!confirmar) return;

    try {
      await remover(registro.id);
    } catch (erro) {
      alert(erro.message || "Não foi possível excluir.");
    }
  }

  return (
    <section className="categorias-layout">
      <article className="panel categoria-form-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Conferência de Saldo</span>
            <h2>Informar saldo real do banco</h2>
          </div>
        </div>

        <small className="foto-ajuda">
          Digite aqui o saldo REAL da conta do banco de uma loja num dia.
          A partir desse ponto, o card Saldo soma sozinho as receitas que
          caírem e desconta as despesas lançadas. Faça isso sempre que
          quiser "zerar" a diferença entre o sistema e o extrato — sem
          precisar de deploy nem de mexer em código.
        </small>

        {saldoCalculadoAtual != null && (
          <p className="foto-ajuda" style={{ marginTop: 8 }}>
            Saldo que o sistema mostra agora (loja selecionada no topo):{" "}
            <strong>{formatarMoeda(saldoCalculadoAtual)}</strong>
          </p>
        )}

        <form onSubmit={salvar}>
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

          <div className="form-row">
            <label>
              Saldo real do banco
              <CampoValor value={valorReal} onChange={setValorReal} required />
            </label>

            <label>
              Data de referência
              <input
                type="date"
                value={dataReferencia}
                onChange={(evento) => setDataReferencia(evento.target.value)}
                required
              />
            </label>
          </div>

          <label>
            Observação
            <textarea
              value={observacao}
              onChange={(evento) => setObservacao(evento.target.value)}
              rows={2}
              placeholder="Ex.: conferido no app do Sicredi às 12h"
            />
          </label>

          <div className="modal-actions">
            <button type="submit" className="primary-button" disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar saldo conferido"}
            </button>
          </div>
        </form>
      </article>

      <article className="panel categoria-lista-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Conferência de Saldo</span>
            <h2>Histórico</h2>
          </div>
        </div>

        {saldos.length === 0 ? (
          <div className="empty-state">
            Nenhum saldo conferido ainda — o card usa o valor de partida do
            código.
          </div>
        ) : (
          <div className="categorias-lista">
            {saldos.map((registro) => (
              <div className="categoria-item" key={registro.id}>
                <div className="categoria-identificacao">
                  <div className="categoria-icone">🏦</div>
                  <div>
                    <strong>{formatarMoeda(registro.valor_real)}</strong>
                    <div>em {formatarData(registro.data_referencia)}</div>
                    {registro.loja_id && lojas.length > 0 && (
                      <small style={{ color: "#9fb0c4" }}>
                        {
                          lojas.find(
                            (loja) =>
                              String(loja.id) === String(registro.loja_id)
                          )?.nome
                        }
                      </small>
                    )}
                    {registro.informado_por && (
                      <div>
                        <small style={{ color: "#9fb0c4" }}>
                          por {registro.informado_por}
                        </small>
                      </div>
                    )}
                    {registro.observacao && (
                      <div>
                        <small style={{ color: "#9fb0c4" }}>
                          {registro.observacao}
                        </small>
                      </div>
                    )}
                  </div>
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="delete-button"
                    onClick={() => confirmarExclusao(registro)}
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

export default ConferenciaSaldo;
