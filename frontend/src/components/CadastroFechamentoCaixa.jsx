import { useState } from "react";

const tiposFechamento = [
  {
    valor: "caixa",
    rotulo: "Fechamento de Caixa",
    icone: "📷",
    ajuda: "Se o comprovante for grande e precisar dobrar, tire quantas fotos precisar — cada foto é registrada separadamente.",
  },
  { valor: "boy", rotulo: "Diária Boy", icone: "🏍️" },
  { valor: "cozinha", rotulo: "Diária Cozinha", icone: "👨‍🍳" },
  {
    valor: "venda_prazo",
    rotulo: "Venda a Prazo Funcionário",
    icone: "🧾",
  },
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
  const [enviandoTipo, setEnviandoTipo] = useState(null);
  const [fotoVisualizada, setFotoVisualizada] = useState(null);
  const [carregandoFotoId, setCarregandoFotoId] = useState(null);

  async function capturarFoto(tipo, arquivo) {
    if (!arquivo) return;

    setEnviandoTipo(tipo);

    try {
      const fotoComprimida = await comprimirImagem(arquivo);
      await adicionarFechamento({ tipo, foto: fotoComprimida });
    } catch (erro) {
      console.error("Erro ao registrar foto:", erro);
      alert(erro.message || "Não foi possível registrar a foto.");
    } finally {
      setEnviandoTipo(null);
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
            <h2>Registrar foto</h2>
          </div>
        </div>

        <div className="fechamento-botoes">
          {tiposFechamento.map((item) => (
            <div key={item.valor} className="foto-upload">
              <span className="foto-upload-title">
                {item.icone} {item.rotulo}
              </span>

              <input
                id={`foto-fechamento-${item.valor}`}
                type="file"
                accept="image/*"
                capture="environment"
                disabled={enviandoTipo === item.valor}
                onChange={async (evento) => {
                  const arquivo = evento.target.files?.[0];
                  await capturarFoto(item.valor, arquivo);
                  evento.target.value = "";
                }}
              />

              <label
                htmlFor={`foto-fechamento-${item.valor}`}
                className="foto-button"
                style={
                  enviandoTipo === item.valor
                    ? { opacity: 0.6, pointerEvents: "none" }
                    : undefined
                }
              >
                {enviandoTipo === item.valor
                  ? "Salvando..."
                  : `📸 Tirar foto — ${item.rotulo}`}
              </label>

              {item.ajuda && <small className="foto-ajuda">{item.ajuda}</small>}
            </div>
          ))}
        </div>
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
                      <strong>{infoTipo?.rotulo || registro.tipo}</strong>
                      <div>{formatarDataHora(registro.criado_em)}</div>
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
                <h2>Foto arquivada</h2>
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
              alt="Foto arquivada"
              className="foto-modal-imagem"
            />
          </div>
        </div>
      )}
    </section>
  );
}

export default CadastroFechamentoCaixa;
