import { useState } from "react";
import CampoValor, { paraNumero } from "./CampoValor";

function CadastroInsumos({
  insumos = [],
  lojas = [],
  carregando = false,
  vePermissaoTotal = true,
  lojaFixaId = null,
  adicionarInsumo,
  editarInsumo,
  excluirInsumo,
  registrarMovimentacao,
}) {
  const [nome, setNome] = useState("");
  const [unidadeMedida, setUnidadeMedida] = useState("un");
  const [estoqueInicial, setEstoqueInicial] = useState("");
  const [estoqueMinimo, setEstoqueMinimo] = useState("0");
  const [unidadeCompra, setUnidadeCompra] = useState("");
  const [fatorConversao, setFatorConversao] = useState("1");
  // Pedido do usuário (21/08/2026): custo por unidade, usado pela Ficha
  // Técnica pra calcular o custo real de cada prato.
  const [custoUnitario, setCustoUnitario] = useState("");
  const [lojaId, setLojaId] = useState(lojaFixaId || "");
  const [editandoId, setEditandoId] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const [lojaFiltro, setLojaFiltro] = useState(lojaFixaId || "todas");
  const [movimentandoId, setMovimentandoId] = useState(null);

  function limparFormulario() {
    setNome("");
    setUnidadeMedida("un");
    setEstoqueInicial("");
    setEstoqueMinimo("0");
    setUnidadeCompra("");
    setFatorConversao("1");
    setCustoUnitario("");
    setLojaId(lojaFixaId || "");
    setEditandoId(null);
  }

  async function salvar(evento) {
    evento.preventDefault();

    const nomeLimpo = nome.trim();

    if (!nomeLimpo) {
      alert("Informe o nome do insumo.");
      return;
    }

    if (!lojaId) {
      alert("Selecione a loja do insumo.");
      return;
    }

    setSalvando(true);

    try {
      if (editandoId) {
        await editarInsumo(editandoId, {
          nome: nomeLimpo,
          unidade_medida: unidadeMedida,
          estoque_minimo: estoqueMinimo || 0,
          unidade_compra: unidadeCompra.trim(),
          fator_conversao: fatorConversao || 1,
          custo_unitario: paraNumero(custoUnitario),
          loja_id: lojaId,
        });
      } else {
        await adicionarInsumo({
          nome: nomeLimpo,
          unidade_medida: unidadeMedida,
          estoque_atual: estoqueInicial || 0,
          estoque_minimo: estoqueMinimo || 0,
          unidade_compra: unidadeCompra.trim(),
          fator_conversao: fatorConversao || 1,
          custo_unitario: paraNumero(custoUnitario),
          loja_id: lojaId,
        });
      }

      limparFormulario();
    } catch (erro) {
      console.error("Erro ao salvar insumo:", erro);
      alert(erro.message || "Não foi possível salvar o insumo.");
    } finally {
      setSalvando(false);
    }
  }

  function iniciarEdicao(insumo) {
    setEditandoId(insumo.id);
    setNome(insumo.nome);
    setUnidadeMedida(insumo.unidade_medida || "un");
    setEstoqueMinimo(String(insumo.estoque_minimo || 0));
    setUnidadeCompra(insumo.unidade_compra || "");
    setFatorConversao(String(insumo.fator_conversao || 1));
    setCustoUnitario(
      insumo.custo_unitario
        ? Number(insumo.custo_unitario).toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        : ""
    );
    setLojaId(insumo.loja_id || "");
  }

  async function confirmarExclusao(insumo) {
    const confirmar = window.confirm(
      `Deseja excluir o insumo "${insumo.nome}"? Isso também apaga o histórico de movimentações dele.`
    );

    if (!confirmar) return;

    try {
      await excluirInsumo(insumo.id);

      if (editandoId === insumo.id) {
        limparFormulario();
      }
    } catch (erro) {
      console.error("Erro ao excluir insumo:", erro);
      alert(erro.message || "Não foi possível excluir o insumo.");
    }
  }

  async function movimentar(insumo, tipo) {
    const temUnidadeCompra = Boolean(insumo.unidade_compra);
    let quantidadeEmEstoque = null;
    let motivoSugerido = "";

    if (tipo === "entrada" && temUnidadeCompra) {
      const emCompra = window.confirm(
        `Essa entrada é em "${insumo.unidade_compra}" (ex.: 2 ${insumo.unidade_compra}s)?\n\nOK = sim, em ${insumo.unidade_compra}\nCancelar = não, em ${insumo.unidade_medida} direto`
      );

      const rotulo = emCompra
        ? `Quantos(as) ${insumo.unidade_compra}(s) entraram?`
        : `Quantas ${insumo.unidade_medida} entraram?`;

      const quantidadeTexto = window.prompt(rotulo);

      if (quantidadeTexto === null) return;

      const quantidadeInformada = Number(
        quantidadeTexto.replace(",", ".")
      );

      if (!quantidadeInformada || quantidadeInformada <= 0) {
        alert("Informe uma quantidade válida, maior que zero.");
        return;
      }

      quantidadeEmEstoque = emCompra
        ? quantidadeInformada * Number(insumo.fator_conversao || 1)
        : quantidadeInformada;

      motivoSugerido = emCompra
        ? `Compra: ${quantidadeInformada} ${insumo.unidade_compra}(s) = ${quantidadeEmEstoque} ${insumo.unidade_medida}`
        : "";
    } else {
      const rotulo =
        tipo === "entrada"
          ? `Quantas ${insumo.unidade_medida} entraram?`
          : tipo === "saida"
          ? `Quantas ${insumo.unidade_medida} saíram?`
          : "Qual é a quantidade real em estoque agora?";

      const quantidadeTexto = window.prompt(rotulo);

      if (quantidadeTexto === null) return;

      quantidadeEmEstoque = Number(quantidadeTexto.replace(",", "."));

      if (!quantidadeEmEstoque || quantidadeEmEstoque <= 0) {
        alert("Informe uma quantidade válida, maior que zero.");
        return;
      }
    }

    const quantidade = quantidadeEmEstoque;

    const motivo = window.prompt(
      "Motivo (opcional, ex.: Compra, Perda, Ajuste de inventário)",
      motivoSugerido
    );

    setMovimentandoId(insumo.id);

    try {
      await registrarMovimentacao(insumo.id, {
        tipo,
        quantidade,
        motivo: motivo || "",
      });
    } catch (erro) {
      console.error("Erro ao registrar movimentação:", erro);
      alert(erro.message || "Não foi possível registrar a movimentação.");
    } finally {
      setMovimentandoId(null);
    }
  }

  const insumosFiltrados =
    lojaFiltro === "todas"
      ? insumos
      : insumos.filter(
          (insumo) => String(insumo.loja_id) === String(lojaFiltro)
        );

  return (
    <section className="categorias-layout">
      <article className="panel categoria-form-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">
              {editandoId ? "Editar cadastro" : "Novo cadastro"}
            </span>

            <h2>{editandoId ? "Editar insumo" : "Novo insumo"}</h2>
          </div>
        </div>

        <form onSubmit={salvar}>
          <label>
            Nome do insumo
            <input
              type="text"
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
              placeholder="Ex.: Carne moída"
            />
          </label>

          <div className="form-row">
            <label>
              Unidade de medida
              <select
                value={unidadeMedida}
                onChange={(evento) => setUnidadeMedida(evento.target.value)}
              >
                <option value="un">Unidade (un)</option>
                <option value="kg">Quilo (kg)</option>
                <option value="g">Grama (g)</option>
                <option value="L">Litro (L)</option>
                <option value="ml">Mililitro (ml)</option>
                <option value="pct">Pacote (pct)</option>
                <option value="cx">Caixa (cx)</option>
              </select>
            </label>

            {!editandoId && (
              <label>
                Estoque inicial
                <input
                  type="text"
                  value={estoqueInicial}
                  onChange={(evento) =>
                    setEstoqueInicial(evento.target.value)
                  }
                  placeholder="0"
                />
              </label>
            )}
          </div>

          <div className="form-row">
            <label>
              Estoque mínimo (alerta)
              <input
                type="text"
                value={estoqueMinimo}
                onChange={(evento) => setEstoqueMinimo(evento.target.value)}
                placeholder="0"
              />
            </label>

            <label>
              Custo por {unidadeMedida} (opcional, pra Ficha Técnica)
              <CampoValor value={custoUnitario} onChange={setCustoUnitario} />
            </label>
          </div>

          <div className="form-row">
            <label>
              Unidade de compra (opcional)
              <input
                type="text"
                value={unidadeCompra}
                onChange={(evento) => setUnidadeCompra(evento.target.value)}
                placeholder="Ex.: Fardo, Caixa"
              />
            </label>

            <label>
              Quantas {unidadeMedida} tem 1 {unidadeCompra || "unidade de compra"}?
              <input
                type="text"
                value={fatorConversao}
                onChange={(evento) => setFatorConversao(evento.target.value)}
                placeholder="Ex.: 12"
                disabled={!unidadeCompra.trim()}
              />
            </label>
          </div>

          <div className="form-row">
            {vePermissaoTotal && (
              <label>
                Loja
                <select
                  value={lojaId}
                  onChange={(evento) => setLojaId(evento.target.value)}
                >
                  <option value="">Selecione</option>
                  {lojas.map((loja) => (
                    <option key={loja.id} value={loja.id}>
                      {loja.nome}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

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
                : "Cadastrar insumo"}
            </button>
          </div>
        </form>
      </article>

      <article className="panel categoria-lista-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Cadastros</span>
            <h2>Insumos em estoque</h2>
          </div>

          <strong>{insumosFiltrados.length}</strong>
        </div>

        {vePermissaoTotal && (
          <label style={{ marginBottom: 14 }}>
            Filtrar por loja
            <select
              value={lojaFiltro}
              onChange={(evento) => setLojaFiltro(evento.target.value)}
            >
              <option value="todas">Todas as lojas</option>
              {lojas.map((loja) => (
                <option key={loja.id} value={loja.id}>
                  {loja.nome}
                </option>
              ))}
            </select>
          </label>
        )}

        {carregando && <p>Carregando...</p>}

        {!carregando && insumosFiltrados.length === 0 ? (
          <div className="empty-state">Nenhum insumo cadastrado.</div>
        ) : (
          <div className="categorias-lista">
            {insumosFiltrados.map((insumo) => {
              const abaixoDoMinimo =
                Number(insumo.estoque_atual) <=
                Number(insumo.estoque_minimo || 0);

              return (
                <div className="categoria-item" key={insumo.id}>
                  <div className="categoria-identificacao">
                    <div className="categoria-icone">🧂</div>

                    <div>
                      <strong>
                        {insumo.nome}
                        {abaixoDoMinimo && (
                          <span className="badge-status badge-status-pendente">
                            ⚠️ Estoque baixo
                          </span>
                        )}
                      </strong>
                      <span>
                        {Number(insumo.estoque_atual).toLocaleString(
                          "pt-BR"
                        )}{" "}
                        {insumo.unidade_medida} em estoque
                        {Number(insumo.custo_unitario) > 0 && (
                          <>
                            {" — "}
                            {Number(insumo.custo_unitario).toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            })}
                            /{insumo.unidade_medida}
                          </>
                        )}
                      </span>
                      <span>
                        🏬{" "}
                        {lojas.find((loja) => loja.id === insumo.loja_id)
                          ?.nome || "Sem loja"}
                      </span>
                    </div>
                  </div>

                  <div className="transaction-actions">
                    <button
                      type="button"
                      className="approve-button"
                      disabled={movimentandoId === insumo.id}
                      onClick={() => movimentar(insumo, "entrada")}
                    >
                      ➕ Entrada
                    </button>

                    <button
                      type="button"
                      className="reject-button"
                      disabled={movimentandoId === insumo.id}
                      onClick={() => movimentar(insumo, "saida")}
                    >
                      ➖ Saída
                    </button>

                    <button
                      type="button"
                      className="edit-button"
                      onClick={() => iniciarEdicao(insumo)}
                    >
                      Editar
                    </button>

                    <button
                      type="button"
                      className="delete-button"
                      onClick={() => confirmarExclusao(insumo)}
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

export default CadastroInsumos;
