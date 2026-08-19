import { useState } from "react";

// Bug real encontrado (12/08/2026): a foto de um fechamento aparecia
// certa no celular (Redmi) mas foi salva de cabeça para baixo — o
// celular corrige a rotação (EXIF) só na hora de MOSTRAR a foto na
// galeria, mas o <img>+canvas usado aqui pra comprimir nem sempre
// respeita esse EXIF (varia por navegador/aparelho), gravando os pixels
// já errados. Isso explicava leituras erradas da IA que pareciam só
// "foto ruim". Corrigido usando createImageBitmap com
// imageOrientation:"from-image", que aplica a rotação certa de forma
// explícita; se o navegador não suportar, cai pro jeito antigo (o mesmo
// de sempre) como reserva.
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

// Bug real corrigido (19/08/2026): o valor do banco às vezes vem SEM
// indicar o fuso (sem "Z" no final) — é UTC de verdade, mas sem o "Z" o
// navegador tenta adivinhar o fuso sozinho e erra o horário. Força UTC no
// valor bruto antes de converter pro fuso de Brasília.
function formatarDataHora(dataIso) {
  if (!dataIso) return "";
  const jaTemFuso = /[Zz]|[+-]\d{2}:\d{2}$/.test(dataIso);
  return new Date(jaTemFuso ? dataIso : `${dataIso}Z`).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
}

function NotasFiscais({
  notas = [],
  carregando = false,
  lojas = [],
  lojaPadrao = null,
  adicionarNota,
  removerNota,
  buscarFoto,
}) {
  const [lojaId, setLojaId] = useState(lojaPadrao ? String(lojaPadrao) : "");
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [fotoVisualizada, setFotoVisualizada] = useState(null);
  const [carregandoFotoId, setCarregandoFotoId] = useState(null);

  async function anexar(arquivo) {
    if (!arquivo) return;

    setEnviando(true);

    try {
      const fotoComprimida = await comprimirImagem(arquivo);
      await adicionarNota({
        foto: fotoComprimida,
        loja_id: lojaId || null,
        observacao,
      });
      setObservacao("");
    } catch (erro) {
      console.error("Erro ao anexar nota fiscal:", erro);
      alert(erro.message || "Não foi possível anexar a nota fiscal.");
    } finally {
      setEnviando(false);
    }
  }

  async function verFoto(nota) {
    setCarregandoFotoId(nota.id);

    try {
      const resultado = await buscarFoto(nota.id);
      setFotoVisualizada(resultado?.foto || "");
    } catch (erro) {
      alert(erro.message || "Não foi possível carregar a foto.");
    } finally {
      setCarregandoFotoId(null);
    }
  }

  async function confirmarExclusao(nota) {
    const confirmar = window.confirm("Excluir essa nota fiscal arquivada?");

    if (!confirmar) return;

    try {
      await removerNota(nota.id);
    } catch (erro) {
      alert(erro.message || "Não foi possível excluir.");
    }
  }

  function nomeLoja(id) {
    return lojas.find((loja) => String(loja.id) === String(id))?.nome || "Sem loja";
  }

  return (
    <section className="categorias-layout">
      <article className="panel categoria-form-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Arquivo</span>
            <h2>Nota Fiscal</h2>
          </div>
        </div>

        {lojas.length > 0 && (
          <label>
            Loja
            <select value={lojaId} onChange={(evento) => setLojaId(evento.target.value)}>
              <option value="">Sem loja específica</option>
              {lojas.map((loja) => (
                <option key={loja.id} value={loja.id}>
                  {loja.nome}
                </option>
              ))}
            </select>
          </label>
        )}

        <label>
          Observação (opcional)
          <input
            type="text"
            value={observacao}
            onChange={(evento) => setObservacao(evento.target.value)}
            placeholder="Ex.: fornecedor, número da nota..."
          />
        </label>

        <div className="foto-upload">
          <span className="foto-upload-title">📄 Nota fiscal / comprovante</span>

          <input
            id="anexar-nota-fiscal"
            type="file"
            accept="image/*,.pdf"
            disabled={enviando}
            onChange={async (evento) => {
              const arquivo = evento.target.files?.[0];
              await anexar(arquivo);
              evento.target.value = "";
            }}
          />

          <label
            htmlFor="anexar-nota-fiscal"
            className="foto-button"
            style={enviando ? { opacity: 0.6, pointerEvents: "none" } : undefined}
          >
            {enviando ? "Salvando..." : "📎 Anexar / importar nota fiscal"}
          </label>

          <small className="foto-ajuda">
            Só pra arquivar — escolhe da câmera ou da galeria/arquivos, sem
            criar nenhuma despesa sozinho.
          </small>
        </div>
      </article>

      <article className="panel categoria-lista-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Arquivadas</span>
            <h2>Notas Fiscais</h2>
          </div>

          <strong>{notas.length}</strong>
        </div>

        {carregando ? (
          <div className="empty-state">Carregando...</div>
        ) : notas.length === 0 ? (
          <div className="empty-state">Nenhuma nota fiscal anexada ainda.</div>
        ) : (
          <div className="categorias-lista">
            {notas.map((nota) => (
              <div className="categoria-item" key={nota.id}>
                <div className="categoria-identificacao">
                  <div className="categoria-icone">📄</div>

                  <div>
                    <strong>{nota.observacao || "Nota fiscal"}</strong>
                    <div>
                      🏬 {nomeLoja(nota.loja_id)} — {formatarDataHora(nota.criado_em)}
                    </div>
                  </div>
                </div>

                <div className="transaction-actions">
                  <button
                    type="button"
                    className="edit-button"
                    disabled={carregandoFotoId === nota.id}
                    onClick={() => verFoto(nota)}
                  >
                    {carregandoFotoId === nota.id ? "Carregando..." : "Ver foto"}
                  </button>

                  <button
                    type="button"
                    className="delete-button"
                    onClick={() => confirmarExclusao(nota)}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            ))}
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
                <span className="eyebrow">Nota Fiscal</span>
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

            <img src={fotoVisualizada} alt="Nota fiscal" className="foto-modal-imagem" />
          </div>
        </div>
      )}
    </section>
  );
}

export default NotasFiscais;
