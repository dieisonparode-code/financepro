import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  buscarVendasPagSeguro,
  conferirFechamentoFoto,
  buscarFechamentosCaixa,
  buscarFotoFechamentoCaixa,
  buscarFechamentoSaipos,
  salvarValoresInformadosFechamento,
  finalizarConciliacaoFechamento,
  salvarDinheiroInformado,
  buscarDinheiroInformado,
  registrarRetiradaComFoto,
  lerValorFechamentoCaixa,
  buscarFotoFundoRetiradaCaixa,
} from "../services/api";
import CampoValor, { paraNumero } from "./CampoValor";

// Mesma compressão já usada em Contas a Pagar/Despesas — reduz o
// tamanho antes de mandar pra IA e guardar.
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

// A pedido do usuário: iFood/Brendi ("Pago Online"), Voucher Parceiro, A
// prazo (funcionários), Vale e Cortesia já são contabilizados
// automaticamente pela própria Saipos — só Dinheiro não tem nenhum
// "Sistema" pra comparar (é físico, só o que o operador informou na
// foto). Mapeia o nome exato que a Saipos usa pro nome que essa tela já
// usa.
const MAPA_SAIPOS_PARA_CONFRONTO = {
  "Pago Online": "Pago Online",
  "A prazo (funcionários)": "A prazo",
  "Voucher Parceiro Desconto": "Voucher Parceiro",
  Vale: "Vale",
  Cortesia: "Cortesia",
};

// Formas em que dá pra confiar no valor que REALMENTE caiu na PagSeguro
// (resumo.totais_brutos_por_forma_pagamento, já buscado direto da conta) —
// pra essas, "Real em conta" vira a régua oficial de bateu/não bateu, não
// mais o "Sistema" (Saipos), porque a categoria que o operador escolhe no
// PDV da Saipos na hora da venda pode vir errada (achamos um caso real,
// 15/08/2026: venda PIX lançada como Cartão de crédito, inflando o Sistema
// do Cartão e esvaziando o do PIX, sem prejuízo nenhum de verdade — o
// dinheiro caiu certinho, só a categoria ficou errada). Pago Online
// (iFood/Brendi), A prazo, Vale, Voucher e Cortesia não têm fonte bancária
// própria no sistema hoje — continuam usando o Sistema (Saipos) como
// antes. Dinheiro nunca teve "Sistema" automático (é físico), continua
// igual.
const FORMAS_COM_REAL_EM_CONTA = ["Cartão de crédito", "Cartão de débito", "PIX"];

// Pedido do usuário (23/08/2026): "Pix Conta Bancária" cai direto no banco,
// sem passar pela maquininha/PagSeguro — nunca vai ter "Real em conta"
// automático (diferente do "PIX" QrCode, que a PagSeguro confirma sozinha).
// Pra essas formas o Informado vem pré-preenchido com o próprio Esperado
// (única fonte que existe), mas a Diferença NUNCA mostra "✅ Bateu"
// sozinha — sempre aparece em vermelho com "conferir", porque é um valor
// assumido, não confirmado por nenhuma fonte independente.
const FORMAS_PRECISAM_CONFERIR = ["Pix Conta Bancária"];

import ConciliacaoDespesas from "./ConciliacaoDespesas";

// Converte o horário de um registro (o momento em que um fechamento foi
// salvo) pro dia do TURNO, não o dia do relógio — um caixa aberto às 20h
// de um dia e fechado só depois da meia-noite ainda pertence ao turno do
// dia anterior. Mesma regra de corte (5h da manhã) já usada na importação
// automática da Saipos, pra não pegar o dia errado ao buscar PagSeguro/
// Saipos pra conciliar.
function hojeDoRegistro(dataIso) {
  const data = new Date(dataIso);

  if (data.getHours() < 5) {
    data.setDate(data.getDate() - 1);
  }

  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

// Sempre mostra no horário de Uberlândia (onde a loja fica), não no fuso do
// dispositivo de quem está olhando — senão parece que a venda foi em outro
// horário do que realmente foi (ex: alguém acessando de Mato Grosso, que é
// 1 hora atrás de Uberlândia).
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

// Status 3 (Paga) e 4 (Disponível) são as únicas que a PagSeguro já confirmou
// como recebidas de verdade — o resto (aguardando, em análise, disputa,
// devolvida, cancelada) é dinheiro que apareceu como venda mas ainda não
// entrou (ou nunca vai entrar) no bolso.
function estaPendenteOuCancelada(venda) {
  return venda.status !== 3 && venda.status !== 4;
}

const ORDEM_FORMAS_PAGAMENTO = ["Cartão de crédito", "Cartão de débito", "PIX"];

function agruparVendasPorFormaPagamento(vendas) {
  const grupos = new Map();

  vendas.forEach((venda) => {
    const forma = venda.forma_pagamento || "Outro";

    if (!grupos.has(forma)) {
      grupos.set(forma, []);
    }

    grupos.get(forma).push(venda);
  });

  const formasOrdenadas = [
    ...ORDEM_FORMAS_PAGAMENTO.filter((forma) => grupos.has(forma)),
    ...[...grupos.keys()].filter(
      (forma) => !ORDEM_FORMAS_PAGAMENTO.includes(forma)
    ),
  ];

  return formasOrdenadas.map((forma) => ({
    forma,
    vendas: grupos.get(forma),
  }));
}

// Sem seletor de loja aqui de propósito — a pedido do usuário, essa tela
// usa a loja em que a pessoa já está logada (ou a selecionada no topo,
// pra administrador), não precisa escolher de novo.
function Conciliacao({
  lojaId,
  fundosRetiradas = [],
  lancamentos = [],
  ehAdministrador = false,
}) {
  const [abaAtiva, setAbaAtiva] = useState("caixa");
  // BUG GRAVE corrigido (13/08/2026): resumo/resumoSaipos eram estados
  // soltos (um valor só, não por fechamento) — trocar de data sem clicar
  // "Conciliar agora" de novo deixava o "Sistema" do Cartão/PIX mostrando
  // os dados da PagSeguro/Saipos do fechamento ANTERIOR. Agora guarda um
  // valor POR DATA (dataChave); o que aparece na tela é sempre só o do
  // fechamento selecionado agora — nunca sobra resto de outro dia. Bônus:
  // voltar pra uma data já conciliada antes mostra na hora, sem buscar de
  // novo.
  const [resumoPorData, setResumoPorData] = useState({});
  const [resumoSaiposPorData, setResumoSaiposPorData] = useState({});
  // Registro de caixa_dinheiro_informado do fechamento selecionado
  // (abertura, em_caixa, retiradas_caixa) — pra conferência do dinheiro.
  const [dinheiroDoFechamento, setDinheiroDoFechamento] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [resultadoFoto, setResultadoFoto] = useState(null);
  // Pedido do usuário (16/08/2026): "Esperado" não pode nunca ficar
  // travado em "—" pra sempre só porque a IA não conseguiu ler algum
  // número da foto (ex: Dinheiro sem Abertura/Vendas legível). Esses dois
  // estados controlam a edição manual inline do Esperado, forma por forma.
  const [editandoEsperado, setEditandoEsperado] = useState(null);
  const [valorEsperadoDigitado, setValorEsperadoDigitado] = useState("");
  // Pedido do usuário (12/08/2026): só as formas que TODO fechamento tem
  // (cartão, pix, dinheiro) ficam fixas aqui. As outras (A prazo, Pago
  // Online, Vale, Voucher Parceiro, Cortesia, ou qualquer forma nova) só
  // aparecem na tabela quando esse fechamento específico realmente teve
  // essa forma (na foto ou no sistema da Saipos) — se não teve, não
  // aparece a linha, em vez de mostrar "R$0,00"/"—" pra algo que nem
  // existiu naquele dia.
  const valoresInformadosBase = {
    "Cartão de crédito": "",
    "Cartão de débito": "",
    PIX: "",
    Dinheiro: "",
  };
  // BUG GRAVE corrigido (13/08/2026), pra valer dessa vez: em vez de um
  // "valoresInformados" solto que precisa ser resetado manualmente (via
  // useEffect) toda vez que troca de fechamento — jeito frágil, e que na
  // prática continuou vazando dado de um fechamento pro outro mesmo depois
  // de 2 tentativas de conserto — agora guarda só as EDIÇÕES (o que foi
  // digitado/lido) separadas POR DATA (edicoesPorData[dataChave]). O valor
  // mostrado na tela é sempre CALCULADO na hora, a partir do fechamento
  // selecionado agora — nunca pode sobrar resto de outro fechamento,
  // porque não existe mais um estado único e solto pra "esquecer" de
  // limpar.
  const [edicoesPorData, setEdicoesPorData] = useState({});
  const [fotoPreview, setFotoPreview] = useState(null);
  const [carregandoPreview, setCarregandoPreview] = useState(false);
  const [fechamentosDisponiveis, setFechamentosDisponiveis] = useState([]);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [grupoEscolhido, setGrupoEscolhido] = useState(null);
  const [finalizandoConciliacao, setFinalizandoConciliacao] = useState(false);
  // Pedido do usuário (12/08/2026): botão "Conciliações" no topo abre um
  // painel simples pra buscar, pela data, um fechamento já finalizado.
  const [painelConciliacoesAberto, setPainelConciliacoesAberto] =
    useState(false);
  const [dataBuscaConciliacoes, setDataBuscaConciliacoes] = useState("");
  const [erroBuscaConciliacoes, setErroBuscaConciliacoes] = useState("");
  // Retiradas de dinheiro do caixa ("Pago com dinheiro do caixa") dessa
  // loja — usadas pra calcular o Esperado do Dinheiro (Abertura + Vendas
  // em dinheiro − Retiradas do turno).
  const [retiradasCaixa, setRetiradasCaixa] = useState([]);
  // Pedido do usuário (19/08/2026): mostrar aqui os pedidos cancelados
  // daquela mesma noite (nome, valor, telefone — lidos automaticamente
  // da foto de "Comandas Canceladas").
  const [comandasCanceladas, setComandasCanceladas] = useState([]);

  // Pedido do usuário (20/08/2026): um aviso — clicado na hora que o
  // usuário quiser, não automático — que compara a Abertura do turno
  // mais recente com o "Em caixa" (fechamento) do turno anterior. Se o
  // caixa abriu hoje com um valor diferente do que fechou ontem, é sinal
  // de que alguém mexeu no dinheiro entre os dois turnos (tirou ou pôs
  // sem registrar) — vale conferir.
  const [avisoAberturaFechamento, setAvisoAberturaFechamento] = useState(null);
  const [conferindoAbertura, setConferindoAbertura] = useState(false);

  // Pedido do usuário (22/08/2026): botão manual pra forçar a conferência
  // de retiradas de frente de caixa não lançadas — reler a mesma foto já
  // salva desse fechamento e rodar de novo a checagem (a automática já
  // roda sozinha toda vez que a foto é lida, esse botão é só pra
  // forçar de novo sem precisar reenviar a foto).
  const [conferindoRetiradas, setConferindoRetiradas] = useState(false);

  async function conferirRetiradasDeNovo() {
    if (!grupoEscolhido?.itens?.length) return;

    const itemCaixa =
      grupoEscolhido.itens.find((item) => item.tipo === "caixa") ||
      grupoEscolhido.itens[0];

    setConferindoRetiradas(true);

    try {
      const fotoResultado = await buscarFotoFechamentoCaixa(itemCaixa.id);

      if (!fotoResultado?.foto) {
        alert("Esse fechamento não tem foto salva pra reler.");
        return;
      }

      await conferirFotoDataUrl(fotoResultado.foto, {
        salvarEm: itemCaixa.id,
        dataChaveAlvo: grupoEscolhido.dataChave,
      });
    } catch (erro) {
      alert(erro.message || "Não foi possível conferir as retiradas agora.");
    } finally {
      setConferindoRetiradas(false);
    }
  }

  // Pedido do usuário (22/08/2026): retirada de frente de caixa não tem
  // confronto (Esperado x Informado) como as formas de pagamento — é só
  // um lugar pra anexar a foto do comprovante. A IA lê o valor e já
  // lança direto como despesa (desconta o Saldo na hora).
  const [enviandoRetiradaFoto, setEnviandoRetiradaFoto] = useState(false);
  const [descricaoRetiradaFoto, setDescricaoRetiradaFoto] = useState("");

  async function enviarRetiradaComFoto(arquivo) {
    if (!arquivo) return;

    if (!lojaId) {
      alert("Escolha uma loja específica antes de registrar a retirada.");
      return;
    }

    setEnviandoRetiradaFoto(true);

    try {
      const fotoComprimida = await comprimirImagem(arquivo);
      const dataDoTurno =
        grupoEscolhido?.dataChave ||
        new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

      const despesa = await registrarRetiradaComFoto(
        fotoComprimida,
        lojaId,
        dataDoTurno,
        descricaoRetiradaFoto
      );

      if (despesa?.erro_leitura) {
        alert(despesa.erro_leitura);
        return;
      }

      alert(
        despesa.ehFundo
          ? `💰 Sem motivo específico — guardado no Cofre: ${formatarMoeda(despesa.valor)}`
          : `✅ Retirada lançada como despesa: ${despesa.descricao} — ${formatarMoeda(despesa.valor)}`
      );
      setDescricaoRetiradaFoto("");
    } catch (erro) {
      alert(erro.message || "Não foi possível registrar a retirada.");
    } finally {
      setEnviandoRetiradaFoto(false);
    }
  }

  // Pedido do usuário (22/08/2026): linha "Cortesia" do Confronto ganha
  // opção de anexar foto (do vale/comprovante de cortesia) — a IA lê o
  // valor e preenche o "Informado" sozinha, sem precisar digitar.
  const [lendoFotoInformado, setLendoFotoInformado] = useState(null);

  async function lerFotoParaInformado(forma, arquivo) {
    if (!arquivo) return;

    setLendoFotoInformado(forma);

    try {
      const fotoComprimida = await comprimirImagem(arquivo);
      const resultado = await lerValorFechamentoCaixa(fotoComprimida);

      if (resultado.erro_leitura || resultado.valor == null) {
        alert(resultado.erro_leitura || "Não consegui ler um valor nessa foto.");
        return;
      }

      setValoresInformados((anterior) => ({
        ...anterior,
        [forma]: Number(resultado.valor).toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
      }));
    } catch (erro) {
      alert(erro.message || "Não foi possível ler a foto.");
    } finally {
      setLendoFotoInformado(null);
    }
  }

  async function conferirAberturaVsFechamentoAnterior() {
    setConferindoAbertura(true);
    setAvisoAberturaFechamento(null);

    try {
      const resultado = await buscarDinheiroInformado();
      const registros = (resultado?.registros || [])
        .filter(
          (item) =>
            String(item.loja_id) === String(lojaId) &&
            item.fechamento_id != null // só fechamentos de verdade (lidos de foto), não ajustes manuais
        )
        .sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));

      if (registros.length < 1) {
        setAvisoAberturaFechamento({
          tipo: "info",
          texto: "Ainda não tem nenhum fechamento lido por foto pra comparar.",
        });
        return;
      }

      // Pedido do usuário (26/08/2026): "preciso que a comparação seja
      // sempre do penúltimo fechamento pra última abertura" — sem exigir
      // que exista literalmente um fechamento de "hoje" e outro de
      // "ontem" no calendário. Sempre os dois turnos mais recentes,
      // sejam quais forem as datas. Ordena pela data REAL do turno
      // (data_abertura_turno, lida do papel) — não por criado_em (que é
      // quando a foto foi lida/processada, pode ser bem depois do turno
      // de verdade, ex: ler de manhã a foto de ontem à noite).
      const formatarDataCurta = (iso) =>
        new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR");

      function turnoRealDoRegistro(registro) {
        const fechamento = fechamentosDisponiveis.find(
          (item) => item.id === registro.fechamento_id
        );
        return (
          fechamento?.data_abertura_turno || hojeDoRegistro(registro.criado_em)
        );
      }

      const registrosPorTurno = [...registros].sort(
        (a, b) =>
          turnoRealDoRegistro(a) < turnoRealDoRegistro(b) ? -1 : 1
      );

      // Pedido do usuário (01/09/2026): se tem um fechamento selecionado
      // na tela, a conferência é sobre ELE — abertura desse turno × o que
      // fechou no turno imediatamente anterior. Antes comparava sempre os
      // dois turnos mais recentes, então conciliando o dia 31 ainda
      // aparecia "29 → 30". Sem seleção, mantém o comportamento antigo.
      const idsSelecionados = grupoEscolhido
        ? new Set(grupoEscolhido.itens.map((item) => item.id))
        : null;
      const registroSelecionado = idsSelecionados
        ? registrosPorTurno.find((r) => idsSelecionados.has(r.fechamento_id))
        : null;

      let ultimaAbertura;
      let penultimoFechamento;

      if (grupoEscolhido && !registroSelecionado) {
        setAvisoAberturaFechamento({
          tipo: "info",
          texto:
            'A abertura desse fechamento ainda não foi lida da foto — clique em "🔄 Ler foto de novo" pra conferir contra o turno anterior.',
        });
        return;
      }

      if (registroSelecionado) {
        const dataSelecionada = turnoRealDoRegistro(registroSelecionado);
        const anteriores = registrosPorTurno.filter(
          (r) => turnoRealDoRegistro(r) < dataSelecionada
        );
        if (anteriores.length === 0) {
          setAvisoAberturaFechamento({
            tipo: "info",
            texto:
              "Não tem nenhum fechamento lido por foto ANTES desse pra comparar a abertura.",
          });
          return;
        }
        ultimaAbertura = registroSelecionado;
        penultimoFechamento = anteriores[anteriores.length - 1];
      } else {
        if (registrosPorTurno.length < 2) {
          setAvisoAberturaFechamento({
            tipo: "info",
            texto:
              "Ainda não tem fechamentos suficientes lidos por foto pra comparar (precisa de pelo menos 2).",
          });
          return;
        }
        ultimaAbertura = registrosPorTurno[registrosPorTurno.length - 1];
        penultimoFechamento =
          registrosPorTurno[registrosPorTurno.length - 2];
      }

      const dataPenultimo = turnoRealDoRegistro(penultimoFechamento);
      const dataUltima = turnoRealDoRegistro(ultimaAbertura);
      const fechamentoAnterior = Number(penultimoFechamento.em_caixa || 0);
      const aberturaMaisRecente = Number(ultimaAbertura.abertura || 0);
      const diferenca = Number(
        (aberturaMaisRecente - fechamentoAnterior).toFixed(2)
      );
      const periodoTexto = `(fechamento de ${formatarDataCurta(dataPenultimo)} → abertura de ${formatarDataCurta(dataUltima)})`;

      if (Math.abs(diferenca) <= 0.02) {
        setAvisoAberturaFechamento({
          tipo: "ok",
          texto: `✅ Bateu ${periodoTexto} — abriu com ${formatarMoeda(aberturaMaisRecente)}, igual ao que fechou no turno anterior.`,
        });
      } else {
        setAvisoAberturaFechamento({
          tipo: "alerta",
          texto: `⚠️ Diferença ${periodoTexto}: fechou o turno anterior com ${formatarMoeda(fechamentoAnterior)}, mas abriu com ${formatarMoeda(aberturaMaisRecente)} — ${diferenca > 0 ? "sobrou" : "faltou"} ${formatarMoeda(Math.abs(diferenca))}. Confira se alguém mexeu no dinheiro do caixa entre os dois fechamentos.`,
        });
      }
    } catch (erro) {
      setAvisoAberturaFechamento({
        tipo: "erro",
        texto: erro.message || "Não foi possível conferir agora.",
      });
    } finally {
      setConferindoAbertura(false);
    }
  }

  // Pedido do usuário: mostra a lista de Fechamentos de Caixa dessa loja
  // pra ele escolher qual conciliar — não é mais só "o último" sozinho.
  useEffect(() => {
    if (!lojaId) {
      setFechamentosDisponiveis([]);
      setRetiradasCaixa([]);
      return;
    }

    setCarregandoLista(true);

    buscarFechamentosCaixa()
      .then((dados) => {
        const todosDaLoja = (Array.isArray(dados) ? dados : []).filter(
          (item) => String(item.loja_id) === String(lojaId)
        );

        // BUG REAL corrigido (24/08/2026): a correção de hoje de manhã
        // (Foto 1/Foto 2 sempre mostrando "Foto 1") trocou o tipo salvo
        // de "caixa" pra "caixa_1"/"caixa_2" — só que esse filtro aqui
        // continuou procurando só "caixa" (o tipo antigo), então todo
        // fechamento novo (de hoje em diante) nunca aparecia na
        // Conciliação, mesmo já salvo certinho no banco. "caixa" continua
        // aceito pra não sumir com o histórico de antes da mudança.
        const daLoja = todosDaLoja
          .filter((item) => item.tipo && item.tipo.startsWith("caixa"))
          .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))
          .slice(0, 20);

        setFechamentosDisponiveis(daLoja);
        setRetiradasCaixa(
          todosDaLoja.filter((item) => item.tipo === "pago_dinheiro_caixa")
        );
        setComandasCanceladas(
          todosDaLoja.filter((item) => item.tipo === "comandas_canceladas")
        );
      })
      .catch(() => {
        setFechamentosDisponiveis([]);
        setRetiradasCaixa([]);
        setComandasCanceladas([]);
      })
      .finally(() => setCarregandoLista(false));
  }, [lojaId]);

  // Pedido do usuário: um fechamento pode ter 2 fotos (Foto 1 / Foto 2),
  // que salvam como 2 registros separados no banco mas são o MESMO
  // fechamento físico — antes apareciam como 2 botões distintos, confuso.
  //
  // BUG REAL corrigido (29/08/2026): antes agrupava só por "dia do envio"
  // (hojeDoRegistro, corte 5h). Isso juntava por engano DOIS fechamentos
  // diferentes: um lido à tarde (ex.: turno de ontem, foto lida hoje 13h)
  // e o fechamento REAL enviado de madrugada do dia seguinte — os dois
  // caíam no mesmo "dia" pelo corte de 5h. Como o primeiro já estava
  // finalizado, o grupo INTEIRO sumia da lista e o fechamento novo nunca
  // aparecia pra conciliar. Agora: (1) separa por LOTE de envio — fotos do
  // mesmo fechamento chegam juntas, em minutos; um intervalo grande (>4h)
  // começa outro lote; (2) resolve a data de cada lote (data do turno lida
  // do papel, senão o dia do envio); (3) só então junta lotes que sejam do
  // mesmo dia de verdade. Corrige também o bug de 17/08/2026 (a data do
  // grupo é a do turno lido do papel quando existe, não a do envio).
  const todosOsGrupos = useMemo(() => {
    const ordenados = [...fechamentosDisponiveis].sort(
      (a, b) => new Date(a.criado_em) - new Date(b.criado_em)
    );

    const JANELA_MESMO_ENVIO_MS = 4 * 60 * 60 * 1000;
    const lotes = [];
    for (const item of ordenados) {
      const loteAtual = lotes[lotes.length - 1];
      const ultimoDoLote = loteAtual?.[loteAtual.length - 1];
      if (
        ultimoDoLote &&
        new Date(item.criado_em) - new Date(ultimoDoLote.criado_em) <=
          JANELA_MESMO_ENVIO_MS
      ) {
        loteAtual.push(item);
      } else {
        lotes.push([item]);
      }
    }

    const porData = new Map();
    for (const itens of lotes) {
      const dataAberturaReal = itens.find(
        (item) => item.data_abertura_turno
      )?.data_abertura_turno;
      const dataChave =
        dataAberturaReal || hojeDoRegistro(itens[0].criado_em);
      if (!porData.has(dataChave)) porData.set(dataChave, []);
      porData.get(dataChave).push(...itens);
    }

    return Array.from(porData.entries())
      .map(([dataChave, itens]) => ({
        dataChave,
        itens: itens.sort(
          (a, b) => new Date(a.criado_em) - new Date(b.criado_em)
        ),
      }))
      .sort((a, b) => (a.dataChave < b.dataChave ? 1 : -1));
  }, [fechamentosDisponiveis]);

  // Pedido do usuário (12/08/2026): depois de "Finalizar Conciliação", o
  // fechamento some da lista padrão — só volta a aparecer buscando pela
  // data em "Conciliações".
  const fechamentosAgrupados = useMemo(
    () =>
      todosOsGrupos.filter(
        (grupo) => !grupo.itens.some((item) => item.conciliacao_finalizada_em)
      ),
    [todosOsGrupos]
  );

  const gruposFinalizados = useMemo(
    () =>
      todosOsGrupos.filter((grupo) =>
        grupo.itens.some((item) => item.conciliacao_finalizada_em)
      ),
    [todosOsGrupos]
  );

  // Usa os dados da PRIMEIRA foto do grupo (mais antiga) que realmente
  // tiver alguma coisa salva — nem chega a olhar pra segunda foto se a
  // primeira já tem dados. Mesma regra do "pára assim que achar" usado na
  // leitura ao vivo (lerFotosDoGrupoEmOrdem): nem toda foto extra tem a
  // tabela CONFERÊNCIA (pode ser só outra página do comprovante, tipo
  // canais de venda), e nesse caso a IA pode ter "inventado" categoria
  // antes dessa correção — misturar isso com os dados certos da primeira
  // foto criava linha fantasma (ex: "Cortesia" que nunca existiu).
  function mesclarDosItens(grupo, campo) {
    if (!grupo) return null;

    for (const item of grupo.itens) {
      if (item[campo] && Object.keys(item[campo]).length > 0) {
        return item[campo];
      }
    }

    return null;
  }

  // Monta o Informado "de fábrica" de um grupo — o que já veio salvo no
  // banco (leitura de foto anterior), sem nenhuma edição feita agora.
  function baseInformadoDoGrupo(grupo) {
    const base = { ...valoresInformadosBase };
    const salvos = mesclarDosItens(grupo, "valores_informados");

    if (salvos) {
      Object.entries(salvos).forEach(([forma, valor]) => {
        if (valor != null) {
          // Bug real corrigido (22/08/2026): .toFixed(2) sempre usa ponto
          // decimal ("374.20", formato americano) — mas o resto do
          // sistema (CampoValor, paraNumero) espera formato brasileiro
          // (vírgula decimal, ponto de milhar). "374.20" salvo assim era
          // lido de volta como 37420 (o ponto sendo tratado como
          // separador de milhar), inflando a diferença em ~100x.
          base[forma] = Number(valor).toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
        }
      });
    }

    return base;
  }

  // O que aparece na tela é SEMPRE calculado na hora: a base do
  // fechamento selecionado AGORA + só as edições feitas pra esse mesmo
  // fechamento (edicoesPorData é isolado por dataChave). Não existe mais
  // um estado único "solto" que precisa lembrar de resetar ao trocar de
  // fechamento — por construção, nunca mistura dado de dois dias.
  const valoresInformados = useMemo(() => {
    if (!grupoEscolhido) return valoresInformadosBase;

    return {
      ...baseInformadoDoGrupo(grupoEscolhido),
      ...(edicoesPorData[grupoEscolhido.dataChave] || {}),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupoEscolhido, edicoesPorData]);

  // Mantém um ref sempre com o valor MESCLADO atual (não só as edições) —
  // usado pra suportar a forma antiga de chamar
  // setValoresInformados((anterior) => ({...anterior, x})) sem reescrever
  // cada chamada existente.
  const valoresInformadosRef = useRef(valoresInformados);
  useEffect(() => {
    valoresInformadosRef.current = valoresInformados;
  }, [valoresInformados]);

  // Compatibilidade: todo o resto do código já chama
  // setValoresInformados(valor) ou setValoresInformados((anterior) => novo)
  // — aqui só redireciona pra dentro de edicoesPorData, na chave do
  // fechamento que estiver selecionado NO MOMENTO da chamada (nunca no
  // fechamento que estava selecionado antes).
  function setValoresInformados(atualizadorOuValor) {
    const dataChaveAtual = dataChaveSelecionadaRef.current;
    if (!dataChaveAtual) return;

    const valorNovo =
      typeof atualizadorOuValor === "function"
        ? atualizadorOuValor(valoresInformadosRef.current)
        : atualizadorOuValor;

    setEdicoesPorData((anterior) => ({
      ...anterior,
      [dataChaveAtual]: valorNovo,
    }));
  }

  // BUG GRAVE corrigido (13/08/2026): se o usuário clicasse "Conciliar
  // agora" e trocasse de fechamento ENQUANTO a busca (PagSeguro/Saipos/
  // foto) ainda estava em andamento, a resposta atrasada do fechamento
  // ANTERIOR chegava depois e sobrescrevia os dados do fechamento novo —
  // condição de corrida clássica. Esse ref sempre guarda qual fechamento
  // está selecionado AGORA; toda resposta assíncrona confere contra ele
  // antes de aplicar no estado (inclusive dentro do próprio
  // setValoresInformados acima), e se o usuário já tiver trocado de
  // fechamento nesse meio tempo, a resposta atrasada é descartada.
  const dataChaveSelecionadaRef = useRef(null);

  useEffect(() => {
    dataChaveSelecionadaRef.current = grupoEscolhido?.dataChave ?? null;
  }, [grupoEscolhido?.dataChave]);

  function aindaSelecionado(dataChaveAlvo) {
    return (
      dataChaveAlvo === undefined ||
      dataChaveSelecionadaRef.current === dataChaveAlvo
    );
  }

  // "resumo"/"resumoSaipos" continuam se chamando assim no resto do código
  // (setResumo(x), resumo?.campo) — só que agora são derivados do mapa por
  // data, nunca guardam nada "solto" que precise lembrar de limpar.
  const resumo = grupoEscolhido
    ? resumoPorData[grupoEscolhido.dataChave] ?? null
    : null;
  const resumoSaipos = grupoEscolhido
    ? resumoSaiposPorData[grupoEscolhido.dataChave] ?? null
    : null;

  function setResumo(valor) {
    const dataChaveAtual = dataChaveSelecionadaRef.current;
    if (!dataChaveAtual) return;
    setResumoPorData((anterior) => ({ ...anterior, [dataChaveAtual]: valor }));
  }

  function setResumoSaipos(valor) {
    const dataChaveAtual = dataChaveSelecionadaRef.current;
    if (!dataChaveAtual) return;
    setResumoSaiposPorData((anterior) => ({
      ...anterior,
      [dataChaveAtual]: valor,
    }));
  }

  // BUG REAL corrigido (16/08/2026): antes disso, escolher uma data só
  // marcava "grupoEscolhido" — a busca de verdade (PagSeguro + Saipos +
  // foto) só rodava se o operador clicasse "✅ Conciliar agora" DEPOIS,
  // num segundo passo manual. resumo/resumoSaipos são estado só de sessão
  // (não salvo no banco), então reabrir um fechamento já conciliado antes
  // (numa aba nova, depois de recarregar a página, etc) sem clicar
  // "Conciliar agora" de novo deixava o Esperado do Cartão de crédito/
  // débito/PIX (que só vem da Saipos/PagSeguro ao vivo, nunca salvo) em
  // "—", enquanto os outros campos (Vale, A prazo, Pago Online — que TÊM
  // um valor salvo no banco de uma leitura anterior) continuavam
  // aparecendo normal. Resultado: tela pela metade, sem nenhum aviso do
  // porquê. Agora a busca dispara sozinha ao escolher a data, sem
  // depender do operador lembrar do segundo clique — só uma vez por data
  // nessa sessão (não fica rebuscando à toa se já tem os dados).
  useEffect(() => {
    if (!grupoEscolhido) return;

    const chave = grupoEscolhido.dataChave;
    const jaTemSaipos = Object.prototype.hasOwnProperty.call(
      resumoSaiposPorData,
      chave
    );
    const jaTemPagSeguro = Object.prototype.hasOwnProperty.call(
      resumoPorData,
      chave
    );

    if (!jaTemSaipos || !jaTemPagSeguro) {
      conciliarAgora();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupoEscolhido?.dataChave]);

  // Busca o registro de dinheiro (abertura / em caixa / retiradas
  // impressas) do fechamento selecionado, pra montar a conferência do
  // dinheiro (painel só-admin). Só leitura.
  useEffect(() => {
    // Trocou de fechamento — limpa o aviso de abertura×fechamento
    // anterior (era do fechamento de antes, confundia).
    setAvisoAberturaFechamento(null);

    if (!grupoEscolhido || !ehAdministrador) {
      setDinheiroDoFechamento(null);
      return;
    }

    let cancelado = false;
    const idsDoGrupo = new Set(grupoEscolhido.itens.map((item) => item.id));

    buscarDinheiroInformado()
      .then((resultado) => {
        if (cancelado) return;
        const registro = (resultado?.registros || []).find((item) =>
          idsDoGrupo.has(item.fechamento_id)
        );
        setDinheiroDoFechamento(registro || null);
      })
      .catch(() => {
        if (!cancelado) setDinheiroDoFechamento(null);
      });

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupoEscolhido?.dataChave, ehAdministrador]);

  // Pedido do usuário: essa tela não é mais "tempo real" — uma vez
  // conciliado o fechamento, não tem por que ficar rodando de novo. Depois
  // de escolher qual Fechamento de Caixa usar, um botão busca a PagSeguro
  // só daquele dia e já lê a(s) foto(s) sozinho.
  async function conciliarAgora() {
    if (!grupoEscolhido) return;

    const dataChaveAlvo = grupoEscolhido.dataChave;

    setCarregando(true);
    setErro("");
    setResultadoFoto(null);
    setResumo(null);
    setResumoSaipos(null);
    // Não deixa categoria dinâmica (A prazo/Vale/Voucher/Cortesia/etc) de
    // um fechamento anterior vazar pra esse — cada fechamento começa do
    // zero, só as formas fixas (cartão/pix/dinheiro).
    setValoresInformados(valoresInformadosBase);

    const dataFechamento = grupoEscolhido.dataChave;

    // As buscas não dependem uma da outra (vendas na PagSeguro × vendas na
    // Saipos × leitura de cada foto por IA) — rodando em paralelo em vez
    // de uma esperar a outra, o tempo total fica perto da mais lenta, não
    // da soma.
    const buscaVendas = buscarVendasPagSeguro(dataFechamento, dataFechamento)
      .then((resultado) => {
        if (!aindaSelecionado(dataChaveAlvo)) return;
        setResumo(resultado);
      })
      .catch((erroBusca) => {
        if (!aindaSelecionado(dataChaveAlvo)) return;
        setErro(
          erroBusca.message ||
            "Não foi possível buscar as vendas na PagSeguro."
        );
      });

    // iFood/Brendi (Pago Online), Voucher Parceiro e A prazo (funcionários)
    // já são contabilizados pela própria Saipos — não falha a conciliação
    // se essa loja ainda não tiver o ID da Saipos cadastrado, só não
    // preenche essas linhas.
    const buscaSaipos = buscarFechamentoSaipos(lojaId, dataFechamento)
      .then((resultado) => {
        if (!aindaSelecionado(dataChaveAlvo)) return;
        setResumoSaipos(resultado);
      })
      .catch(() => {
        if (!aindaSelecionado(dataChaveAlvo)) return;
        setResumoSaipos(null);
      });

    // Pedido do usuário: uma vez lida a foto, o valor fica salvo nesse
    // registro — refazer a conciliação usa o valor salvo, sem chamar a IA
    // de novo (evita o valor mudar sozinho entre uma tentativa e outra).
    // Só o botão "Ler foto de novo" força uma releitura. Um fechamento pode
    // ter até 2 fotos (Foto 1 / Foto 2) — lê EM ORDEM (a mais antiga
    // primeiro) e PÁRA assim que achar uma foto com dados de verdade: nem
    // toda foto extra tem a tabela CONFERÊNCIA (pode ser só outra página
    // do comprovante), e se a IA "inventar" categoria numa foto sem
    // tabela, ler ela por cima correria o risco de sobrescrever os
    // valores certos já achados na primeira foto.
    const buscaFotos = lerFotosDoGrupoEmOrdem(grupoEscolhido.itens, dataChaveAlvo);

    await Promise.all([buscaVendas, buscaSaipos, buscaFotos]);
    setCarregando(false);
  }

  async function lerOuUsarFotoDoItem(item, dataChaveAlvo) {
    if (item.valores_informados) {
      return usarValoresSalvos(item.valores_informados, {
        silencioso: true,
        dataChaveAlvo,
      });
    }

    try {
      const fotoResultado = await buscarFotoFechamentoCaixa(item.id);
      return await conferirFotoDataUrl(fotoResultado?.foto, {
        salvarEm: item.id,
        silencioso: true,
        dataChaveAlvo,
      });
    } catch (erroFoto) {
      return {
        erro_leitura:
          erroFoto.message ||
          "Não foi possível buscar uma das fotos desse fechamento.",
      };
    }
  }

  async function lerFotosDoGrupoEmOrdem(itens, dataChaveAlvo) {
    const resultados = [];

    for (const item of itens) {
      const resultado = await lerOuUsarFotoDoItem(item, dataChaveAlvo);
      resultados.push(resultado);
      if (resultado?.sucesso) break;
    }

    if (!aindaSelecionado(dataChaveAlvo)) return;
    setResultadoFoto(agregarResultadosFoto(resultados));
  }

  // Combina o resultado da leitura/reaproveitamento de cada foto do grupo
  // num só objeto pra mostrar uma mensagem só (em vez de uma por foto).
  function agregarResultadosFoto(resultados) {
    const validos = resultados.filter(Boolean);
    const algumSucesso = validos.some((r) => r.sucesso);
    const algumSalvo = validos.some((r) => r.salvo);
    const formasNaoLidas = Array.from(
      new Set(validos.flatMap((r) => r.formasNaoLidas || []))
    );
    const erro = validos.find((r) => r.erro_leitura);
    const avisoSomaNaoBate = validos.find((r) => r.avisoSomaNaoBate)
      ?.avisoSomaNaoBate;

    if (!algumSucesso && erro) {
      return { erro_leitura: erro.erro_leitura, debugRespostaIa: erro.debugRespostaIa };
    }

    return {
      sucesso: algumSucesso,
      salvo: algumSalvo,
      formasNaoLidas,
      avisoSomaNaoBate: avisoSomaNaoBate || null,
    };
  }

  // Usa uma leitura já salva anteriormente, sem chamar a IA de novo.
  function usarValoresSalvos(valoresSalvos, { silencioso, dataChaveAlvo } = {}) {
    // Usuário já trocou de fechamento antes disso terminar — descarta,
    // não aplica em cima do fechamento errado.
    if (!aindaSelecionado(dataChaveAlvo)) {
      return { sucesso: false, formasNaoLidas: [] };
    }

    setValoresInformados((anterior) => {
      const novo = { ...anterior };

      Object.entries(valoresSalvos).forEach(([forma, valor]) => {
        if (valor != null) {
          // Mesmo bug de .toFixed(2) corrigido acima em baseInformadoDoGrupo.
          novo[forma] = Number(valor).toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
        }
      });

      return novo;
    });

    const resultado = { sucesso: true, salvo: true, formasNaoLidas: [] };
    if (!silencioso) setResultadoFoto(resultado);
    return resultado;
  }

  // Força reler as fotos do grupo (ignora o que já estava salvo) — usado
  // quando o operador clica "Ler foto de novo" de propósito. Mesma regra
  // de ordem/parada antecipada do conciliarAgora (primeira foto com dados
  // de verdade tem prioridade).
  async function relerFotoAgora() {
    if (!grupoEscolhido) return;

    const dataChaveAlvo = grupoEscolhido.dataChave;

    setEnviandoFoto(true);
    setResultadoFoto(null);

    const resultados = [];

    for (const item of grupoEscolhido.itens) {
      let resultado;
      try {
        const fotoResultado = await buscarFotoFechamentoCaixa(item.id);
        resultado = await conferirFotoDataUrl(fotoResultado?.foto, {
          salvarEm: item.id,
          silencioso: true,
          dataChaveAlvo,
        });
      } catch (erroFoto) {
        resultado = {
          erro_leitura:
            erroFoto.message ||
            "Não foi possível buscar uma das fotos desse fechamento.",
        };
      }
      resultados.push(resultado);
      if (resultado?.sucesso) break;
    }

    if (aindaSelecionado(dataChaveAlvo)) {
      setResultadoFoto(agregarResultadosFoto(resultados));
    }
    setEnviandoFoto(false);
  }

  // Marca o fechamento como conciliação finalizada — some da lista padrão
  // de "Escolha o fechamento" (só volta buscando pela data em
  // "Conciliações").
  async function finalizarConciliacao() {
    if (!grupoEscolhido) return;

    const confirmar = window.confirm(
      "Finalizar essa conciliação? Ela vai sumir da lista de fechamentos pra escolher — só dá pra achar de novo buscando pela data em \"Conciliações\"."
    );

    if (!confirmar) return;

    setFinalizandoConciliacao(true);

    try {
      const idsFinalizados = [];

      for (const item of grupoEscolhido.itens) {
        const salvo = await finalizarConciliacaoFechamento(item.id);
        idsFinalizados.push({ id: item.id, em: salvo.conciliacao_finalizada_em });
      }

      setFechamentosDisponiveis((anteriores) =>
        anteriores.map((item) => {
          const achado = idsFinalizados.find((alvo) => alvo.id === item.id);
          return achado
            ? { ...item, conciliacao_finalizada_em: achado.em }
            : item;
        })
      );

      setGrupoEscolhido(null);
    } catch (erro) {
      alert(erro.message || "Não foi possível finalizar a conciliação.");
    } finally {
      setFinalizandoConciliacao(false);
    }
  }

  function buscarConciliacaoPorData() {
    setErroBuscaConciliacoes("");

    if (!dataBuscaConciliacoes) {
      setErroBuscaConciliacoes("Escolha uma data.");
      return;
    }

    const grupo = gruposFinalizados.find(
      (item) => item.dataChave === dataBuscaConciliacoes
    );

    if (!grupo) {
      setErroBuscaConciliacoes(
        "Nenhuma conciliação finalizada encontrada nessa data (a data que vale é a de abertura do caixa)."
      );
      return;
    }

    setGrupoEscolhido(grupo);
    setPainelConciliacoesAberto(false);
  }

  async function conferirFotoDataUrl(
    fotoDataUrl,
    { salvarEm, silencioso, dataChaveAlvo } = {}
  ) {
    if (!fotoDataUrl) return null;

    if (!silencioso) {
      setEnviandoFoto(true);
      setResultadoFoto(null);
    }

    try {
      const resultado = await conferirFechamentoFoto(fotoDataUrl, lojaId);

      // Usuário já trocou de fechamento enquanto a IA lia a foto — descarta
      // essa resposta atrasada, não pode pintar a tabela do fechamento
      // errado.
      if (!aindaSelecionado(dataChaveAlvo)) {
        return { sucesso: false, formasNaoLidas: [] };
      }

      if (resultado.erro_leitura || !resultado.valores) {
        const resultadoErro = {
          erro_leitura:
            resultado.erro_leitura ||
            "Não foi possível ler os valores dessa foto.",
          debugRespostaIa: resultado.debug_resposta_ia,
        };
        if (!silencioso) setResultadoFoto(resultadoErro);
        return resultadoErro;
      }

      // Preenche a tabela de confronto sozinha com o que a foto trouxe —
      // inclui TODAS as categorias que a foto tiver (Dinheiro, Vale, Voucher,
      // etc), não só as 3 fixas (Crédito/Débito/PIX).
      setValoresInformados((anterior) => {
        const novo = { ...anterior };

        Object.entries(resultado.valores).forEach(([forma, valor]) => {
          if (valor != null) {
            // Mesmo bug de .toFixed(2) corrigido acima.
            novo[forma] = Number(valor).toLocaleString("pt-BR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });
          }
        });

        return novo;
      });

      const formasNaoLidas = Object.entries(resultado.valores)
        .filter(([, valor]) => valor == null)
        .map(([forma]) => forma);

      const resultadoOk = {
        sucesso: true,
        formasNaoLidas,
        avisoSomaNaoBate: resultado.aviso_soma_nao_bate || null,
        despesasLancadasAutomaticamente:
          resultado.despesas_lancadas_automaticamente || [],
        // 29/08/2026: retiradas de frente de caixa não descontam mais nada
        // sozinhas — só vem a análise (o que já tem despesa × o que está
        // sem comprovante) + o total "Retiradas (-)" impresso no fechamento.
        retiradasAnalise: resultado.retiradas_analise || null,
        retiradasTotalImpresso:
          resultado.retiradas_caixa != null
            ? Number(resultado.retiradas_caixa)
            : null,
      };
      if (!silencioso) setResultadoFoto(resultadoOk);

      // BUG REAL corrigido (17/08/2026): até aqui, Crédito/Débito/PIX
      // ficavam de fora dessa leitura de propósito — o "Esperado" deles
      // vinha só da API de vendas da Saipos (search_sales), uma conta
      // SEPARADA da que a própria maquininha/POS já faz e imprime na
      // tabela CONFERÊNCIA do comprovante físico. São duas contas
      // diferentes dentro da própria Saipos, quase nunca batem exato —
      // foi isso que causou o "Esperado não bate com o da Saipos" (o
      // Esperado mostrado NUNCA vinha do papel pra essas 3 formas). Como
      // quem já decide "bateu/não bateu" pro Crédito/Débito/PIX é a
      // coluna "Real em conta" (PagSeguro, mais abaixo), não faz sentido
      // o Esperado ter uma fonte diferente de todo o resto — agora TODAS
      // as formas usam a mesma fonte única: a coluna "Esperado" já
      // impressa na tabela CONFERÊNCIA do comprovante.
      const sistemaLidoDaFoto = {};
      if (resultado.esperado) {
        Object.entries(resultado.esperado).forEach(([forma, valor]) => {
          if (valor == null) return;
          sistemaLidoDaFoto[forma] = valor;
        });
      }

      // Pedido do usuário (17/08/2026): a ordem das linhas na tela de
      // Conciliação tem que seguir a mesma ordem impressa na tabela
      // CONFERÊNCIA do comprovante (de cima pra baixo) — se a Saipos
      // mudar a ordem impressa um dia, a tela acompanha sozinha na
      // próxima leitura. "resultado.esperado" já vem do backend na ordem
      // que a IA leu a tabela (topo → base), então só precisa guardar
      // essa mesma ordem de chaves.
      const ordemLidaDaFoto = resultado.esperado
        ? Object.keys(resultado.esperado)
        : [];

      // REMOVIDO (16/08/2026, a pedido do usuário): a fórmula clássica de
      // caixa físico (Abertura + Vendas em dinheiro − Retiradas) sobrescrevia
      // o Esperado do Dinheiro que já vinha certinho da própria tabela
      // CONFERÊNCIA (a mesma fonte confiável usada por TODAS as outras
      // formas). O problema: essa fórmula depende de ler "Abertura (+)" de
      // outra seção da foto (CAIXA:), separada da tabela — bug real
      // encontrado (16/08/2026): a IA confundiu esse valor com o horário
      // "Abertura: 15/08/2026 17:14:49" impresso perto do topo do
      // comprovante (mesma palavra, seção diferente), calculando um
      // Esperado de Dinheiro de R$1.487,22 quando o próprio papel já dizia
      // R$261,19 na tabela CONFERÊNCIA. Uma leitura a mais = uma chance a
      // mais de erro. Dinheiro agora usa a MESMA fonte simples e confiável
      // das outras formas: o valor "Esperado" já impresso na tabela
      // CONFERÊNCIA (sistemaLidoDaFoto.Dinheiro já veio preenchido daí,
      // acima). Retiradas continuam registradas no sistema normalmente,
      // só não entram mais nessa conta — eram usadas só pra essa fórmula.

      // Salva a leitura no fechamento pra não precisar (nem poder) ler de
      // novo por engano nas próximas vezes — só sobrescreve se o operador
      // clicar em "Ler foto de novo" explicitamente.
      if (salvarEm) {
        try {
          const salvo = await salvarValoresInformadosFechamento(
            salvarEm,
            resultado.valores,
            Object.keys(sistemaLidoDaFoto).length > 0
              ? sistemaLidoDaFoto
              : undefined,
            ordemLidaDaFoto.length > 0 ? ordemLidaDaFoto : undefined,
            resultado.data_abertura || undefined
          );

          setFechamentosDisponiveis((anteriores) =>
            anteriores.map((item) =>
              item.id === salvarEm
                ? {
                    ...item,
                    valores_informados: salvo.valores_informados,
                    sistema_manual: salvo.sistema_manual,
                    ordem_formas_pagamento: salvo.ordem_formas_pagamento,
                    data_abertura_turno: salvo.data_abertura_turno,
                  }
                : item
            )
          );

          setGrupoEscolhido((anterior) =>
            anterior
              ? {
                  ...anterior,
                  // BUG REAL corrigido (17/08/2026): a data de abertura
                  // lida agora do papel pode ser diferente da data em
                  // que esse fechamento estava agrupado até aqui (ex:
                  // foto enviada só depois das 5h do dia seguinte). Se
                  // mudou, o "dataChave" do grupo já selecionado tem que
                  // acompanhar — senão a tela continua buscando Saipos/
                  // PagSeguro no dia errado até a página ser recarregada.
                  dataChave: salvo.data_abertura_turno || anterior.dataChave,
                  itens: anterior.itens.map((item) =>
                    item.id === salvarEm
                      ? {
                          ...item,
                          valores_informados: salvo.valores_informados,
                          sistema_manual: salvo.sistema_manual,
                          ordem_formas_pagamento: salvo.ordem_formas_pagamento,
                          data_abertura_turno: salvo.data_abertura_turno,
                        }
                      : item
                  ),
                }
              : anterior
          );
        } catch (erroSalvar) {
          console.error("Erro ao salvar leitura da foto:", erroSalvar);
        }

        // Pedido do usuário (19/08/2026): o "em dinheiro" do card Saldo só
        // desconta despesa e nunca somava nada, porque essa confirmação
        // nunca estava ligada a nenhum botão. Agora, toda vez que a foto
        // do fechamento é lida com sucesso e ela trouxe tanto o "Em
        // caixa" de Dinheiro quanto a "Abertura (+)" em R$, isso já
        // atualiza sozinho — sem precisar de nenhum clique a mais.
        // fechamento_id garante que reler a mesma foto (correção) só
        // ATUALIZA esse valor, nunca soma duas vezes.
        const emCaixaDinheiro = resultado.valores?.["Dinheiro"];
        if (emCaixaDinheiro != null && resultado.abertura_caixa != null) {
          try {
            await salvarDinheiroInformado(
              emCaixaDinheiro,
              resultado.abertura_caixa,
              lojaId,
              salvarEm,
              // Guarda o total "Retiradas (-)" impresso na foto e a lista
              // de retiradas com o campo "Conta:" (ex. "Cofre") pra
              // conferência do dinheiro (painel só-admin mais abaixo).
              resultado.retiradas_caixa ?? null,
              resultado.retiradas_frente_caixa ?? null
            );
          } catch (erroDinheiro) {
            console.error(
              "Erro ao atualizar dinheiro confirmado no fechamento:",
              erroDinheiro
            );
          }
        }
      }

      return resultadoOk;
    } catch (erroFoto) {
      const resultadoErro = {
        erro_leitura: erroFoto.message || "Não foi possível conferir a foto.",
      };
      if (!silencioso) setResultadoFoto(resultadoErro);
      return resultadoErro;
    } finally {
      if (!silencioso) setEnviandoFoto(false);
    }
  }

  // Salva um valor de "Esperado" digitado na mão pelo operador — usado
  // quando a leitura automática da foto não conseguiu ler aquele número
  // (ex: Dinheiro sem Abertura/Vendas legível) ou leu errado. Mesmo
  // caminho de gravação já usado pela leitura por IA (sistema_manual),
  // só que a origem do valor agora é o teclado, não a IA — assim o
  // "Esperado" nunca fica travado em "—" pra sempre.
  async function salvarEsperadoManual(forma) {
    if (!grupoEscolhido || !grupoEscolhido.itens?.length) return;

    // Bug real corrigido (21/08/2026): "35.000" (sem vírgula) virava 35 —
    // usa o paraNumero() do CampoValor, que sempre tira o ponto de milhar
    // primeiro, tenha vírgula ou não.
    const valorNumero = paraNumero(valorEsperadoDigitado);
    if (!Number.isFinite(valorNumero)) {
      alert("Digite um valor válido (ex: 150,00).");
      return;
    }

    const idAlvo = grupoEscolhido.itens[0].id;
    const sistemaAtual = mesclarDosItens(grupoEscolhido, "sistema_manual") || {};
    const valoresAtuais = mesclarDosItens(grupoEscolhido, "valores_informados") || {};

    try {
      const salvo = await salvarValoresInformadosFechamento(idAlvo, valoresAtuais, {
        ...sistemaAtual,
        [forma]: valorNumero,
      });

      setFechamentosDisponiveis((anteriores) =>
        anteriores.map((item) =>
          item.id === idAlvo
            ? {
                ...item,
                valores_informados: salvo.valores_informados,
                sistema_manual: salvo.sistema_manual,
              }
            : item
        )
      );

      setGrupoEscolhido((anterior) =>
        anterior
          ? {
              ...anterior,
              itens: anterior.itens.map((item) =>
                item.id === idAlvo
                  ? {
                      ...item,
                      valores_informados: salvo.valores_informados,
                      sistema_manual: salvo.sistema_manual,
                    }
                  : item
              ),
            }
          : anterior
      );

      setEditandoEsperado(null);
      setValorEsperadoDigitado("");
    } catch (erroSalvar) {
      alert(erroSalvar.message || "Não foi possível salvar o valor.");
    }
  }

  async function verFotoSelecionada(id) {
    if (!id) return;

    setCarregandoPreview(true);

    try {
      const resultado = await buscarFotoFechamentoCaixa(id);
      setFotoPreview(resultado?.foto || null);
    } catch (erroFoto) {
      alert(erroFoto.message || "Não foi possível carregar a foto.");
    } finally {
      setCarregandoPreview(false);
    }
  }

  // A foto de uma "Retirada pro Cofre" mora numa tabela separada
  // (fundo_retiradas_caixa), então tem endpoint próprio — mas reaproveita
  // o mesmo modal de preview das fotos de fechamento.
  async function verFotoFundoCofre(id) {
    if (!id) return;

    setCarregandoPreview(true);

    try {
      const resultado = await buscarFotoFundoRetiradaCaixa(id);
      setFotoPreview(resultado?.foto || null);
    } catch (erroFoto) {
      alert(erroFoto.message || "Não foi possível carregar a foto.");
    } finally {
      setCarregandoPreview(false);
    }
  }

  // Pedido do usuário (12/08/2026): pra conferência na Conciliação, os
  // valores têm que vir CHEIOS (brutos, antes da taxa) — é isso que bate
  // com o comprovante físico (a Saipos não desconta taxa de maquininha).
  // O líquido (com taxa já descontada) continua só no Dashboard, que não
  // é pra mexer.
  const formasPagamento = Object.entries(
    resumo?.totais_brutos_por_forma_pagamento || {}
  );

  // Sistema (Esperado) de cada forma de pagamento — PagSeguro (cartão/PIX)
  // + Saipos/foto (as demais, exceto Dinheiro) + eventual ajuste manual.
  // Isolado num useMemo próprio (não só dentro do confronto) porque o
  // efeito abaixo também precisa desse valor pra pré-preencher o
  // Informado.
  const totaisBrutosSistema = useMemo(() => {
    const totaisBrutos = {};

    // Pedido do usuário (13/08/2026): pro Cartão de crédito/débito/PIX, o
    // "Sistema" agora vem do Esperado da própria Saipos (o que ela
    // esperava vender), não mais do valor real recebido na PagSeguro. O
    // Informado continua sendo o que o operador digita/lê da foto (o que
    // realmente entrou) — então o confronto passa a ser "Saipos esperava
    // vender X" × "realmente entrou Y", pegando direto se uma venda não
    // caiu na maquininha, sem depender de PagSeguro nem de digitação
    // extra. iFood/Brendi (Pago Online), Voucher Parceiro, A prazo
    // (funcionários), Vale, Cortesia e qualquer forma nova entram do
    // mesmo jeito — só Dinheiro fica sem "Sistema" automático (é físico,
    // só o que o operador informar mesmo).
    if (resumoSaipos?.totais_por_forma_pagamento) {
      Object.entries(resumoSaipos.totais_por_forma_pagamento).forEach(
        ([nomeSaipos, valor]) => {
          let nomeConfronto;

          // BUG REAL corrigido (13/08/2026): a Saipos tem uma forma
          // chamada "Pago Online via Pix" (pedido de app cujo trilho é
          // Pix) — o teste "contém a palavra pix" pegava ela junto do PIX
          // de balcão por engano, inflando o Sistema do PIX com dinheiro
          // que na verdade é Pago Online (e já aparece certinho como
          // "Pago Online" no próprio comprovante). Por isso "pago online"
          // tem que ser checado ANTES do "pix" genérico.
          if (/pago online/i.test(nomeSaipos)) {
            nomeConfronto = "Pago Online";
          } else if (/conta.*banc|banc.*conta/i.test(nomeSaipos)) {
            // Pedido do usuário (23/08/2026): "Pix Conta Bancária" cai
            // direto no banco, sem passar pela PagSeguro — por isso vira
            // linha PRÓPRIA (não funde mais dentro de "PIX"), já que não
            // tem como confirmar ela sozinha do mesmo jeito que o Pix
            // QrCode/maquininha (ver FORMAS_PRECISAM_CONFERIR mais abaixo).
            nomeConfronto = "Pix Conta Bancária";
          } else if (/pix/i.test(nomeSaipos)) {
            nomeConfronto = "PIX";
          } else if (nomeSaipos === "Crédito") {
            nomeConfronto = "Cartão de crédito";
          } else if (nomeSaipos === "Débito") {
            nomeConfronto = "Cartão de débito";
          } else {
            nomeConfronto = MAPA_SAIPOS_PARA_CONFRONTO[nomeSaipos] || nomeSaipos;
          }

          if (nomeConfronto === "Dinheiro") return; // Dinheiro não tem Sistema automático

          totaisBrutos[nomeConfronto] =
            (totaisBrutos[nomeConfronto] || 0) + Number(valor || 0);
        }
      );
    }

    // Valor manual informado pelo usuário só pra esse fechamento
    // específico (ex.: Dinheiro, que normalmente não tem "Sistema"
    // automático) — sobrescreve o que vier da Saipos. Recurso raro, usado
    // só em algum caso pontual.
    const sistemaManual = mesclarDosItens(grupoEscolhido, "sistema_manual");
    if (sistemaManual) {
      Object.assign(totaisBrutos, sistemaManual);
    }

    return totaisBrutos;
  }, [resumoSaipos, grupoEscolhido]);

  // REMOVIDO (16/08/2026, a pedido do usuário): esse useEffect pré-
  // preenchia o "Informado" com o próprio valor de referência (Real em
  // conta pra Crédito/Débito/PIX, Sistema pras demais) sempre que o campo
  // estivesse em branco — inclusive antes da foto terminar de ser lida
  // (a leitura da foto/IA demora ~10-12s e roda em paralelo com a busca
  // da PagSeguro, que é bem mais rápida). Na prática isso comparava a
  // PagSeguro com ela mesma e sempre dava "✅ Bateu", mascarando qualquer
  // divergência real — foi exatamente o caso relatado pelo usuário
  // (Cartão de crédito/débito/PIX "bateram" sozinhos, mesmo com o
  // Esperado do comprovante físico bem diferente). O "Informado" agora só
  // vem de duas fontes de verdade: a leitura automática da foto do
  // fechamento (coluna "Em caixa" do comprovante, ver
  // conferirFotoDataUrl acima) ou o próprio operador digitando na hora —
  // nunca mais um valor "chutado" igual à referência só pra não ficar em
  // branco. Fechamentos que já tinham sido lidos/salvos ANTES dessa
  // mudança continuam com o valor antigo (possivelmente o "chute")
  // guardado no banco — precisam clicar "🔄 Ler foto de novo" pra
  // corrigir.

  // Pedido do usuário (23/08/2026): "Pix Conta Bancária" nunca teve fonte
  // pra confirmar sozinha (nem PagSeguro nem foto costumam trazer ela
  // separada) — em vez de deixar o campo em branco esperando o operador
  // digitar um número que ele não tem como conferir de outro jeito, pré-
  // preenche o Informado com o próprio Esperado (Saipos) assim que
  // aparecer, só quando ainda estiver vazio (não sobrescreve se o
  // operador já digitou ou já leu de uma foto). Diferente do useEffect
  // removido em 16/08 (comentário acima), isso é seguro aqui porque a
  // Diferença dessa linha NUNCA mostra "✅ Bateu" sozinha (ver
  // FORMAS_PRECISAM_CONFERIR) — sempre aparece em vermelho pedindo pra
  // conferir, então não mascara divergência nenhuma.
  useEffect(() => {
    const esperadoContaBancaria = totaisBrutosSistema["Pix Conta Bancária"];
    if (esperadoContaBancaria == null) return;

    setValoresInformados((anterior) => {
      if (anterior["Pix Conta Bancária"] != null && anterior["Pix Conta Bancária"] !== "") {
        return anterior;
      }
      return {
        ...anterior,
        "Pix Conta Bancária": esperadoContaBancaria.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
      };
    });
  }, [totaisBrutosSistema]);

  // Confronto Sistema/Real em conta × Informado calculado aqui (não só
  // dentro da tabela) pra poder mostrar um aviso no topo da tela quando
  // tiver diferença, igual o aviso de CMV alto do Dashboard.
  const confrontoCalculado = useMemo(() => {
    const totaisBrutos = { ...totaisBrutosSistema };
    const totaisReaisConta = { ...(resumo?.totais_brutos_por_forma_pagamento || {}) };

    // A lista de linhas é a união do que o operador informou (foto/OCR) com
    // o que a Saipos/PagSeguro reportou como Sistema — assim, se aparecer
    // uma forma de pagamento nova só no Sistema (ainda sem foto lida ou não
    // reconhecida na foto), ela mesmo assim aparece na tabela já com o
    // valor esperado preenchido.
    const formasUnicas = Array.from(
      new Set([...Object.keys(valoresInformados), ...Object.keys(totaisBrutos)])
    );

    // Pedido do usuário (17/08/2026): a ordem das linhas segue a mesma
    // ordem impressa na tabela CONFERÊNCIA do comprovante da Saipos (de
    // cima pra baixo) — guardada em ordem_formas_pagamento na última
    // leitura de foto. Se a Saipos mudar a ordem impressa, a próxima
    // leitura de foto atualiza sozinha. Forma nova que não estava na
    // ordem salva (ex: acabou de ser lida, ainda sem "Ler foto de novo")
    // vai pro final, na ordem que apareceu.
    const ordemSalva = mesclarDosItens(grupoEscolhido, "ordem_formas_pagamento");
    const todasAsFormasOrdenadas = ordemSalva
      ? [...formasUnicas].sort((a, b) => {
          const posA = ordemSalva.indexOf(a);
          const posB = ordemSalva.indexOf(b);
          if (posA === -1 && posB === -1) return 0;
          if (posA === -1) return 1;
          if (posB === -1) return -1;
          return posA - posB;
        })
      : formasUnicas;

    // Pedido do usuário (23/08/2026): "Pix Conta Bancária" sempre logo
    // abaixo de "PIX" na tabela, um pix embaixo do outro — independente
    // de onde ela caiu na ordem salva do comprovante (a ordem salva é de
    // antes de existir essa linha separada, então ela sempre ia parar no
    // final da lista sem esse ajuste).
    const todasAsFormas = todasAsFormasOrdenadas.includes("Pix Conta Bancária")
      ? (() => {
          const semPixConta = todasAsFormasOrdenadas.filter(
            (forma) => forma !== "Pix Conta Bancária"
          );
          const posicaoPix = semPixConta.indexOf("PIX");
          if (posicaoPix === -1) return todasAsFormasOrdenadas;
          return [
            ...semPixConta.slice(0, posicaoPix + 1),
            "Pix Conta Bancária",
            ...semPixConta.slice(posicaoPix + 1),
          ];
        })()
      : todasAsFormasOrdenadas;

    const linhas = todasAsFormas.map((forma) => {
      const temSistema = forma in totaisBrutos;
      const valorSistema = totaisBrutos[forma] || 0;

      const valorInformadoTexto = valoresInformados[forma] ?? "";
      const temInformado = valorInformadoTexto !== "";
      // Bug real corrigido (21/08/2026): "35.000" (sem vírgula) virava
      // 35 — usa o paraNumero() do CampoValor.
      const valorInformado = temInformado ? paraNumero(valorInformadoTexto) : null;

      const precisaConferir = FORMAS_PRECISAM_CONFERIR.includes(forma);

      // Pedido do usuário (23/08/2026): "Pix Conta Bancária" não tem fonte
      // bancária própria pra confirmar sozinha — em vez de "Real em conta"
      // ficar em branco (o que sempre ia sobrar como diferença no total),
      // usa o próprio Informado como Real em conta, fechando o caixa
      // sozinho. O alerta "⚠️ Conferir" (mais abaixo, na coluna Diferença)
      // continua aparecendo do mesmo jeito, deixando claro que esse valor
      // não foi confirmado por nenhuma fonte independente.
      const temRealConta = precisaConferir
        ? temInformado
        : FORMAS_COM_REAL_EM_CONTA.includes(forma) && forma in totaisReaisConta;
      const valorRealConta = temRealConta
        ? precisaConferir
          ? valorInformado
          : totaisReaisConta[forma]
        : null;

      // Base usada pra decidir bateu/não bateu: Real em conta quando
      // existir (mais confiável), senão cai pro Sistema (Saipos) — mesmo
      // comportamento de antes pra quem não tem Real em conta.
      const temBase = temRealConta || temSistema;
      const valorBase = temRealConta ? valorRealConta : valorSistema;

      // Pedido do usuário (21/08/2026): pra Cartão de Crédito/Débito e
      // PIX (formas com Real em conta), o "bateu/não bateu" NÃO deve
      // depender do "Informado" — esse número vem de alguém contando/
      // digitando o totalizador da maquininha na hora de fechar o caixa,
      // e pode ter erro de conta ou comprovante perdido. O "Esperado" já
      // é o que a própria Saipos registrou automaticamente na hora da
      // venda (o vendedor não digita esse número, o sistema registra
      // sozinho) — comparar Esperado direto com o Real em conta (o
      // dinheiro que realmente caiu, verdade objetiva) é mais confiável
      // pra decidir se bateu. O "Informado" continua aparecendo na tela
      // (ainda serve pra pegar um caso de dinheiro sumindo do caixa
      // físico que nem o Esperado nem o Real em conta pegariam sozinhos),
      // só não é mais ele quem decide a cor/veredito dessas 3 formas.
      // BUG REAL corrigido (21/08/2026, achado pelo usuário): tinha
      // invertido o sinal — "Falta" tem que ser quando o Esperado é MAIOR
      // que o Real em conta (esperava mais do que realmente caiu), não o
      // contrário. Ficou mostrando "Sobra" em verde quando na verdade
      // estava faltando dinheiro (ex: Esperado R$402,87, Real R$302,58 —
      // isso é FALTA de R$100,29, não sobra).
      const diferenca =
        temRealConta && temSistema
          ? Number((valorSistema - valorRealConta).toFixed(2))
          : temInformado && temBase
          ? Number((valorBase - valorInformado).toFixed(2))
          : null;
      const bateu = diferenca != null && Math.abs(diferenca) < 0.01;

      return {
        forma,
        valorSistema,
        temSistema,
        valorRealConta,
        temRealConta,
        temBase,
        temInformado,
        diferenca,
        bateu,
      };
    });

    // Pedido do usuário (21/08/2026): antes só somava linha que tinha
    // "Informado" digitado — mas Crédito/Débito/PIX agora decidem sozinhas
    // (Esperado × Real em conta), mesmo sem ninguém digitar nada em
    // Informado. O total tem que incluir toda linha que TEM veredito
    // (diferenca calculada), não só as que dependem do Informado.
    const diferencaTotal = linhas
      .filter((linha) => linha.diferenca != null)
      .reduce((soma, linha) => soma + linha.diferenca, 0);
    const algumInformado = linhas.some((linha) => linha.diferenca != null);

    return { linhas, diferencaTotal, algumInformado };
  }, [totaisBrutosSistema, valoresInformados, resumo, grupoEscolhido]);

  const temDiferencaNoConfronto =
    confrontoCalculado.algumInformado &&
    Math.abs(confrontoCalculado.diferencaTotal) >= 0.01;

  return (
    <>
      <div
        className="conciliacao-abas"
        style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}
      >
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            className={abaAtiva === "caixa" ? "aba-ativa" : ""}
            onClick={() => setAbaAtiva("caixa")}
          >
            Fechamento de Caixa
          </button>
          <button
            type="button"
            className={abaAtiva === "despesas" ? "aba-ativa" : ""}
            onClick={() => setAbaAtiva("despesas")}
          >
            Despesas (Extrato Bancário)
          </button>
        </div>

        {abaAtiva === "caixa" && (
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setPainelConciliacoesAberto((anterior) => !anterior);
              setErroBuscaConciliacoes("");
            }}
          >
            📅 Conciliações
          </button>
        )}
      </div>

      {abaAtiva === "caixa" && painelConciliacoesAberto && (
        <div
          className="panel"
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: "12px",
            flexWrap: "wrap",
            margin: "8px 0 16px",
          }}
        >
          <label style={{ margin: 0 }}>
            Data de abertura do caixa
            <input
              type="date"
              value={dataBuscaConciliacoes}
              onChange={(evento) => setDataBuscaConciliacoes(evento.target.value)}
            />
          </label>

          <button
            type="button"
            className="primary-button"
            onClick={buscarConciliacaoPorData}
          >
            Buscar
          </button>

          {erroBuscaConciliacoes && (
            <small style={{ color: "#ff4655" }}>{erroBuscaConciliacoes}</small>
          )}
        </div>
      )}

      {abaAtiva === "despesas" ? (
        <ConciliacaoDespesas />
      ) : (
    <section className="conciliacao-layout">
      {temDiferencaNoConfronto && (
        <div
          className={
            confrontoCalculado.diferencaTotal > 0
              ? "fp-alerta-cmv fp-alerta-cmv-critico"
              : "fp-alerta-cmv fp-alerta-cmv-sucesso"
          }
          style={{ marginBottom: "16px" }}
        >
          <span className="fp-alerta-cmv-icone">
            {confrontoCalculado.diferencaTotal > 0 ? "🚨" : "✅"}
          </span>

          <div>
            <strong>
              Diferença no confronto:{" "}
              {confrontoCalculado.diferencaTotal > 0
                ? `falta ${formatarMoeda(confrontoCalculado.diferencaTotal)}`
                : `sobra ${formatarMoeda(
                    Math.abs(confrontoCalculado.diferencaTotal)
                  )}`}
            </strong>
            <span>
              O que o sistema esperava não bateu com o que foi informado no
              fechamento. Confira a tabela de confronto abaixo antes de
              fechar o caixa.
            </span>
          </div>
        </div>
      )}

      <article className="panel">
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            marginBottom: "0.3rem",
          }}
        >
          <div>
            <span className="eyebrow">Conciliação de pagamentos</span>
            <h2 style={{ margin: 0 }}>PagSeguro em tempo real</h2>
          </div>

          {resumo && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: "1px",
                lineHeight: 1.4,
                fontSize: "14px",
              }}
            >
              <div>
                <span style={{ display: "inline-block", width: "20px" }}>
                  💰
                </span>{" "}
                Total vendido (bruto):{" "}
                <strong>{formatarMoeda(resumo.total_bruto)}</strong>{" "}
                <small style={{ color: "#9fb0c4" }}>
                  (líquido {formatarMoeda(resumo.total_recebido)}, taxa{" "}
                  {formatarMoeda(resumo.total_bruto - resumo.total_recebido)})
                </small>
              </div>

              <div>
                <span style={{ display: "inline-block", width: "20px" }}>
                  🧾
                </span>{" "}
                Vendas: <strong>{resumo.quantidade_recebida} recebidas</strong>
                {resumo.quantidade_pendente_ou_cancelada > 0 &&
                  ` · ${resumo.quantidade_pendente_ou_cancelada} pend./canc.`}
              </div>

              {formasPagamento.map(([forma, valor]) => (
                <div key={forma}>
                  <span style={{ display: "inline-block", width: "20px" }}>
                    💳
                  </span>{" "}
                  <strong style={{ color: "#16ca50" }}>{forma}</strong>:{" "}
                  <strong>{formatarMoeda(valor)}</strong>
                </div>
              ))}
            </div>
          )}

          <div
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            {!lojaId ? (
              <small className="foto-ajuda">
                Selecione uma loja no seletor do topo da tela.
              </small>
            ) : (
              <>
                <strong style={{ fontSize: "13px" }}>
                  1. Escolha o fechamento
                </strong>

                {carregandoLista ? (
                  <small className="foto-ajuda">Carregando...</small>
                ) : fechamentosAgrupados.length === 0 ? (
                  <small className="foto-ajuda">
                    Nenhum Fechamento de Caixa encontrado ainda pra essa
                    loja.
                  </small>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "8px",
                    }}
                  >
                    {fechamentosAgrupados.map((grupo) => (
                      <button
                        key={grupo.dataChave}
                        type="button"
                        className={
                          grupoEscolhido?.dataChave === grupo.dataChave
                            ? "primary-button"
                            : "secondary-button"
                        }
                        onClick={() => setGrupoEscolhido(grupo)}
                      >
                        📅{" "}
                        {new Date(
                          `${grupo.dataChave}T00:00:00`
                        ).toLocaleDateString("pt-BR")}
                        {grupo.itens.length > 1
                          ? ` (${grupo.itens.length} fotos)`
                          : ""}
                      </button>
                    ))}
                  </div>
                )}

                {grupoEscolhido && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "1rem",
                      flexWrap: "wrap",
                      marginTop: "4px",
                    }}
                  >
                    <strong style={{ fontSize: "13px" }}>
                      2. Gerar a conciliação
                    </strong>

                    <button
                      type="button"
                      className="approve-button"
                      style={{ fontSize: "15px", padding: "10px 18px" }}
                      onClick={conciliarAgora}
                      disabled={carregando || enviandoFoto}
                    >
                      {carregando || enviandoFoto
                        ? "Conciliando..."
                        : "✅ Conciliar agora"}
                    </button>

                    {grupoEscolhido.itens.map((item, indice) => (
                      <button
                        key={item.id}
                        type="button"
                        className="secondary-button"
                        onClick={() => verFotoSelecionada(item.id)}
                        disabled={carregandoPreview}
                      >
                        {carregandoPreview
                          ? "Carregando..."
                          : grupoEscolhido.itens.length > 1
                            ? `👁️ Ver foto ${indice + 1}`
                            : "👁️ Ver foto"}
                      </button>
                    ))}

                    {grupoEscolhido.itens.some(
                      (item) => item.valores_informados
                    ) && (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={relerFotoAgora}
                        disabled={carregando || enviandoFoto}
                        title="A leitura já está salva — só use isso se quiser tentar ler a(s) foto(s) de novo."
                      >
                        {enviandoFoto ? "Lendo..." : "🔄 Ler foto de novo"}
                      </button>
                    )}

                    {resumo && (
                      <button
                        type="button"
                        className="delete-button"
                        onClick={finalizarConciliacao}
                        disabled={finalizandoConciliacao}
                        title="Marca esse fechamento como concluído — ele some da lista pra escolher, só volta buscando pela data em Conciliações."
                      >
                        {finalizandoConciliacao
                          ? "Finalizando..."
                          : "🔴 Finalizar Conciliação"}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {lojaId && (
          <div style={{ marginBottom: "12px" }}>
            <button
              type="button"
              className="secondary-button"
              onClick={conferirAberturaVsFechamentoAnterior}
              disabled={conferindoAbertura}
            >
              {conferindoAbertura
                ? "Conferindo..."
                : grupoEscolhido
                ? "🔍 Conferir se a abertura deste fechamento bate com o turno anterior"
                : "🔍 Conferir se a abertura mais recente bate com o fechamento anterior"}
            </button>

            {grupoEscolhido && (
              <button
                type="button"
                className="secondary-button"
                style={{ marginLeft: 8 }}
                onClick={conferirRetiradasDeNovo}
                disabled={conferindoRetiradas}
              >
                {conferindoRetiradas
                  ? "Conferindo..."
                  : "💸 Conferir retiradas de frente de caixa não lançadas"}
              </button>
            )}

            {/* Pedido do usuário (22/08/2026): retirada não tem
                confronto — é só um lugar pra anexar a foto do
                comprovante. A IA lê o valor e já lança direto como
                despesa, desconta o Saldo na hora. */}
            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="text"
                placeholder="Descrição da retirada (opcional, ex: acerto com entregador)"
                value={descricaoRetiradaFoto}
                onChange={(evento) => setDescricaoRetiradaFoto(evento.target.value)}
                style={{ maxWidth: 260 }}
                disabled={enviandoRetiradaFoto}
              />

              <label
                className="secondary-button"
                style={{ cursor: "pointer", margin: 0 }}
              >
                {enviandoRetiradaFoto ? "Lendo foto..." : "📷 Registrar retirada com foto"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: "none" }}
                  disabled={enviandoRetiradaFoto}
                  onChange={(evento) => {
                    const arquivo = evento.target.files?.[0];
                    evento.target.value = "";
                    enviarRetiradaComFoto(arquivo);
                  }}
                />
              </label>
            </div>

            {avisoAberturaFechamento && (
              <div
                className="empty-state"
                style={{
                  marginTop: "8px",
                  color:
                    avisoAberturaFechamento.tipo === "alerta"
                      ? "#f59e0b"
                      : avisoAberturaFechamento.tipo === "ok"
                      ? "#16ca50"
                      : undefined,
                }}
              >
                {avisoAberturaFechamento.texto}
              </div>
            )}
          </div>
        )}

        {/* Pedido do usuário (30/08/2026): mostrar aqui, junto do
            fechamento, o que saiu do caixa pro Cofre nessa mesma noite
            (botão "🔒 Retirada pro Cofre" do Fechamento de Caixa). É só
            leitura — a movimentação de verdade continua sendo criada e
            editada na tela de Fechamento de Caixa / Extrato do Cofre. As
            retiradas genéricas (conta_para_cofre === false) ficam de fora:
            essas já aparecem no quadro "💸 Retiradas de frente de caixa". */}
        {grupoEscolhido &&
          (() => {
            const chaveTurno = hojeDoRegistro(
              grupoEscolhido.itens[0]?.criado_em
            );
            const retiradasCofreTurno = fundosRetiradas.filter((fundo) => {
              if (fundo.conta_para_cofre === false) return false;
              if (lojaId && String(fundo.loja_id) !== String(lojaId)) {
                return false;
              }
              return hojeDoRegistro(fundo.criado_em) === chaveTurno;
            });

            if (retiradasCofreTurno.length === 0) return null;

            const totalCofre = retiradasCofreTurno.reduce(
              (soma, fundo) => soma + Number(fundo.valor || 0),
              0
            );

            return (
              <div
                className="panel"
                style={{
                  marginBottom: "12px",
                  padding: "12px 16px",
                  border: "1px solid rgba(59, 130, 246, 0.4)",
                  borderRadius: "10px",
                }}
              >
                <strong style={{ color: "#3b82f6" }}>
                  🔒 Retiradas pro Cofre nessa noite (
                  {retiradasCofreTurno.length}) — total{" "}
                  {formatarMoeda(totalCofre)}
                </strong>
                <div
                  style={{
                    marginTop: "8px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  {retiradasCofreTurno.map((fundo) => {
                    const usado = Number(fundo.valor_usado || 0);
                    return (
                      <div
                        key={`cofre-${fundo.id}`}
                        style={{
                          fontSize: "13px",
                          display: "flex",
                          gap: "8px",
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <span>
                          {formatarDataHora(fundo.criado_em)} —{" "}
                          <strong>{formatarMoeda(fundo.valor)}</strong>
                          {usado > 0 && (
                            <span style={{ color: "#9fb0c4" }}>
                              {" "}
                              (já usado {formatarMoeda(usado)})
                            </span>
                          )}
                        </span>
                        {fundo.tem_foto && (
                          <button
                            type="button"
                            className="secondary-button"
                            style={{ padding: "2px 8px", fontSize: "12px" }}
                            disabled={carregandoPreview}
                            onClick={() => verFotoFundoCofre(fundo.id)}
                          >
                            {carregandoPreview ? "..." : "👁️ Ver foto"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div
                  style={{
                    marginTop: "8px",
                    fontSize: "12px",
                    color: "#9fb0c4",
                  }}
                >
                  Isso saiu do caixa em dinheiro e foi guardado no Cofre — não
                  desconta o Saldo geral agora. Some no saldo do Cofre
                  (Dashboard / Extrato do Cofre).
                </div>
              </div>
            );
          })()}

        {/* Pedido do usuário (30/08/2026): conferência do DINHEIRO físico
            do caixa, só pra admin (o pessoal de caixa não vê). Só o
            dinheiro porque cartão/PIX já têm o "Real em conta" da
            PagSeguro como fonte independente — o dinheiro é o único ponto
            que dá pra fraudar. Só leitura, não mexe em Saldo nem Cofre. */}
        {ehAdministrador &&
          grupoEscolhido &&
          (() => {
            const chaveTurno = hojeDoRegistro(
              grupoEscolhido.itens[0]?.criado_em
            );
            const daLoja = (id) =>
              !lojaId || String(id) === String(lojaId);

            const reg = dinheiroDoFechamento;
            const abertura = Number(reg?.abertura || 0);
            const retiradasImpressas =
              reg?.retiradas_caixa != null
                ? Number(reg.retiradas_caixa)
                : null;

            // Contado pelo operador: o "Informado" da linha Dinheiro no
            // confronto; se vazio, o "Em caixa" salvo da foto.
            const informadoTexto = valoresInformados["Dinheiro"];
            const contado =
              informadoTexto != null && informadoTexto !== ""
                ? paraNumero(informadoTexto)
                : reg?.em_caixa != null
                ? Number(reg.em_caixa)
                : null;

            // Vendas em dinheiro: Saipos (fonte independente do operador).
            const vendasDinheiro = Number(
              resumoSaipos?.totais_por_forma_pagamento?.["Dinheiro"] || 0
            );

            const fundosTurno = fundosRetiradas.filter(
              (f) =>
                daLoja(f.loja_id) &&
                hojeDoRegistro(f.criado_em) === chaveTurno
            );
            const retiradasCofre = fundosTurno
              .filter((f) => f.conta_para_cofre !== false)
              .reduce((s, f) => s + Number(f.valor || 0), 0);
            const retiradasGenericas = fundosTurno
              .filter((f) => f.conta_para_cofre === false)
              .reduce((s, f) => s + Number(f.valor || 0), 0);

            const pagosEmDinheiro = (lancamentos || [])
              .filter(
                (l) =>
                  l.tipo === "despesa" &&
                  l.pago_em_dinheiro === true &&
                  daLoja(l.loja_id) &&
                  String(l.data || "").slice(0, 10) === chaveTurno
              )
              .reduce((s, l) => s + Number(l.valor || 0), 0);

            const semDados =
              reg == null && vendasDinheiro === 0 && contado == null;
            if (semDados) return null;

            const deveriaTer = Number(
              (
                abertura +
                vendasDinheiro -
                retiradasCofre -
                retiradasGenericas -
                pagosEmDinheiro
              ).toFixed(2)
            );

            const temContado = contado != null;
            const diferenca = temContado
              ? Number((contado - deveriaTer).toFixed(2))
              : null;
            const TOLERANCIA = 1;
            const dentro =
              diferenca != null && Math.abs(diferenca) <= TOLERANCIA;
            const corDif =
              diferenca == null
                ? "#9fb0c4"
                : dentro
                ? "#16ca50"
                : diferenca < 0
                ? "#ff4655"
                : "#f59e0b";

            // Cruzamento: a Saipos diz que saiu X do caixa; o sistema
            // explica isso com Retirada pro Cofre + retiradas genéricas +
            // despesas pagas em dinheiro.
            const explicadoRetirada = Number(
              (
                retiradasCofre +
                retiradasGenericas +
                pagosEmDinheiro
              ).toFixed(2)
            );
            const retiradaSemRegistro =
              retiradasImpressas != null
                ? Number(
                    (retiradasImpressas - explicadoRetirada).toFixed(2)
                  )
                : null;

            // A Saipos NÃO tem conceito de "cofre" — a retirada aparece
            // só como "retirada de frente de caixa" / "retirada de
            // caixa". O que ela dá é: vendas em dinheiro + a lista de
            // retiradas que saíram do caixa. O "cofre" é registro nosso.
            // Aqui só listamos as retiradas lidas da foto, pra rastreio.
            const detalheRetiradas = Array.isArray(reg?.retiradas_detalhe)
              ? reg.retiradas_detalhe
              : null;

            const linha = (rotulo, valor, sinal) => (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  fontSize: 13.5,
                  padding: "3px 0",
                }}
              >
                <span style={{ color: "#b9c6d7" }}>{rotulo}</span>
                <strong style={{ fontVariantNumeric: "tabular-nums" }}>
                  {sinal || ""}
                  {formatarMoeda(valor)}
                </strong>
              </div>
            );

            return (
              <div
                className="panel"
                style={{
                  marginBottom: 12,
                  padding: "14px 16px",
                  border: "1px solid rgba(59, 130, 246, 0.4)",
                  borderRadius: 10,
                }}
              >
                <strong style={{ color: "#3b82f6" }}>
                  💵 Conferência do dinheiro do caixa
                </strong>
                <div
                  style={{
                    fontSize: 11.5,
                    color: "#9fb0c4",
                    margin: "2px 0 10px",
                  }}
                >
                  Só admin. Só dinheiro — cartão e PIX já batem sozinhos
                  pela PagSeguro.
                </div>

                {linha("Abertura do caixa", abertura)}
                {linha("Vendas em dinheiro (Saipos)", vendasDinheiro, "+ ")}
                {linha("Retiradas pro Cofre", retiradasCofre, "− ")}
                {linha(
                  "Retiradas de frente de caixa",
                  retiradasGenericas,
                  "− "
                )}
                {linha("Pagos com dinheiro do caixa", pagosEmDinheiro, "− ")}

                <div
                  style={{
                    borderTop: "1px solid rgba(148,163,184,0.25)",
                    margin: "8px 0 6px",
                  }}
                />
                {linha("Deveria ter em caixa", deveriaTer)}
                {temContado
                  ? linha("Contado pelo operador", contado)
                  : linha("Contado pelo operador", 0, "sem valor — ")}

                {temContado && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      marginTop: 8,
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: "rgba(148,163,184,0.08)",
                      fontSize: 14,
                    }}
                  >
                    <strong>Diferença</strong>
                    <strong
                      style={{
                        color: corDif,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {diferenca > 0 ? "+" : ""}
                      {formatarMoeda(diferenca)}
                      {"  "}
                      {dentro
                        ? "✅ dentro da margem"
                        : diferenca < 0
                        ? "🔴 faltou"
                        : "🟠 sobrou"}
                    </strong>
                  </div>
                )}

                {!temContado && (
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 12.5,
                      color: "#f59e0b",
                    }}
                  >
                    ⚠️ O "Dinheiro" contado não foi informado nesse
                    fechamento — sem isso não dá pra saber se bateu.
                  </div>
                )}

                {/* Destino do dinheiro que saiu do caixa. A Saipos não
                    tem "cofre" — dá o total que saiu e a lista de
                    retiradas; o cofre é registro nosso. */}
                <div
                  style={{
                    marginTop: 10,
                    padding: "9px 11px",
                    borderRadius: 8,
                    background: "rgba(59,130,246,0.08)",
                    fontSize: 13,
                  }}
                >
                  <strong style={{ color: "#3b82f6" }}>
                    🔒 Destino do que saiu do caixa
                  </strong>

                  {linha("Retirada pro Cofre (registrada)", retiradasCofre)}
                  {linha("Retiradas genéricas (registradas)", retiradasGenericas)}
                  {linha("Despesas pagas em dinheiro", pagosEmDinheiro)}

                  {retiradasImpressas != null ? (
                    <>
                      <div
                        style={{
                          borderTop: "1px solid rgba(148,163,184,0.25)",
                          margin: "6px 0",
                        }}
                      />
                      {linha(
                        "Total que saiu do caixa (Saipos)",
                        retiradasImpressas
                      )}
                      {linha("Explicado pelo sistema", explicadoRetirada)}
                      <div
                        style={{
                          marginTop: 6,
                          color:
                            retiradaSemRegistro > TOLERANCIA
                              ? "#ff4655"
                              : "#16ca50",
                          fontSize: 12.5,
                        }}
                      >
                        {retiradaSemRegistro > TOLERANCIA ? (
                          <>
                            🔴 {formatarMoeda(retiradaSemRegistro)} saíram
                            do caixa sem nenhum registro (nem Cofre, nem
                            despesa).
                            {retiradasCofre === 0
                              ? " Nenhuma Retirada pro Cofre foi lançada nessa noite."
                              : ""}
                          </>
                        ) : (
                          <>✅ Tudo que saiu do caixa tem registro.</>
                        )}
                      </div>
                    </>
                  ) : (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 11.5,
                        color: "#9fb0c4",
                      }}
                    >
                      Clique em "🔄 Ler foto de novo" pra cruzar com o
                      total que saiu do caixa segundo o fechamento da
                      Saipos.
                    </div>
                  )}

                  {/* Rastreio: as retiradas individuais lidas da foto. */}
                  {Array.isArray(detalheRetiradas) &&
                    detalheRetiradas.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <div
                          style={{
                            fontSize: 11.5,
                            color: "#9fb0c4",
                            marginBottom: 3,
                          }}
                        >
                          Retiradas lidas da foto ({detalheRetiradas.length}):
                        </div>
                        {detalheRetiradas.map((r, i) => (
                          <div
                            key={i}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 10,
                              fontSize: 12,
                              padding: "2px 0",
                              color: "#c7d2df",
                            }}
                          >
                            <span>
                              {r?.data_hora ? `${r.data_hora} — ` : ""}
                              {r?.descricao || "retirada de caixa"}
                            </span>
                            <span
                              style={{
                                fontVariantNumeric: "tabular-nums",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {formatarMoeda(r?.valor || 0)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                </div>
              </div>
            );
          })()}

        {grupoEscolhido &&
          (() => {
            const chaveTurno = hojeDoRegistro(grupoEscolhido.itens[0]?.criado_em);
            const canceladasDoTurno = comandasCanceladas.filter(
              (item) => hojeDoRegistro(item.criado_em) === chaveTurno
            );

            if (canceladasDoTurno.length === 0) return null;

            const totalCancelado = canceladasDoTurno.reduce(
              (soma, item) => soma + Number(item.valor || 0),
              0
            );

            return (
              <div
                className="panel"
                style={{
                  marginBottom: "12px",
                  padding: "12px 16px",
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  borderRadius: "10px",
                }}
              >
                <strong style={{ color: "#ef4444" }}>
                  🚫 Pedidos cancelados nessa noite ({canceladasDoTurno.length}) —
                  total {formatarMoeda(totalCancelado)}
                </strong>
                <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  {canceladasDoTurno.map((item) => (
                    <div key={item.id} style={{ fontSize: "13px" }}>
                      {item.nome_pessoa || "(nome não lido)"} —{" "}
                      {formatarMoeda(item.valor)}
                      {item.telefone ? ` — ${item.telefone}` : ""}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

        {resultadoFoto && (
          <div
            className="empty-state"
            style={{
              color: resultadoFoto.erro_leitura ? undefined : "#16ca50",
              marginBottom: "10px",
            }}
          >
            {resultadoFoto.erro_leitura ? (
              <>
                {resultadoFoto.erro_leitura}
                {resultadoFoto.debugRespostaIa != null && (
                  <div
                    style={{
                      marginTop: "8px",
                      fontSize: "12px",
                      color: "#9fb0c4",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    (debug — o que a IA respondeu:){" "}
                    {resultadoFoto.debugRespostaIa}
                  </div>
                )}
              </>
            ) : (
              <>
                {resultadoFoto.salvo
                  ? "✅ Usando a leitura já salva desse fechamento (não chamou a IA de novo)."
                  : "✅ Valores lidos e preenchidos na tabela abaixo — leitura salva pra próxima vez."}
                {resultadoFoto.formasNaoLidas?.length > 0 &&
                  ` Não consegui ler: ${resultadoFoto.formasNaoLidas.join(", ")} — preencha essa(s) manualmente.`}
              </>
            )}
          </div>
        )}

        {resultadoFoto?.retiradasAnalise &&
          (() => {
            const a = resultadoFoto.retiradasAnalise;
            const informado = resultadoFoto.retiradasTotalImpresso;
            const comComprovante = a.total_ja_coberto || 0;
            const semComprovante = a.total_sem_comprovante || 0;
            // Se a foto trouxe a linha "Retiradas (-)" usa ela como o valor
            // a bater; senão cai pra soma das retiradas listadas.
            const alvo = informado != null ? informado : a.total_detectado || 0;
            const falta = Number((alvo - comComprovante).toFixed(2));
            const bate = Math.abs(falta) <= 0.01;

            return (
              <div
                className="empty-state"
                style={{
                  marginBottom: "10px",
                  border: `1px solid ${bate ? "#16ca50" : "#ff4655"}`,
                  borderRadius: 10,
                  padding: "10px 14px",
                  textAlign: "left",
                }}
              >
                <strong>💸 Retiradas de frente de caixa</strong>
                <div style={{ marginTop: 6, fontSize: 13 }}>
                  Retiradas informadas no fechamento:{" "}
                  <strong>{formatarMoeda(alvo)}</strong>
                  {informado == null && (
                    <span style={{ color: "#9fb0c4" }}>
                      {" "}
                      (soma das retiradas listadas — não achei a linha
                      "Retiradas (-)" na foto)
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13 }}>
                  Com comprovante (despesa já lançada):{" "}
                  <strong className="tipo-receita">
                    {formatarMoeda(comComprovante)}
                  </strong>
                </div>
                <div style={{ fontSize: 13 }}>
                  {bate ? (
                    <span className="tipo-receita">✅ Bateu.</span>
                  ) : (
                    <span className="tipo-despesa">
                      ⚠️ Falta comprovante de {formatarMoeda(falta)} — anexe o
                      acerto assinado de cada entregador/boy. Enquanto não
                      bater, esse valor conta como dinheiro que sumiu do caixa.
                    </span>
                  )}
                </div>
                {a.sem_comprovante?.length > 0 && (
                  <ul style={{ marginTop: 6, fontSize: 12 }}>
                    {a.sem_comprovante.map((r, i) => (
                      <li key={i}>
                        {r.data_hora ? `${r.data_hora} — ` : ""}
                        {r.descricao} — {formatarMoeda(r.valor)}{" "}
                        <span className="tipo-despesa">(sem comprovante)</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })()}

        {resultadoFoto?.avisoSomaNaoBate && (
          <div
            className="empty-state"
            style={{ color: "#f59e0b", marginBottom: "10px" }}
          >
            ⚠️ A soma dos valores que a IA leu não bate com o TOTAL impresso
            no próprio comprovante — confira os números manualmente antes de
            confiar neles.
            {resultadoFoto.avisoSomaNaoBate.em_caixa && (
              <div style={{ marginTop: 4 }}>
                Em caixa: soma leu{" "}
                {formatarMoeda(
                  resultadoFoto.avisoSomaNaoBate.em_caixa.soma_calculada
                )}
                , mas o comprovante mostra TOTAL{" "}
                {formatarMoeda(
                  resultadoFoto.avisoSomaNaoBate.em_caixa.total_impresso
                )}{" "}
                (diferença de{" "}
                {formatarMoeda(
                  resultadoFoto.avisoSomaNaoBate.em_caixa.diferenca
                )}
                ).
              </div>
            )}
            {resultadoFoto.avisoSomaNaoBate.esperado && (
              <div style={{ marginTop: 4 }}>
                Esperado: soma leu{" "}
                {formatarMoeda(
                  resultadoFoto.avisoSomaNaoBate.esperado.soma_calculada
                )}
                , mas o comprovante mostra TOTAL{" "}
                {formatarMoeda(
                  resultadoFoto.avisoSomaNaoBate.esperado.total_impresso
                )}{" "}
                (diferença de{" "}
                {formatarMoeda(
                  resultadoFoto.avisoSomaNaoBate.esperado.diferenca
                )}
                ).
              </div>
            )}
          </div>
        )}

        {erro && <div className="empty-state">{erro}</div>}

        {resumo && (
          <>
            <div
              className="panel-header"
              style={{
                margin: "10px 0 10px",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div>
                <span className="eyebrow">Confronto</span>
                <h2>Esperado / Real em conta × Informado, por forma de pagamento</h2>
              </div>
            </div>

            {(() => {
              const { linhas, diferencaTotal, algumInformado } =
                confrontoCalculado;

              return (
                <>
                  <div className="table-wrapper tabela-responsiva">
                    <table>
                      <thead>
                        <tr>
                          <th>Forma de pagamento</th>
                          <th>Esperado</th>
                          <th>Informado</th>
                          <th>Real em conta</th>
                          <th>Diferença</th>
                        </tr>
                      </thead>
                      <tbody>
                        {linhas.map(
                          ({
                            forma,
                            valorSistema,
                            temSistema,
                            valorRealConta,
                            temRealConta,
                            temBase,
                            temInformado,
                            diferenca,
                            bateu,
                          }) => (
                            <Fragment key={forma}>
                              <tr>
                                <td
                                  data-label="Forma de pagamento"
                                  style={{ color: "#16ca50", fontWeight: 700 }}
                                >
                                  {forma}
                                </td>
                                <td data-label="Esperado">
                                  {editandoEsperado === forma ? (
                                    <div
                                      style={{
                                        display: "flex",
                                        gap: "4px",
                                        alignItems: "center",
                                      }}
                                    >
                                      <CampoValor
                                        autoFocus
                                        value={valorEsperadoDigitado}
                                        onChange={setValorEsperadoDigitado}
                                        style={{ maxWidth: "90px" }}
                                      />
                                      <button
                                        type="button"
                                        title="Salvar"
                                        onClick={() => salvarEsperadoManual(forma)}
                                      >
                                        ✅
                                      </button>
                                      <button
                                        type="button"
                                        title="Cancelar"
                                        onClick={() => {
                                          setEditandoEsperado(null);
                                          setValorEsperadoDigitado("");
                                        }}
                                      >
                                        ✖️
                                      </button>
                                    </div>
                                  ) : (
                                    <span
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "6px",
                                      }}
                                    >
                                      {temSistema ? formatarMoeda(valorSistema) : "—"}
                                      <button
                                        type="button"
                                        title={
                                          temSistema
                                            ? "Corrigir manualmente"
                                            : "Informar manualmente (a leitura automática não achou esse valor)"
                                        }
                                        onClick={() => {
                                          setEditandoEsperado(forma);
                                          setValorEsperadoDigitado(
                                            temSistema
                                              ? valorSistema.toLocaleString("pt-BR", {
                                                  minimumFractionDigits: 2,
                                                  maximumFractionDigits: 2,
                                                })
                                              : ""
                                          );
                                        }}
                                        style={{
                                          background: "none",
                                          border: "none",
                                          cursor: "pointer",
                                          fontSize: "12px",
                                          opacity: 0.7,
                                          padding: 0,
                                        }}
                                      >
                                        ✏️
                                      </button>
                                    </span>
                                  )}
                                </td>
                                <td data-label="Informado">
                                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                    <CampoValor
                                      value={valoresInformados[forma] ?? ""}
                                      onChange={(novoValor) =>
                                        setValoresInformados((anterior) => ({
                                          ...anterior,
                                          [forma]: novoValor,
                                        }))
                                      }
                                      style={{ maxWidth: "120px" }}
                                    />

                                    {forma === "Cortesia" && (
                                      <label
                                        title="Anexar foto do comprovante/vale de cortesia — a IA lê o valor sozinha"
                                        style={{ cursor: "pointer", fontSize: "14px" }}
                                      >
                                        {lendoFotoInformado === forma ? "⏳" : "📷"}
                                        <input
                                          type="file"
                                          accept="image/*"
                                          capture="environment"
                                          style={{ display: "none" }}
                                          disabled={lendoFotoInformado === forma}
                                          onChange={(evento) => {
                                            const arquivo = evento.target.files?.[0];
                                            evento.target.value = "";
                                            lerFotoParaInformado(forma, arquivo);
                                          }}
                                        />
                                      </label>
                                    )}
                                  </div>
                                </td>
                                {/* Pedido do usuário (15/08/2026): valor que
                                REALMENTE caiu na PagSeguro — só existe pra
                                Cartão de crédito/débito/PIX (ver
                                FORMAS_COM_REAL_EM_CONTA). É essa coluna que
                                agora decide bateu/não bateu pra essas 3
                                formas, não mais o Sistema (Saipos), porque a
                                categoria escolhida no PDV pode vir errada. */}
                                <td
                                  data-label="Real em conta"
                                  style={{ fontWeight: temRealConta ? 700 : 400 }}
                                >
                                  {temRealConta
                                    ? formatarMoeda(valorRealConta)
                                    : "—"}
                                </td>
                                <td
                                  data-label="Diferença"
                                  style={{
                                    color: FORMAS_PRECISAM_CONFERIR.includes(forma)
                                      ? "#ff4655"
                                      : diferenca == null
                                      ? undefined
                                      : bateu
                                      ? "#16ca50"
                                      : diferenca > 0
                                      ? "#ff4655"
                                      : "#16ca50",
                                    fontWeight: 700,
                                  }}
                                >
                                  {/* Pedido do usuário (23/08/2026): "Pix
                                  Conta Bancária" não tem fonte pra
                                  confirmar sozinha — o Informado vem
                                  pré-preenchido com o Esperado (útil só
                                  pra não ficar em branco), mas NUNCA
                                  mostra "✅ Bateu" sozinho, sempre pede
                                  conferência manual. */}
                                  {FORMAS_PRECISAM_CONFERIR.includes(forma)
                                    ? `⚠️ Conferir${
                                        diferenca != null && !bateu
                                          ? ` (dif. ${formatarMoeda(diferenca)})`
                                          : ""
                                      }`
                                    : !temBase
                                    ? "(sem comparação ainda)"
                                    : diferenca == null
                                    ? "—"
                                    : bateu
                                    ? "✅ Bateu"
                                    : diferenca > 0
                                    ? `Falta ${formatarMoeda(diferenca)}`
                                    : `Sobra ${formatarMoeda(Math.abs(diferenca))}`}
                                </td>
                              </tr>

                              {/* Pedido do usuário (12/08/2026): quando o
                              Dinheiro não bate, é o caso mais comum de ser
                              uma retirada do caixa que esqueceram de
                              registrar no botão "Pago com dinheiro do
                              caixa" — avisa na hora em vez de só mostrar o
                              número. Só a partir de R$15,00 de diferença
                              (pedido do usuário, 16/08/2026) — abaixo
                              disso costuma ser só arredondamento/troco,
                              não vale a pena interromper com aviso. */}
                              {forma === "Dinheiro" &&
                                temBase &&
                                temInformado &&
                                !bateu &&
                                Math.abs(diferenca) > 15 && (
                                  <tr>
                                    <td
                                      colSpan={5}
                                      style={{
                                        color: "#ffb020",
                                        fontSize: "12px",
                                        paddingTop: 0,
                                      }}
                                    >
                                      ⚠️ Diferença no Dinheiro — confira se
                                      teve alguma retirada de dinheiro do
                                      caixa que não foi registrada no botão
                                      "💵 Pago com dinheiro do caixa" no
                                      Fechamento de Caixa.
                                    </td>
                                  </tr>
                                )}
                            </Fragment>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>

                  {algumInformado && (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        marginTop: "16px",
                      }}
                    >
                    <div
                      style={{
                        padding: "14px 18px",
                        border: "2px solid",
                        borderColor:
                          Math.abs(diferencaTotal) < 0.01
                            ? "#16ca50"
                            : diferencaTotal > 0
                            ? "#ff4655"
                            : "#16ca50",
                        borderRadius: "10px",
                        fontWeight: 700,
                        fontSize: "16px",
                        textAlign: "center",
                        color:
                          Math.abs(diferencaTotal) < 0.01
                            ? "#16ca50"
                            : diferencaTotal > 0
                            ? "#ff4655"
                            : "#16ca50",
                      }}
                    >
                      {Math.abs(diferencaTotal) < 0.01
                        ? "✅ Diferença final total: bateu certinho"
                        : diferencaTotal > 0
                        ? `Diferença final total: falta ${formatarMoeda(diferencaTotal)}`
                        : `Diferença final total: sobra ${formatarMoeda(Math.abs(diferencaTotal))}`}
                    </div>
                    </div>
                  )}

                  {/* Pedido do usuário (16/08/2026): explicar que uma
                  diferença numa forma isolada (ex: vendeu no débito mas o
                  operador lançou como crédito na Saipos) é normal e não
                  significa dinheiro sumindo — só o total no final é que
                  confirma se faltou dinheiro de verdade ou foi só erro de
                  categoria na hora de lançar a venda. */}
                  {algumInformado && (
                    <p
                      style={{
                        fontSize: "12px",
                        color: "var(--texto-secundario, #9aa0ac)",
                        marginTop: "8px",
                        textAlign: "right",
                      }}
                    >
                      💡 Diferença numa forma isolada (ex: Crédito sobrando e
                      Débito faltando) pode ser só erro de categoria na hora
                      de lançar a venda — não significa dinheiro sumindo. O
                      que decide se faltou dinheiro de verdade é a{" "}
                      <strong>Diferença final total</strong> acima.
                    </p>
                  )}
                </>
              );
            })()}
          </>
        )}

        <div className="panel-header" style={{ margin: "10px 0 10px" }}>
          <div>
            <span className="eyebrow">Últimas vendas</span>
            <h2>Caindo na PagSeguro, por forma de pagamento</h2>
          </div>
        </div>

        {!resumo || resumo.ultimas_vendas?.length === 0 ? (
          <div className="empty-state">
            {carregando
              ? "Buscando..."
              : "Nenhuma venda encontrada nesse período."}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "1rem",
            }}
          >
            {agruparVendasPorFormaPagamento(resumo.ultimas_vendas).map(
              (grupo) => {
                // O contador tem que refletir só o que realmente
                // efetivou — contar pendente/cancelada junto (mesmo que só
                // na exibição do total) confunde, mesmo o valor em R$ já
                // estando certo (esse nunca somou canceladas).
                const efetivadas = grupo.vendas.filter(
                  (venda) => !estaPendenteOuCancelada(venda)
                ).length;
                const naoEfetivadas = grupo.vendas.length - efetivadas;

                return (
                <div key={grupo.forma}>
                  <div style={{ marginBottom: "10px" }}>
                    <strong style={{ color: "#16ca50" }}>
                      {grupo.forma}
                    </strong>{" "}
                    <span>
                      ({efetivadas}
                      {naoEfetivadas > 0 &&
                        ` · ${naoEfetivadas} pend./canc.`}
                      )
                    </span>
                  </div>

                  <div className="categorias-lista">
                    {grupo.vendas.map((venda) => {
                      const pendenteOuCancelada =
                        estaPendenteOuCancelada(venda);

                      return (
                        <div className="categoria-item" key={venda.codigo}>
                          <div className="categoria-identificacao">
                            <div className="categoria-icone">
                              {pendenteOuCancelada ? "⚠️" : "💰"}
                            </div>

                            <div>
                              <strong
                                style={
                                  pendenteOuCancelada
                                    ? { color: "#ff4655" }
                                    : undefined
                                }
                              >
                                {formatarMoeda(venda.valor_bruto)}
                              </strong>{" "}
                              <small
                                style={{ color: "#9fb0c4", fontSize: "11px" }}
                              >
                                (taxa{" "}
                                {formatarMoeda(
                                  venda.valor_bruto - venda.valor_liquido
                                )}
                                ) #{venda.codigo?.slice(-8)}
                              </small>
                              <div
                                style={
                                  pendenteOuCancelada
                                    ? { color: "#ff4655" }
                                    : undefined
                                }
                              >
                                {formatarDataHora(venda.data)}
                                {pendenteOuCancelada &&
                                  ` · ${venda.status_descricao}`}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                );
              }
            )}
          </div>
        )}
      </article>

      {fotoPreview && (
        <div
          className="modal-overlay"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget) {
              setFotoPreview(null);
            }
          }}
        >
          <div className="modal modal-foto">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Fechamento de caixa</span>
                <h2>Foto enviada</h2>
              </div>

              <button
                type="button"
                className="close-button"
                onClick={() => setFotoPreview(null)}
              >
                ×
              </button>
            </div>

            <img
              src={fotoPreview}
              alt="Foto do fechamento de caixa"
              className="foto-modal-imagem"
            />
          </div>
        </div>
      )}
    </section>
      )}
    </>
  );
}

export default Conciliacao;
