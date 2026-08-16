import { useEffect, useState } from "react";

const tiposFechamento = [
  {
    chave: "caixa-1",
    valor: "caixa",
    rotulo: "Fechamento de Caixa — Foto 1",
    icone: "📷",
  },
  {
    chave: "caixa-2",
    valor: "caixa",
    rotulo: "Fechamento de Caixa — Foto 2",
    icone: "📷",
    ajuda: "Se o comprovante tiver mais partes (dobrou o papel, mais de 2 fotos), tire quantas precisar — cada foto é registrada separadamente.",
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
  // Pedido do usuário (16/08/2026): arquivar foto das comandas canceladas
  // do turno — só evidência/auditoria (prova de que o cancelamento foi
  // legítimo), igual ao padrão já usado em Notas Fiscais: NÃO lê valor
  // por IA, NÃO gera despesa/conta a pagar, é só anexar/guardar.
  {
    valor: "comandas_canceladas",
    rotulo: "Comandas Canceladas",
    icone: "🚫",
    semCapture: true,
    ajuda: "Foto de cada comanda cancelada do turno — pode tirar quantas precisar, cada uma vira um registro separado.",
  },
];

function rotuloTipo(tipo) {
  return tiposFechamento.find((item) => item.valor === tipo) || null;
}

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
//
// Pedido do usuário (13/08/2026): mesmo com o EXIF corrigido, às vezes a
// foto ainda sai "de lado" (deitada) — o comprovante de fechamento é
// sempre uma tira longa e estreita (bem mais alto que largo), então se o
// resultado vier deitado (mais largo que alto), gira 90° à força pra
// sempre sair em pé. Só faz isso aqui (Fechamento de Caixa) — não nos
// outros lugares que comprimem foto (Notas Fiscais, Contas a Pagar),
// porque lá a foto pode legitimamente ser paisagem.
function desenharForcandoEmPe(contexto, canvas, origem, largura, altura) {
  if (largura <= altura) {
    canvas.width = largura;
    canvas.height = altura;
    contexto.drawImage(origem, 0, 0, largura, altura);
    return;
  }

  // Deitada: o canvas fica com largura/altura trocadas, e o desenho gira
  // 90° (sentido horário) pra encaixar em pé.
  canvas.width = altura;
  canvas.height = largura;
  contexto.translate(altura, 0);
  contexto.rotate(Math.PI / 2);
  contexto.drawImage(origem, 0, 0, largura, altura);
}

function comprimirImagem(arquivo, larguraMaxima = 1000, qualidade = 0.6) {
  function comImageElement(resolve, reject) {
    const leitor = new FileReader();

    leitor.onload = () => {
      const imagem = new Image();

      imagem.onload = () => {
        const escala = Math.min(1, larguraMaxima / imagem.width);
        const largura = Math.round(imagem.width * escala);
        const altura = Math.round(imagem.height * escala);

        const canvas = document.createElement("canvas");
        const contexto = canvas.getContext("2d");
        desenharForcandoEmPe(contexto, canvas, imagem, largura, altura);

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
        const contexto = canvas.getContext("2d");
        desenharForcandoEmPe(contexto, canvas, bitmap, largura, altura);

        resolve(canvas.toDataURL("image/jpeg", qualidade));
      })
      .catch(() => comImageElement(resolve, reject));
  });
}

function formatarDataHora(dataIso) {
  if (!dataIso) return "";
  return new Date(dataIso).toLocaleString("pt-BR");
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

// Fallback só usado se NUNCA houve nenhuma finalização ainda (ex.: recém
// publicado) — a partir da primeira finalização, o corte deixa de ser por
// horas e passa a ser só "depois da última finalização".
const OITO_HORAS_MS = 8 * 60 * 60 * 1000;

// Teto de segurança: mesmo sem finalizar, depois de 3 dias o registro sai
// da lista "em aberto" sozinho (pedido do usuário) — pra não acumular pra
// sempre se alguém esquecer de clicar em Finalizar.
const TRES_DIAS_MS = 3 * 24 * 60 * 60 * 1000;

// Diárias (Boy/Cozinha) não salvam a foto direto — abrem um rascunho pra
// conferir/corrigir o valor lido por IA antes de confirmar (pedido do
// usuário: "as vezes foi pago parte em dinheiro e parte pix"). "Pago com
// dinheiro do caixa" (12/08/2026) usa o mesmo rascunho — é sempre 100% em
// dinheiro (sem a pergunta de dividir) e já entra direto em Contas Pagas
// quando o fechamento é finalizado.
const TIPOS_COM_VALOR_CONFERIDO = ["boy", "cozinha", "pago_dinheiro_caixa"];

function CadastroFechamentoCaixa({
  registros = [],
  carregando = false,
  adicionarFechamento,
  removerFechamento,
  buscarFoto,
  lerValorFoto,
  finalizacoes = [],
  finalizarFechamento,
  reabrirFechamento,
  lojaId = null,
  ehAdministrador = false,
  trocarFoto,
}) {
  const [enviandoTipo, setEnviandoTipo] = useState(null);
  const [fotoVisualizada, setFotoVisualizada] = useState(null);
  const [registroFotoVisualizada, setRegistroFotoVisualizada] =
    useState(null);
  const [trocandoFoto, setTrocandoFoto] = useState(false);
  const [carregandoFotoId, setCarregandoFotoId] = useState(null);
  const [finalizando, setFinalizando] = useState(false);
  const [reabrindo, setReabrindo] = useState(false);
  const [rascunhoDiaria, setRascunhoDiaria] = useState(null);
  // Pedido do usuário (12/08/2026): botão pra consultar o último caixa já
  // fechado (o lote que entrou na última "Finalizar Fechamento de Caixa")
  // — só pra ver, sem poder editar/excluir nada.
  const [mostrarUltimoCaixaFechado, setMostrarUltimoCaixaFechado] =
    useState(false);

  // Pedido do usuário: "caixa ainda não fechado não pode sumir" — enquanto
  // ninguém clicar em "Finalizar Fechamento de Caixa", nada some da lista,
  // mesmo passando da meia-noite.
  const ultimaFinalizacao = finalizacoes.length
    ? Math.max(
        ...finalizacoes.map((item) => new Date(item.criado_em).getTime())
      )
    : null;

  // Nunca mistura loja — só mostra o que é da loja selecionada no topo (ou
  // registros antigos sem loja gravada, que aparecem pra todas).
  const registrosDaLoja = lojaId
    ? registros.filter(
        (registro) =>
          !registro.loja_id || String(registro.loja_id) === String(lojaId)
      )
    : registros;

  const registrosRecentes = registrosDaLoja
    .filter((registro) => {
      const criadoEm = new Date(registro.criado_em).getTime();

      // Teto de 3 dias sempre vale, finalizado ou não.
      if (Date.now() - criadoEm >= TRES_DIAS_MS) {
        return false;
      }

      if (ultimaFinalizacao != null) {
        return criadoEm > ultimaFinalizacao;
      }

      return Date.now() - criadoEm < OITO_HORAS_MS;
    })
    // Ordem crescente por data — a mais antiga primeiro, descendo até a
    // mais recente (pedido do usuário).
    .sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));

  // Pedido do usuário (12/08/2026): "reabrir" o último caixa já fechado só
  // pra CONSULTA — é tudo que entrou entre a penúltima e a última
  // "Finalizar Fechamento de Caixa" (o lote que acabou de ser finalizado).
  const finalizacoesOrdenadas = [...finalizacoes].sort(
    (a, b) => new Date(b.criado_em) - new Date(a.criado_em)
  );
  const penultimaFinalizacao = finalizacoesOrdenadas[1]
    ? new Date(finalizacoesOrdenadas[1].criado_em).getTime()
    : null;
  const ultimaFinalizacaoRegistro = finalizacoesOrdenadas[0] || null;

  const registrosDoUltimoCaixaFechado =
    ultimaFinalizacao != null
      ? registrosDaLoja
          .filter((registro) => {
            const criadoEm = new Date(registro.criado_em).getTime();
            return (
              criadoEm <= ultimaFinalizacao &&
              (penultimaFinalizacao == null ||
                criadoEm > penultimaFinalizacao)
            );
          })
          .sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em))
      : [];

  // Pedido do usuário: assim que o operador tira a foto do Fechamento de
  // Caixa, ela já aparece em miniatura no topo — sem precisar clicar em
  // "Ver foto" (igual em tempo real ao que já acontece com a linha da
  // Diária Boy/Cozinha na lista).
  const [fotosCaixaAbertura, setFotosCaixaAbertura] = useState({});

  const registrosCaixaAbertos = registrosRecentes.filter(
    (registro) => registro.tipo === "caixa"
  );

  useEffect(() => {
    registrosCaixaAbertos.forEach((registro) => {
      if (fotosCaixaAbertura[registro.id] !== undefined) return;

      buscarFoto(registro.id)
        .then((resultado) => {
          setFotosCaixaAbertura((anteriores) => ({
            ...anteriores,
            [registro.id]: resultado?.foto || "",
          }));
        })
        .catch((erro) => {
          console.error("Erro ao carregar miniatura do fechamento:", erro);
        });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registrosCaixaAbertos.map((item) => item.id).join(",")]);

  async function finalizarHandler() {
    const confirmar = window.confirm(
      "Finalizar o fechamento de caixa? Os registros de agora vão parar de aparecer aqui (continuam salvos — dá pra ver em Relatórios → Caixa). As diárias vão pra Contas a Pagar (só o valor que ainda falta) e a parte já paga em dinheiro já dá baixa direto no saldo."
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

  async function capturarFoto(tipo, arquivo, chave = tipo) {
    if (!arquivo) return;

    if (!lojaId) {
      alert(
        "Selecione uma loja no seletor do topo da tela antes de registrar."
      );
      return;
    }

    if (TIPOS_COM_VALOR_CONFERIDO.includes(tipo)) {
      await capturarDiaria(tipo, arquivo);
      return;
    }

    setEnviandoTipo(chave);

    try {
      const fotoComprimida = await comprimirImagem(arquivo);
      await adicionarFechamento({
        tipo,
        foto: fotoComprimida,
        loja_id: lojaId,
      });
    } catch (erro) {
      console.error("Erro ao registrar foto:", erro);
      alert(erro.message || "Não foi possível registrar a foto.");
    } finally {
      setEnviandoTipo(null);
    }
  }

  async function capturarDiaria(tipo, arquivo) {
    setEnviandoTipo(tipo);

    let fotoComprimida;

    try {
      fotoComprimida = await comprimirImagem(arquivo);
    } catch (erro) {
      console.error("Erro ao processar foto:", erro);
      alert(erro.message || "Não foi possível processar a foto selecionada.");
      setEnviandoTipo(null);
      return;
    }

    // Mostra o rascunho já com a foto — a leitura do valor continua em
    // segundo plano, o operador não precisa esperar pra ver a foto.
    setRascunhoDiaria({
      tipo,
      foto: fotoComprimida,
      valor: "",
      // Por padrão nada foi pago em dinheiro ainda — se foi dividido
      // (parte em dinheiro, parte em Pix depois), o operador preenche.
      pagoDinheiro: "",
      // Só usado no tipo "pago_dinheiro_caixa" — o que foi pago (ex:
      // "Uber compras", "Diária extra Fulano").
      nomePessoa: "",
      lendo: true,
      avisoLeitura: "",
    });
    setEnviandoTipo(null);

    try {
      const resultado = await lerValorFoto(fotoComprimida);

      setRascunhoDiaria((anterior) =>
        anterior && anterior.foto === fotoComprimida
          ? {
              ...anterior,
              valor: resultado?.valor != null ? String(resultado.valor) : "",
              lendo: false,
              avisoLeitura:
                resultado?.valor == null
                  ? resultado?.erro_leitura ||
                    "Não consegui ler o valor dessa foto. Preencha manualmente."
                  : "",
            }
          : anterior
      );
    } catch (erroLeitura) {
      console.error("Erro ao ler valor da diária:", erroLeitura);

      setRascunhoDiaria((anterior) =>
        anterior && anterior.foto === fotoComprimida
          ? {
              ...anterior,
              lendo: false,
              avisoLeitura:
                erroLeitura.message ||
                "Não consegui ler o valor dessa foto. Preencha manualmente.",
            }
          : anterior
      );
    }
  }

  async function confirmarRascunhoDiaria() {
    if (!rascunhoDiaria) return;

    setRascunhoDiaria((anterior) => ({ ...anterior, salvando: true }));

    const ehPagoDinheiroCaixa = rascunhoDiaria.tipo === "pago_dinheiro_caixa";
    const valorNumerico =
      rascunhoDiaria.valor !== "" ? Number(rascunhoDiaria.valor) : null;

    try {
      await adicionarFechamento({
        tipo: rascunhoDiaria.tipo,
        foto: rascunhoDiaria.foto,
        loja_id: lojaId,
        valor: valorNumerico,
        // "Pago com dinheiro do caixa" é sempre 100% em dinheiro — não
        // pergunta a divisão, o valor todo já conta como pago na hora.
        valor_pago_dinheiro: ehPagoDinheiroCaixa
          ? valorNumerico || 0
          : rascunhoDiaria.pagoDinheiro !== ""
          ? Number(rascunhoDiaria.pagoDinheiro)
          : 0,
        nome_pessoa: ehPagoDinheiroCaixa ? rascunhoDiaria.nomePessoa : "",
      });

      setRascunhoDiaria(null);
    } catch (erro) {
      console.error("Erro ao salvar diária:", erro);
      alert(erro.message || "Não foi possível salvar.");
      setRascunhoDiaria((anterior) =>
        anterior ? { ...anterior, salvando: false } : anterior
      );
    }
  }

  function cancelarRascunhoDiaria() {
    setRascunhoDiaria(null);
  }

  // Divide o valor total em "já pago em dinheiro agora" (dá baixa direto
  // no saldo) e "a pagar" (o que ainda falta, ex.: no Pix do dia
  // seguinte) — pedido do usuário pra diária paga em duas partes.
  const valorDiariaNumerico = rascunhoDiaria
    ? Number(rascunhoDiaria.valor || 0)
    : 0;
  const pagoDinheiroNumerico = rascunhoDiaria
    ? Number(rascunhoDiaria.pagoDinheiro || 0)
    : 0;
  const aPagarNumerico = Math.max(
    0,
    valorDiariaNumerico - pagoDinheiroNumerico
  );

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
      setRegistroFotoVisualizada(registro);
    } catch (erro) {
      alert(erro.message || "Não foi possível carregar a foto.");
    } finally {
      setCarregandoFotoId(null);
    }
  }

  async function trocarFotoDoRegistro(arquivo) {
    if (!arquivo || !registroFotoVisualizada) return;

    setTrocandoFoto(true);

    try {
      const fotoComprimida = await comprimirImagem(arquivo);
      await trocarFoto(registroFotoVisualizada.id, fotoComprimida);
      setFotoVisualizada(fotoComprimida);
    } catch (erro) {
      alert(erro.message || "Não foi possível trocar a foto.");
    } finally {
      setTrocandoFoto(false);
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
          {tiposFechamento.map((item) => {
            const chave = item.chave || item.valor;

            return (
            <div key={chave} className="foto-upload">
              <span className="foto-upload-title">
                {item.icone} {item.rotulo}
              </span>

              <input
                id={`foto-fechamento-${chave}`}
                type="file"
                accept="image/*"
                {...(item.semCapture ? {} : { capture: "environment" })}
                disabled={enviandoTipo === chave}
                onChange={async (evento) => {
                  const arquivo = evento.target.files?.[0];
                  await capturarFoto(item.valor, arquivo, chave);
                  evento.target.value = "";
                }}
              />

              <label
                htmlFor={`foto-fechamento-${chave}`}
                className={
                  item.corVerde ? "foto-button foto-button-verde" : "foto-button"
                }
                style={
                  enviandoTipo === chave
                    ? { opacity: 0.6, pointerEvents: "none" }
                    : undefined
                }
              >
                {enviandoTipo === chave
                  ? "Salvando..."
                  : item.semCapture
                  ? `📷📎 Tirar foto ou adicionar arquivo — ${item.rotulo}`
                  : `📸 Tirar foto — ${item.rotulo}`}
              </label>

              {item.ajuda && <small className="foto-ajuda">{item.ajuda}</small>}
            </div>
            );
          })}

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

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {ultimaFinalizacao != null && (
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setMostrarUltimoCaixaFechado((anterior) => !anterior)
                }
              >
                👁️ {mostrarUltimoCaixaFechado
                  ? "Fechar consulta"
                  : "Ver último caixa fechado"}
              </button>
            )}

            <strong>{registrosRecentes.length}</strong>
          </div>
        </div>

        {mostrarUltimoCaixaFechado && (
          <div className="empty-state" style={{ marginBottom: 12 }}>
            <strong>👁️ Consulta — só pra ver, nada aqui pode ser editado ou excluído.</strong>

            {/* Pedido do usuário (16/08/2026): quando um lançamento saiu
            errado (ex: venda categorizada errado no PDV da Saipos) e o
            fechamento já foi finalizado, só admin consegue reabrir pra
            corrigir — some da lista "só-leitura" acima e volta pra
            "Fechamento em aberto", editável de novo. */}
            {ehAdministrador && ultimaFinalizacaoRegistro && (
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={reabrindo}
                  onClick={async () => {
                    setReabrindo(true);
                    try {
                      await reabrirFechamento?.(ultimaFinalizacaoRegistro.id);
                      setMostrarUltimoCaixaFechado(false);
                    } finally {
                      setReabrindo(false);
                    }
                  }}
                >
                  {reabrindo
                    ? "Reabrindo..."
                    : "🔓 Reabrir este fechamento pra corrigir (só admin)"}
                </button>
                <div>
                  <small className="foto-ajuda">
                    Volta esses registros pra "Fechamento em aberto" —
                    editáveis/excluíveis de novo — até você finalizar mais
                    uma vez.
                  </small>
                </div>
              </div>
            )}

            {registrosDoUltimoCaixaFechado.length === 0 ? (
              <div>Nenhum registro encontrado no último caixa fechado.</div>
            ) : (
              <div className="categorias-lista" style={{ marginTop: 10 }}>
                {registrosDoUltimoCaixaFechado.map((registro) => {
                  const infoTipo = rotuloTipo(registro.tipo);

                  return (
                    <div className="categoria-item" key={registro.id}>
                      <div className="categoria-identificacao">
                        <div className="categoria-icone">
                          {infoTipo?.icone || "🗂️"}
                        </div>

                        <div>
                          <strong>{infoTipo?.rotulo || registro.tipo}</strong>
                          {registro.valor != null && (
                            <span> · {formatarMoeda(registro.valor)}</span>
                          )}
                          {registro.nome_pessoa && (
                            <span> · {registro.nome_pessoa}</span>
                          )}
                          <div>{formatarDataHora(registro.criado_em)}</div>
                        </div>
                      </div>

                      {registro.tem_foto && (
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
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <small className="foto-ajuda">
          Fica aqui até você clicar em "Finalizar Fechamento de Caixa" (não
          some passando da meia-noite) — ou no máximo 3 dias, o que vier
          primeiro. Pra ver fechamentos mais antigos, use Relatórios →
          Caixa e escolha a data.
        </small>

        {registrosCaixaAbertos.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              margin: "12px 0",
            }}
          >
            {registrosCaixaAbertos.map((registro) => {
              const foto = fotosCaixaAbertura[registro.id];

              return (
                <button
                  key={registro.id}
                  type="button"
                  title={`Fechamento de Caixa — ${formatarDataHora(
                    registro.criado_em
                  )}`}
                  onClick={() => foto && setFotoVisualizada(foto)}
                  style={{
                    width: 90,
                    height: 90,
                    borderRadius: 8,
                    border: "none",
                    padding: 0,
                    overflow: "hidden",
                    cursor: foto ? "pointer" : "default",
                    background: "#0f172a",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  {foto ? (
                    <img
                      src={foto}
                      alt="Foto do fechamento de caixa"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <small className="foto-ajuda">Carregando...</small>
                  )}
                </button>
              );
            })}
          </div>
        )}

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

      {rascunhoDiaria && (
        <div
          className="modal-overlay"
          onMouseDown={(evento) => {
            if (
              evento.target === evento.currentTarget &&
              !rascunhoDiaria.salvando
            ) {
              cancelarRascunhoDiaria();
            }
          }}
        >
          <div className="modal modal-foto">
            <div className="modal-header">
              <div>
                <span className="eyebrow">
                  {rotuloTipo(rascunhoDiaria.tipo)?.rotulo || "Diária"}
                </span>
                <h2>Confirme o valor</h2>
              </div>
            </div>

            <img
              src={rascunhoDiaria.foto}
              alt="Foto da diária"
              className="foto-modal-imagem"
            />

            {rascunhoDiaria.tipo === "pago_dinheiro_caixa" && (
              <label>
                O que foi pago
                <input
                  type="text"
                  placeholder="Ex: Uber compras, Diária extra Fulano..."
                  value={rascunhoDiaria.nomePessoa}
                  disabled={rascunhoDiaria.salvando}
                  onChange={(evento) =>
                    setRascunhoDiaria((anterior) => ({
                      ...anterior,
                      nomePessoa: evento.target.value,
                    }))
                  }
                />
              </label>
            )}

            <label>
              Valor total do recibo
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder={
                  rascunhoDiaria.lendo ? "Lendo valor da foto..." : "0,00"
                }
                value={rascunhoDiaria.valor}
                disabled={rascunhoDiaria.lendo || rascunhoDiaria.salvando}
                onChange={(evento) =>
                  setRascunhoDiaria((anterior) => ({
                    ...anterior,
                    valor: evento.target.value,
                  }))
                }
              />
            </label>

            {rascunhoDiaria.lendo && (
              <small className="foto-ajuda">
                🤖 Lendo o valor automaticamente...
              </small>
            )}

            {rascunhoDiaria.avisoLeitura && (
              <div className="empty-state">
                ⚠️ {rascunhoDiaria.avisoLeitura}
              </div>
            )}

            {rascunhoDiaria.tipo === "pago_dinheiro_caixa" ? (
              <div style={{ margin: "8px 0 16px", color: "#22c55e", fontWeight: 700 }}>
                💰 Vai direto pra Contas Pagas — 100% pago em dinheiro do
                caixa, sem "a pagar".
              </div>
            ) : (
              <>
                <label>
                  💵 Pago em dinheiro agora (deixe 0,00 se nada foi pago em
                  dinheiro — vai tudo pra "a pagar")
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    value={rascunhoDiaria.pagoDinheiro}
                    disabled={rascunhoDiaria.salvando}
                    onChange={(evento) =>
                      setRascunhoDiaria((anterior) => ({
                        ...anterior,
                        pagoDinheiro: evento.target.value,
                      }))
                    }
                  />
                </label>

                <div style={{ margin: "8px 0 16px" }}>
                  <div style={{ color: "#22c55e", fontWeight: 700 }}>
                    💰 {formatarMoeda(pagoDinheiroNumerico)} pago em dinheiro
                  </div>
                  <div style={{ color: "#ef4444", fontWeight: 700 }}>
                    🔴 A pagar: {formatarMoeda(aPagarNumerico)}
                  </div>
                </div>
              </>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={rascunhoDiaria.salvando}
                onClick={cancelarRascunhoDiaria}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="primary-button"
                disabled={rascunhoDiaria.salvando}
                onClick={confirmarRascunhoDiaria}
              >
                {rascunhoDiaria.salvando ? "Salvando..." : "💾 Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {fotoVisualizada && (
        <div
          className="modal-overlay"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget) {
              setFotoVisualizada(null);
              setRegistroFotoVisualizada(null);
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
                onClick={() => {
                  setFotoVisualizada(null);
                  setRegistroFotoVisualizada(null);
                }}
              >
                ×
              </button>
            </div>

            <img
              src={fotoVisualizada}
              alt="Foto arquivada"
              className="foto-modal-imagem"
            />

            {ehAdministrador && (
              <div className="modal-actions">
                <input
                  id="trocar-foto-fechamento"
                  type="file"
                  accept="image/*"
                  disabled={trocandoFoto}
                  style={{ display: "none" }}
                  onChange={async (evento) => {
                    const arquivo = evento.target.files?.[0];
                    await trocarFotoDoRegistro(arquivo);
                    evento.target.value = "";
                  }}
                />

                <label
                  htmlFor="trocar-foto-fechamento"
                  className="secondary-button"
                  style={
                    trocandoFoto
                      ? { opacity: 0.6, pointerEvents: "none" }
                      : undefined
                  }
                >
                  {trocandoFoto ? "Trocando..." : "✏️ Editar (trocar foto)"}
                </label>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default CadastroFechamentoCaixa;
