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
  {
    valor: "pago_dinheiro_caixa",
    rotulo: "Pago com dinheiro do caixa",
    icone: "💵",
    corVerde: true,
    semCapture: true,
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

// Fallback só usado se NUNCA houve nenhuma finalização ainda (ex.: recém
// publicado) — a partir da primeira finalização, o corte deixa de ser por
// horas e passa a ser só "depois da última finalização".
const OITO_HORAS_MS = 8 * 60 * 60 * 1000;

function CadastroFechamentoCaixa({
  registros = [],
  carregando = false,
  adicionarFechamento,
  removerFechamento,
  buscarFoto,
  finalizacoes = [],
  finalizarFechamento,
}) {
  const [enviandoTipo, setEnviandoTipo] = useState(null);
  const [fotoVisualizada, setFotoVisualizada] = useState(null);
  const [carregandoFotoId, setCarregandoFotoId] = useState(null);
  const [finalizando, setFinalizando] = useState(false);

  // Pedido do usuário: "caixa ainda não fechado não pode sumir" — enquanto
  // ninguém clicar em "Finalizar Fechamento de Caixa", nada some da lista,
  // mesmo passando da meia-noite.
  const ultimaFinalizacao = finalizacoes.length
    ? Math.max(
        ...finalizacoes.map((item) => new Date(item.criado_em).getTime())
      )
    : null;

  const registrosRecentes = registros.filter((registro) => {
    const criadoEm = new Date(registro.criado_em).getTime();

    if (ultimaFinalizacao != null) {
      return criadoEm > ultimaFinalizacao;
    }

    return Date.now() - criadoEm < OITO_HORAS_MS;
  });

  async function finalizarHandler() {
    const confirmar = window.confirm(
      "Finalizar o fechamento de caixa? Os registros de agora vão parar de aparecer aqui (continuam salvos — dá pra ver em Relatórios → Caixa)."
    );

    if (!confirmar) return;

    setFinalizando(true);

    try {
      await finalizarFechamento();
    } catch (erro) {
      console.error("Erro ao finalizar fechamento de caixa:", erro);
      alert(erro.message || "Não foi possível finalizar o fechamento de caixa.");
    } finally {
      setFinalizando(false);
    }
  }

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
                {...(item.semCapture ? {} : { capture: "environment" })}
                disabled={enviandoTipo === item.valor}
                onChange={async (evento) => {
                  const arquivo = evento.target.files?.[0];
                  await capturarFoto(item.valor, arquivo);
                  evento.target.value = "";
                }}
              />

              <label
                htmlFor={`foto-fechamento-${item.valor}`}
                className={
                  item.corVerde ? "foto-button foto-button-verde" : "foto-button"
                }
                style={
                  enviandoTipo === item.valor
                    ? { opacity: 0.6, pointerEvents: "none" }
                    : undefined
                }
              >
                {enviandoTipo === item.valor
                  ? "Salvando..."
                  : item.semCapture
                  ? `📷📎 Tirar foto ou adicionar arquivo — ${item.rotulo}`
                  : `📸 Tirar foto — ${item.rotulo}`}
              </label>

              {item.ajuda && <small className="foto-ajuda">{item.ajuda}</small>}
            </div>
          ))}

          <div className="foto-upload">
            <button
              type="button"
              className="foto-button foto-button-vermelho"
              disabled={finalizando || registrosRecentes.length === 0}
              onClick={finalizarHandler}
            >
              {finalizando
                ? "Finalizando..."
                : "🔴 Finalizar Fechamento de Caixa"}
            </button>

            <small className="foto-ajuda">
              Clique aqui só quando terminar de registrar tudo desse
              fechamento — depois disso, esses registros somem da lista
              abaixo (continuam salvos, dá pra ver em Relatórios → Caixa).
            </small>
          </div>
        </div>
      </article>

      <article className="panel categoria-lista-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Fechamento em aberto</span>
            <h2>Fechamento de Caixa</h2>
          </div>

          <strong>{registrosRecentes.length}</strong>
        </div>

        <small className="foto-ajuda">
          Fica tudo aqui até você clicar em "Finalizar Fechamento de
          Caixa" — não some com o tempo nem passando da meia-noite. Pra ver
          fechamentos já finalizados, use Relatórios → Caixa e escolha a
          data.
        </small>

        {carregando ? (
          <div className="empty-state">Carregando...</div>
        ) : registrosRecentes.length === 0 ? (
          <div className="empty-state">
            Nenhum registro em aberto no momento.
          </div>
        ) : (
          <div className="categorias-lista">
            {registrosRecentes.map((registro) => {
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
