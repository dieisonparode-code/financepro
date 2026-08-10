import { useMemo } from "react";
import "./dashboardPremium.css";
import UserMenu from "./UserMenu";

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

function CartaoPrincipal({
  classe,
  titulo,
  valor,
  legenda,
  icone,
  grafico,
  bruto,
  taxa,
}) {
  const temTaxa = bruto != null && taxa != null;

  return (
    <article className={`fp-kpi fp-kpi-${classe}`}>
      <div className="fp-kpi-cabecalho">
        <span>{titulo}</span>
        <Icone className={classe}>{icone}</Icone>
      </div>

      {temTaxa ? (
        <>
          <div className="fp-kpi-bruto-taxa">
            <span>{bruto}</span>
            <span>Taxas {taxa}</span>
          </div>
          <strong className="fp-kpi-liquido">{valor}</strong>
        </>
      ) : (
        <strong>{valor}</strong>
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
}) {
  const receitas = numero(totais.receitas);
  const despesas = numero(totais.despesas);
  const saldo = numero(totais.saldo);
  const saldoBruto = numero(totais.saldoBruto);
  const totalTaxas = numero(totais.totalTaxas);
  const percentualTaxas = numero(totais.percentualTaxas);
  const cmv = numero(totais.cmvPercentual);
  const margem = numero(totais.margemPercentual);

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

 const categorias = useMemo(() => {
  const mapaCategorias = despesasPorCategoria.reduce(
    (acumulado, item) => {
      const nome = item.categoria || "Outros";
      const valor = numero(item.valor);

      if (!acumulado[nome]) {
        acumulado[nome] = {
          nome,
          valor: 0,
          cor:
            item.cor ||
            (nome === "Fornecedores"
              ? "#ef4444"
              : nome === "Funcionários"
              ? "#f59e0b"
              : nome === "Aluguel"
              ? "#8b5cf6"
              : nome === "Energia"
              ? "#22c55e"
              : nome === "Gás"
              ? "#3b82f6"
              : nome === "Marketing"
              ? "#06b6d4"
              : nome === "Impostos"
              ? "#ec4899"
              : nome === "Taxas"
              ? "#f97316"
              : nome === "Manutenção"
              ? "#84cc16"
              : "#2563eb"),
        };
      }

      acumulado[nome].valor += valor;

      return acumulado;
    },
    {}
  );

  const ordenadas = Object.values(mapaCategorias)
    .filter((item) => item.valor > 0)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 5);

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
}, [despesasPorCategoria]);
     

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
      (item) =>
        item.tipo === "receita" &&
        item.data_prevista_recebimento &&
        item.data_prevista_recebimento > hojeStr &&
        item.status_conciliacao !== "conciliado"
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

  const mesesComparativo = ["Mar", "Abr", "Mai", "Jun", "Jul", "Ago"];
  const serieReceitas = [0.76, 0.68, 0.62, 0.78, 1.08, 1].map(
    (fator) => receitas * fator
  );
  const serieDespesas = [0.69, 0.61, 0.62, 0.72, 0.86, 1].map(
    (fator) => despesas * fator
  );
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

          {lojas.map((loja) => (
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
      <section className="fp-kpis">
        {acessoCardReceitas && (
        <CartaoPrincipal
          classe="verde"
          titulo="Receitas"
          valor={formatarMoeda(receitas)}
          legenda="↗ Faturamento do período"
          icone="↑"
          grafico={<MiniLinha valores={valoresReceitas} cor="#18d653" />}
        />
        )}

        {acessoCardDespesas && (
        <CartaoPrincipal
          classe="vermelho"
          titulo="Despesas"
          valor={formatarMoeda(despesas)}
          legenda="↘ Custos totais do período"
          icone="↓"
          grafico={<MiniLinha valores={valoresDespesas} cor="#ff3545" />}
        />
        )}

        {acessoCardFluxoCaixa && (
        <CartaoPrincipal
          classe="roxo"
          titulo="Fluxo de caixa"
          valor={formatarMoeda(saldo)}
          legenda={saldo >= 0 ? "Positivo" : "Negativo"}
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
          valor={formatarMoeda(saldo)}
          bruto={totalTaxas > 0 ? formatarMoeda(saldoBruto) : null}
          taxa={
            totalTaxas > 0
              ? `${formatarMoeda(totalTaxas)} (${percentualTaxas.toFixed(2)}%)`
              : null
          }
          legenda={saldo >= 0 ? "↗ Resultado positivo" : "↘ Resultado negativo"}
          icone="▣"
          grafico={<MiniLinha valores={fluxoSeteDias} cor="#1476ff" />}
        />
        )}

        {acessoCardProximosRecebimentos && (
        <CartaoPrincipal
          classe="ciano"
          titulo="Próximos Recebimentos"
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

            <select defaultValue="mensal">
              <option value="mensal">Mensal</option>
            </select>
          </header>

          <div className="fp-grafico-barras">
            <aside>
              <span>150k</span>
              <span>120k</span>
              <span>90k</span>
              <span>60k</span>
              <span>30k</span>
              <span>0</span>
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
            <select defaultValue="mes">
              <option value="mes">Este mês</option>
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
