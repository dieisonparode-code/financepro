import { useState } from "react";
import CampoValor, { paraNumero } from "./CampoValor";

// Pedido do usuário (21/08/2026): Ficha Técnica — CMV real por prato,
// somando quantidade × custo unitário de cada insumo usado. Reaproveita
// os Insumos que já existem na tela "Estoque" (CadastroInsumos.jsx) —
// aqui só monta a receita (quais insumos e quanto usa de cada), não
// cadastra insumo novo nem mexe em estoque (isso continua só na tela
// Estoque).
function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function FichaTecnica({
  insumos = [],
  fichas = [],
  carregandoFichas = false,
  lojas = [],
  lojaPadrao = null,
  adicionarFicha,
  editarFichaExistente,
  removerFicha,
}) {
  const [editandoFichaId, setEditandoFichaId] = useState(null);
  const [nomeProduto, setNomeProduto] = useState("");
  const [precoVenda, setPrecoVenda] = useState("");
  const [nomeItemSaipos, setNomeItemSaipos] = useState("");
  const [itensFicha, setItensFicha] = useState([]);
  const [salvandoFicha, setSalvandoFicha] = useState(false);

  const insumosComCusto = insumos.filter(
    (insumo) => Number(insumo.custo_unitario) > 0
  );
  const algunsInsumosSemCusto =
    insumos.length > 0 && insumosComCusto.length < insumos.length;

  function limparFormularioFicha() {
    setEditandoFichaId(null);
    setNomeProduto("");
    setPrecoVenda("");
    setNomeItemSaipos("");
    setItensFicha([]);
  }

  function adicionarLinhaItem() {
    setItensFicha((anterior) => [
      ...anterior,
      { insumo_id: "", quantidade: "" },
    ]);
  }

  function atualizarLinhaItem(indice, chave, valor) {
    setItensFicha((anterior) =>
      anterior.map((item, i) =>
        i === indice ? { ...item, [chave]: valor } : item
      )
    );
  }

  function removerLinhaItem(indice) {
    setItensFicha((anterior) => anterior.filter((_, i) => i !== indice));
  }

  const custoTotalFormulario = itensFicha.reduce((total, item) => {
    const insumo = insumos.find((i) => String(i.id) === String(item.insumo_id));
    if (!insumo) return total;
    return total + paraNumero(String(item.quantidade)) * Number(insumo.custo_unitario || 0);
  }, 0);

  async function salvarFicha(evento) {
    evento.preventDefault();

    if (!nomeProduto.trim()) {
      alert("Informe o nome do produto/prato.");
      return;
    }

    setSalvandoFicha(true);

    try {
      const dados = {
        nome_produto: nomeProduto.trim(),
        preco_venda: precoVenda === "" ? null : paraNumero(precoVenda),
        nome_item_saipos: nomeItemSaipos.trim(),
        loja_id: lojaPadrao || null,
        itens: itensFicha.map((item) => ({
          insumo_id: item.insumo_id,
          quantidade: paraNumero(String(item.quantidade)),
        })),
      };

      if (editandoFichaId) {
        await editarFichaExistente(editandoFichaId, dados);
      } else {
        await adicionarFicha(dados);
      }

      limparFormularioFicha();
    } catch (erro) {
      alert(erro.message || "Não foi possível salvar a ficha técnica.");
    } finally {
      setSalvandoFicha(false);
    }
  }

  function iniciarEdicaoFicha(ficha) {
    setEditandoFichaId(ficha.id);
    setNomeProduto(ficha.nome_produto);
    setPrecoVenda(
      ficha.preco_venda != null
        ? Number(ficha.preco_venda).toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        : ""
    );
    setNomeItemSaipos(ficha.nome_item_saipos || "");
    setItensFicha(
      (ficha.itens || []).map((item) => ({
        insumo_id: String(item.insumo_id),
        quantidade: Number(item.quantidade || 0).toLocaleString("pt-BR"),
      }))
    );
  }

  async function confirmarExclusaoFicha(ficha) {
    const confirmar = window.confirm(
      `Excluir a ficha técnica de "${ficha.nome_produto}"?`
    );

    if (!confirmar) return;

    try {
      await removerFicha(ficha.id);
    } catch (erro) {
      alert(erro.message || "Não foi possível excluir.");
    }
  }

  return (
    <section className="categorias-layout">
      <article className="panel categoria-form-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Fichas Técnicas</span>
            <h2>{editandoFichaId ? "Editar ficha" : "Nova ficha técnica"}</h2>
          </div>
        </div>

        <small className="foto-ajuda">
          Monte o prato com os insumos que ele usa e a quantidade de cada
          um — o custo total sai sozinho. Os insumos (e o custo de cada
          um) são cadastrados na aba <strong>Estoque</strong>.
          {algunsInsumosSemCusto && (
            <>
              {" "}⚠️ Alguns insumos ainda não têm custo por unidade
              cadastrado em Estoque — o custo da ficha vai sair menor que
              o real até isso ser preenchido lá.
            </>
          )}
        </small>

        <form onSubmit={salvarFicha}>
          <label>
            Nome do produto
            <input
              type="text"
              value={nomeProduto}
              onChange={(evento) => setNomeProduto(evento.target.value)}
              placeholder="Ex.: X-Salada"
            />
          </label>

          <div className="form-row">
            <label>
              Preço de venda (opcional, pra calcular CMV do prato)
              <CampoValor value={precoVenda} onChange={setPrecoVenda} />
            </label>

            <label>
              Nome exato na Saipos (opcional, uso futuro)
              <input
                type="text"
                value={nomeItemSaipos}
                onChange={(evento) => setNomeItemSaipos(evento.target.value)}
                placeholder="Ex.: X-SALADA"
              />
            </label>
          </div>

          <div>
            <span style={{ display: "block", marginBottom: 6 }}>
              Insumos usados
            </span>

            {itensFicha.map((item, indice) => (
              <div
                key={indice}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  marginBottom: 8,
                  flexWrap: "wrap",
                }}
              >
                <select
                  value={item.insumo_id}
                  onChange={(evento) =>
                    atualizarLinhaItem(indice, "insumo_id", evento.target.value)
                  }
                  style={{ maxWidth: 200 }}
                >
                  <option value="">Escolha o insumo...</option>
                  {insumos.map((insumo) => (
                    <option key={insumo.id} value={insumo.id}>
                      {insumo.nome} ({insumo.unidade_medida})
                    </option>
                  ))}
                </select>

                <CampoValor
                  value={item.quantidade}
                  onChange={(valor) =>
                    atualizarLinhaItem(indice, "quantidade", valor)
                  }
                  placeholder="Qtd"
                  style={{ maxWidth: 90 }}
                />

                <button
                  type="button"
                  className="delete-button"
                  onClick={() => removerLinhaItem(indice)}
                >
                  ✖️
                </button>
              </div>
            ))}

            <button
              type="button"
              className="secondary-button"
              onClick={adicionarLinhaItem}
              disabled={insumos.length === 0}
            >
              + Adicionar insumo
            </button>

            {insumos.length === 0 && (
              <small className="foto-ajuda" style={{ display: "block", marginTop: 6 }}>
                Nenhum insumo cadastrado ainda — cadastre primeiro na aba
                Estoque.
              </small>
            )}
          </div>

          <p style={{ marginTop: 12 }}>
            Custo total do prato:{" "}
            <strong>{formatarMoeda(custoTotalFormulario)}</strong>
            {precoVenda !== "" && paraNumero(precoVenda) > 0 && (
              <>
                {" — CMV: "}
                <strong>
                  {((custoTotalFormulario / paraNumero(precoVenda)) * 100).toFixed(1)}%
                </strong>
              </>
            )}
          </p>

          <div className="modal-actions">
            {editandoFichaId && (
              <button
                type="button"
                className="secondary-button"
                onClick={limparFormularioFicha}
                disabled={salvandoFicha}
              >
                Cancelar edição
              </button>
            )}

            <button
              type="submit"
              className="primary-button"
              disabled={salvandoFicha}
            >
              {salvandoFicha ? "Salvando..." : "Salvar ficha técnica"}
            </button>
          </div>
        </form>
      </article>

      <article className="panel categoria-lista-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Fichas Técnicas</span>
            <h2>Cadastradas</h2>
          </div>
          <strong>{fichas.length}</strong>
        </div>

        {carregandoFichas ? (
          <div className="empty-state">Carregando...</div>
        ) : fichas.length === 0 ? (
          <div className="empty-state">Nenhuma ficha técnica ainda.</div>
        ) : (
          <div className="categorias-lista">
            {fichas.map((ficha) => {
              const cmv =
                ficha.preco_venda > 0
                  ? (ficha.custo_total / ficha.preco_venda) * 100
                  : null;

              return (
                <div className="categoria-item" key={ficha.id}>
                  <div className="categoria-identificacao">
                    <div className="categoria-icone">📋</div>
                    <div>
                      <strong>{ficha.nome_produto}</strong>
                      <div>
                        Custo: {formatarMoeda(ficha.custo_total)}
                        {ficha.preco_venda > 0 && (
                          <>
                            {" — Venda: "}
                            {formatarMoeda(ficha.preco_venda)}
                            {" — CMV: "}
                            <strong
                              style={{
                                color:
                                  cmv <= 35
                                    ? "#18c754"
                                    : cmv <= 40
                                    ? "#ff9800"
                                    : "#ff3545",
                              }}
                            >
                              {cmv.toFixed(1)}%
                            </strong>
                          </>
                        )}
                      </div>
                      <small style={{ color: "#9fb0c4" }}>
                        {(ficha.itens || [])
                          .map(
                            (item) =>
                              `${Number(item.quantidade).toLocaleString("pt-BR")} ${item.insumos?.nome || "?"}`
                          )
                          .join(", ")}
                      </small>
                    </div>
                  </div>

                  <div className="transaction-actions">
                    <button
                      type="button"
                      className="edit-button"
                      onClick={() => iniciarEdicaoFicha(ficha)}
                    >
                      Editar
                    </button>

                    <button
                      type="button"
                      className="delete-button"
                      onClick={() => confirmarExclusaoFicha(ficha)}
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

export default FichaTecnica;
