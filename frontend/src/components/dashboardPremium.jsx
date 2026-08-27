import { useEffect, useMemo, useState } from "react";
import "./dashboardPremium.css";
import UserMenu from "./UserMenu";
import { buscarStatusImportacaoSaipos } from "../services/api";
import { receitaPendente } from "../utils/calculoFinanceiro";

const MESES = [
  ["2026-01", "Janeiro de 2026"],
  ["2026-02", "Fevereiro de 2026"],
  ["2026-03", "Março de 2026"],
  ["2026-04", "Abril de 2026"],
  ["2026-05", "Maio de 2026"],
  ["2026-06", "Junho de 2026"],
  ["2026-07", "Julho de 2026"],
  ["2026-08", "Agosto de 2026"],
  ["2026-09", "Setembro de 2026"],
  ["2026-10", "Outubro de 2026"],
  ["2026-11", "Novembro de 2026"],
  ["2026-12", "Dezembro de 2026"],
];

const CORES_CATEGORIAS = [
  "#1476ff",
  "#16c857",
  "#ff9800",
  "#8b35df",
  "#ff3545",
];

function numero(valor) {
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : 0;
}

function formatarPercentual(valor) {
  return `${numero(valor).toFixed(1)}%`;
}

// Marcas do eixo Y do gráfico de barras (ex: "150k", "3k", "800") —
// acompanha o valor real dos dados, não é mais fixo.
function formatarEscalaGrafico(valor) {
  const v = numero(valor);
  if (v >= 1000) return `${Math.round(v / 1000)}k`;
  return String(Math.round(v));
}

function Icone({ children, className = "" }) {
  return <span className={`fp-icone ${className}`}>{children}</span>;
}

function MiniLinha({ valores, cor }) {
  const largura = 280;
  const altura = 58;
  const margem = 4;
  const maximo = Math.max(...valores, 1);
  const minimo = Math.min(...valores, 0);
  const intervalo = Math.max(maximo - minimo, 1);

  const pontos = valores
    .map((valor, indice) => {
      const x =
        margem +
        (indice / Math.max(valores.length - 1, 1)) *
          (largura - margem * 2);
      const y =
        altura -
        margem -
        ((valor - minimo) / intervalo) * (altura - margem * 2);

      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      className="fp-mini-linha"
      viewBox={`0 0 ${largura} ${altura}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        points={pontos}
        fill="none"
        stroke={cor}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MiniBarras({ valores, cor }) {
  const maximo = Math.max(...valores, 1);

  return (
    <div className="fp-mini-barras" aria-hidden="true">
      {valores.map((valor, indice) => (
        <span
          key={`${valor}-${indice}`}
          style={{
            height: `${Math.max(8, (valor / maximo) * 100)}%`,
            background: cor,
          }}
        />
      ))}
    </div>
  );
}

function Anel({ valor, cor, texto }) {
  const percentual = Math.max(0, Math.min(100, numero(valor)));

  return (
    <div
      className="fp-anel"
      style={{
        background: `conic-gradient(${cor} ${percentual * 3.6}deg, #16283e 0deg)`,
      }}
      aria-label={`${texto}: ${formatarPercentual(percentual)}`}
    >
      <div>{texto}</div>
    </div>
  );
}

// Pedido do usuário (22/08/2026): olho de privacidade GERAL (fora dos
// cards, um botão só) — esconde só o número PRINCIPAL de Receitas,
// Despesas, Fluxo de Caixa, Saldo e Próximos Recebimentos. Os detalhes
// menores (Taxa, Fundo de Caixa, Fundo de Retirada) continuam sempre
// visíveis, não precisam esconder. Fica salvo (localStorage).
const MASCARA = "••••••";

function CartaoPrincipal({
  classe,
  titulo,
  valor,
  legenda,
  icone,
  grafico,
  bruto,
  taxa,
  emDinheiro,
  fundoRetirada,
  mascarar = false,
}) {
  const temTaxa = bruto != null && taxa != null;

  return (
    <article className={`fp-kpi fp-kpi-${classe}`}>
      <div className="fp-kpi-cabecalho">
        <span>{titulo}</span>
        <Icone className={classe}>{icone}</Icone>
      </div>

      {temTaxa && (
        <div className="fp-kpi-bruto-taxa">
          <span>{mascarar ? MASCARA : bruto}</span>
          <span>Taxas {taxa}</span>
        </div>
      )}

      {emDinheiro != null && (
        <div className="fp-kpi-bruto-taxa">
          <span>💵 fundo de caixa {emDinheiro}</span>
        </div>
      )}

      {/* Pedido do usuário (22/08/2026): retirada genérica de caixa
          guardada pra gasto futuro (ainda não é despesa) — só mostra a
          linha quando tem algum valor disponível, pra não poluir a
          tela em quem não usa isso. */}
      {fundoRetirada && (
        <div className="fp-kpi-bruto-taxa">
          <span>💰 cofre {fundoRetirada}</span>
        </div>
      )}

      {temTaxa || emDinheiro != null ? (
        <strong className="fp-kpi-liquido">{mascarar ? MASCARA : valor}</strong>
      ) : (
        <strong>{mascarar ? MASCARA : valor}</strong>
      )}

      <small>{legenda}</small>

      <div className="fp-kpi-grafico">{grafico}</div>
    </article>
  );
}

export default function DashboardPremium({
  totais = {},
  cmvStatus = "Sem dados",
  margemStatus = "Sem dados",
  despesasPorCategoria = [],
  mesDashboard = "2026-08",
  setMesDashboard = () => {},
  lancamentos = [],
  todosLancamentos = [],
  formasPagamento = [],
  formatarMoeda = (valor) =>
    numero(valor).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    }),
  formatarData = (valor) => valor || "—",
  usuario = null,
  sair = () => {},
  lojas = [],
  lojaDashboard = "todas",
  setLojaDashboard = () => {},
  ehAdministrador = true,
  temAcessoFinanceiro = true,
  acessoCardSaldo = true,
  acessoCardReceitas = true,
  acessoCardDespesas = true,
  acessoCardFluxoCaixa = true,
  acessoCardProximosRecebimentos = true,
  pontoDeEquilibrio = null,
  carregando = false,
}) {
  // Pedido do usuário (22/08/2026): olho de privacidade GERAL, fora dos
  // cards — um botão só que esconde o número principal de Receitas,
  // Despesas, Fluxo de Caixa, Saldo e Próximos Recebimentos de uma vez.
  // Fica salvo (localStorage), então continua escondido mesmo
  // recarregando a página.
  const [valoresVisiveis, setValoresVisiveis] = useState(() => {
    try {
      return localStorage.getItem("financepro_valores_visiveis") !== "false";
    } catch {
      return true;
    }
  });

  function alternarValoresVisiveis() {
    setValoresVisiveis((anterior) => {
      const novo = !anterior;
      try {
        localStorage.setItem("financepro_valores_visiveis", String(novo));
      } catch {
        // localStorage indisponível — só não persiste entre recarregamentos.
      }
      return novo;
    });
  }

  // Pedido do usuário (26/08/2026): "o que faremos pra não acontecer de
  // novo?" — aviso aqui quando a importação automática da Saipos de
  // ONTEM ainda não terminou até uma hora razoável da manhã (7h). Fica
  // conferindo de tempos em tempos e some sozinho assim que a
  // importação (automática ou pelo botão manual) terminar — não precisa
  // recarregar a página.
  const [statusImportacaoSaipos, setStatusImportacaoSaipos] = useState(null);

  useEffect(() => {
    if (!ehAdministrador) return;

    let cancelado = false;

    function conferir() {
      buscarStatusImportacaoSaipos()
        .then((resultado) => {
          if (!cancelado) setStatusImportacaoSaipos(resultado);
        })
        .catch(() => {
          // Falha ao conferir não é motivo pra alarmar sozinho — só não
          // mostra nada dessa vez, tenta de novo na próxima.
        });
    }

    conferir();
    const intervalo = setInterval(conferir, 5 * 60 * 1000);

    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, [ehAdministrador]);

  const horaAgoraBrasilia = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hour12: false,
    }).format(new Date())
  );

  const mostrarAvisoImportacaoSaipos =
    ehAdministrador &&
    statusImportacaoSaipos &&
    !statusImportacaoSaipos.completo &&
    horaAgoraBrasilia >= 7;

  // Pedido do usuário (19/08/2026): ordem fixa dos botões de loja no
  // Dashboard — Sinop, Sorriso, Rondonópolis, Uberlândia. Qualquer loja
  // nova cadastrada que não bata com nenhum desses 4 nomes (ex: lojas de
  // teste) cai no final, sem quebrar nada.
  // "donopolis" em vez de "rondonopolis": o nome cadastrado no banco tem
  // erro de digitação ("Romdonopolis", com M) — "donopolis" bate certo
  // nos dois jeitos (com ou sem esse erro de digitação).
  const ORDEM_LOJAS_DASHBOARD = ["sinop", "sorriso", "donopolis", "uberlandia"];

  function normalizarNomeLoja(nome) {
    return (nome || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, ""); // tira acento (ex: "Rondonópolis" -> "rondonopolis")
  }

  const lojasOrdenadas = useMemo(() => {
    return [...lojas].sort((a, b) => {
      const posicaoA = ORDEM_LOJAS_DASHBOARD.findIndex((chave) =>
        normalizarNomeLoja(a.nome).includes(chave)
      );
      const posicaoB = ORDEM_LOJAS_DASHBOARD.findIndex((chave) =>
        normalizarNomeLoja(b.nome).includes(chave)
      );

      // Loja que não bate com nenhum nome conhecido vai pro final da lista.
      const indiceA = posicaoA === -1 ? ORDEM_LOJAS_DASHBOARD.length : posicaoA;
      const indiceB = posicaoB === -1 ? ORDEM_LOJAS_DASHBOARD.length : posicaoB;

      return indiceA - indiceB;
    });
  }, [lojas]);

  const receitas = numero(totais.receitas);
  const despesas = numero(totais.despesas);
  const fluxoCaixa = numero(totais.fluxoCaixa);
  const saldo = numero(totais.saldo);
  const saldoBruto = numero(totais.saldoBruto);
  const totalTaxas = numero(totais.totalTaxas);
  const percentualTaxas = numero(totais.percentualTaxas);
  const dinheiroEmCaixa = numero(totais.dinheiroEmCaixa);
  const fundoRetirada = numero(totais.fundoRetirada);
  const cmv = numero(totais.cmvPercentual);
  const margem = numero(totais.margemPercentual);
  const conferenciaSaldo = totais.conferenciaSaldo || null;

  const lancamentosDoMes = useMemo(
    () =>
      lancamentos.filter(
        (item) =>
          item.data &&
          String(item.data).slice(0, 7) === String(mesDashboard)
      ),
    [lancamentos, mesDashboard]
  );

  const quantidadeReceitas = lancamentosDoMes.filter(
    (item) => item.tipo === "receita"
  ).length;

  const ticketMedio =
    quantidadeReceitas > 0 ? receitas / quantidadeReceitas : 0;

 // Lançamentos de TODOS os meses (não só o mês escolhido no topo),
 // filtrados só pela loja — usado pelos seletores de período dos
 // gráficos, que precisam olhar além do mês atual.
 const lancamentosComparativo = useMemo(() => {
   return todosLancamentos.filter(
     (item) =>
       lojaDashboard === "todas" ||
       String(item.loja_id || "") === String(lojaDashboard)
   );
 }, [todosLancamentos, lojaDashboard]);

 // Pedido do usuário (19/08/2026): o seletor "Este mês" tinha só essa
 // opção — não dava pra ver outro período de verdade. Agora tem "Mês
 // passado" e "Este ano" de verdade, recalculando a partir dos
 // lançamentos reais (não só o mês escolhido no topo do Dashboard).
 const [periodoCategorias, setPeriodoCategorias] = useState("mes");

 const despesasPorCategoriaNoPeriodo = useMemo(() => {
   if (periodoCategorias === "mes") {
     return despesasPorCategoria;
   }

   let filtroData;
   if (periodoCategorias === "mes_passado") {
     const [ano, mes] = mesDashboard.split("-").map(Number);
     const dataAnterior = new Date(ano, mes - 2, 1);
     const anoMesAnterior = `${dataAnterior.getFullYear()}-${String(
       dataAnterior.getMonth() + 1
     ).padStart(2, "0")}`;
     filtroData = (data) => data?.slice(0, 7) === anoMesAnterior;
   } else {
     // "ano"
     const ano = mesDashboard.split("-")[0];
     filtroData = (data) => data?.slice(0, 4) === ano;
   }

   const agrupadas = lancamentosComparativo
     .filter((item) => item.tipo === "despesa" && filtroData(item.data))
     .reduce((acumulado, item) => {
       const categoria = item.categoria || "Outros";
       if (!acumulado[categoria]) {
         acumulado[categoria] = { categoria, valor: 0 };
       }
       acumulado[categoria].valor += Number(item.valor || 0);
       return acumulado;
     }, {});

   return Object.values(agrupadas);
 }, [periodoCategorias, despesasPorCategoria, lancamentosComparativo, mesDashboard]);

 const categorias = useMemo(() => {
  // Bug encontrado (19/08/2026): a cor de cada categoria vinha de uma
  // lista fixa de NOMES ("Fornecedores", "Funcionários", "Aluguel"...)
  // que não tem nada a ver com as categorias reais cadastradas no
  // sistema (ex: "Outros", "Retirada de Caixa", "Despesas Diversas",
  // "Matéria-Prima") — qualquer nome que não batesse caía todo no mesmo
  // azul padrão, por isso o gráfico parecia ter só 2 cores. Agora a cor
  // vem só da POSIÇÃO no ranking (1ª maior categoria, 2ª maior, etc.),
  // usando a paleta CORES_CATEGORIAS — cada fatia sempre com uma cor
  // diferente da vizinha, não importa o nome da categoria.
  const mapaCategorias = despesasPorCategoriaNoPeriodo.reduce((acumulado, item) => {
    const nome = item.categoria || "Outros";
    const valor = numero(item.valor);

    if (!acumulado[nome]) {
      acumulado[nome] = { nome, valor: 0 };
    }

    acumulado[nome].valor += valor;

    return acumulado;
  }, {});

  const ordenadas = Object.values(mapaCategorias)
    .filter((item) => item.valor > 0)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 5)
    .map((item, indice) => ({
      ...item,
      cor: CORES_CATEGORIAS[indice % CORES_CATEGORIAS.length],
    }));

  const totalCategorias = ordenadas.reduce(
    (acumulado, item) => acumulado + item.valor,
    0
  );

  return ordenadas.map((item) => ({
    ...item,
    percentual:
      totalCategorias > 0
        ? (item.valor / totalCategorias) * 100
        : 0,
  }));
}, [despesasPorCategoriaNoPeriodo]);


  const ultimasTransacoes = useMemo(
    () =>
      [...lancamentos]
        .sort((a, b) =>
          String(b.data || "").localeCompare(String(a.data || ""))
        )
        .slice(0, 4),
    [lancamentos]
  );

  // "A Receber": vendas a prazo (cartão com prazo, etc.) que já foram
  // lançadas como receita mas cujo dinheiro ainda não caiu de verdade —
  // olha TODOS os lançamentos aprovados, não só o mês selecionado no
  // filtro do Dashboard, porque uma venda de julho pode estar prevista
  // pra cair em agosto. Só conta o que ainda está no futuro (mesma regra
  // usada pro Saldo) — o que já venceu (ex.: cartão antecipado, D+0) já
  // conta como recebido, não aparece mais aqui.
  const receitasAReceber = useMemo(() => {
    const hoje = new Date();
    const hojeStr = `${hoje.getFullYear()}-${String(
      hoje.getMonth() + 1
    ).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;

    return todosLancamentos.filter(
      (item) => item.tipo === "receita" && receitaPendente(item, hojeStr)
    );
  }, [todosLancamentos]);

  const aReceber = useMemo(() => {
    return receitasAReceber.reduce(
      (soma, item) =>
        soma + numero(item.valor_liquido_esperado ?? item.valor),
      0
    );
  }, [receitasAReceber]);

  // Mesma quebra bruto/taxa/líquido que o card de Saldo já mostra, agora
  // também pros "Próximos Recebimentos" — pra saber quanto vai cair de taxa
  // quando esse dinheiro pendente realmente chegar.
  const aReceberBruto = useMemo(() => {
    return receitasAReceber.reduce((soma, item) => soma + numero(item.valor), 0);
  }, [receitasAReceber]);

  const taxaAReceber = aReceberBruto - aReceber;

  const percentualTaxaAReceber =
    aReceberBruto > 0 ? (taxaAReceber / aReceberBruto) * 100 : 0;

  const valoresAReceber = useMemo(
    () => [0.8, 0.9, 0.7, 1, 0.85, 0.95, 1].map((fator) => aReceber * fator),
    [aReceber]
  );

  function nomeFormaPagamento(id) {
    return formasPagamento.find((forma) => forma.id === id)?.nome || null;
  }

  // Próximos recebimentos: as mesmas receitas a receber, mas organizadas
  // em ordem de data (a mais próxima primeiro), pra virar uma "agenda" de
  // quando o dinheiro cai.
  const proximosRecebimentos = useMemo(() => {
    return [...receitasAReceber]
      .sort((a, b) =>
        String(a.data_prevista_recebimento).localeCompare(
          String(b.data_prevista_recebimento)
        )
      )
      .slice(0, 8)
      .map((item) => ({
        id: item.id,
        data: item.data_prevista_recebimento,
        descricao:
          nomeFormaPagamento(item.forma_pagamento_id) ||
          item.fornecedor ||
          item.descricao ||
          "Recebimento",
        valor: numero(item.valor_liquido_esperado ?? item.valor),
      }));
  }, [receitasAReceber, formasPagamento]);

  // Legenda do card "Próximos Recebimentos": mostra de qual forma de
  // pagamento e o dia exato que a próxima entrada cai (ex.: "iFood —
  // quarta-feira, 12/08"), em vez de um texto genérico.
  const legendaProximosRecebimentos = useMemo(() => {
    if (proximosRecebimentos.length === 0) {
      return "Nenhuma venda a prazo pendente";
    }

    const primeiro = proximosRecebimentos[0];
    const dataLocal = new Date(`${primeiro.data}T12:00:00`);
    const diaSemana = dataLocal.toLocaleDateString("pt-BR", {
      weekday: "long",
    });
    const diaMes = dataLocal.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    });
    const restante = proximosRecebimentos.length - 1;

    return `${primeiro.descricao} — ${diaSemana}, ${diaMes}${
      restante > 0 ? ` (+${restante})` : ""
    }`;
  }, [proximosRecebimentos]);

  function formatarDiaSemana(data) {
    if (!data) return { semana: "—", dia: "—" };

    const dataLocal = new Date(`${data}T12:00:00`);
    const semana = dataLocal
      .toLocaleDateString("pt-BR", { weekday: "short" })
      .replace(".", "")
      .toUpperCase();
    const dia = String(dataLocal.getDate()).padStart(2, "0");

    return { semana, dia };
  }

  const valoresReceitas = useMemo(
    () => [0.62, 0.7, 0.66, 0.78, 0.74, 0.88, 0.83, 0.96, 1].map((fator) => receitas * fator),
    [receitas]
  );

  const valoresDespesas = useMemo(
    () => [0.58, 0.63, 0.6, 0.68, 0.72, 0.77, 0.74, 0.84, 1].map((fator) => despesas * fator),
    [despesas]
  );

  // Pedido do usuário (19/08/2026): esse gráfico usava números FAKE (o
  // valor de receita/despesa do mês atual multiplicado por fatores
  // decorativos tipo 0.76, 0.68...) pra simular uma tendência de vários
  // meses — não eram dados reais de mês nenhum. Agora calcula de verdade,
  // a partir dos lançamentos reais, agrupado por mês/trimestre/ano
  // (o seletor "Mensal" já funciona e tem outras opções).
  const NOMES_MES_CURTO = [
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez",
  ];

  const [periodoComparativo, setPeriodoComparativo] = useState("mensal");

  const { mesesComparativo, serieReceitas, serieDespesas } = useMemo(() => {
    const [anoBase, mesBase] = mesDashboard.split("-").map(Number);

    // Quantos "baldes" (meses, trimestres ou anos) voltar, e o tamanho de
    // cada balde em meses.
    const configuracao = {
      mensal: { quantidade: 6, tamanhoMeses: 1 },
      trimestral: { quantidade: 4, tamanhoMeses: 3 },
      anual: { quantidade: 3, tamanhoMeses: 12 },
    }[periodoComparativo] || { quantidade: 6, tamanhoMeses: 1 };

    const baldes = [];
    for (let i = configuracao.quantidade - 1; i >= 0; i--) {
      const totalMesesAtras = i * configuracao.tamanhoMeses;
      const dataBalde = new Date(anoBase, mesBase - 1 - totalMesesAtras, 1);
      const anoBalde = dataBalde.getFullYear();
      const mesBalde = dataBalde.getMonth(); // 0-11, início do balde

      let rotulo;
      if (configuracao.tamanhoMeses === 1) {
        rotulo = NOMES_MES_CURTO[mesBalde];
      } else if (configuracao.tamanhoMeses === 3) {
        rotulo = `T${Math.floor(mesBalde / 3) + 1}/${String(anoBalde).slice(2)}`;
      } else {
        rotulo = String(anoBalde);
      }

      baldes.push({
        rotulo,
        anoInicio: anoBalde,
        mesInicio: mesBalde, // 0-11
        receita: 0,
        despesa: 0,
      });
    }

    lancamentosComparativo.forEach((item) => {
      if (!item.data) return;
      const [anoItem, mesItem] = item.data.split("-").map(Number);
      if (!anoItem || !mesItem) return;

      const mesesTotaisItem = anoItem * 12 + (mesItem - 1);

      const balde = baldes.find((b) => {
        const inicioTotal = b.anoInicio * 12 + b.mesInicio;
        return (
          mesesTotaisItem >= inicioTotal &&
          mesesTotaisItem < inicioTotal + configuracao.tamanhoMeses
        );
      });

      if (!balde) return;

      if (item.tipo === "receita") {
        balde.receita += Number(item.valor || 0);
      } else if (item.tipo === "despesa") {
        balde.despesa += Number(item.valor || 0);
      }
    });

    return {
      mesesComparativo: baldes.map((b) => b.rotulo),
      serieReceitas: baldes.map((b) => b.receita),
      serieDespesas: baldes.map((b) => b.despesa),
    };
  }, [lancamentosComparativo, mesDashboard, periodoComparativo]);

  const maiorComparativo = Math.max(
    1,
    ...serieReceitas,
    ...serieDespesas
  );

  let acumuladoDonut = 0;
  const fundoDonut =
    categorias.length > 0
      ? `conic-gradient(${categorias
          .map((item) => {
            const inicio = acumuladoDonut;
            acumuladoDonut += item.percentual;
            return `${item.cor} ${inicio}% ${acumuladoDonut}%`;
          })
          .join(", ")})`
      : "#17304e";

  const fluxoSeteDias = useMemo(() => {
    const base = saldo || receitas - despesas;
    return [0.3, 0.45, 0.38, 0.66, 0.4, 0.54, 0.88].map(
      (fator) => base * fator
    );
  }, [saldo, receitas, despesas]);

  const larguraGrafico = 700;
  const alturaGrafico = 210;
  const maximoFluxo = Math.max(...fluxoSeteDias.map(Math.abs), 1);

  const pontosFluxo = fluxoSeteDias
    .map((valor, indice) => {
      const x = 20 + (indice / 6) * (larguraGrafico - 40);
      const y =
        alturaGrafico -
        20 -
        ((valor + maximoFluxo) / (maximoFluxo * 2)) *
          (alturaGrafico - 40);

      return `${x},${y}`;
    })
    .join(" ");

  return (
    <main className="fpdash">
      {mostrarAvisoImportacaoSaipos && (
        <div
          style={{
            background: "rgba(234, 179, 8, 0.15)",
            border: "1px solid #eab308",
            borderRadius: 10,
            padding: "12px 16px",
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          ⚠️ A importação automática das vendas da Saipos de{" "}
          <strong>
            {new Date(
              `${statusImportacaoSaipos.data}T12:00:00`
            ).toLocaleDateString("pt-BR")}
          </strong>{" "}
          ainda não terminou. Consumo/vendas a prazo de funcionários e
          outras formas de pagamento podem estar faltando em Contas a
          Receber. O sistema tenta de novo sozinho a cada minuto — se
          demorar muito, avise pra conferir manualmente.
        </div>
      )}

      <header className="fp-topo">
        <div>
          <h1>Olá, Dieison! 👋</h1>
          <p>Aqui está o resumo financeiro da sua empresa.</p>
        </div>

        <div className="fp-topo-acoes">
          {temAcessoFinanceiro && (
            <label className="fp-periodo">
              <span>Período</span>
              <select
                value={mesDashboard}
                onChange={(evento) =>
                  setMesDashboard(evento.target.value)
                }
              >
                {MESES.map(([valor, texto]) => (
                  <option key={valor} value={valor}>
                    {texto}
                  </option>
                ))}
              </select>
            </label>
          )}

          <button type="button" className="fp-botao-icone" aria-label="Pesquisar">
            ⌕
          </button>

          <button
            type="button"
            className="fp-botao-icone fp-notificacao"
            aria-label="Notificações"
          >
            ♧
            <b>3</b>
          </button>

          <UserMenu usuario={usuario} sair={sair} />
        </div>
      </header>

      {!temAcessoFinanceiro && (
        <div className="empty-state">
          Sua conta não tem permissão pra ver informações financeiras. Peça
          ao administrador pra liberar o acesso em Usuários, ou use uma das
          opções disponíveis no menu.
        </div>
      )}

      {temAcessoFinanceiro && cmvStatus !== "Dentro da meta" && cmvStatus !== "Sem dados" && (
        <div
          className={
            cmvStatus === "Risco elevado"
              ? "fp-alerta-cmv fp-alerta-cmv-critico"
              : "fp-alerta-cmv fp-alerta-cmv-atencao"
          }
        >
          <span className="fp-alerta-cmv-icone">
            {cmvStatus === "Risco elevado" ? "🚨" : "⚠️"}
          </span>

          <div>
            <strong>
              CMV {cmvStatus === "Risco elevado" ? "crítico" : "em atenção"}
              : {formatarPercentual(cmv)}
            </strong>
            <span>
              {cmvStatus === "Risco elevado"
                ? "O CMV deste mês passou de 40% — revise os custos de insumos o quanto antes."
                : "O CMV deste mês está entre 35% e 40% — fique de olho antes de virar crítico."}
            </span>
          </div>
        </div>
      )}

      {temAcessoFinanceiro && ehAdministrador && lojas.length > 0 && (
        <section className="fp-lojas-seletor">
          <button
            type="button"
            className={`fp-loja-tile ${
              lojaDashboard === "todas" ? "ativo" : ""
            }`}
            onClick={() => setLojaDashboard("todas")}
          >
            Todas as lojas
          </button>

          {lojasOrdenadas.map((loja) => (
            <button
              type="button"
              key={loja.id}
              className={`fp-loja-tile ${
                lojaDashboard === String(loja.id) ? "ativo" : ""
              }`}
              onClick={() => setLojaDashboard(String(loja.id))}
            >
              {loja.nome}
            </button>
          ))}
        </section>
      )}

      {temAcessoFinanceiro && (
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 4,
        }}
      >
        <button
          type="button"
          onClick={alternarValoresVisiveis}
          title={valoresVisiveis ? "Esconder valores" : "Mostrar valores"}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 4,
            fontSize: 18,
            lineHeight: 1,
            opacity: 0.7,
          }}
        >
          {valoresVisiveis ? "👁️" : "🙈"}
        </button>
      </div>
      )}

      {temAcessoFinanceiro && (
      <section className="fp-kpis">
        {acessoCardReceitas && (
        <CartaoPrincipal
          classe="verde"
          titulo="Receitas"
          mascarar={!valoresVisiveis}
          valor={carregando ? "…" : formatarMoeda(receitas)}
          legenda="↗ Faturamento do período"
          icone="↑"
          grafico={<MiniLinha valores={valoresReceitas} cor="#18d653" />}
        />
        )}

        {acessoCardDespesas && (
        <CartaoPrincipal
          classe="vermelho"
          titulo="Despesas"
          mascarar={!valoresVisiveis}
          valor={carregando ? "…" : formatarMoeda(despesas)}
          legenda="↘ Custos totais do período"
          icone="↓"
          grafico={<MiniLinha valores={valoresDespesas} cor="#ff3545" />}
        />
        )}

        {acessoCardFluxoCaixa && (
        <CartaoPrincipal
          classe="roxo"
          titulo="Fluxo de caixa"
          mascarar={!valoresVisiveis}
          valor={carregando ? "…" : formatarMoeda(fluxoCaixa)}
          legenda={carregando ? "Carregando..." : fluxoCaixa >= 0 ? "Positivo" : "Negativo"}
          icone="⌁"
          grafico={
            <MiniBarras
              valores={[35, 60, 42, 53, 48, 68, 86, 44, 75, 47, 40, 58]}
              cor="#8b35df"
            />
          }
        />
        )}

        {acessoCardSaldo && (
        <CartaoPrincipal
          classe="azul"
          titulo="Saldo"
          mascarar={!valoresVisiveis}
          // BUG REAL corrigido (24/08/2026): antes de "lancamentos" terminar
          // de carregar, o Saldo mostrava só a base fixa (R$106.430,13, sem
          // nenhuma receita/despesa somada ainda) por alguns segundos — um
          // "flash" de valor errado bem convincente (parecia o saldo de
          // verdade, não um estado de carregamento). Usuário gravou vídeo
          // mostrando exatamente isso. Agora mostra "…" enquanto carrega, em
          // vez de um número real só que incompleto.
          valor={carregando ? "…" : formatarMoeda(saldo)}
          // Pedido do usuário (18/08/2026): não é pra sumir com a linha de
          // Bruto/Taxas quando não há taxa nenhuma desde o ajuste do saldo —
          // é pra continuar aparecendo, só que com o valor certo (mesma base
          // de R$ 106.430,13 do Saldo de cima), em vez do número do mês
          // inteiro que não tinha relação nenhuma com o saldo novo.
          bruto={carregando ? "…" : formatarMoeda(saldoBruto)}
          taxa={
            carregando
              ? "…"
              : `${formatarMoeda(totalTaxas)} (${percentualTaxas.toFixed(2)}%)`
          }
          // Pedido do usuário (20/08/2026): antes sumia a linha inteira
          // quando o valor era exatamente R$0,00 — agora sempre mostra,
          // mesmo zerado, pra dar pra confirmar visualmente que zerou de
          // verdade (em vez de simplesmente não aparecer nada).
          emDinheiro={carregando ? "…" : formatarMoeda(dinheiroEmCaixa)}
          fundoRetirada={
            carregando ? null : fundoRetirada > 0 ? formatarMoeda(fundoRetirada) : null
          }
          legenda={
            carregando
              ? "Carregando..."
              : saldo >= 0
              ? "↗ Resultado positivo"
              : "↘ Resultado negativo"
          }
          icone="▣"
          grafico={<MiniLinha valores={fluxoSeteDias} cor="#1476ff" />}
        />
        )}

        {acessoCardProximosRecebimentos && (
        <CartaoPrincipal
          classe="ciano"
          titulo="Próximos Recebimentos"
          mascarar={!valoresVisiveis}
          valor={formatarMoeda(aReceber)}
          bruto={taxaAReceber > 0 ? formatarMoeda(aReceberBruto) : null}
          taxa={
            taxaAReceber > 0
              ? `${formatarMoeda(taxaAReceber)} (${percentualTaxaAReceber.toFixed(2)}%)`
              : null
          }
          legenda={legendaProximosRecebimentos}
          icone="⏳"
          grafico={<MiniLinha valores={valoresAReceber} cor="#06b6d4" />}
        />
        )}
      </section>
      )}

      {temAcessoFinanceiro &&
        acessoCardSaldo &&
        !carregando &&
        conferenciaSaldo &&
        conferenciaSaldo.temRegistro &&
        (() => {
          // Etapa 4 (Malha 4): aviso de "há quanto tempo o Saldo não é
          // conferido contra o banco". Sem feed bancário, a segurança do
          // Saldo vem de reconferir na mão de vez em quando — este aviso
          // cutuca pra isso e mostra o quanto o sistema diz que andou
          // desde a última conferência (o valor a "casar" com o extrato).
          const dias = conferenciaSaldo.diasDesdeConferencia ?? 0;
          const nivel = dias >= 8 ? "alto" : dias >= 4 ? "medio" : "ok";
          const cores = {
            ok: { borda: "#1e5aa8", fundo: "#0f2036", texto: "#9fd0ff" },
            medio: { borda: "#b7791f", fundo: "#2c210c", texto: "#ffd58a" },
            alto: { borda: "#c0392b", fundo: "#2c1110", texto: "#ff9a90" },
          }[nivel];
          const dataFmt = conferenciaSaldo.dataUltimaConferencia
            ? new Date(
                `${conferenciaSaldo.dataUltimaConferencia}T12:00:00`
              ).toLocaleDateString("pt-BR")
            : "—";

          return (
            <div
              style={{
                margin: "0 0 18px",
                padding: "12px 16px",
                borderRadius: 12,
                border: `1px solid ${cores.borda}`,
                background: cores.fundo,
                color: cores.texto,
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              <strong>
                {nivel === "ok"
                  ? "✓ Saldo conferido"
                  : "⚠️ Confira o Saldo com o banco"}
              </strong>{" "}
              — última conferência {dias === 0 ? "hoje" : `há ${dias} dia${dias > 1 ? "s" : ""}`}{" "}
              ({dataFmt}), no valor de{" "}
              {formatarMoeda(conferenciaSaldo.valorConferido)}.
              <br />
              Desde então o sistema somou{" "}
              <strong>+{formatarMoeda(conferenciaSaldo.entradasDesdeConferencia)}</strong>{" "}
              e descontou{" "}
              <strong>−{formatarMoeda(conferenciaSaldo.saidasDesdeConferencia)}</strong>{" "}
              (variação {formatarMoeda(conferenciaSaldo.movimentoDesdeConferencia)}).
              {nivel !== "ok" && (
                <>
                  {" "}
                  Abra <strong>🏦 Conferência de Saldo</strong> no menu, confira
                  o extrato e atualize o valor real.
                </>
              )}
            </div>
          );
        })()}

      {temAcessoFinanceiro && (
      <section className="fp-metricas">
        <article>
          <div>
            <span>CMV</span>
            <strong>{formatarPercentual(cmv)}</strong>
            <small className="fp-alerta">{cmvStatus}</small>
          </div>
          <Anel valor={cmv} cor="#ff9800" texto="CMV" />
        </article>

        <article>
          <div>
            <span>Margem</span>
            <strong>{formatarPercentual(margem)}</strong>
            <small className="fp-sucesso">{margemStatus}</small>
          </div>
          <Anel valor={margem} cor="#18c754" texto="Margem" />
        </article>

        <article>
          <div>
            <span>⚖️ Ponto de Equilíbrio</span>
            <strong>
              {pontoDeEquilibrio?.faturamentoNecessario != null
                ? formatarMoeda(pontoDeEquilibrio.faturamentoNecessario)
                : "—"}
            </strong>
            <small>
              Custo fixo {formatarMoeda(pontoDeEquilibrio?.custoFixoMensal || 0)}
              /mês pra bater
            </small>
          </div>
          <b className="fp-alerta">📉</b>
        </article>

        <article>
          <div>
            <span>Ticket médio</span>
            <strong>{formatarMoeda(ticketMedio)}</strong>
            <small>Receita média por venda</small>
          </div>
          <b className="fp-sucesso">↗ 8.2%</b>
        </article>

        <article>
          <div>
            <span>Lançamentos</span>
            <strong>{lancamentosDoMes.length.toLocaleString("pt-BR")}</strong>
            <small>Registros no período</small>
          </div>
          <b className="fp-sacola">♧</b>
        </article>
      </section>
      )}

      {temAcessoFinanceiro && (
      <section className="fp-grade">
        <article className="fp-painel fp-comparativo">
          <header>
            <div>
              <h2>Comparativo: receitas x despesas</h2>
              <p>
                <i className="fp-legenda fp-legenda-verde" />
                Receitas
                <i className="fp-legenda fp-legenda-vermelha" />
                Despesas
              </p>
            </div>

            <select
              value={periodoComparativo}
              onChange={(evento) => setPeriodoComparativo(evento.target.value)}
            >
              <option value="mensal">Mensal (últimos 6 meses)</option>
              <option value="trimestral">Trimestral (últimos 4)</option>
              <option value="anual">Anual (últimos 3)</option>
            </select>
          </header>

          <div className="fp-grafico-barras">
            <aside>
              {/* Antes essas 6 marcas eram fixas (150k/120k/90k...) — não
                  faziam sentido nenhum com dados reais variando bem
                  diferente disso. Agora acompanham o maior valor real da
                  série (maiorComparativo). */}
              {[1, 0.8, 0.6, 0.4, 0.2, 0].map((fator) => (
                <span key={fator}>
                  {formatarEscalaGrafico(maiorComparativo * fator)}
                </span>
              ))}
            </aside>

            <div className="fp-area-meses">
              {mesesComparativo.map((mes, indice) => (
                <div className="fp-mes" key={mes}>
                  <div>
                    <span
                      className="fp-barra-receita"
                      style={{
                        height: `${Math.max(
                          2,
                          (serieReceitas[indice] / maiorComparativo) * 100
                        )}%`,
                      }}
                    />
                    <span
                      className="fp-barra-despesa"
                      style={{
                        height: `${Math.max(
                          2,
                          (serieDespesas[indice] / maiorComparativo) * 100
                        )}%`,
                      }}
                    />
                  </div>
                  <b>{mes}</b>
                </div>
              ))}
            </div>
          </div>

          <footer>
            <div>
              <span>Total receitas</span>
              <strong className="fp-sucesso">
                {formatarMoeda(receitas)}
              </strong>
            </div>

            <div>
              <span>Total despesas</span>
              <strong className="fp-erro">
                {formatarMoeda(despesas)}
              </strong>
            </div>

            <div>
              <span>Resultado</span>
              <strong className="fp-destaque">
                {formatarMoeda(saldo)}
              </strong>
            </div>
          </footer>
        </article>

        <article className="fp-painel fp-categorias">
          <header>
            <h2>Despesas por categoria</h2>
            <select
              value={periodoCategorias}
              onChange={(evento) => setPeriodoCategorias(evento.target.value)}
            >
              <option value="mes">Este mês</option>
              <option value="mes_passado">Mês passado</option>
              <option value="ano">Este ano</option>
            </select>
          </header>

          <div className="fp-corpo-categorias">
            <div
              className="fp-donut"
              style={{ background: fundoDonut }}
            >
              <div>
                <strong>{formatarMoeda(despesas)}</strong>
                <span>Total</span>
              </div>
            </div>

            <div className="fp-lista-categorias">
              {categorias.length > 0 ? (
                categorias.map((item) => (
                  <div key={item.nome}>
                    <i style={{ background: item.cor }} />
                    <span>{item.nome}</span>
                    <b>{item.percentual.toFixed(1)}%</b>
                    <em>{formatarMoeda(item.valor)}</em>
                  </div>
                ))
              ) : (
                <p>Nenhuma despesa cadastrada.</p>
              )}
            </div>
          </div>

          <button type="button" className="fp-link">
            Ver todas as categorias →
          </button>
        </article>

        <article className="fp-painel fp-fluxo">
          <header>
            <h2>Fluxo de caixa — últimos 7 dias</h2>
          </header>

          <div className="fp-grafico-linha">
            <svg
              viewBox={`0 0 ${larguraGrafico} ${alturaGrafico}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <polyline
                points={pontosFluxo}
                fill="none"
                stroke="#1476ff"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {pontosFluxo.split(" ").map((ponto, indice) => {
                const [x, y] = ponto.split(",");
                return (
                  <circle
                    key={`${x}-${y}-${indice}`}
                    cx={x}
                    cy={y}
                    r="6"
                    fill="#1476ff"
                  />
                );
              })}
            </svg>

            <div>
              {["28/07", "29/07", "30/07", "31/07", "01/08", "02/08", "03/08"].map(
                (data) => (
                  <span key={data}>{data}</span>
                )
              )}
            </div>
          </div>
        </article>

        <article className="fp-painel fp-transacoes">
          <header>
            <h2>Últimas transações</h2>
            <button type="button">Ver todas →</button>
          </header>

          <div>
            {ultimasTransacoes.length > 0 ? (
              ultimasTransacoes.map((item) => (
                <div className="fp-transacao" key={item.id}>
                  <i
                    className={
                      item.tipo === "receita"
                        ? "fp-transacao-entrada"
                        : "fp-transacao-saida"
                    }
                  >
                    {item.tipo === "receita" ? "↑" : "↓"}
                  </i>

                  <div>
                    <strong>{item.descricao || "Movimentação"}</strong>
                    <small>
                      {item.tipo === "receita"
                        ? "Receitas"
                        : item.categoria || "Despesas"}
                    </small>
                  </div>

                  {item.tipo === "receita" &&
                  item.valor_liquido_esperado != null &&
                  Number(item.valor_liquido_esperado) !==
                    Number(item.valor) ? (
                    <div className="fp-transacao-com-taxa">
                      <div className="fp-transacao-com-taxa-topo">
                        <small>{formatarMoeda(item.valor)}</small>
                        <small>
                          Taxa{" "}
                          {formatarMoeda(
                            Number(item.valor) -
                              Number(item.valor_liquido_esperado)
                          )}{" "}
                          (
                          {(
                            ((Number(item.valor) -
                              Number(item.valor_liquido_esperado)) /
                              Number(item.valor)) *
                            100
                          ).toFixed(2)}
                          %)
                        </small>
                      </div>

                      <strong className="fp-sucesso fp-transacao-liquido">
                        {formatarMoeda(item.valor_liquido_esperado)}
                      </strong>

                      <small>{formatarData(item.data)}</small>
                    </div>
                  ) : (
                    <div>
                      <strong
                        className={
                          item.tipo === "receita"
                            ? "fp-sucesso"
                            : "fp-erro"
                        }
                      >
                        {item.tipo === "receita" ? "" : "- "}
                        {formatarMoeda(item.valor)}
                      </strong>
                      <small>{formatarData(item.data)}</small>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p>Nenhuma movimentação cadastrada.</p>
            )}
          </div>
        </article>
      </section>
      )}
    </main>
  );
}
