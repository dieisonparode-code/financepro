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
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [raioMetros, setRaioMetros] = useState("200");
  const [saiposIdStore, setSaiposIdStore] = useState("");
  const [capturandoLocal, setCapturandoLocal] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [salvando, setSalvando] = useState(false);

  function limparFormulario() {
    setNome("");
    setEndereco("");
    setLatitude("");
    setLongitude("");
    setRaioMetros("200");
    setSaiposIdStore("");
    setEditandoId(null);
  }

  function usarLocalizacaoAtual() {
    if (!navigator.geolocation) {
      alert("Seu navegador não suporta geolocalização.");
      return;
    }

    setCapturandoLocal(true);

    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        setLatitude(String(posicao.coords.latitude));
        setLongitude(String(posicao.coords.longitude));
        setCapturandoLocal(false);
      },
      () => {
        alert(
          "Não foi possível capturar sua localização. Verifique se o navegador tem permissão de acesso."
        );
        setCapturandoLocal(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function salvar(evento) {
    evento.preventDefault();

    const nomeLimpo = nome.trim();

    if (!nomeLimpo) {
      alert("Informe o nome da loja.");
      return;
    }

    setSalvando(true);

    const dados = {
      nome: nomeLimpo,
      endereco: endereco.trim(),
      latitude: latitude ? Number(latitude) : null,
      longitude: longitude ? Number(longitude) : null,
      raio_metros: raioMetros ? Number(raioMetros) : 200,
      saipos_id_store: saiposIdStore ? Number(saiposIdStore) : null,
    };

    try {
      if (editandoId) {
        await editarLoja(editandoId, dados);
      } else {
        await adicionarLoja(dados);
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
    setLatitude(loja.latitude != null ? String(loja.latitude) : "");
    setLongitude(loja.longitude != null ? String(loja.longitude) : "");
    setRaioMetros(String(loja.raio_metros || 200));
    setSaiposIdStore(
      loja.saipos_id_store != null ? String(loja.saipos_id_store) : ""
    );
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

          <div className="foto-upload">
            <span className="foto-upload-title">
              📍 Localização da loja
            </span>

            <button
              type="button"
              className="foto-button"
              onClick={usarLocalizacaoAtual}
              disabled={capturandoLocal}
              style={
                capturandoLocal
                  ? { opacity: 0.6, pointerEvents: "none" }
                  : undefined
              }
            >
              {capturandoLocal
                ? "Capturando..."
                : "📍 Usar minha localização atual"}
            </button>

            <small className="foto-ajuda">
              Fique dentro da loja e toque nesse botão pra registrar a
              posição certa dela.
            </small>
          </div>

          {latitude && longitude && (
            <p className="foto-geo-status">
              📍 Localização definida ({Number(latitude).toFixed(5)},{" "}
              {Number(longitude).toFixed(5)})
            </p>
          )}

          <label>
            Raio de tolerância (metros)
            <input
              type="number"
              min="20"
              step="10"
              value={raioMetros}
              onChange={(evento) => setRaioMetros(evento.target.value)}
              placeholder="200"
            />
          </label>

          <label>
            ID da loja na Saipos (opcional)
            <input
              type="number"
              value={saiposIdStore}
              onChange={(evento) => setSaiposIdStore(evento.target.value)}
              placeholder="Ex.: 32136"
            />
          </label>

          <small className="foto-ajuda">
            Só preencha se essa loja usar a Saipos e você já tiver recebido o
            token de acesso à API de Dados. É o número que identifica essa
            loja lá dentro da Saipos — precisa dele pra puxar o fechamento de
            caixa automaticamente.
          </small>

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
                    <span>
                      {loja.latitude && loja.longitude
                        ? `📍 Localização definida — raio de ${
                            loja.raio_metros || 200
                          }m`
                        : "⚠️ Localização não definida"}
                    </span>
                    <span>
                      {loja.saipos_id_store
                        ? `🔗 Saipos conectada (ID ${loja.saipos_id_store})`
                        : "🔗 Saipos não conectada"}
                    </span>
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
