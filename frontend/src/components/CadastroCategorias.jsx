import { useState } from "react";

function CadastroCategorias({
  categorias = [],
  adicionarCategoria,
  editarCategoria,
  excluirCategoria,
}) {
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState("#2563eb");
  const [icone, setIcone] = useState("📁");
  const [editandoId, setEditandoId] = useState(null);

  function limparFormulario() {
    setNome("");
    setCor("#2563eb");
    setIcone("📁");
    setEditandoId(null);
  }

  function salvar(evento) {
    evento.preventDefault();

    const nomeLimpo = nome.trim();

    if (!nomeLimpo) {
      alert("Informe o nome da categoria.");
      return;
    }

    if (editandoId) {
      editarCategoria(editandoId, {
        nome: nomeLimpo,
        cor,
        icone,
      });
    } else {
      adicionarCategoria({
        nome: nomeLimpo,
        cor,
        icone,
      });
    }

    limparFormulario();
  }

  function iniciarEdicao(categoria) {
    setEditandoId(categoria.id);
    setNome(categoria.nome);
    setCor(categoria.cor || "#2563eb");
    setIcone(categoria.icone || "📁");
  }

  function confirmarExclusao(categoria) {
    const confirmar = window.confirm(
      `Deseja excluir a categoria "${categoria.nome}"?`
    );

    if (!confirmar) {
      return;
    }

    excluirCategoria(categoria.id);

    if (editandoId === categoria.id) {
      limparFormulario();
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

            <h2>
              {editandoId ? "Editar categoria" : "Nova categoria"}
            </h2>
          </div>
        </div>

        <form onSubmit={salvar}>
          <label>
            Nome da categoria
            <input
              type="text"
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
              placeholder="Ex.: Embalagens"
            />
          </label>

          <div className="form-row">
            <label>
              Cor
              <input
                className="categoria-color-input"
                type="color"
                value={cor}
                onChange={(evento) => setCor(evento.target.value)}
              />
            </label>

            <label>
              Ícone
              <input
                type="text"
                value={icone}
                onChange={(evento) => setIcone(evento.target.value)}
                placeholder="📁"
                maxLength="4"
              />
            </label>
          </div>

          <div className="modal-actions">
            {editandoId && (
              <button
                type="button"
                className="secondary-button"
                onClick={limparFormulario}
              >
                Cancelar edição
              </button>
            )}

            <button type="submit" className="primary-button">
              {editandoId
                ? "Salvar alterações"
                : "Cadastrar categoria"}
            </button>
          </div>
        </form>
      </article>

      <article className="panel categoria-lista-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Cadastros</span>
            <h2>Categorias cadastradas</h2>
          </div>

          <strong>{categorias.length}</strong>
        </div>

        {categorias.length === 0 ? (
          <div className="empty-state">
            Nenhuma categoria cadastrada.
          </div>
        ) : (
          <div className="categorias-lista">
            {categorias.map((categoria) => (
              <div className="categoria-item" key={categoria.id}>
                <div className="categoria-identificacao">
                  <div
                    className="categoria-icone"
                    style={{
                      backgroundColor: categoria.cor || "#2563eb",
                    }}
                  >
                    {categoria.icone || "📁"}
                  </div>

                  <div>
                    <strong>{categoria.nome}</strong>

                 
                  </div>
                </div>

                <div className="transaction-actions">
                  <button
                    type="button"
                    className="edit-button"
                    onClick={() => iniciarEdicao(categoria)}
                  >
                    Editar
                  </button>

                  <button
                    type="button"
                    className="delete-button"
                    onClick={() => confirmarExclusao(categoria)}
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

export default CadastroCategorias;