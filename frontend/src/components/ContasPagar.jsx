import { useState } from "react";
import { lerFotoContaPagar } from "../services/api";

// Mesma compressão já usada em Despesas/Conciliação — reduz o tamanho antes
// de guardar (a foto vira base64 direto na tabela, sem isso ficaria pesado).
function comprimirImagem(arquivo, larguraMaxima = 1000, qualidade = 0.6) {
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

// Primeiro dia do mês atual, no formato YYYY-MM-DD — usado pra limitar o
// histórico de Contas Pagas ao mês corrente por padrão (mês anterior só
// aparece se a pessoa pesquisar por ele).
function primeiroDiaMesAtual() {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(
    2,
    "0"
  )}-01`;
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
  despesas = [],
  buscarFotoDespesa,
  carregando = false,
  adicionarConta,
  editarConta,
  marcarComoPaga,
  removerConta,
  lojas = [],
  vePermissaoTotal = true,
  lojaPadrao = null,
  modo = "pendentes",
  aoConfirmarPagamento,
}) {
  const [descricao, setDescricao] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [valor, setValor] = useState("");
  const [dataVencimento, setDataVencimento] = useState("");
  const [observacao, setObservacao] = useState("");
  const [lojaId, setLojaId] = useState(lojaPadrao ? String(lojaPadrao) : "");
  const [editandoId, setEditandoId] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [foto, setFoto] = useState("");
  const [processandoFoto, setProcessandoFoto] = useState(false);
  const [lendoFoto, setLendoFoto] = useState(false);
  const [fotoVisualizada, setFotoVisualizada] = useState(null);
  const [detalheVisualizado, setDetalheVisualizado] = useState(null);
  const [carregandoFotoDetalhe, setCarregandoFotoDetalhe] = useState(false);
  const [selecionadas, setSelecionadas] = useState([]);
  const [confirmandoPagamento, setConfirmandoPagamento] = useState(false);
  const [busca, setBusca] = useState("");
  const [buscaData, setBuscaData] = useState("");
  const [salvandoValorId, setSalvandoValorId] = useState(null);

  function limparFormulario() {
    setDescricao("");
    setFornecedor("");
    setValor("");
    setDataVencimento("");
    setObservacao("");
    setLojaId(lojaPadrao ? String(lojaPadrao) : "");
    setEditandoId(null);
    setFoto("");
  }

  async function lerFotoAutomaticamente(fotoParaLer) {
    const fotoAlvo = fotoParaLer || foto;

    if (!fotoAlvo || lendoFoto) return;

    setLendoFoto(true);

    try {
      const resultado = await lerFotoContaPagar(fotoAlvo);

      if (resultado.valor == null) {
        alert(
          resultado.erro_leitura ||
            "Não consegui identificar o valor dessa foto. Preencha manualmente."
        );
        return;
      }

      // Esse campo é <input type="number"> (formato com ponto decimal),
      // diferente do campo de valor de Despesas — não usar formatação
      // brasileira com vírgula aqui, o input nativo não aceita.
      setValor(Number(resultado.valor).toFixed(2));

      if (resultado.fornecedor) {
        setFornecedor(resultado.fornecedor);
      }
    } catch (erro) {
      alert(erro.message || "Não foi possível ler a foto.");
    } finally {
      setLendoFoto(false);
    }
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
        foto,
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
    setFoto(conta.foto || "");
  }

  async function salvarValorEditado(conta, valorDigitado) {
    const novoValor = Number(String(valorDigitado).replace(",", "."));

    if (!Number.isFinite(novoValor) || novoValor <= 0) {
      alert("Digite um valor válido maior que zero.");
      return;
    }

    // Sem mudança de verdade — não precisa salvar de novo.
    if (Number(conta.valor) === novoValor) return;

    setSalvandoValorId(conta.id);

    try {
      await editarConta(conta.id, {
        descricao: conta.descricao,
        fornecedor: conta.fornecedor,
        valor: novoValor,
        data_vencimento: conta.data_vencimento,
        observacao: conta.observacao,
        loja_id: conta.loja_id,
        foto: conta.foto,
      });
    } catch (erro) {
      alert(erro.message || "Não foi possível atualizar o valor.");
    } finally {
      setSalvandoValorId(null);
    }
  }

  function alternarSelecao(id) {
    setSelecionadas((anteriores) =>
      anteriores.includes(id)
        ? anteriores.filter((item) => item !== id)
        : [...anteriores, id]
    );
  }

  async function confirmarPagamentoSelecionadas() {
    if (selecionadas.length === 0) return;

    const confirmar = window.confirm(
      selecionadas.length === 1
        ? "Marcar a conta selecionada como paga?"
        : `Marcar as ${selecionadas.length} contas selecionadas como pagas?`
    );

    if (!confirmar) return;

    setConfirmandoPagamento(true);

    try {
      const falhas = [];

      for (const id of selecionadas) {
        try {
          await marcarComoPaga(id);
        } catch (erro) {
          falhas.push(erro.message || "erro desconhecido");
        }
      }

      setSelecionadas([]);
      // Vai direto pra página de Contas Pagas, já com acesso ao "Ver
      // detalhes" de tudo que acabou de ser pago.
      aoConfirmarPagamento?.();

      if (falhas.length > 0) {
        alert(
          `Algumas contas não puderam ser marcadas como pagas: ${falhas.join(
            ", "
          )}`
        );
      }
    } finally {
      setConfirmandoPagamento(false);
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

  const buscaLimpa = busca.trim().toLowerCase();

  // Despesas lançadas já são dinheiro pago — entram junto na aba "Contas
  // Pagas" (só nessa aba, nunca em "A pagar"), sem duplicar nada no banco:
  // é só uma junção pra visualização, cada uma mantém sua origem marcada
  // (_origem) pra "Ver foto"/Editar/Excluir saberem de onde vieram.
  const contasPagasNormalizadas =
    modo === "pagas"
      ? [
          ...contas
            .filter((conta) => conta.status === "pago")
            .map((conta) => ({ ...conta, _origem: "contas_pagar" })),
          ...despesas.map((despesa) => ({
            id: `despesa-${despesa.id}`,
            _origem: "despesa",
            _idOriginal: despesa.id,
            descricao: despesa.descricao,
            fornecedor: despesa.fornecedor,
            valor: despesa.valor,
            data_vencimento: despesa.data,
            data_pagamento: despesa.data,
            status: "pago",
            observacao: despesa.observacao,
            loja_id: despesa.loja_id,
            foto: null,
            tem_foto: despesa.tem_foto,
          })),
        ]
      : [];

  const contasVisiveis =
    modo === "pagas"
      ? contasPagasNormalizadas
          .filter((conta) =>
            buscaLimpa
              ? `${conta.descricao} ${conta.fornecedor || ""}`
                  .toLowerCase()
                  .includes(buscaLimpa)
              : true
          )
          .filter((conta) => {
            if (buscaData) {
              return conta.data_pagamento === buscaData;
            }

            // Sem nenhum filtro de data escolhido: se já pesquisou por
            // nome, mostra de qualquer época; senão, só o mês atual (mês
            // anterior cresceria a lista pra sempre).
            return buscaLimpa
              ? true
              : (conta.data_pagamento || "") >= primeiroDiaMesAtual();
          })
          .sort((a, b) =>
            (b.data_pagamento || "").localeCompare(a.data_pagamento || "")
          )
      : contas
          .filter((conta) => conta.status !== "pago")
          .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));

  return (
    <section className="categorias-layout">
      {modo === "pagas" ? (
        <article className="panel categoria-form-panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Contas Pagas</span>
              <h2>Buscar no histórico</h2>
            </div>
          </div>

          <div className="form-row">
            <label>
              Pesquisar
              <input
                type="text"
                value={busca}
                onChange={(evento) => setBusca(evento.target.value)}
                placeholder="Descrição ou fornecedor..."
              />
            </label>

            <label>
              Ou pesquisar por data
              <input
                type="date"
                value={buscaData}
                onChange={(evento) => setBuscaData(evento.target.value)}
              />
            </label>
          </div>

          {buscaData && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => setBuscaData("")}
            >
              Limpar data
            </button>
          )}

          <small className="foto-ajuda">
            {buscaData
              ? "Mostrando só o dia escolhido."
              : busca.trim()
              ? "Buscando em todo o histórico, sem limite de data."
              : "Mostrando só as contas pagas neste mês. Pra ver meses anteriores, pesquise pelo nome ou escolha uma data."}
          </small>
        </article>
      ) : (
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

          <div className="foto-upload">
            <span className="foto-upload-title">
              📄 Foto do boleto/nota
            </span>

            <input
              id="foto-conta-pagar"
              type="file"
              accept="image/*"
              disabled={processandoFoto}
              onChange={async (evento) => {
                const arquivo = evento.target.files?.[0];

                if (!arquivo) return;

                setProcessandoFoto(true);

                try {
                  const fotoComprimida = await comprimirImagem(arquivo);
                  setFoto(fotoComprimida);
                  await lerFotoAutomaticamente(fotoComprimida);
                } catch (erro) {
                  console.error("Erro ao processar a foto:", erro);
                  alert(
                    erro.message ||
                      "Não foi possível processar a foto selecionada."
                  );
                } finally {
                  setProcessandoFoto(false);
                  evento.target.value = "";
                }
              }}
            />

            <label
              htmlFor="foto-conta-pagar"
              className="foto-button"
              style={
                processandoFoto || lendoFoto
                  ? { opacity: 0.6, pointerEvents: "none" }
                  : undefined
              }
            >
              {processandoFoto
                ? "Processando foto..."
                : lendoFoto
                ? "🤖 Lendo automaticamente..."
                : "📷📄 Tirar foto ou anexar e ler automaticamente"}
            </label>

            <small className="foto-ajuda">
              Escolhe da câmera ou da galeria — tanto foto quanto arquivo de
              imagem já salvo.
            </small>
          </div>

          {foto && (
            <div className="foto-preview">
              <img src={foto} alt="Pré-visualização do boleto/nota" />

              <button
                type="button"
                className="secondary-button"
                onClick={() => lerFotoAutomaticamente()}
                disabled={lendoFoto}
              >
                {lendoFoto ? "Lendo..." : "🤖 Ler novamente"}
              </button>

              <button
                type="button"
                className="secondary-button"
                onClick={() => setFoto("")}
              >
                Remover foto
              </button>
            </div>
          )}

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
      )}

      <article className="panel categoria-lista-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">
              {modo === "pagas" ? "Contas Pagas" : "Contas a Pagar"}
            </span>
            <h2>{modo === "pagas" ? "Histórico" : "Vencimentos"}</h2>
          </div>

          <strong>{contasVisiveis.length}</strong>
        </div>

        {modo === "pendentes" && selecionadas.length > 0 && (
          <button
            type="button"
            className="approve-button"
            onClick={confirmarPagamentoSelecionadas}
            disabled={confirmandoPagamento}
            style={{ marginBottom: 12 }}
          >
            {confirmandoPagamento
              ? "Confirmando..."
              : `✅ Confirmar pagamento (${selecionadas.length})`}
          </button>
        )}

        {carregando ? (
          <div className="empty-state">Carregando...</div>
        ) : contasVisiveis.length === 0 ? (
          <div className="empty-state">
            {modo === "pagas"
              ? buscaData
                ? "Nenhuma conta paga nesse dia."
                : busca.trim()
                ? "Nenhuma conta paga encontrada com essa busca."
                : "Nenhuma conta paga neste mês ainda."
              : "Nenhuma conta a pagar."}
          </div>
        ) : (
          <div className="categorias-lista">
            {contasVisiveis.map((conta) => {
              const situacao = situacaoConta(conta);

              return (
                <div className="categoria-item" key={conta.id}>
                  <div className="categoria-identificacao">
                    {modo === "pendentes" && (
                      <input
                        type="checkbox"
                        checked={selecionadas.includes(conta.id)}
                        onChange={() => alternarSelecao(conta.id)}
                        style={{ width: 20, height: 20, flexShrink: 0 }}
                      />
                    )}

                    <div className="categoria-icone">
                      {conta._origem === "despesa" ? "🧾" : "💸"}
                    </div>

                    <div>
                      <strong>{conta.descricao}</strong>
                      <div>
                        {conta._origem === "despesa" && (
                          <span
                            className="badge-status badge-status-pendente"
                            title="Essa é uma despesa lançada em Despesas — aparece aqui só pra visualização."
                          >
                            Despesa
                          </span>
                        )}
                        {conta.fornecedor ? `${conta.fornecedor} — ` : ""}
                        {modo === "pendentes" && conta._origem !== "despesa" ? (
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            defaultValue={conta.valor}
                            disabled={salvandoValorId === conta.id}
                            style={{ width: 100, display: "inline-block" }}
                            onBlur={(evento) =>
                              salvarValorEditado(conta, evento.target.value)
                            }
                            onKeyDown={(evento) => {
                              if (evento.key === "Enter") {
                                evento.target.blur();
                              }
                            }}
                          />
                        ) : (
                          formatarMoeda(conta.valor)
                        )}
                        {modo === "pagas" && conta.data_pagamento
                          ? ` — pago em ${formatarData(conta.data_pagamento)}`
                          : ` — vence em ${formatarData(
                              conta.data_vencimento
                            )}`}
                      </div>
                      {vePermissaoTotal &&
                        (() => {
                          const nomeLoja = lojas.find(
                            (loja) =>
                              String(loja.id) === String(conta.loja_id)
                          )?.nome;

                          // Sem loja atribuída não mostra nada aqui — a
                          // frase "Sem loja" só confundia quem já está
                          // vendo tudo filtrado por uma loja específica.
                          return nomeLoja ? <span>🏬 {nomeLoja}</span> : null;
                        })()}
                      <span className={situacao.classe}>
                        {situacao.rotulo}
                      </span>
                    </div>
                  </div>

                  <div className="transaction-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setDetalheVisualizado(conta)}
                    >
                      👁️ Ver detalhes
                    </button>

                    {conta._origem !== "despesa" && (
                      <>
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
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </article>

      {detalheVisualizado && (
        <div
          className="modal-overlay"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget) {
              setDetalheVisualizado(null);
            }
          }}
        >
          <div className="modal">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Conta a pagar</span>
                <h2>{detalheVisualizado.descricao}</h2>
              </div>

              <button
                type="button"
                className="close-button"
                onClick={() => setDetalheVisualizado(null)}
              >
                ×
              </button>
            </div>

            <div className="categorias-lista">
              <div className="categoria-item">
                <div className="categoria-identificacao">
                  <div className="categoria-icone">💸</div>
                  <div>
                    <strong>Valor</strong>
                    <div>{formatarMoeda(detalheVisualizado.valor)}</div>
                  </div>
                </div>
              </div>

              {detalheVisualizado.fornecedor && (
                <div className="categoria-item">
                  <div className="categoria-identificacao">
                    <div className="categoria-icone">🏭</div>
                    <div>
                      <strong>Fornecedor</strong>
                      <div>{detalheVisualizado.fornecedor}</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="categoria-item">
                <div className="categoria-identificacao">
                  <div className="categoria-icone">📅</div>
                  <div>
                    <strong>Vencimento</strong>
                    <div>
                      {formatarData(detalheVisualizado.data_vencimento)}
                    </div>
                  </div>
                </div>
              </div>

              {lojas.find(
                (loja) =>
                  String(loja.id) === String(detalheVisualizado.loja_id)
              )?.nome && (
                <div className="categoria-item">
                  <div className="categoria-identificacao">
                    <div className="categoria-icone">🏬</div>
                    <div>
                      <strong>Loja</strong>
                      <div>
                        {
                          lojas.find(
                            (loja) =>
                              String(loja.id) ===
                              String(detalheVisualizado.loja_id)
                          )?.nome
                        }
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="categoria-item">
                <div className="categoria-identificacao">
                  <div className="categoria-icone">
                    {detalheVisualizado.status === "pago" ? "✅" : "⏳"}
                  </div>
                  <div>
                    <strong>Situação</strong>
                    <div>
                      {situacaoConta(detalheVisualizado).rotulo}
                    </div>
                  </div>
                </div>
              </div>

              {detalheVisualizado.observacao && (
                <div className="categoria-item">
                  <div className="categoria-identificacao">
                    <div className="categoria-icone">📝</div>
                    <div>
                      <strong>Observação</strong>
                      <div>{detalheVisualizado.observacao}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-actions">
              {(detalheVisualizado.foto || detalheVisualizado.tem_foto) && (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={carregandoFotoDetalhe}
                  onClick={async () => {
                    if (detalheVisualizado._origem === "despesa") {
                      setCarregandoFotoDetalhe(true);

                      try {
                        const resultado = await buscarFotoDespesa(
                          detalheVisualizado._idOriginal
                        );
                        setFotoVisualizada(resultado?.foto || "");
                        setDetalheVisualizado(null);
                      } catch (erro) {
                        alert(
                          erro.message || "Não foi possível carregar a foto."
                        );
                      } finally {
                        setCarregandoFotoDetalhe(false);
                      }

                      return;
                    }

                    setFotoVisualizada(detalheVisualizado.foto);
                    setDetalheVisualizado(null);
                  }}
                >
                  {carregandoFotoDetalhe ? "Carregando..." : "👁️ Ver foto"}
                </button>
              )}

              <button
                type="button"
                className="primary-button"
                onClick={() => setDetalheVisualizado(null)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

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
                <span className="eyebrow">Conta a pagar</span>
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
              alt="Foto do boleto/nota"
              className="foto-modal-imagem"
            />
          </div>
        </div>
      )}
    </section>
  );
}

export default ContasPagar;
export { situacaoConta, diasAte };
