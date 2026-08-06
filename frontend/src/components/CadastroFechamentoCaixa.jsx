import { useState } from "react";

const tiposFechamento = [
  { valor: "boy", rotulo: "Diária Motoboy", icone: "🏍️" },
  { valor: "funcionario", rotulo: "Diária Funcionário", icone: "👷" },
  { valor: "venda_prazo", rotulo: "Venda a Prazo (Funcionário)", icone: "🧾" },
];

function rotuloTipo(tipo) {
  return tiposFechamento.find((item) => item.valor === tipo) || null;
}

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

function formatarDataHora(dataIso) {
  if (!dataIso) return "";
  return new Date(dataIso).toLocaleString("pt-BR");
}

function CadastroFechamentoCaixa({
  registros = [],
  carregando = false,
  adicionarFechamento,
  removerFechamento,
  buscarFoto,
}) {
  const [tipo, setTipo] = useState("boy");
  const [nomePessoa, setNomePessoa] = useState("");
  const [valor, setValor] = useState("");
  const [observacao, setObservacao] = useState("");
  const [foto, setFoto] = useState("");
  const [processandoFoto, setProcessandoFoto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [fotoVisualizada, setFotoVisualizada] = useState(null);
  const [carregandoFotoId, setCarregandoFotoId] = useState(null);

  function limparFormulario() {
    setTipo("boy");
    setNomePessoa("");
    setValor("");
    setObservacao("");
    setFoto("");
  }

  async function salvar(evento) {
    evento.preventDefault();

    if (!foto) {
      alert("Anexe a foto do comprovante assinado antes de finalizar.");
      return;
    }

    setSalvando(true);

    try {
      await adicionarFechamento({
        tipo,
        nome_pessoa: nomePessoa,
        valor: valor === "" ? null : valor,
        observacao,
        foto,
      });

      limparFormulario();
    } catch (erro) {
      alert(erro.message || "Não foi possível salvar o registro.");
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarExclusao(registro) {
    const confirmar = window.confirm(
      "Deseja excluir este registro arquivado? Essa ação não pode ser desfeita."
    );

    if (!confirmar) return;

    try {
      await removerFechamento(registro.id);
    } catch (erro) {
      alert(erro.message || "Não foi possível excluir o registro.");
    }
  }

  async function verFoto(registro) {
    setCarregandoFotoId(registro.id);

    try {
      const resultado = await buscarFoto(registro.id);
      setFotoVisualizada(resultado?.foto || "");
    } catch (erro) {
      alert(erro.message || "Não foi possível carregar a foto.");
    } finally {
      setCarregandoFotoId(null);
    }
  }

  return (
    <section className="categorias-layout">
      <article className="panel categoria-form-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Arquivo de comprovantes</span>
            <h2>Novo registro</h2>
          </div>
        </div>

        <form onSubmit={salvar}>
          <label>
            Tipo
            <select
              value={tipo}
              onChange={(evento) => setTipo(evento.target.value)}
            >
              {tiposFechamento.map((item) => (
                <option key={item.valor} value={item.valor}>
                  {item.icone} {item.rotulo}
                </option>
              ))}
            </select>
          </label>

          <label>
            Nome da pessoa
            <input
              type="text"
              value={nomePessoa}
              onChange={(evento) => setNomePessoa(evento.target.value)}
              placeholder="Ex.: João"
            />
          </label>

          <label>
            Valor (opcional)
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
              ✍️ Foto do recibo assinado
            </span>

            <input
              id="foto-fechamento-caixa"
              type="file"
              accept="image/*"
              capture="environment"
              disabled={processandoFoto}
              onChange={async (evento) => {
                const arquivo = evento.target.files?.[0];

                if (!arquivo) return;

                setProcessandoFoto(true);

                try {
                  const fotoComprimida = await comprimirImagem(arquivo);
                  setFoto(fotoComprimida);
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
              htmlFor="foto-fechamento-caixa"
              className="foto-button"
              style={
                processandoFoto
                  ? { opacity: 0.6, pointerEvents: "none" }
                  : undefined
              }
            >
              {processandoFoto
                ? "Processando foto..."
                : "📷 Tirar foto do recibo"}
            </label>

            <small className="foto-ajuda">
              Obrigatório — só é possível finalizar depois de anexar a foto.
            </small>
          </div>

          {foto && (
            <div className="foto-preview">
              <img src={foto} alt="Pré-visualização do recibo" />

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
            <button
              type="submit"
              className="primary-button"
              disabled={salvando || !foto}
            >
              {salvando ? "Salvando..." : "Arquivar registro"}
            </button>
          </div>
        </form>
      </article>

      <article className="panel categoria-lista-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Arquivado</span>
            <h2>Fechamento de Caixa</h2>
          </div>

          <strong>{registros.length}</strong>
        </div>

        {carregando ? (
          <div className="empty-state">Carregando...</div>
        ) : registros.length === 0 ? (
          <div className="empty-state">
            Nenhum registro arquivado ainda.
          </div>
        ) : (
          <div className="categorias-lista">
            {registros.map((registro) => {
              const infoTipo = rotuloTipo(registro.tipo);

              return (
                <div className="categoria-item" key={registro.id}>
                  <div className="categoria-identificacao">
                    <div className="categoria-icone">
                      {infoTipo?.icone || "🗂️"}
                    </div>

                    <div>
                      <strong>
                        {infoTipo?.rotulo || registro.tipo}
                        {registro.nome_pessoa
                          ? ` — ${registro.nome_pessoa}`
                          : ""}
                      </strong>

                      <div>
                        {registro.valor
                          ? `R$ ${Number(registro.valor).toFixed(2)} · `
                          : ""}
                        {formatarDataHora(registro.criado_em)}
                      </div>

                      {registro.observacao && (
                        <div>{registro.observacao}</div>
                      )}
                    </div>
                  </div>

                  <div className="transaction-actions">
                    <button
                      type="button"
                      className="edit-button"
                      disabled={carregandoFotoId === registro.id}
                      onClick={() => verFoto(registro)}
                    >
                      {carregandoFotoId === registro.id
                        ? "Carregando..."
                        : "Ver foto"}
                    </button>

                    <button
                      type="button"
                      className="delete-button"
                      onClick={() => confirmarExclusao(registro)}
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
                <span className="eyebrow">Comprovante</span>
                <h2>Foto do recibo</h2>
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
              alt="Foto do recibo"
              className="foto-modal-imagem"
            />
          </div>
        </div>
      )}
    </section>
  );
}

export default CadastroFechamentoCaixa;
