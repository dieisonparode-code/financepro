import { useState } from "react";
import CampoValor, { paraNumero } from "./CampoValor";

// Mesma compressão usada em Notas Fiscais/Contas a Pagar — sem forçar
// orientação (uma nota de fornecedor pode vir em pé ou deitada).
function comprimirImagem(arquivo, larguraMaxima = 1400, qualidade = 0.75) {
  function comImageElement(resolve, reject) {
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
  }

  return new Promise((resolve, reject) => {
    if (typeof createImageBitmap !== "function") {
      comImageElement(resolve, reject);
      return;
    }

    createImageBitmap(arquivo, { imageOrientation: "from-image" })
      .then((bitmap) => {
        const escala = Math.min(1, larguraMaxima / bitmap.width);
        const largura = Math.round(bitmap.width * escala);
        const altura = Math.round(bitmap.height * escala);

        const canvas = document.createElement("canvas");
        canvas.width = largura;
        canvas.height = altura;

        const contexto = canvas.getContext("2d");
        contexto.drawImage(bitmap, 0, 0, largura, altura);

        resolve(canvas.toDataURL("image/jpeg", qualidade));
      })
      .catch(() => comImageElement(resolve, reject));
  });
}

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
  lerNotaFiscal,
  atualizarCustosPorCompra,
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
  // Pedido do usuário (21/08/2026): cadastrar o mesmo insumo em todas as
  // lojas de uma vez, em vez de repetir o cadastro uma por uma. Só faz
  // sentido pra insumo NOVO (editar é sempre de um registro específico).
  const [paraTodasAsLojas, setParaTodasAsLojas] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const [lojaFiltro, setLojaFiltro] = useState(lojaFixaId || "todas");
  const [movimentandoId, setMovimentandoId] = useState(null);

  // Pedido do usuário (23/08/2026): "mandei a foto de 10kg mussarela na
  // nota, fala o kg, aí já ajusta sozinho" — a foto não fica salva em
  // lugar nenhum, só é usada pra ler o valor e a quantidade e calcular o
  // custo unitário (mesmo motor da leitura de nota em Lançamentos) — só
  // preenche o insumo que ainda estiver com custo R$0,00.
  const [lendoNotaInsumo, setLendoNotaInsumo] = useState(false);

  async function lerNotaDeCompra(arquivo) {
    if (!arquivo || !lerNotaFiscal || !atualizarCustosPorCompra) return;

    const lojaAlvo = lojaFixaId || (lojaFiltro !== "todas" ? lojaFiltro : null);

    if (!lojaAlvo) {
      alert(
        "Escolha uma loja específica no filtro do topo antes de ler a nota (não dá pra saber em qual loja ajustar o custo com \"Todas as lojas\" selecionado)."
      );
      return;
    }

    setLendoNotaInsumo(true);

    try {
      const fotoComprimida = await comprimirImagem(arquivo);
      const resultado = await lerNotaFiscal(fotoComprimida);

      if (!resultado.itens || resultado.itens.length === 0) {
        alert(
          resultado.erro_leitura ||
            "Não identifiquei itens de compra nessa nota (parece não ter tabela de produto/quantidade/valor)."
        );
        return;
      }

      const resumo = await atualizarCustosPorCompra(lojaAlvo, resultado.itens);

      if (resumo.atualizados?.length > 0) {
        alert(
          `Custo unitário preenchido pra ${resumo.atualizados.length} insumo(s): ${resumo.atualizados
            .map((a) => `${a.nome} (R$${a.custo_unitario.toFixed(2)})`)
            .join(", ")}.` +
            (resumo.ja_tinham_custo?.length
              ? `\n\nJá tinham custo definido (não mexi): ${resumo.ja_tinham_custo.join(", ")}`
              : "") +
            (resumo.nao_encontrados?.length
              ? `\n\nNão encontrei no Estoque: ${resumo.nao_encontrados.join(", ")} — cadastre com esse nome se quiser que a próxima nota reconheça.`
              : "")
        );
      } else {
        alert(
          "Li a nota, mas nenhum insumo foi atualizado — " +
            (resumo.ja_tinham_custo?.length
              ? "os itens já tinham custo definido."
              : resumo.nao_encontrados?.length
              ? `não encontrei no Estoque: ${resumo.nao_encontrados.join(", ")}.`
              : "não bateu com nenhum insumo cadastrado.")
        );
      }
    } catch (erro) {
      alert(erro.message || "Não foi possível ler a nota.");
    } finally {
      setLendoNotaInsumo(false);
    }
  }

  function limparFormulario() {
    setNome("");
    setUnidadeMedida("un");
    setEstoqueInicial("");
    setEstoqueMinimo("0");
    setUnidadeCompra("");
    setFatorConversao("1");
    setCustoUnitario("");
    setLojaId(lojaFixaId || "");
    // Pedido do usuário (21/08/2026): fica marcado depois de salvar, pra
    // não precisar marcar de novo cadastrando vários insumos seguidos.
    setEditandoId(null);
  }

  async function salvar(evento) {
    evento.preventDefault();

    const nomeLimpo = nome.trim();

    if (!nomeLimpo) {
      alert("Informe o nome do insumo.");
      return;
    }

    if (!editandoId && !paraTodasAsLojas && !lojaId) {
      alert("Selecione a loja do insumo (ou marque \"Todas as lojas\").");
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
          loja_id: lojaId || null,
        });
      } else {
        // Pedido do usuário (22/08/2026): "todas as lojas" é UM registro
        // só (loja_id nulo) — não duplica por loja. Aparece em qualquer
        // loja que filtrar na lista, com um estoque único e
        // compartilhado (não é um estoque por loja nesse caso).
        await adicionarInsumo({
          nome: nomeLimpo,
          unidade_medida: unidadeMedida,
          estoque_atual: estoqueInicial || 0,
          estoque_minimo: estoqueMinimo || 0,
          unidade_compra: unidadeCompra.trim(),
          fator_conversao: fatorConversao || 1,
          custo_unitario: paraNumero(custoUnitario),
          loja_id: paraTodasAsLojas ? null : lojaId,
          todas_as_lojas: paraTodasAsLojas,
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
    setParaTodasAsLojas(!insumo.loja_id);
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

  // Pedido do usuário (22/08/2026): insumo "de todas as lojas" (loja_id
  // nulo) aparece SEMPRE, mesmo filtrando por uma loja específica —
  // ele não pertence só a uma, então some ao contrário do esperado se
  // fosse filtrado igual aos outros.
  const insumosFiltrados =
    lojaFiltro === "todas"
      ? insumos
      : insumos.filter(
          (insumo) =>
            insumo.loja_id == null ||
            String(insumo.loja_id) === String(lojaFiltro)
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

        {lerNotaFiscal && atualizarCustosPorCompra && (
          <div
            style={{
              margin: "0 0 16px",
              padding: "12px",
              border: "1px solid #2a2f3a",
              borderRadius: "8px",
            }}
          >
            <strong>📷 Ler nota de compra</strong>
            <div style={{ margin: "8px 0" }}>
              <label
                className="secondary-button"
                style={{
                  display: "inline-block",
                  cursor: lendoNotaInsumo ? "default" : "pointer",
                  opacity: lendoNotaInsumo ? 0.6 : 1,
                }}
              >
                {lendoNotaInsumo ? "Lendo nota..." : "📷 Escolher foto da nota"}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  disabled={lendoNotaInsumo}
                  onChange={(evento) => {
                    const arquivo = evento.target.files?.[0];
                    evento.target.value = "";
                    lerNotaDeCompra(arquivo);
                  }}
                />
              </label>
            </div>
            <small className="foto-ajuda" style={{ display: "block" }}>
              A foto não fica salva em lugar nenhum — só é usada pra ler
              quantidade e valor de cada item da nota, casar pelo nome com um
              insumo já cadastrado e calcular o custo unitário sozinho (só
              preenche quem ainda estiver R$0,00).
            </small>
          </div>
        )}

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

          {/* Pedido do usuário (22/08/2026): esses dois campos deixavam
              confuso — o segundo ficava travado até preencher o
              primeiro, sem nenhum aviso do porquê. Agora os dois ficam
              sempre liberados pra digitar, com uma explicação simples
              embaixo (esses dois campos só são opcionais mesmo — dá pra
              ignorar os dois se você compra sempre na mesma unidade que
              usa, ex: compra carne já em kg e usa em kg). */}
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
              />
            </label>
          </div>

          <small className="foto-ajuda">
            Só preenche esses dois se você COMPRA numa unidade diferente
            da que USA (ex: compra "Fardo" com 12 dentro, mas usa 1 por
            1). Se compra e usa igual (ex: compra carne em kg, usa em
            kg), pode deixar os dois em branco.
          </small>

          {vePermissaoTotal && !editandoId && (
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
                checked={paraTodasAsLojas}
                style={{ width: "auto" }}
                onChange={(evento) => {
                  setParaTodasAsLojas(evento.target.checked);
                  if (evento.target.checked) setLojaId("");
                }}
              />
              🌐 Todas as lojas (um cadastro só, aparece em qualquer loja)
            </label>
          )}

          {vePermissaoTotal && (!paraTodasAsLojas || editandoId) && (
            <div className="form-row">
              <label>
                Loja
                <select
                  value={lojaId}
                  onChange={(evento) => setLojaId(evento.target.value)}
                >
                  <option value="">
                    {editandoId ? "🌐 Todas as lojas" : "Selecione"}
                  </option>
                  {lojas.map((loja) => (
                    <option key={loja.id} value={loja.id}>
                      {loja.nome}
                    </option>
                  ))}
                </select>
              </label>
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
                        {insumo.loja_id == null
                          ? "🌐 Todas as lojas"
                          : `🏬 ${
                              lojas.find(
                                (loja) => String(loja.id) === String(insumo.loja_id)
                              )?.nome || "Sem loja"
                            }`}
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
