import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  buscarVendasPagSeguro,
  conferirFechamentoFoto,
  buscarFechamentosCaixa,
  buscarFotoFechamentoCaixa,
  buscarFechamentoSaipos,
  salvarValoresInformadosFechamento,
  finalizarConciliacaoFechamento,
} from "../services/api";

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
function formatarDataHora(dataIso) {
  if (!dataIso) return "";
  return new Date(dataIso).toLocaleString("pt-BR", {
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
function Conciliacao({ lojaId }) {
  const [abaAtiva, setAbaAtiva] = useState("caixa");
  const [resumo, setResumo] = useState(null);
  const [resumoSaipos, setResumoSaipos] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [resultadoFoto, setResultadoFoto] = useState(null);
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
  const [valoresInformados, setValoresInformados] = useState(
    valoresInformadosBase
  );
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

        const daLoja = todosDaLoja
          .filter((item) => item.tipo === "caixa")
          .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))
          .slice(0, 20);

        setFechamentosDisponiveis(daLoja);
        setRetiradasCaixa(
          todosDaLoja.filter((item) => item.tipo === "pago_dinheiro_caixa")
        );
      })
      .catch(() => {
        setFechamentosDisponiveis([]);
        setRetiradasCaixa([]);
      })
      .finally(() => setCarregandoLista(false));
  }, [lojaId]);

  // Pedido do usuário: um fechamento pode ter 2 fotos (Foto 1 / Foto 2),
  // que salvam como 2 registros separados no banco mas são o MESMO
  // fechamento físico — antes apareciam como 2 botões distintos, confuso.
  // Agora agrupa pela data do turno (mesma regra de corte 5h usada pra
  // buscar PagSeguro/Saipos, e que na prática coincide com a data de
  // ABERTURA do caixa) e mostra um botão só por dia.
  const todosOsGrupos = useMemo(() => {
    const mapa = new Map();

    fechamentosDisponiveis.forEach((item) => {
      const chave = hojeDoRegistro(item.criado_em);
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave).push(item);
    });

    return Array.from(mapa.entries())
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

  // BUG REAL corrigido (13/08/2026): o "Sistema" já reagia sozinho a trocar
  // de fechamento (vem de totaisBrutosSistema, calculado a partir de
  // grupoEscolhido), mas o "Informado" era um estado solto — trocar de
  // data SEM clicar em "Conciliar agora" de novo deixava o Informado
  // "grudado" com os valores do fechamento anterior, misturando dados de
  // dois dias diferentes na mesma tabela. Isso é inaceitável num sistema
  // financeiro. Agora, toda vez que a identidade do fechamento escolhido
  // muda (dataChave), o Informado é resetado e recarregado com o que
  // aquele fechamento específico já tiver salvo — nunca herda nada do
  // fechamento anterior. Usa dataChave (não o objeto grupoEscolhido
  // inteiro) como dependência de propósito: o objeto é substituído
  // internamente (ex.: depois de ler uma foto) sem trocar de fechamento,
  // e isso não pode disparar esse reset.
  useEffect(() => {
    if (!grupoEscolhido) {
      setValoresInformados(valoresInformadosBase);
      return;
    }

    const salvos = mesclarDosItens(grupoEscolhido, "valores_informados");
    const novo = { ...valoresInformadosBase };

    if (salvos) {
      Object.entries(salvos).forEach(([forma, valor]) => {
        if (valor != null) {
          novo[forma] = Number(valor).toFixed(2);
        }
      });
    }

    setValoresInformados(novo);
    setResumo(null);
    setResumoSaipos(null);
    setResultadoFoto(null);
    setErro("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupoEscolhido?.dataChave]);

  // BUG REAL corrigido (13/08/2026), segunda parte: mesmo com o reset
  // acima, se o usuário clicasse "Conciliar agora" e trocasse de
  // fechamento ENQUANTO a busca (PagSeguro/Saipos/foto) ainda estava em
  // andamento, a resposta atrasada do fechamento ANTERIOR chegava depois
  // e sobrescrevia os dados certos do fechamento novo — condição de
  // corrida clássica. Esse ref sempre guarda qual fechamento está
  // selecionado AGORA; toda resposta assíncrona confere contra ele antes
  // de aplicar no estado, e se o usuário já tiver trocado de fechamento
  // nesse meio tempo, a resposta atrasada é simplesmente descartada.
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

    if (!algumSucesso && erro) {
      return { erro_leitura: erro.erro_leitura, debugRespostaIa: erro.debugRespostaIa };
    }

    return { sucesso: algumSucesso, salvo: algumSalvo, formasNaoLidas };
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
          novo[forma] = Number(valor).toFixed(2);
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
      const resultado = await conferirFechamentoFoto(fotoDataUrl);

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
            novo[forma] = valor.toFixed(2);
          }
        });

        return novo;
      });

      const formasNaoLidas = Object.entries(resultado.valores)
        .filter(([, valor]) => valor == null)
        .map(([forma]) => forma);

      const resultadoOk = { sucesso: true, formasNaoLidas };
      if (!silencioso) setResultadoFoto(resultadoOk);

      // A coluna "Esperado" do próprio comprovante (Saipos já faz essa
      // conta pra cada forma, inclusive Dinheiro) alimenta o "Sistema" da
      // conciliação — exceto Crédito/Débito/PIX, que continuam vindo da
      // PagSeguro (fonte mais confiável pra essas 3, é quem realmente
      // recebeu o dinheiro).
      const sistemaLidoDaFoto = {};
      if (resultado.esperado) {
        Object.entries(resultado.esperado).forEach(([forma, valor]) => {
          if (valor == null) return;
          if (
            forma === "Cartão de crédito" ||
            forma === "Cartão de débito" ||
            /pix/i.test(forma)
          ) {
            return;
          }
          sistemaLidoDaFoto[forma] = valor;
        });
      }

      // Pedido do usuário (12/08/2026): o Esperado do Dinheiro tem que
      // bater na fórmula clássica de caixa físico — Abertura + Vendas em
      // dinheiro − Retiradas do turno (cada "Pago com dinheiro do caixa"
      // já registrado). Sobrescreve o "Esperado" lido bruto da tabela
      // CONFERÊNCIA (que é só uma célula, mais exposta a erro de leitura)
      // por esse cálculo, composto de números que também são lidos da
      // mesma foto + dado que o próprio sistema já tem (retiradas).
      if (resultado.abertura_caixa != null && resultado.vendas_dinheiro != null) {
        const dataChave = grupoEscolhido?.dataChave;
        const somaRetiradas = dataChave
          ? retiradasCaixa
              .filter((item) => hojeDoRegistro(item.criado_em) === dataChave)
              .reduce(
                (soma, item) => soma + Number(item.valor_pago_dinheiro || 0),
                0
              )
          : 0;

        sistemaLidoDaFoto.Dinheiro = Number(
          (
            Number(resultado.abertura_caixa) +
            Number(resultado.vendas_dinheiro) -
            somaRetiradas
          ).toFixed(2)
        );
      }

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
              : undefined
          );

          setFechamentosDisponiveis((anteriores) =>
            anteriores.map((item) =>
              item.id === salvarEm
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
                    item.id === salvarEm
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
        } catch (erroSalvar) {
          console.error("Erro ao salvar leitura da foto:", erroSalvar);
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
    const totaisBrutos = { ...(resumo?.totais_brutos_por_forma_pagamento || {}) };

    // iFood/Brendi (Pago Online), Voucher Parceiro, A prazo (funcionários),
    // Vale, Cortesia e QUALQUER outra forma nova que a Saipos vier a
    // reportar entram automático como "Sistema" — só Dinheiro fica sem
    // "Sistema" automático (é físico, só o que o operador informar mesmo).
    // Crédito/Débito/Pix de balcão a Saipos também reporta, mas quem manda
    // nesses é a PagSeguro (já preenchido acima), então são ignorados aqui
    // pra não somar em dobro.
    if (resumoSaipos?.totais_por_forma_pagamento) {
      Object.entries(resumoSaipos.totais_por_forma_pagamento).forEach(
        ([nomeSaipos, valor]) => {
          if (/pix/i.test(nomeSaipos)) return; // já vem da PagSeguro
          if (nomeSaipos === "Crédito" || nomeSaipos === "Débito") return; // já vem da PagSeguro
          const nomeConfronto = MAPA_SAIPOS_PARA_CONFRONTO[nomeSaipos] || nomeSaipos;
          if (nomeConfronto === "Dinheiro") return; // Dinheiro não tem Sistema automático
          totaisBrutos[nomeConfronto] = Number(valor || 0);
        }
      );
    }

    // Valor manual informado pelo usuário só pra esse fechamento
    // específico (ex.: Dinheiro, que normalmente não tem "Sistema"
    // automático) — sobrescreve o que vier de PagSeguro/Saipos. Recurso
    // raro, usado só em algum caso pontual — hoje nenhum fechamento usa.
    const sistemaManual = mesclarDosItens(grupoEscolhido, "sistema_manual");
    if (sistemaManual) {
      Object.assign(totaisBrutos, sistemaManual);
    }

    return totaisBrutos;
  }, [resumo, resumoSaipos, grupoEscolhido]);

  // Pedido do usuário (12/08/2026): o Informado não deve começar em
  // branco — já vem pré-preenchido com o valor do Sistema (Esperado),
  // o operador só ajusta se o valor real contado no fechamento for
  // diferente. Só preenche o que ainda estiver em branco (não sobrescreve
  // nada que já foi lido da foto ou digitado).
  useEffect(() => {
    const formasComSistema = Object.keys(totaisBrutosSistema);
    if (formasComSistema.length === 0) return;

    setValoresInformados((anterior) => {
      let mudou = false;
      const novo = { ...anterior };

      formasComSistema.forEach((forma) => {
        if (novo[forma] === undefined || novo[forma] === "") {
          novo[forma] = Number(totaisBrutosSistema[forma] || 0).toFixed(2);
          mudou = true;
        }
      });

      return mudou ? novo : anterior;
    });
  }, [totaisBrutosSistema]);

  // Confronto Sistema × Informado calculado aqui (não só dentro da tabela)
  // pra poder mostrar um aviso no topo da tela quando tiver diferença,
  // igual o aviso de CMV alto do Dashboard.
  const confrontoCalculado = useMemo(() => {
    const totaisBrutos = totaisBrutosSistema;

    // A lista de linhas é a união do que o operador informou (foto/OCR) com
    // o que a Saipos/PagSeguro reportou como Sistema — assim, se aparecer
    // uma forma de pagamento nova só no Sistema (ainda sem foto lida ou não
    // reconhecida na foto), ela mesmo assim aparece na tabela já com o
    // valor esperado preenchido.
    const todasAsFormas = Array.from(
      new Set([...Object.keys(valoresInformados), ...Object.keys(totaisBrutos)])
    );

    const linhas = todasAsFormas.map((forma) => {
      const temSistema = forma in totaisBrutos;
      const valorSistema = totaisBrutos[forma] || 0;
      const valorInformadoTexto = valoresInformados[forma] ?? "";
      const temInformado = valorInformadoTexto !== "";
      const valorInformado = temInformado
        ? Number(valorInformadoTexto.replace(",", "."))
        : null;
      const diferenca =
        temInformado && temSistema
          ? Number((valorSistema - valorInformado).toFixed(2))
          : null;
      const bateu = diferenca != null && Math.abs(diferenca) < 0.01;

      return {
        forma,
        valorSistema,
        temSistema,
        temInformado,
        diferenca,
        bateu,
      };
    });

    const diferencaTotal = linhas
      .filter((linha) => linha.temInformado && linha.temSistema)
      .reduce((soma, linha) => soma + linha.diferenca, 0);
    const algumInformado = linhas.some(
      (linha) => linha.temInformado && linha.temSistema
    );

    return { linhas, diferencaTotal, algumInformado };
  }, [totaisBrutosSistema, valoresInformados]);

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
          className="fp-alerta-cmv fp-alerta-cmv-critico"
          style={{ marginBottom: "16px" }}
        >
          <span className="fp-alerta-cmv-icone">🚨</span>

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
                <h2>Sistema × Informado, por forma de pagamento</h2>
              </div>
            </div>

            {(() => {
              const { linhas, diferencaTotal, algumInformado } =
                confrontoCalculado;

              return (
                <>
                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>Forma de pagamento</th>
                          <th>Sistema</th>
                          <th>Informado</th>
                          <th>Diferença</th>
                        </tr>
                      </thead>
                      <tbody>
                        {linhas.map(
                          ({
                            forma,
                            valorSistema,
                            temSistema,
                            temInformado,
                            diferenca,
                            bateu,
                          }) => (
                            <Fragment key={forma}>
                              <tr>
                                <td style={{ color: "#16ca50", fontWeight: 700 }}>
                                  {forma}
                                </td>
                                <td>
                                  {temSistema ? formatarMoeda(valorSistema) : "—"}
                                </td>
                                <td>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="0,00"
                                    value={valoresInformados[forma] ?? ""}
                                    onChange={(evento) =>
                                      setValoresInformados((anterior) => ({
                                        ...anterior,
                                        [forma]: evento.target.value,
                                      }))
                                    }
                                    style={{ maxWidth: "120px" }}
                                  />
                                </td>
                                <td
                                  style={{
                                    color:
                                      !temInformado || !temSistema
                                        ? undefined
                                        : bateu
                                        ? "#16ca50"
                                        : diferenca > 0
                                        ? "#ff4655"
                                        : "#16ca50",
                                    fontWeight: 700,
                                  }}
                                >
                                  {!temSistema
                                    ? "(sem comparação ainda)"
                                    : !temInformado
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
                              número. */}
                              {forma === "Dinheiro" &&
                                temSistema &&
                                temInformado &&
                                !bateu && (
                                  <tr>
                                    <td
                                      colSpan={4}
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
