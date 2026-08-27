import { useMemo, useState } from "react";
import CampoValor, { paraNumero } from "./CampoValor";
import {
  somaReceitasRecebidas,
  somaDespesas,
} from "../utils/calculoFinanceiro";

// Etapa 3 + 4 (Malhas 3 e 4) do plano de confiabilidade — 27/08/2026.
// Tela só-admin pra reancorar o card Saldo sem mexer em código. Cada
// registro diz "no dia X o saldo REAL do banco da loja Y era R$ Z"; o
// Dashboard pega o mais recente de cada loja e soma os movimentos pra
// frente. A Etapa 4 acrescenta a DIVERGÊNCIA: quando você salva um saldo
// novo, mostra quanto o sistema previa pra aquela data e a diferença —
// esse gap é o sinal de despesa não lançada ou taxa errada no período
// (o substituto da integração bancária).
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

const dataEfetiva = (item) => item.data_prevista_recebimento || item.data;

// Reconstrói o que o Saldo mostraria numa data, partindo de um ponto
// conferido anterior: base + receitas que caíram entre as duas datas −
// despesas lançadas entre as duas datas. Não inclui retiradas de sócios
// nem empréstimos entre lojas (raros; pra Uberlândia hoje = 0).
function preverSaldoNaData(lancamentos, corteAnterior, dataAlvo, baseAnterior) {
  const receitas = somaReceitasRecebidas(
    lancamentos.filter(
      (item) =>
        item.tipo === "receita" &&
        dataEfetiva(item) > corteAnterior &&
        dataEfetiva(item) <= dataAlvo
    ),
    dataAlvo,
    { liquido: true }
  );

  const despesas = somaDespesas(
    lancamentos.filter(
      (item) =>
        item.tipo === "despesa" &&
        item.data > corteAnterior &&
        item.data <= dataAlvo
    ),
    { descontarCofre: true }
  );

  return Number((baseAnterior + receitas - despesas).toFixed(2));
}

const LIMITE_DIVERGENCIA = 200;

function LinhaDivergencia({ diferenca }) {
  if (diferenca == null) return null;

  const ok = Math.abs(diferenca) < LIMITE_DIVERGENCIA;
  const cor = ok ? "#3fae6a" : "#e0574d";

  return (
    <div style={{ marginTop: 4 }}>
      <small style={{ color: cor }}>
        {ok ? "✓" : "⚠️"} diferença vs. o que o sistema previa:{" "}
        <strong>{formatarMoeda(diferenca)}</strong>
        {!ok && " — provável despesa não lançada ou taxa errada no período"}
      </small>
    </div>
  );
}

function ConferenciaSaldo({
  saldos = [],
  lojas = [],
  lojaPadrao = null,
  saldoCalculadoAtual = null,
  lancamentos = [],
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

  // Último registro conferido da loja escolhida no formulário — serve de
  // ponto de partida pra prever o saldo na data que está sendo digitada.
  function ultimoRegistroDaLoja(idLoja, antesDe = null) {
    return saldos
      .filter(
        (registro) =>
          String(registro.loja_id || "") === String(idLoja || "") &&
          (!antesDe || registro.data_referencia < antesDe)
      )
      .sort((a, b) =>
        a.data_referencia === b.data_referencia
          ? Number(a.id) - Number(b.id)
          : a.data_referencia.localeCompare(b.data_referencia)
      )
      .slice(-1)[0];
  }

  // Prévia da divergência enquanto o usuário digita.
  const previaDivergencia = useMemo(() => {
    if (!lojaId || !valorReal || !dataReferencia) return null;

    const anterior = ultimoRegistroDaLoja(lojaId, dataReferencia);
    if (!anterior) return null;

    const previsto = preverSaldoNaData(
      lancamentos,
      anterior.data_referencia,
      dataReferencia,
      Number(anterior.valor_real || 0)
    );

    return {
      previsto,
      diferenca: Number((paraNumero(valorReal) - previsto).toFixed(2)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojaId, valorReal, dataReferencia, saldos, lancamentos]);

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

  // Divergência histórica: pra cada registro, o que o sistema previa
  // (partindo do registro anterior da mesma loja).
  const divergenciaPorRegistro = useMemo(() => {
    const mapa = new Map();

    for (const registro of saldos) {
      const anterior = ultimoRegistroDaLoja(
        registro.loja_id,
        registro.data_referencia
      );
      if (!anterior) continue;

      const previsto = preverSaldoNaData(
        lancamentos,
        anterior.data_referencia,
        registro.data_referencia,
        Number(anterior.valor_real || 0)
      );

      mapa.set(
        registro.id,
        Number((Number(registro.valor_real || 0) - previsto).toFixed(2))
      );
    }

    return mapa;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saldos, lancamentos]);

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

          {previaDivergencia && (
            <p
              className="foto-ajuda"
              style={{
                marginTop: 4,
                color:
                  Math.abs(previaDivergencia.diferenca) < LIMITE_DIVERGENCIA
                    ? "#3fae6a"
                    : "#e0574d",
              }}
            >
              O sistema previa{" "}
              <strong>{formatarMoeda(previaDivergencia.previsto)}</strong> pra
              essa data. Sua diferença:{" "}
              <strong>{formatarMoeda(previaDivergencia.diferenca)}</strong>
              {Math.abs(previaDivergencia.diferenca) >= LIMITE_DIVERGENCIA &&
                " — vale investigar despesa não lançada ou taxa errada antes de salvar."}
            </p>
          )}

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
                    <LinhaDivergencia
                      diferenca={divergenciaPorRegistro.get(registro.id)}
                    />
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
