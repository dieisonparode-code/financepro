import { useState } from "react";
import { lerFotoContaPagar, anexarComprovantePagamento } from "../services/api";
import CampoValor, { paraNumero } from "./CampoValor";

// Mesma compressão já usada em Despesas/Conciliação — reduz o tamanho antes
// de guardar (a foto vira base64 direto na tabela, sem isso ficaria pesado).
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

function formatarData(data) {
  if (!data) return "Sem data";
  return new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR");
}

// Bug real corrigido (19/08/2026): o Supabase às vezes devolve o horário
// SEM indicar o fuso (ex: "2026-08-19T22:41:40", sem "Z" no final) — o
// valor gravado já é em UTC (padrão do Postgres), mas sem o "Z" o
// navegador tenta ADIVINHAR o fuso sozinho (usa o fuso dele) e erra o
// horário mostrado. Confirmado comparando com o horário real de um
// comprovante Pix: o sistema mostrava 3~4h a mais. Corrigido forçando UTC
// no valor bruto antes de converter pro fuso de Brasília.
function paraDataUtc(bruto) {
  if (!bruto) return null;
  const jaTemFuso = /[Zz]|[+-]\d{2}:\d{2}$/.test(bruto);
  const data = new Date(jaTemFuso ? bruto : `${bruto}Z`);
  return Number.isNaN(data.getTime()) ? null : data;
}

// Pedido do usuário (18/08/2026): mostrar não só a data, mas o horário
// exato em que a conta foi paga/lançada no sistema (nunca a data de uma
// nota/comprovante). `horarioIso` vem de `pago_em`/`created_at`.
function formatarDataHora(horarioIso, dataFallback) {
  if (!horarioIso) return formatarData(dataFallback);
  const data = paraDataUtc(horarioIso);
  if (!data) return formatarData(dataFallback);
  const dataFormatada = data.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
  const horaFormatada = data.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  return `${dataFormatada} às ${horaFormatada}`;
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function diasAte(data) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const alvo = new Date(`${data}T00:00:00`);

  return Math.round((alvo - hoje) / (1000 * 60 * 60 * 24));
}

// Pedido do usuário (12/08/2026): uma conta paga só fica visível por
// padrão em "Contas Pagas" até as 8h da manhã do dia seguinte ao
// pagamento — depois disso some da lista padrão (só volta se pesquisar
// pela data ou pelo nome). Mesmo espírito do "últimas 8h" já usado no
// Fechamento de Caixa.
function dataFormatada(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(data.getDate()).padStart(2, "0")}`;
}

function pagamentoDentroDaJanelaPadrao(dataPagamento) {
  if (!dataPagamento) return false;

  const agora = new Date();
  const hoje = dataFormatada(agora);

  if (dataPagamento === hoje) return true;

  // Antes das 8h, o pagamento de ontem ainda conta como "recente" — só
  // some da lista padrão quando passar das 8h da manhã seguinte.
  if (agora.getHours() < 8) {
    const ontem = new Date(agora);
    ontem.setDate(ontem.getDate() - 1);
    return dataPagamento === dataFormatada(ontem);
  }

  return false;
}

function situacaoConta(conta) {
  if (conta.status === "pago") {
    return { rotulo: "Pago", classe: "status-saudavel" };
  }

  const dias = diasAte(conta.data_vencimento);

  if (dias < 0) {
    return { rotulo: "Atrasado", classe: "status-critico" };
  }

  if (dias === 0) {
    return { rotulo: "Vence hoje", classe: "status-critico" };
  }

  if (dias <= 2) {
    return { rotulo: `Vence em ${dias} dia(s)`, classe: "status-atencao" };
  }

  return { rotulo: "Pendente", classe: "status-saudavel" };
}

function ContasPagar({
  contas = [],
  despesas = [],
  buscarFotoDespesa,
  carregando = false,
  adicionarConta,
  editarConta,
  marcarComoPaga,
  editarDataPagamento,
  removerConta,
  lojas = [],
  vePermissaoTotal = true,
  lojaPadrao = null,
  modo = "pendentes",
  aoConfirmarPagamento,
  ehAdministrador = false,
  removerDespesa,
}) {
  const [descricao, setDescricao] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [valor, setValor] = useState("");
  const [pix, setPix] = useState("");
  const [dataVencimento, setDataVencimento] = useState("");
  const [observacao, setObservacao] = useState("");
  const [lojaId, setLojaId] = useState(lojaPadrao ? String(lojaPadrao) : "");
  const [editandoId, setEditandoId] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [foto, setFoto] = useState("");
  const [processandoFoto, setProcessandoFoto] = useState(false);
  const [lendoFoto, setLendoFoto] = useState(false);
  const [fotoVisualizada, setFotoVisualizada] = useState(null);
  const [detalheVisualizado, setDetalheVisualizado] = useState(null);
  const [carregandoFotoDetalhe, setCarregandoFotoDetalhe] = useState(false);
  const [selecionadas, setSelecionadas] = useState([]);
  const [confirmandoPagamento, setConfirmandoPagamento] = useState(false);
  // Pedido do usuário (21/08/2026): "paguei essa conta com o saldo de
  // outra loja" — em vez de tela separada, é uma marcação aqui mesmo
  // na hora de confirmar o pagamento. Cria um Empréstimo entre Lojas
  // automático, vinculado a essa conta, sem precisar digitar nada à
  // parte.
  const [pagoComOutraLoja, setPagoComOutraLoja] = useState(false);
  const [lojaCredoraId, setLojaCredoraId] = useState("");
  const [busca, setBusca] = useState("");
  const [buscaData, setBuscaData] = useState("");
  const [salvandoValorId, setSalvandoValorId] = useState(null);
  // Pedido do usuário (24/08/2026): "como lança conta paga futura, isso
  // não existe" — antes o botão "Pagar" sempre usava a data de agora, sem
  // opção de escolher. Data escolhida aqui vale pra TODAS as contas
  // marcadas junto (mesmo lote); começa em hoje, igual já era o padrão.
  const [dataPagamentoEscolhida, setDataPagamentoEscolhida] = useState(
    dataFormatada(new Date())
  );
  const [editandoDataPagaId, setEditandoDataPagaId] = useState(null);
  const [novaDataPagaEmEdicao, setNovaDataPagaEmEdicao] = useState("");
  const [salvandoDataPagaId, setSalvandoDataPagaId] = useState(null);

  function limparFormulario() {
    setDescricao("");
    setFornecedor("");
    setValor("");
    setPix("");
    setDataVencimento("");
    setObservacao("");
    setLojaId(lojaPadrao ? String(lojaPadrao) : "");
    setEditandoId(null);
    setFoto("");
  }

  async function lerFotoAutomaticamente(fotoParaLer) {
    const fotoAlvo = fotoParaLer || foto;

    if (!fotoAlvo || lendoFoto) return;

    setLendoFoto(true);

    try {
      const resultado = await lerFotoContaPagar(fotoAlvo);

      if (resultado.valor == null) {
        alert(
          resultado.erro_leitura ||
            "Não consegui identificar o valor dessa foto. Preencha manualmente."
        );
        return;
      }

      // Pedido do usuário (20/08/2026): campo trocado pro CampoValor
      // (formato brasileiro, com vírgula e milhar) — preenche já nesse
      // formato, não mais com ponto decimal.
      setValor(
        Number(resultado.valor).toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      );

      if (resultado.fornecedor) {
        setFornecedor(resultado.fornecedor);
      }

      if (resultado.pix) {
        setPix(resultado.pix);
      }
    } catch (erro) {
      alert(erro.message || "Não foi possível ler a foto.");
    } finally {
      setLendoFoto(false);
    }
  }

  async function salvar(evento) {
    evento.preventDefault();

    if (!descricao.trim() || !dataVencimento) {
      alert("Informe a descrição e a data de vencimento.");
      return;
    }

    if (!lojaId) {
      alert(
        "Selecione uma loja no seletor do topo da tela antes de cadastrar."
      );
      return;
    }

    setSalvando(true);

    try {
      const dados = {
        descricao: descricao.trim(),
        fornecedor,
        // Pedido do usuário (20/08/2026): campo agora é o CampoValor
        // (formato brasileiro, com milhar) — precisa converter pra
        // Bug real corrigido (21/08/2026): "35.000" (sem vírgula) virava
        // 35 — usa o paraNumero() do CampoValor, que sempre tira o ponto
        // de milhar primeiro, tenha vírgula ou não.
        valor: paraNumero(valor),
        pix,
        data_vencimento: dataVencimento,
        observacao,
        loja_id: lojaId,
        foto,
      };

      if (editandoId) {
        await editarConta(editandoId, dados);
      } else {
        await adicionarConta(dados);
      }

      limparFormulario();
    } catch (erro) {
      alert(erro.message || "Não foi possível salvar a conta.");
    } finally {
      setSalvando(false);
    }
  }

  function iniciarEdicao(conta) {
    setEditandoId(conta.id);
    setDescricao(conta.descricao);
    setFornecedor(conta.fornecedor || "");
    setValor(
      Number(conta.valor || 0).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
    setPix(conta.pix || "");
    setDataVencimento(conta.data_vencimento);
    setObservacao(conta.observacao || "");
    setLojaId(conta.loja_id ? String(conta.loja_id) : "");
    setFoto(conta.foto || "");
  }

  async function salvarValorEditado(conta, valorDigitado) {
    // Esse campo continua sendo um <input type="number"> nativo (só
    // aceita ponto decimal, nunca vírgula nem ponto de milhar), então
    // paraNumero() aqui é só por consistência/segurança.
    const novoValor = paraNumero(String(valorDigitado));

    if (!Number.isFinite(novoValor) || novoValor <= 0) {
      alert("Digite um valor válido maior que zero.");
      return;
    }

    // Sem mudança de verdade — não precisa salvar de novo.
    if (Number(conta.valor) === novoValor) return;

    setSalvandoValorId(conta.id);

    try {
      await editarConta(conta.id, {
        descricao: conta.descricao,
        fornecedor: conta.fornecedor,
        valor: novoValor,
        pix: conta.pix,
        data_vencimento: conta.data_vencimento,
        observacao: conta.observacao,
        loja_id: conta.loja_id,
        foto: conta.foto,
      });
    } catch (erro) {
      alert(erro.message || "Não foi possível atualizar o valor.");
    } finally {
      setSalvandoValorId(null);
    }
  }

  const [pixEditando, setPixEditando] = useState(null);
  const [salvandoPixId, setSalvandoPixId] = useState(null);
  const [pixCopiado, setPixCopiado] = useState(null);

  // Comprovante de pagamento (foto anexada DEPOIS de pagar, na aba Contas
  // Pagas) — guardado à parte no state pra aparecer na hora, sem precisar
  // recarregar a página (o objeto `conta` vem do state do componente pai,
  // que só atualiza no próximo carregamento da lista).
  const [comprovantesAnexados, setComprovantesAnexados] = useState({});
  const [anexandoComprovanteId, setAnexandoComprovanteId] = useState(null);

  async function anexarComprovante(conta, arquivo) {
    if (!arquivo) return;

    setAnexandoComprovanteId(conta.id);

    try {
      const fotoComprimida = await comprimirImagem(arquivo);

      await anexarComprovantePagamento(conta.id, fotoComprimida);

      setComprovantesAnexados((atuais) => ({
        ...atuais,
        [conta.id]: fotoComprimida,
      }));
    } catch (erro) {
      console.error("Erro ao anexar comprovante:", erro);
      alert(erro.message || "Não foi possível anexar o comprovante.");
    } finally {
      setAnexandoComprovanteId(null);
    }
  }

  async function copiarPix(chavePix, identificador) {
    if (!chavePix) return;

    try {
      await navigator.clipboard.writeText(chavePix);
      setPixCopiado(identificador);
      setTimeout(() => setPixCopiado(null), 2000);
    } catch {
      alert("Não foi possível copiar. Copie manualmente: " + chavePix);
    }
  }

  async function salvarPixEditado(conta, novoPix) {
    if ((conta.pix || "") === novoPix) return;

    setSalvandoPixId(conta.id);

    try {
      await editarConta(conta.id, {
        descricao: conta.descricao,
        fornecedor: conta.fornecedor,
        valor: conta.valor,
        pix: novoPix,
        data_vencimento: conta.data_vencimento,
        observacao: conta.observacao,
        loja_id: conta.loja_id,
        foto: conta.foto,
      });
    } catch (erro) {
      alert(erro.message || "Não foi possível atualizar o Pix.");
    } finally {
      setSalvandoPixId(null);
    }
  }

  // Pedido do usuário (24/08/2026): editar a data de um pagamento já
  // confirmado, direto na tela — antes só dava pra corrigir no banco.
  async function salvarNovaDataPagamento(conta) {
    if (!novaDataPagaEmEdicao || novaDataPagaEmEdicao === conta.data_pagamento) {
      setEditandoDataPagaId(null);
      return;
    }

    setSalvandoDataPagaId(conta.id);

    try {
      await editarDataPagamento(conta.id, novaDataPagaEmEdicao);
      setEditandoDataPagaId(null);
    } catch (erro) {
      alert(erro.message || "Não foi possível editar a data de pagamento.");
    } finally {
      setSalvandoDataPagaId(null);
    }
  }

  function alternarSelecao(id) {
    setSelecionadas((anteriores) =>
      anteriores.includes(id)
        ? anteriores.filter((item) => item !== id)
        : [...anteriores, id]
    );
  }

  async function confirmarPagamentoSelecionadas() {
    if (selecionadas.length === 0) return;

    if (pagoComOutraLoja && !lojaCredoraId) {
      alert("Escolha qual loja emprestou o saldo pra pagar.");
      return;
    }

    const confirmar = window.confirm(
      selecionadas.length === 1
        ? "Marcar a conta selecionada como paga?"
        : `Marcar as ${selecionadas.length} contas selecionadas como pagas?`
    );

    if (!confirmar) return;

    setConfirmandoPagamento(true);

    try {
      const falhas = [];

      for (const id of selecionadas) {
        try {
          await marcarComoPaga(
            id,
            pagoComOutraLoja ? lojaCredoraId : undefined,
            dataPagamentoEscolhida
          );
        } catch (erro) {
          falhas.push(erro.message || "erro desconhecido");
        }
      }

      setSelecionadas([]);
      setPagoComOutraLoja(false);
      setLojaCredoraId("");
      setDataPagamentoEscolhida(dataFormatada(new Date()));
      // Vai direto pra página de Contas Pagas, já com acesso ao "Ver
      // detalhes" de tudo que acabou de ser pago.
      aoConfirmarPagamento?.();

      if (falhas.length > 0) {
        alert(
          `Algumas contas não puderam ser marcadas como pagas: ${falhas.join(
            ", "
          )}`
        );
      }
    } finally {
      setConfirmandoPagamento(false);
    }
  }

  async function confirmarExclusao(conta) {
    const confirmar = window.confirm(
      `Excluir a conta "${conta.descricao}"?`
    );

    if (!confirmar) return;

    try {
      await removerConta(conta.id);

      if (editandoId === conta.id) {
        limparFormulario();
      }
    } catch (erro) {
      alert(erro.message || "Não foi possível excluir a conta.");
    }
  }

  // Pedido do usuário (18/08/2026): admin conseguir excluir, direto
  // daqui, uma despesa que apareceu em Contas Pagas (ex: lançada
  // automática via WhatsApp) sem precisar ir na tela Despesas.
  async function confirmarExclusaoDespesa(conta) {
    const confirmar = window.confirm(
      `Excluir a despesa "${conta.descricao}"? Isso desfaz o valor lançado no saldo.`
    );

    if (!confirmar) return;

    try {
      await removerDespesa(conta._idOriginal);
    } catch (erro) {
      alert(erro.message || "Não foi possível excluir a despesa.");
    }
  }

  const buscaLimpa = busca.trim().toLowerCase();

  // Despesas lançadas já são dinheiro pago — entram junto na aba "Contas
  // Pagas" (só nessa aba, nunca em "A pagar"), sem duplicar nada no banco:
  // é só uma junção pra visualização, cada uma mantém sua origem marcada
  // (_origem) pra "Ver foto"/Editar/Excluir saberem de onde vieram.
  // Bug real corrigido (20/08/2026): quando uma Conta a Pagar é marcada
  // como paga, o sistema cria uma despesa vinculada (lancamento_id) — mas
  // essa MESMA despesa também aparecia solta na lista de "despesas" logo
  // abaixo, fazendo o mesmo pagamento aparecer 2x na tela (e o total do
  // dia contar em dobro). Agora tira da lista de despesas qualquer uma
  // que já esteja vinculada a uma conta paga, pra cada pagamento aparecer
  // só uma vez.
  const idsDespesasJaEmContaPaga = new Set(
    contas
      .filter((conta) => conta.status === "pago" && conta.lancamento_id)
      .map((conta) => conta.lancamento_id)
  );

  const contasPagasNormalizadas =
    modo === "pagas"
      ? [
          ...contas
            .filter((conta) => conta.status === "pago")
            .map((conta) => ({
              ...conta,
              _origem: "contas_pagar",
              // Pedido do usuário (18/08/2026): ordem/exibição da lista
              // usa o horário real do pagamento no sistema, não a data da
              // nota. Contas pagas antes dessa mudança não têm pago_em
              // (fica null e cai no fallback por data, sem horário).
              _horario: conta.pago_em || null,
            })),
          ...despesas
            .filter((despesa) => !idsDespesasJaEmContaPaga.has(despesa.id))
            .map((despesa) => ({
            id: `despesa-${despesa.id}`,
            _origem: "despesa",
            _idOriginal: despesa.id,
            descricao: despesa.descricao,
            fornecedor: despesa.fornecedor,
            valor: despesa.valor,
            data_vencimento: despesa.data,
            data_pagamento: despesa.data,
            status: "pago",
            observacao: despesa.observacao,
            loja_id: despesa.loja_id,
            foto: null,
            tem_foto: despesa.tem_foto,
            _horario: despesa.created_at || null,
          })),
        ]
      : [];

  const contasVisiveis =
    modo === "pagas"
      ? contasPagasNormalizadas
          .filter((conta) =>
            buscaLimpa
              ? `${conta.descricao} ${conta.fornecedor || ""}`
                  .toLowerCase()
                  .includes(buscaLimpa)
              : true
          )
          .filter((conta) => {
            if (buscaData) {
              return conta.data_pagamento === buscaData;
            }

            // Sem nenhum filtro de data escolhido: se já pesquisou por
            // nome, mostra de qualquer época; senão, só o que foi pago
            // "recentemente" (até as 8h da manhã do dia seguinte ao
            // pagamento) — depois disso só aparece pesquisando pela data.
            return buscaLimpa
              ? true
              : pagamentoDentroDaJanelaPadrao(conta.data_pagamento);
          })
          .sort((a, b) => {
            // Ordem de pagamento real no sistema (horário exato), não a
            // data da nota. Registros antigos sem _horario caem por
            // último dentro do mesmo dia (usando só a data como reforço).
            if (a._horario && b._horario) {
              return b._horario.localeCompare(a._horario);
            }
            if (a._horario) return -1;
            if (b._horario) return 1;
            return (b.data_pagamento || "").localeCompare(
              a.data_pagamento || ""
            );
          })
      : contas
          .filter((conta) => conta.status !== "pago")
          .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));

  // Total pago HOJE — soma independente de qualquer busca/filtro ativo na
  // tela, pra sempre refletir o dia real; soma sozinho conforme mais
  // pagamentos forem lançados (não precisa recarregar a página).
  const totalPagoHoje = contasPagasNormalizadas
    .filter((conta) => conta.data_pagamento === dataFormatada(new Date()))
    .reduce((soma, conta) => soma + Number(conta.valor || 0), 0);

  // Soma de TODAS as contas vencidas (atrasadas) visíveis — cada mês não
  // pago de uma despesa recorrente entra como uma conta separada, com
  // sua própria data; esse total só soma o que já passou do vencimento.
  const contasVencidas = contasVisiveis.filter(
    (conta) => situacaoConta(conta).rotulo === "Atrasado"
  );
  const quantidadeVencida = contasVencidas.length;
  const totalVencido = contasVencidas.reduce(
    (soma, conta) => soma + Number(conta.valor || 0),
    0
  );

  return (
    <section className="categorias-layout">
      {modo === "pagas" ? (
        <article className="panel categoria-form-panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Contas Pagas</span>
              <h2>Buscar no histórico</h2>
            </div>
          </div>

          <div className="form-row">
            <label>
              Pesquisar
              <input
                type="text"
                value={busca}
                onChange={(evento) => setBusca(evento.target.value)}
                placeholder="Descrição ou fornecedor..."
              />
            </label>

            <label>
              Ou pesquisar por data
              <input
                type="date"
                value={buscaData}
                onChange={(evento) => setBuscaData(evento.target.value)}
              />
            </label>
          </div>

          {buscaData && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => setBuscaData("")}
            >
              Limpar data
            </button>
          )}

          <small className="foto-ajuda">
            {buscaData
              ? "Mostrando só o dia escolhido."
              : busca.trim()
              ? "Buscando em todo o histórico, sem limite de data."
              : "Mostrando só as contas pagas neste mês. Pra ver meses anteriores, pesquise pelo nome ou escolha uma data."}
          </small>
        </article>
      ) : (
      <article className="panel categoria-form-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">
              {editandoId ? "Editar cadastro" : "Novo cadastro"}
            </span>

            <h2>{editandoId ? "Editar conta" : "Nova conta a pagar"}</h2>
          </div>
        </div>

        <form onSubmit={salvar}>
          <label>
            Descrição
            <input
              type="text"
              value={descricao}
              onChange={(evento) => setDescricao(evento.target.value)}
              placeholder="Ex.: Aluguel, energia, fornecedor..."
            />
          </label>

          <label>
            Fornecedor (opcional)
            <input
              type="text"
              value={fornecedor}
              onChange={(evento) => setFornecedor(evento.target.value)}
              placeholder="Ex.: Frigorífico X"
            />
          </label>

          <div className="form-row">
            <label>
              Valor
              <CampoValor value={valor} onChange={setValor} />
            </label>

            <label>
              Data de vencimento
              <input
                type="date"
                value={dataVencimento}
                onChange={(evento) =>
                  setDataVencimento(evento.target.value)
                }
              />
            </label>
          </div>

          <label>
            Pix (opcional)
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={pix}
                onChange={(evento) => setPix(evento.target.value)}
                placeholder="Chave Pix ou código copia-e-cola"
                style={{ flex: 1 }}
              />
              {pix && (
                <button
                  type="button"
                  className="secondary-button"
                  title={pixCopiado === "form" ? "Copiado!" : "Copiar"}
                  onClick={() => copiarPix(pix, "form")}
                >
                  📋
                </button>
              )}
            </div>
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
              📄 Foto do boleto/nota
            </span>

            <input
              id="foto-conta-pagar"
              type="file"
              accept="image/*"
              disabled={processandoFoto}
              onChange={async (evento) => {
                const arquivo = evento.target.files?.[0];

                if (!arquivo) return;

                setProcessandoFoto(true);

                try {
                  const fotoComprimida = await comprimirImagem(arquivo);
                  setFoto(fotoComprimida);
                  await lerFotoAutomaticamente(fotoComprimida);
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
              htmlFor="foto-conta-pagar"
              className="foto-button"
              style={
                processandoFoto || lendoFoto
                  ? { opacity: 0.6, pointerEvents: "none" }
                  : undefined
              }
            >
              {processandoFoto
                ? "Processando foto..."
                : lendoFoto
                ? "🤖 Lendo automaticamente..."
                : "📷📄 Tirar foto ou anexar e ler automaticamente"}
            </label>

            <small className="foto-ajuda">
              Escolhe da câmera ou da galeria — tanto foto quanto arquivo de
              imagem já salvo.
            </small>
          </div>

          {foto && (
            <div className="foto-preview">
              <img src={foto} alt="Pré-visualização do boleto/nota" />

              <button
                type="button"
                className="secondary-button"
                onClick={() => lerFotoAutomaticamente()}
                disabled={lendoFoto}
              >
                {lendoFoto ? "Lendo..." : "🤖 Ler novamente"}
              </button>

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
                : "Cadastrar conta"}
            </button>
          </div>
        </form>
      </article>
      )}

      <article className="panel categoria-lista-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">
              {modo === "pagas" ? "Contas Pagas" : "Contas a Pagar"}
            </span>
            <h2>{modo === "pagas" ? "Histórico" : "Vencimentos"}</h2>
          </div>

          <strong>{contasVisiveis.length}</strong>
        </div>

        {modo === "pendentes" && totalVencido > 0 && (
          // Pedido do usuário (19/08/2026): uma despesa recorrente não
          // paga por vários meses seguidos gera uma Conta a Pagar NOVA a
          // cada mês (cada uma com sua própria data de vencimento — isso
          // já acontece sozinho). O que faltava era mostrar a SOMA de
          // tudo que já venceu, pra dar pra ver de cara "olha, atrasei
          // R$ X no total, em N contas" sem ter que somar na mão.
          <div
            style={{
              background: "rgba(220, 38, 38, 0.12)",
              border: "1px solid rgba(220, 38, 38, 0.4)",
              borderRadius: 10,
              padding: "10px 14px",
              marginBottom: 12,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <span style={{ color: "#dc2626", fontWeight: 600 }}>
              ⚠️ {quantidadeVencida} conta(s) vencida(s)
            </span>
            <strong style={{ color: "#dc2626" }}>
              Total: {formatarMoeda(totalVencido)}
            </strong>
          </div>
        )}

        {modo === "pendentes" && contasVisiveis.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 12,
            }}
          >
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setSelecionadas(
                  selecionadas.length === contasVisiveis.length
                    ? []
                    : contasVisiveis.map((conta) => conta.id)
                )
              }
            >
              {selecionadas.length === contasVisiveis.length
                ? "Desmarcar todas"
                : `Selecionar todas (${contasVisiveis.length})`}
            </button>

            {selecionadas.length > 0 && (
              <>
                <label
                  className="toque-alvo"
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  Data do pagamento:
                  <input
                    type="date"
                    value={dataPagamentoEscolhida}
                    onChange={(evento) =>
                      setDataPagamentoEscolhida(evento.target.value)
                    }
                  />
                </label>

                <label
                  className="toque-alvo"
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  <input
                    type="checkbox"
                    checked={pagoComOutraLoja}
                    onChange={(evento) => {
                      setPagoComOutraLoja(evento.target.checked);
                      if (!evento.target.checked) setLojaCredoraId("");
                    }}
                  />
                  💰 Paguei com o saldo de outra loja
                </label>

                {pagoComOutraLoja && (
                  <select
                    value={lojaCredoraId}
                    onChange={(evento) => setLojaCredoraId(evento.target.value)}
                  >
                    <option value="">Qual loja emprestou?</option>
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
                  onClick={confirmarPagamentoSelecionadas}
                  disabled={confirmandoPagamento}
                >
                  {confirmandoPagamento
                    ? "Confirmando..."
                    : `✅ Confirmar pagamento (${selecionadas.length})`}
                </button>
              </>
            )}
          </div>
        )}

        {carregando ? (
          <div className="empty-state">Carregando...</div>
        ) : contasVisiveis.length === 0 ? (
          <div className="empty-state">
            {modo === "pagas"
              ? buscaData
                ? "Nenhuma conta paga nesse dia."
                : busca.trim()
                ? "Nenhuma conta paga encontrada com essa busca."
                : "Nenhuma conta paga neste mês ainda."
              : "Nenhuma conta a pagar."}
          </div>
        ) : (
          <div className="categorias-lista">
            {contasVisiveis.map((conta) => {
              const situacao = situacaoConta(conta);

              return (
                <div className="categoria-item" key={conta.id}>
                  <div className="categoria-identificacao">
                    {modo === "pendentes" && (
                      // 15/08/2026: checkbox em si continua pequeno
                      // visualmente, mas o "label" ao redor dá uma área
                      // de toque de 44x44 pro dedo acertar (antes eram só
                      // os 20x20 do quadradinho, fácil de errar no
                      // celular). Ver .toque-alvo em App.css.
                      <label className="toque-alvo">
                        <input
                          type="checkbox"
                          checked={selecionadas.includes(conta.id)}
                          onChange={() => alternarSelecao(conta.id)}
                        />
                      </label>
                    )}

                    <div className="categoria-icone">
                      {conta._origem === "despesa" ? "🧾" : "💸"}
                    </div>

                    <div>
                      <strong>{conta.descricao}</strong>
                      <div>
                        {conta._origem === "despesa" && (
                          <span
                            className="badge-status badge-status-pendente"
                            title="Essa é uma despesa lançada em Despesas — aparece aqui só pra visualização."
                          >
                            Despesa
                          </span>
                        )}
                        {conta.fornecedor ? `${conta.fornecedor} — ` : ""}
                        {modo === "pendentes" && conta._origem !== "despesa" ? (
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            defaultValue={conta.valor}
                            disabled={salvandoValorId === conta.id}
                            style={{ width: 100, display: "inline-block" }}
                            onBlur={(evento) =>
                              salvarValorEditado(conta, evento.target.value)
                            }
                            onKeyDown={(evento) => {
                              if (evento.key === "Enter") {
                                evento.target.blur();
                              }
                            }}
                          />
                        ) : (
                          formatarMoeda(conta.valor)
                        )}
                        {modo === "pagas" && conta.data_pagamento
                          ? ` — pago em ${formatarDataHora(
                              conta._horario,
                              conta.data_pagamento
                            )}`
                          : ` — vence em ${formatarData(
                              conta.data_vencimento
                            )}`}
                        {/* Pedido do usuário (24/08/2026): editar a data de
                            um pagamento já confirmado, direto na tela —
                            antes só dava pra corrigir no banco. Só pras
                            contas de verdade (não pra "despesa" que só
                            aparece aqui pra visualização, sem registro
                            correspondente em contas_pagar pra editar). */}
                        {modo === "pagas" &&
                          conta._origem !== "despesa" &&
                          (editandoDataPagaId === conta.id ? (
                            <span style={{ marginLeft: 6 }}>
                              <input
                                type="date"
                                autoFocus
                                value={novaDataPagaEmEdicao}
                                disabled={salvandoDataPagaId === conta.id}
                                onChange={(evento) =>
                                  setNovaDataPagaEmEdicao(evento.target.value)
                                }
                                onBlur={() => salvarNovaDataPagamento(conta)}
                                onKeyDown={(evento) => {
                                  if (evento.key === "Enter") evento.target.blur();
                                  if (evento.key === "Escape")
                                    setEditandoDataPagaId(null);
                                }}
                              />
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="secondary-button"
                              style={{
                                marginLeft: 6,
                                padding: "2px 6px",
                                fontSize: 12,
                              }}
                              title="Corrigir a data desse pagamento"
                              onClick={() => {
                                setNovaDataPagaEmEdicao(conta.data_pagamento || "");
                                setEditandoDataPagaId(conta.id);
                              }}
                            >
                              ✏️
                            </button>
                          ))}
                      </div>
                      {vePermissaoTotal &&
                        (() => {
                          const nomeLoja = lojas.find(
                            (loja) =>
                              String(loja.id) === String(conta.loja_id)
                          )?.nome;

                          // Sem loja atribuída não mostra nada aqui — a
                          // frase "Sem loja" só confundia quem já está
                          // vendo tudo filtrado por uma loja específica.
                          return nomeLoja ? <span>🏬 {nomeLoja}</span> : null;
                        })()}
                      {/* Pedido do usuário (13/08/2026): diária paga em
                      duas partes (dinheiro na hora + restante) mostra
                      quanto já foi pago (verde) e quanto falta (vermelho,
                      é o valor editável acima) em vez do badge comum de
                      vencimento. */}
                      {conta.valor_pago_dinheiro ? (
                        <span>
                          Pago{" "}
                          <strong style={{ color: "#16ca50" }}>
                            {formatarMoeda(conta.valor_pago_dinheiro)}
                          </strong>{" "}
                          em dinheiro — pagar somente{" "}
                          <strong style={{ color: "#ef4444" }}>
                            {formatarMoeda(conta.valor)}
                          </strong>
                        </span>
                      ) : (
                        <span className={situacao.classe}>
                          {situacao.rotulo}
                        </span>
                      )}

                      {conta._origem !== "despesa" && (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "row",
                            flexWrap: "nowrap",
                            alignItems: "center",
                            gap: 6,
                            marginTop: 4,
                          }}
                        >
                          <span>Pix:</span>
                          <input
                            type="text"
                            key={conta.id}
                            defaultValue={conta.pix || ""}
                            disabled={salvandoPixId === conta.id}
                            placeholder="Chave Pix..."
                            style={{ width: 160, flexShrink: 0 }}
                            onBlur={(evento) =>
                              salvarPixEditado(conta, evento.target.value)
                            }
                            onKeyDown={(evento) => {
                              if (evento.key === "Enter") {
                                evento.target.blur();
                              }
                            }}
                          />
                          {conta.pix && (
                            <button
                              type="button"
                              className="secondary-button"
                              title={
                                pixCopiado === `lista-${conta.id}`
                                  ? "Copiado!"
                                  : "Copiar"
                              }
                              onClick={() =>
                                copiarPix(conta.pix, `lista-${conta.id}`)
                              }
                            >
                              📋
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="transaction-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setDetalheVisualizado(conta)}
                    >
                      👁️ Ver detalhes
                    </button>

                    {modo === "pagas" && conta._origem !== "despesa" && (
                      <>
                        <input
                          id={`comprovante-${conta.id}`}
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          disabled={anexandoComprovanteId === conta.id}
                          onChange={(evento) => {
                            const arquivo = evento.target.files?.[0];
                            anexarComprovante(conta, arquivo);
                            evento.target.value = "";
                          }}
                        />

                        <label
                          htmlFor={`comprovante-${conta.id}`}
                          className="secondary-button"
                          style={{
                            cursor: "pointer",
                            opacity:
                              anexandoComprovanteId === conta.id ? 0.6 : 1,
                          }}
                        >
                          {anexandoComprovanteId === conta.id
                            ? "Enviando..."
                            : conta.comprovante_pagamento ||
                              comprovantesAnexados[conta.id]
                            ? "📎 Trocar comprovante"
                            : "📎 Anexar comprovante"}
                        </label>

                        {(conta.comprovante_pagamento ||
                          comprovantesAnexados[conta.id]) && (
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() =>
                              setFotoVisualizada(
                                comprovantesAnexados[conta.id] ||
                                  conta.comprovante_pagamento
                              )
                            }
                          >
                            👁️ Ver comprovante
                          </button>
                        )}
                      </>
                    )}

                    {conta._origem !== "despesa" && (
                      <>
                        <button
                          type="button"
                          className="edit-button"
                          onClick={() => iniciarEdicao(conta)}
                        >
                          Editar
                        </button>

                        {/* Pedido do usuário (18/08/2026): excluir uma
                        conta JÁ PAGA é uma ação sensível (reverte a
                        despesa que já baixou o saldo) — fica só pro
                        admin. Excluir uma conta ainda PENDENTE continua
                        liberado pra quem já tinha acesso, sem mudança. */}
                        {(modo !== "pagas" || ehAdministrador) && (
                          <button
                            type="button"
                            className="delete-button"
                            onClick={() => confirmarExclusao(conta)}
                          >
                            Excluir
                          </button>
                        )}
                      </>
                    )}

                    {/* Pedido do usuário (18/08/2026): despesa que
                    apareceu aqui (ex: lançada automática via WhatsApp)
                    também precisa de opção de excluir — só admin, mesma
                    regra sensível de acima. */}
                    {conta._origem === "despesa" &&
                      ehAdministrador &&
                      removerDespesa && (
                        <button
                          type="button"
                          className="delete-button"
                          onClick={() => confirmarExclusaoDespesa(conta)}
                        >
                          Excluir
                        </button>
                      )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {modo === "pagas" && (
          <div
            className="categoria-item"
            style={{
              marginTop: 12,
              justifyContent: "space-between",
              display: "flex",
              alignItems: "center",
            }}
          >
            {/* Pedido do usuário (24/08/2026): esse total é sempre de HOJE,
                de propósito — não muda com a busca por data ali em cima
                (ver comentário em totalPagoHoje). Só que ficava confuso
                ver "Nenhuma conta paga nesse dia" (buscando outra data) ao
                lado de um total com valor — parecia bug. Agora mostra a
                data de hoje escrita do lado, pra ficar óbvio que são duas
                coisas independentes. */}
            <strong>
              Total de contas pagas hoje ({formatarData(dataFormatada(new Date()))}):
            </strong>
            <strong style={{ fontSize: "16px" }}>
              {formatarMoeda(totalPagoHoje)}
            </strong>
          </div>
        )}
      </article>

      {detalheVisualizado && (
        <div
          className="modal-overlay"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget) {
              setDetalheVisualizado(null);
            }
          }}
        >
          <div className="modal">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Conta a pagar</span>
                <h2>{detalheVisualizado.descricao}</h2>
              </div>

              <button
                type="button"
                className="close-button"
                onClick={() => setDetalheVisualizado(null)}
              >
                ×
              </button>
            </div>

            <div className="categorias-lista">
              <div className="categoria-item">
                <div className="categoria-identificacao">
                  <div className="categoria-icone">💸</div>
                  <div>
                    <strong>Valor</strong>
                    <div>{formatarMoeda(detalheVisualizado.valor)}</div>
                  </div>
                </div>
              </div>

              {detalheVisualizado._origem !== "despesa" && (
                <div className="categoria-item">
                  <div className="categoria-identificacao">
                    <div className="categoria-icone">🔑</div>
                    <div style={{ width: "100%" }}>
                      <strong>Pix</strong>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "row",
                          flexWrap: "nowrap",
                          alignItems: "center",
                          gap: 8,
                          marginTop: 4,
                        }}
                      >
                        <input
                          type="text"
                          key={detalheVisualizado.id}
                          defaultValue={detalheVisualizado.pix || ""}
                          disabled={salvandoPixId === detalheVisualizado.id}
                          placeholder="Chave Pix..."
                          style={{ flex: 1 }}
                          onBlur={(evento) => {
                            salvarPixEditado(
                              detalheVisualizado,
                              evento.target.value
                            );
                            setDetalheVisualizado((atual) =>
                              atual
                                ? { ...atual, pix: evento.target.value }
                                : atual
                            );
                          }}
                          onKeyDown={(evento) => {
                            if (evento.key === "Enter") {
                              evento.target.blur();
                            }
                          }}
                        />
                        {detalheVisualizado.pix && (
                          <button
                            type="button"
                            className="secondary-button"
                            title={
                              pixCopiado === `detalhe-${detalheVisualizado.id}`
                                ? "Copiado!"
                                : "Copiar"
                            }
                            onClick={() =>
                              copiarPix(
                                detalheVisualizado.pix,
                                `detalhe-${detalheVisualizado.id}`
                              )
                            }
                          >
                            📋
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {detalheVisualizado.fornecedor && (
                <div className="categoria-item">
                  <div className="categoria-identificacao">
                    <div className="categoria-icone">🏭</div>
                    <div>
                      <strong>Fornecedor</strong>
                      <div>{detalheVisualizado.fornecedor}</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="categoria-item">
                <div className="categoria-identificacao">
                  <div className="categoria-icone">📅</div>
                  <div>
                    <strong>Vencimento</strong>
                    <div>
                      {formatarData(detalheVisualizado.data_vencimento)}
                    </div>
                  </div>
                </div>
              </div>

              {lojas.find(
                (loja) =>
                  String(loja.id) === String(detalheVisualizado.loja_id)
              )?.nome && (
                <div className="categoria-item">
                  <div className="categoria-identificacao">
                    <div className="categoria-icone">🏬</div>
                    <div>
                      <strong>Loja</strong>
                      <div>
                        {
                          lojas.find(
                            (loja) =>
                              String(loja.id) ===
                              String(detalheVisualizado.loja_id)
                          )?.nome
                        }
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="categoria-item">
                <div className="categoria-identificacao">
                  <div className="categoria-icone">
                    {detalheVisualizado.status === "pago" ? "✅" : "⏳"}
                  </div>
                  <div>
                    <strong>Situação</strong>
                    {detalheVisualizado.valor_pago_dinheiro ? (
                      <div>
                        <div style={{ color: "#16ca50" }}>
                          Pago{" "}
                          <strong>
                            {formatarMoeda(detalheVisualizado.valor_pago_dinheiro)}
                          </strong>{" "}
                          em dinheiro
                        </div>
                        <div style={{ marginTop: 6 }}>A pagar</div>
                        <strong style={{ color: "#ef4444", fontSize: "16px" }}>
                          {formatarMoeda(detalheVisualizado.valor)}
                        </strong>
                      </div>
                    ) : (
                      <div>{situacaoConta(detalheVisualizado).rotulo}</div>
                    )}
                  </div>
                </div>
              </div>

              {detalheVisualizado.observacao && (
                <div className="categoria-item">
                  <div className="categoria-identificacao">
                    <div className="categoria-icone">📝</div>
                    <div>
                      <strong>Observação</strong>
                      <div>{detalheVisualizado.observacao}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-actions">
              {(detalheVisualizado.foto || detalheVisualizado.tem_foto) && (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={carregandoFotoDetalhe}
                  onClick={async () => {
                    if (detalheVisualizado._origem === "despesa") {
                      setCarregandoFotoDetalhe(true);

                      try {
                        const resultado = await buscarFotoDespesa(
                          detalheVisualizado._idOriginal
                        );
                        setFotoVisualizada(resultado?.foto || "");
                        setDetalheVisualizado(null);
                      } catch (erro) {
                        alert(
                          erro.message || "Não foi possível carregar a foto."
                        );
                      } finally {
                        setCarregandoFotoDetalhe(false);
                      }

                      return;
                    }

                    setFotoVisualizada(detalheVisualizado.foto);
                    setDetalheVisualizado(null);
                  }}
                >
                  {carregandoFotoDetalhe ? "Carregando..." : "👁️ Ver foto"}
                </button>
              )}

              <button
                type="button"
                className="primary-button"
                onClick={() => setDetalheVisualizado(null)}
              >
                Fechar
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
            }
          }}
        >
          <div className="modal modal-foto">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Conta a pagar</span>
                <h2>Foto anexada</h2>
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
              alt="Foto do boleto/nota"
              className="foto-modal-imagem"
            />
          </div>
        </div>
      )}
    </section>
  );
}

export default ContasPagar;
export { situacaoConta, diasAte };
