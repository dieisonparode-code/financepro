import { useEffect, useState } from "react";

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
  // Pedido do usuário (19/08/2026): quando o dia de vencimento já passou
  // nesse mês (ex: cadastra dia 19 uma recorrente com vencimento dia
  // 10), o sistema gerava a conta desse mês já "atrasada" na hora —
  // mesmo quando a intenção era só começar a contar a partir do mês
  // seguinte. Esse toggle deixa escolher.
  const [comecarProximoMes, setComecarProximoMes] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [salvando, setSalvando] = useState(false);

  // BUG REAL corrigido (17/08/2026): o campo Loja só pegava o valor de
  // "lojaPadrao" (o seletor do topo) na primeira vez que a tela abria —
  // se o usuário trocasse a loja no topo DEPOIS de já estar nessa
  // página, o formulário continuava com "Loja" em branco por dentro,
  // mesmo mostrando visualmente o nome certo. Cadastrar assim salvava
  // loja_id nulo, e a despesa gerada some do Dashboard quando filtra por
  // uma loja específica. Agora acompanha o seletor do topo sempre que
  // muda, contanto que não esteja editando um cadastro existente.
  useEffect(() => {
    if (editandoId) return;
    setLojaId(lojaPadrao ? String(lojaPadrao) : "");
  }, [lojaPadrao, editandoId]);

  function limparFormulario() {
    setDescricao("");
    setFornecedor("");
    setValor("");
    setDiaVencimento("");
    setLojaId(lojaPadrao ? String(lojaPadrao) : "");
    setObservacao("");
    setComecarProximoMes(false);
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
    setComecarProximoMes(Boolean(recorrente.mes_inicio));
  }

  async function salvar(evento) {
    evento.preventDefault();

    if (!descricao.trim() || !valor || !diaVencimento) {
      alert("Preencha descrição, valor e dia do vencimento.");
      return;
    }

    // BUG REAL corrigido (17/08/2026): o campo "Loja" aqui do formulário
    // é diferente do seletor de loja lá em cima da tela — ficava em
    // branco por padrão sempre que "Todas as lojas" estava selecionado
    // no topo, e ninguém percebia (a Conta a Pagar gerada nascia sem
    // loja, e o Dashboard filtrado numa loja específica escondia ela
    // sozinha, sem erro nenhum). Agora obriga escolher, se tiver mais de
    // uma loja cadastrada.
    if (lojas.length > 0 && !lojaId) {
      alert("Escolha a loja dessa despesa recorrente.");
      return;
    }

    setSalvando(true);

    const dados = {
      descricao: descricao.trim(),
      fornecedor: fornecedor.trim(),
      // BUG REAL corrigido (17/08/2026): valor digitado no formato
      // brasileiro (ex: "6.520,16") só trocava a vírgula por ponto,
      // sobrando o ponto de milhar e virando um número inválido
      // ("6.520.16" → NaN → chegava como 0 no servidor, disparando "Informe
      // o valor" mesmo com o campo preenchido). Só tira o ponto quando
      // tem vírgula também (senão um valor tipo "650.16" digitado com
      // ponto decimal quebraria virando "65016").
      valor: Number(
        valor.includes(",") ? valor.replace(/\./g, "").replace(",", ".") : valor
      ),
      dia_vencimento: Number(diaVencimento),
      loja_id: lojaId || null,
      observacao: observacao.trim(),
      // "Só a partir do mês que vem" — calcula o mês seguinte (AAAA-MM)
      // ao de hoje; deixa null (sem restrição) se a intenção é já contar
      // esse mês, mesmo que o dia já tenha passado.
      mes_inicio: comecarProximoMes
        ? (() => {
            const agora = new Date();
            const proximo = new Date(
              agora.getFullYear(),
              agora.getMonth() + 1,
              1
            );
            return `${proximo.getFullYear()}-${String(
              proximo.getMonth() + 1
            ).padStart(2, "0")}`;
          })()
        : null,
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
        mes_inicio: recorrente.mes_inicio || null,
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

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexDirection: "row",
            }}
          >
            <input
              type="checkbox"
              checked={comecarProximoMes}
              onChange={(evento) => setComecarProximoMes(evento.target.checked)}
              style={{ width: "auto" }}
            />
            Só vale a partir do mês que vem (não conta o dia de vencimento
            desse mês, mesmo que já tenha passado)
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
                    {recorrente.mes_inicio && (
                      <div>
                        <small style={{ color: "#f59e0b" }}>
                          ⏳ Só a partir de {recorrente.mes_inicio}
                        </small>
                      </div>
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
