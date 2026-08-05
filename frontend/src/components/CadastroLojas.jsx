import { useState } from "react";

function CadastroLojas({
  lojas = [],
  carregando = false,
  adicionarLoja,
  editarLoja,
  excluirLoja,
}) {
  const [nome, setNome] = useState("");
  const [endereco, setEndereco] = useState("");
  const [editandoId, setEditandoId] = useState(null);
  const [salvando, setSalvando] = useState(false);

  function limparFormulario() {
    setNome("");
    setEndereco("");
    setEditandoId(null);
  }

  async function salvar(evento) {
    evento.preventDefault();

    const nomeLimpo = nome.trim();

    if (!nomeLimpo) {
      alert("Informe o nome da loja.");
      return;
    }

    setSalvando(true);

    try {
      if (editandoId) {
        await editarLoja(editandoId, {
          nome: nomeLimpo,
          endereco: endereco.trim(),
        });
      } else {
        await adicionarLoja({
          nome: nomeLimpo,
          endereco: endereco.trim(),
        });
      }

      limparFormulario();
    } catch (erro) {
      console.error("Erro ao salvar loja:", erro);
      alert(erro.message || "Não foi possível salvar a loja.");
    } finally {
      setSalvando(false);
    }
  }

  function iniciarEdicao(loja) {
    setEditandoId(loja.id);
    setNome(loja.nome);
    setEndereco(loja.endereco || "");
  }

  async function confirmarExclusao(loja) {
    const confirmar = window.confirm(
      `Deseja excluir a loja "${loja.nome}"?`
    );

    if (!confirmar) {
      return;
    }

    try {
      await excluirLoja(loja.id);

      if (editandoId === loja.id) {
        limparFormulario();
      }
    } catch (erro) {
      console.error("Erro ao excluir loja:", erro);
      alert(erro.message || "Não foi possível excluir a loja.");
    }
  }

  return (
    <section className="categorias-layout">
      <article className="panel categoria-form-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">
              {editandoId ? "Editar cadastro" : "Novo cadastro"}
            </span>

            <h2>{editandoId ? "Editar loja" : "Nova loja"}</h2>
          </div>
        </div>

        <form onSubmit={salvar}>
          <label>
            Nome da loja
            <input
              type="text"
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
              placeholder="Ex.: Loja Centro"
            />
          </label>

          <label>
            Endereço
            <input
              type="text"
              value={endereco}
              onChange={(evento) => setEndereco(evento.target.value)}
              placeholder="Ex.: Rua das Flores, 123"
            />
          </label>

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
                : "Cadastrar loja"}
            </button>
          </div>
        </form>
      </article>

      <article className="panel categoria-lista-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Cadastros</span>
            <h2>Lojas cadastradas</h2>
          </div>

          <strong>{lojas.length}</strong>
        </div>

        {carregando && <p>Carregando...</p>}

        {!carregando && lojas.length === 0 ? (
          <div className="empty-state">Nenhuma loja cadastrada.</div>
        ) : (
          <div className="categorias-lista">
            {lojas.map((loja) => (
              <div className="categoria-item" key={loja.id}>
                <div className="categoria-identificacao">
                  <div className="categoria-icone">🏬</div>

                  <div>
                    <strong>{loja.nome}</strong>
                    <span>{loja.endereco || "-"}</span>
                  </div>
                </div>

                <div className="transaction-actions">
                  <button
                    type="button"
                    className="edit-button"
                    onClick={() => iniciarEdicao(loja)}
                  >
                    Editar
                  </button>

                  <button
                    type="button"
                    className="delete-button"
                    onClick={() => confirmarExclusao(loja)}
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

export default CadastroLojas;
