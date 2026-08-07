import { useState } from "react";

const permissoesDisponiveis = [
  { valor: "financeiro", rotulo: "Financeiro (Receitas, Despesas, Fluxo, Relatórios)" },
  { valor: "estoque", rotulo: "Estoque / Insumos" },
  { valor: "fechamento_caixa", rotulo: "Fechamento de Caixa" },
  { valor: "aprovar_despesas", rotulo: "Aprovar Despesas" },
  { valor: "clientes", rotulo: "Clientes (CRM)" },
];

function CadastroUsuarios({
  usuarios = [],
  lojas = [],
  carregando = false,
  usuarioAtualId = null,
  adicionarUsuario,
  editarUsuario,
  removerUsuario,
}) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [perfil, setPerfil] = useState("gerente");
  const [lojaId, setLojaId] = useState("todas");
  const [permissoes, setPermissoes] = useState([]);
  const [editandoId, setEditandoId] = useState(null);
  const [salvando, setSalvando] = useState(false);

  function limparFormulario() {
    setNome("");
    setEmail("");
    setSenha("");
    setPerfil("gerente");
    setLojaId("todas");
    setPermissoes([]);
    setEditandoId(null);
  }

  function alternarPermissao(valor) {
    setPermissoes((anteriores) =>
      anteriores.includes(valor)
        ? anteriores.filter((item) => item !== valor)
        : [...anteriores, valor]
    );
  }

  async function salvar(evento) {
    evento.preventDefault();

    const nomeLimpo = nome.trim();

    if (!nomeLimpo) {
      alert("Informe o nome.");
      return;
    }

    if (!editandoId && (!email.trim() || !senha)) {
      alert("Informe e-mail e senha para o novo usuário.");
      return;
    }

    const lojaFinal = lojaId !== "todas" ? lojaId : null;

    setSalvando(true);

    try {
      if (editandoId) {
        await editarUsuario(editandoId, {
          nome: nomeLimpo,
          perfil,
          loja_id: lojaFinal,
          permissoes,
        });
      } else {
        await adicionarUsuario({
          nome: nomeLimpo,
          email: email.trim(),
          senha,
          perfil,
          loja_id: lojaFinal,
          permissoes,
        });
      }

      limparFormulario();
    } catch (erro) {
      console.error("Erro ao salvar usuário:", erro);
      alert(erro.message || "Não foi possível salvar o usuário.");
    } finally {
      setSalvando(false);
    }
  }

  function iniciarEdicao(usuarioItem) {
    setEditandoId(usuarioItem.user_id);
    setNome(usuarioItem.nome);
    setEmail(usuarioItem.email || "");
    setSenha("");
    setPerfil(usuarioItem.perfil);
    setLojaId(usuarioItem.loja_id || "todas");
    setPermissoes(usuarioItem.permissoes || []);
  }

  async function confirmarRemocao(usuarioItem) {
    const confirmar = window.confirm(
      `Remover o acesso de "${usuarioItem.nome}"? A pessoa não vai mais conseguir entrar no sistema.`
    );

    if (!confirmar) {
      return;
    }

    try {
      await removerUsuario(usuarioItem.user_id);

      if (editandoId === usuarioItem.user_id) {
        limparFormulario();
      }
    } catch (erro) {
      console.error("Erro ao remover usuário:", erro);
      alert(erro.message || "Não foi possível remover o acesso.");
    }
  }

  return (
    <section className="categorias-layout">
      <article className="panel categoria-form-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">
              {editandoId ? "Editar acesso" : "Novo acesso"}
            </span>

            <h2>{editandoId ? "Editar usuário" : "Novo usuário"}</h2>
          </div>
        </div>

        <form onSubmit={salvar}>
          <label>
            Nome
            <input
              type="text"
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
              placeholder="Ex.: Maria Silva"
            />
          </label>

          {!editandoId && (
            <>
              <label>
                E-mail
                <input
                  type="email"
                  value={email}
                  onChange={(evento) => setEmail(evento.target.value)}
                  placeholder="nome@exemplo.com"
                  autoComplete="off"
                />
              </label>

              <label>
                Senha provisória
                <input
                  type="text"
                  value={senha}
                  onChange={(evento) => setSenha(evento.target.value)}
                  placeholder="Defina uma senha para a pessoa"
                  autoComplete="off"
                />
              </label>
            </>
          )}

          <div className="form-row">
            <label>
              Perfil
              <select
                value={perfil}
                onChange={(evento) => setPerfil(evento.target.value)}
              >
                <option value="gerente">Gerente</option>
                <option value="administrador">Administrador</option>
              </select>
            </label>

            <label>
              Loja
              <select
                value={lojaId}
                onChange={(evento) => setLojaId(evento.target.value)}
              >
                <option value="todas">Todas as lojas</option>
                {lojas.map((loja) => (
                  <option key={loja.id} value={loja.id}>
                    {loja.nome}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {perfil === "gerente" && (
            <div className="permissoes-lista">
              <span>Permissões desse usuário</span>

              {permissoesDisponiveis.map((item) => (
                <label key={item.valor} className="permissao-item">
                  <input
                    type="checkbox"
                    checked={permissoes.includes(item.valor)}
                    onChange={() => alternarPermissao(item.valor)}
                  />
                  {item.rotulo}
                </label>
              ))}
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
                : "Criar usuário"}
            </button>
          </div>
        </form>
      </article>

      <article className="panel categoria-lista-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Cadastros</span>
            <h2>Usuários com acesso</h2>
          </div>

          <strong>{usuarios.length}</strong>
        </div>

        {carregando && <p>Carregando...</p>}

        {!carregando && usuarios.length === 0 ? (
          <div className="empty-state">Nenhum usuário cadastrado.</div>
        ) : (
          <div className="categorias-lista">
            {usuarios.map((usuarioItem) => (
              <div className="categoria-item" key={usuarioItem.user_id}>
                <div className="categoria-identificacao">
                  <div className="categoria-icone">
                    {usuarioItem.perfil === "administrador" ? "🛡️" : "👤"}
                  </div>

                  <div>
                    <strong>{usuarioItem.nome}</strong>
                    <span>{usuarioItem.email}</span>
                    <span>
                      {usuarioItem.perfil === "administrador"
                        ? "Administrador"
                        : "Gerente"}
                      {" — "}
                      {usuarioItem.loja_id
                        ? lojas.find(
                            (loja) => loja.id === usuarioItem.loja_id
                          )?.nome || "loja não encontrada"
                        : "Todas as lojas"}
                    </span>

                    {usuarioItem.perfil !== "administrador" && (
                      <span>
                        {usuarioItem.permissoes?.length
                          ? usuarioItem.permissoes
                              .map(
                                (valor) =>
                                  permissoesDisponiveis.find(
                                    (item) => item.valor === valor
                                  )?.rotulo || valor
                              )
                              .join(", ")
                          : "Sem permissões liberadas"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="transaction-actions">
                  <button
                    type="button"
                    className="edit-button"
                    onClick={() => iniciarEdicao(usuarioItem)}
                  >
                    Editar
                  </button>

                  {usuarioItem.user_id !== usuarioAtualId && (
                    <button
                      type="button"
                      className="delete-button"
                      onClick={() => confirmarRemocao(usuarioItem)}
                    >
                      Remover acesso
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

export default CadastroUsuarios;
