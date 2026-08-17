import { useState } from "react";

// Opções de classificação manual — mesma lista de palavras-código que o
// robô do WhatsApp já tenta reconhecer sozinho na legenda. Isso só
// aparece quando ele NÃO conseguiu reconhecer (legenda errada/vazia).
const OPCOES_CLASSIFICACAO = [
  { valor: "boy", rotulo: "🏍️ Diária Boy", destino: "fechamento" },
  { valor: "cozinha", rotulo: "👨‍🍳 Diária Cozinha", destino: "fechamento" },
  { valor: "Vale", rotulo: "💰 Despesa — Vale", destino: "despesa" },
  { valor: "Reforma", rotulo: "🔨 Despesa — Reforma", destino: "despesa" },
  { valor: "Compras", rotulo: "🛒 Despesa — Compras", destino: "despesa" },
  {
    valor: "Matéria-Prima",
    rotulo: "🥩 Despesa — Matéria-Prima",
    destino: "despesa",
  },
];

function formatarDataHora(dataIso) {
  if (!dataIso) return "";
  return new Date(dataIso).toLocaleString("pt-BR");
}

function hojeISO() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
}

function WhatsAppFila({
  itens = [],
  carregando = false,
  lojas = [],
  lojaPadrao = null,
  criarFechamento,
  criarDespesa,
  removerItem,
}) {
  // Estado de edição por item (id → campos escolhidos), pra cada card da
  // fila poder ser preenchido/confirmado independente dos outros.
  const [edicoes, setEdicoes] = useState({});
  const [salvandoId, setSalvandoId] = useState(null);
  const [fotoVisualizada, setFotoVisualizada] = useState(null);

  function campoDoItem(id, chave, padrao = "") {
    return edicoes[id]?.[chave] ?? padrao;
  }

  function atualizarCampo(id, chave, valor) {
    setEdicoes((anterior) => ({
      ...anterior,
      [id]: { ...anterior[id], [chave]: valor },
    }));
  }

  function nomeLoja(id) {
    return (
      lojas.find((loja) => String(loja.id) === String(id))?.nome ||
      "Sem loja"
    );
  }

  async function confirmarClassificacao(item) {
    const tipoEscolhido = campoDoItem(item.id, "tipo", "");
    const opcao = OPCOES_CLASSIFICACAO.find((o) => o.valor === tipoEscolhido);

    if (!opcao) {
      alert("Escolhe o que essa foto é antes de confirmar.");
      return;
    }

    const valorTexto = campoDoItem(item.id, "valor", "");
    const valorNumero = valorTexto
      ? Number(String(valorTexto).replace(",", "."))
      : 0;
    const lojaEscolhida =
      campoDoItem(item.id, "loja_id", "") || item.loja_id || lojaPadrao || "";

    setSalvandoId(item.id);

    try {
      if (opcao.destino === "fechamento") {
        await criarFechamento({
          tipo: opcao.valor,
          foto: item.foto,
          loja_id: lojaEscolhida || null,
          valor: valorNumero || null,
          observacao: `Classificado a partir da fila do WhatsApp (legenda original: "${item.legenda_recebida || ""}").`,
        });
      } else {
        await criarDespesa({
          tipo: "despesa",
          descricao: opcao.valor,
          categoria: opcao.valor,
          fornecedor: campoDoItem(item.id, "fornecedor", ""),
          valor: valorNumero,
          data: hojeISO(),
          foto: item.foto,
          loja_id: lojaEscolhida || null,
          observacao: `Classificado a partir da fila do WhatsApp (legenda original: "${item.legenda_recebida || ""}").`,
        });
      }

      await removerItem(item.id);
    } catch (erro) {
      console.error("Erro ao classificar item da fila:", erro);
      alert(erro.message || "Não foi possível classificar essa foto.");
    } finally {
      setSalvandoId(null);
    }
  }

  async function descartar(item) {
    const confirmar = window.confirm(
      "Descartar essa foto sem lançar nada? Não tem como desfazer."
    );

    if (!confirmar) return;

    setSalvandoId(item.id);

    try {
      await removerItem(item.id);
    } catch (erro) {
      alert(erro.message || "Não foi possível descartar.");
    } finally {
      setSalvandoId(null);
    }
  }

  return (
    <section className="categorias-layout">
      <article className="panel categoria-lista-panel" style={{ gridColumn: "1 / -1" }}>
        <div className="panel-header">
          <div>
            <span className="eyebrow">WhatsApp</span>
            <h2>Fila pra classificar</h2>
          </div>

          <strong>{itens.length}</strong>
        </div>

        <small className="foto-ajuda">
          Fotos que chegaram no grupo do WhatsApp sem uma legenda
          reconhecida (ou sem legenda nenhuma) caem aqui. Escolhe o que
          cada uma é e confirma — some da fila e vira um lançamento de
          verdade no sistema.
        </small>

        {carregando ? (
          <div className="empty-state">Carregando...</div>
        ) : itens.length === 0 ? (
          <div className="empty-state">
            Nenhuma foto esperando classificação. 🎉
          </div>
        ) : (
          <div className="categorias-lista" style={{ marginTop: 12 }}>
            {itens.map((item) => {
              const tipoEscolhido = campoDoItem(item.id, "tipo", "");
              const opcao = OPCOES_CLASSIFICACAO.find(
                (o) => o.valor === tipoEscolhido
              );
              const salvandoEsse = salvandoId === item.id;

              return (
                <div
                  className="categoria-item"
                  key={item.id}
                  style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}
                >
                  <div
                    style={{ display: "flex", gap: 12, alignItems: "flex-start" }}
                  >
                    <button
                      type="button"
                      onClick={() => setFotoVisualizada(item.foto)}
                      style={{
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        width: 70,
                        height: 70,
                        flexShrink: 0,
                        borderRadius: 8,
                        overflow: "hidden",
                      }}
                    >
                      <img
                        src={item.foto}
                        alt="Foto recebida no WhatsApp"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    </button>

                    <div>
                      <strong>
                        {item.legenda_recebida
                          ? `Legenda recebida: "${item.legenda_recebida}"`
                          : "Sem legenda"}
                      </strong>
                      <div>
                        📱 {item.remetente || "Desconhecido"} — 🏬{" "}
                        {nomeLoja(item.loja_id)} —{" "}
                        {formatarDataHora(item.criado_em)}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <select
                      value={tipoEscolhido}
                      disabled={salvandoEsse}
                      onChange={(evento) =>
                        atualizarCampo(item.id, "tipo", evento.target.value)
                      }
                      style={{ maxWidth: 220 }}
                    >
                      <option value="">O que é essa foto?</option>
                      {OPCOES_CLASSIFICACAO.map((opcaoItem) => (
                        <option key={opcaoItem.valor} value={opcaoItem.valor}>
                          {opcaoItem.rotulo}
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Valor (R$)"
                      disabled={salvandoEsse}
                      value={campoDoItem(item.id, "valor", "")}
                      onChange={(evento) =>
                        atualizarCampo(item.id, "valor", evento.target.value)
                      }
                      style={{ maxWidth: 120 }}
                    />

                    {opcao?.destino === "despesa" && (
                      <input
                        type="text"
                        placeholder="Fornecedor (opcional)"
                        disabled={salvandoEsse}
                        value={campoDoItem(item.id, "fornecedor", "")}
                        onChange={(evento) =>
                          atualizarCampo(item.id, "fornecedor", evento.target.value)
                        }
                        style={{ maxWidth: 180 }}
                      />
                    )}

                    {lojas.length > 0 && (
                      <select
                        value={campoDoItem(item.id, "loja_id", item.loja_id || "")}
                        disabled={salvandoEsse}
                        onChange={(evento) =>
                          atualizarCampo(item.id, "loja_id", evento.target.value)
                        }
                        style={{ maxWidth: 160 }}
                      >
                        <option value="">Sem loja específica</option>
                        {lojas.map((loja) => (
                          <option key={loja.id} value={loja.id}>
                            {loja.nome}
                          </option>
                        ))}
                      </select>
                    )}

                    <button
                      type="button"
                      className="approve-button"
                      disabled={salvandoEsse}
                      onClick={() => confirmarClassificacao(item)}
                    >
                      {salvandoEsse ? "Salvando..." : "✅ Confirmar"}
                    </button>

                    <button
                      type="button"
                      className="delete-button"
                      disabled={salvandoEsse}
                      onClick={() => descartar(item)}
                    >
                      Descartar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </article>

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
                <span className="eyebrow">WhatsApp</span>
                <h2>Foto recebida</h2>
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
              alt="Foto recebida no WhatsApp"
              className="foto-modal-imagem"
            />
          </div>
        </div>
      )}
    </section>
  );
}

export default WhatsAppFila;
