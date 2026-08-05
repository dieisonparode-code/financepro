import React, { useState, useEffect, useMemo } from "react";
import DashboardPremium from "./components/dashboardPremium";
import "./App.css";
import "./paginasInternas.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import ProtectedRoute from "./routes/ProtectedRoute";
import {
  buscarLancamentos,
  criarLancamento,
  atualizarLancamento,
  excluirLancamento,
} from "./services/api";

import GraficoFinanceiro from "./components/GraficoFinanceiro";
import GraficoCategorias from "./components/GraficoCategorias";
import CadastroCategorias from "./components/CadastroCategorias";

const categoriasPadrao = [
  "Vendas",
  "Delivery",
  "Fornecedores",
  "Funcionários",
  "Aluguel",
  "Energia",
  "Gás",
  "Marketing",
  "Impostos",
  "Taxas",
  "Manutenção",
  "Outros",
 ];

function criarCategoriasIniciais() {
  return categoriasPadrao.map((nome, indice) => ({
    id: `categoria-${indice + 1}`,
    nome,
    cor: [
      "#2563eb",
      "#0ea5e9",
      "#ef4444",
      "#f59e0b",
      "#8b5cf6",
      "#22c55e",
    ][indice % 6],
    icone: "📁",
  }));
}

function carregarCategorias() {
  try {
    const salvas = localStorage.getItem("financepro-categorias");

    if (!salvas) {
      return criarCategoriasIniciais();
    }

    const dados = JSON.parse(salvas);

    return Array.isArray(dados) && dados.length > 0
      ? dados
      : criarCategoriasIniciais();
  } catch {
    return criarCategoriasIniciais();
  }
}

const gruposFinanceiros = [
  "Receita Operacional",
  "CMV - Insumos",
  "Despesas Operacionais",
  "Despesas Administrativas",
  "Despesas Comerciais",
  "Despesas Financeiras",
  "Impostos",
  "Investimentos",
  "Outros",
];

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarData(data) {
  if (!data) return "Sem data";
  return new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR");
}

function criarFormularioInicial(tipo = "receita") {
  return {
    descricao: "",
    valor: "",
    grupo:
      tipo === "receita"
        ? "Receita Operacional"
        : "CMV - Insumos",
    categoria:
      tipo === "receita"
        ? "Vendas"
        : "Fornecedores",
    subcategoria: "",
    fornecedor: "",
    observacao: "",
    foto: "",
    data: new Date().toISOString().slice(0, 10),
  };
}
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <FinanceApp />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
function FinanceApp() {
  const [pagina, setPagina] = useState("dashboard");
  const [lancamentos, setLancamentos] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const [modalAberto, setModalAberto] = useState(false);
  const [tipoLancamento, setTipoLancamento] = useState("receita");
  const [editandoId, setEditandoId] = useState(null);

  const [formulario, setFormulario] = useState(
    criarFormularioInicial("receita")
  );

  const [categoriasCadastradas, setCategoriasCadastradas] =
    useState(carregarCategorias);

  const hoje = new Date().toISOString().slice(0, 10);
  const primeiroDiaMes = `${hoje.slice(0, 7)}-01`;

  const [dataInicialRelatorio, setDataInicialRelatorio] =
    useState(primeiroDiaMes);
  const [dataFinalRelatorio, setDataFinalRelatorio] = useState(hoje);

  const [dataInicialFluxo, setDataInicialFluxo] =
    useState(primeiroDiaMes);
  const [dataFinalFluxo, setDataFinalFluxo] = useState(hoje);
  const [agrupamentoFluxo, setAgrupamentoFluxo] =
    useState("diario");

  useEffect(() => {
    localStorage.setItem(
      "financepro-categorias",
      JSON.stringify(categoriasCadastradas)
    );
  }, [categoriasCadastradas]);

  useEffect(() => {
    async function carregarDados() {
      try {
        setCarregando(true);
        const dados = await buscarLancamentos();
        setLancamentos(Array.isArray(dados) ? dados : []);
      } catch (erro) {
        console.error("Erro ao carregar lançamentos:", erro);
        alert(
          "Não foi possível carregar os lançamentos. Confirme se o backend está funcionando."
        );
      } finally {
        setCarregando(false);
      }
    }

    carregarDados();
  }, []);
const [mesDashboard, setMesDashboard] = useState(
  new Date().toISOString().slice(0, 7)
);

const lancamentosDashboard = useMemo(() => {
  return lancamentos.filter((item) => {
    if (!item.data) return false;

    return item.data.slice(0, 7) === mesDashboard;
  });
}, [lancamentos, mesDashboard]);
  const totais = useMemo(() => {
   const receitas = lancamentosDashboard
      .filter((item) => item.tipo === "receita")
      .reduce((total, item) => total + Number(item.valor || 0), 0);

    const despesas = lancamentosDashboard
      .filter((item) => item.tipo === "despesa")
      .reduce((total, item) => total + Number(item.valor || 0), 0);

    const cmvValor = lancamentosDashboard
      .filter(
        (item) =>
          item.tipo === "despesa" &&
          item.grupo === "CMV - Insumos"
      )
      .reduce((total, item) => total + Number(item.valor || 0), 0);

    const saldo = receitas - despesas;
    const cmvPercentual =
      receitas > 0 ? (cmvValor / receitas) * 100 : 0;
    const margemPercentual =
      receitas > 0 ? (saldo / receitas) * 100 : 0;

    return {
      receitas,
      despesas,
      saldo,
      cmvValor,
      cmvPercentual,
      margemPercentual,
    };
  }, [lancamentosDashboard]);

  const despesasPorCategoria = useMemo(() => {
  const agrupadas = lancamentos
    .filter((item) => item.tipo === "despesa")
    .reduce((acumulador, item) => {
      const categoria = item.categoria || "Outros";

      if (!acumulador[categoria]) {
        acumulador[categoria] = {
          categoria,
          valor: 0,
        };
      }

      acumulador[categoria].valor += Number(item.valor || 0);

      return acumulador;
    }, {});

  return Object.values(agrupadas);
}, [lancamentos]);

const lancamentosFiltrados = useMemo(() => {
  if (pagina === "receitas") {
    return lancamentos.filter((item) => item.tipo === "receita");
  }

  if (pagina === "despesas") {
    return lancamentos.filter((item) => item.tipo === "despesa");
  }

  return lancamentos;
}, [lancamentos, pagina]);

const lancamentosRelatorio = useMemo(() => {
  return lancamentos.filter((item) => {
    if (!item.data) return false;

    return (
      item.data >= dataInicialRelatorio &&
      item.data <= dataFinalRelatorio
       );
  });
}, [lancamentos, dataInicialRelatorio, dataFinalRelatorio]);
const totaisRelatorio = useMemo(() => {
  const receitas = lancamentosRelatorio
    .filter((item) => item.tipo === "receita")
    .reduce((total, item) => total + Number(item.valor || 0), 0);

  const despesas = lancamentosRelatorio
    .filter((item) => item.tipo === "despesa")
    .reduce((total, item) => total + Number(item.valor || 0), 0);

  const cmvValor = lancamentosRelatorio
    .filter(
      (item) =>
        item.tipo === "despesa" &&
        item.grupo === "CMV - Insumos"
    )
    .reduce((total, item) => total + Number(item.valor || 0), 0);

  const saldo = receitas - despesas;

  const cmvPercentual =
    receitas > 0 ? (cmvValor / receitas) * 100 : 0;
const statusCmv =
  cmvPercentual <= 35
    ? "Dentro da meta"
    : cmvPercentual <= 40
    ? "Atenção"
    : "Crítico";
  const margemPercentual =
    receitas > 0 ? (saldo / receitas) * 100 : 0;

  return {
    receitas,
    despesas,
    saldo,
    cmvValor,
    cmvPercentual,
    margemPercentual,
  };
}, [lancamentosRelatorio]);

  
   

  const rankingCategoriasRelatorio = useMemo(() => {
    const agrupadas = lancamentosRelatorio
      .filter((item) => item.tipo === "despesa")
      .reduce((acc, item) => {
        const categoria = item.categoria || "Outros";
        acc[categoria] =
          (acc[categoria] || 0) + Number(item.valor || 0);
        return acc;
      }, {});

    return Object.entries(agrupadas)
      .map(([categoria, valor]) => ({ categoria, valor }))
      .sort((a, b) => b.valor - a.valor);
  }, [lancamentosRelatorio]);

  const lancamentosFluxo = useMemo(() => {
    return lancamentos
      .filter((item) => {
        if (!item.data) return false;

        return (
          item.data >= dataInicialFluxo &&
          item.data <= dataFinalFluxo
        );
      })
      .sort((a, b) => {
        const comparacaoData = a.data.localeCompare(b.data);

        if (comparacaoData !== 0) {
          return comparacaoData;
        }

        return String(a.id || "").localeCompare(
          String(b.id || "")
        );
      });
  }, [lancamentos, dataInicialFluxo, dataFinalFluxo]);

  const totaisFluxo = useMemo(() => {
    const entradas = lancamentosFluxo
      .filter((item) => item.tipo === "receita")
      .reduce(
        (total, item) => total + Number(item.valor || 0),
        0
      );

    const saidas = lancamentosFluxo
      .filter((item) => item.tipo === "despesa")
      .reduce(
        (total, item) => total + Number(item.valor || 0),
        0
      );

    return {
      entradas,
      saidas,
      saldo: entradas - saidas,
    };
  }, [lancamentosFluxo]);

  const dadosFluxoCaixa = useMemo(() => {
    function obterChavePeriodo(data) {
      const dataLocal = new Date(`${data}T12:00:00`);

      if (agrupamentoFluxo === "mensal") {
        return data.slice(0, 7);
      }

      if (agrupamentoFluxo === "semanal") {
        const diaSemana = dataLocal.getDay();
        const diferencaParaSegunda =
          diaSemana === 0 ? -6 : 1 - diaSemana;

        dataLocal.setDate(
          dataLocal.getDate() + diferencaParaSegunda
        );

        return dataLocal.toISOString().slice(0, 10);
      }

      return data;
    }

    function formatarPeriodo(chave) {
      if (agrupamentoFluxo === "mensal") {
        const [ano, mes] = chave.split("-");

        return new Date(
          Number(ano),
          Number(mes) - 1,
          1
        ).toLocaleDateString("pt-BR", {
          month: "short",
          year: "numeric",
        });
      }

      if (agrupamentoFluxo === "semanal") {
        return `Semana de ${formatarData(chave)}`;
      }

      return formatarData(chave);
    }

    const agrupados = lancamentosFluxo.reduce(
      (acumulador, item) => {
        const chave = obterChavePeriodo(item.data);

        if (!acumulador[chave]) {
          acumulador[chave] = {
            chave,
            periodo: formatarPeriodo(chave),
            entradas: 0,
            saidas: 0,
          };
        }

        if (item.tipo === "receita") {
          acumulador[chave].entradas += Number(
            item.valor || 0
          );
        } else {
          acumulador[chave].saidas += Number(
            item.valor || 0
          );
        }

        return acumulador;
      },
      {}
    );

    let saldoAcumulado = 0;

    return Object.values(agrupados)
      .sort((a, b) => a.chave.localeCompare(b.chave))
      .map((item) => {
        const saldoPeriodo = item.entradas - item.saidas;
        saldoAcumulado += saldoPeriodo;

        return {
          ...item,
          saldoPeriodo,
          saldoAcumulado,
        };
      });
  }, [lancamentosFluxo, agrupamentoFluxo]);

  const periodosNegativosFluxo = useMemo(() => {
    return dadosFluxoCaixa.filter(
      (item) => item.saldoAcumulado < 0
    ).length;
  }, [dadosFluxoCaixa]);

  const cmvStatus =
    totais.cmvPercentual <= 35
      ? "Dentro da meta"
      : totais.cmvPercentual <= 40
      ? "Atenção"
      : "Risco elevado";

  const margemStatus =
    totais.margemPercentual >= 15
      ? "Saudável"
      : totais.margemPercentual >= 5
      ? "Atenção"
      : "Crítica";

  function abrirModal(tipo) {
    setTipoLancamento(tipo);
    setEditandoId(null);
    setFormulario(criarFormularioInicial(tipo));
    setModalAberto(true);
  }

  function abrirEdicao(lancamento) {
    setTipoLancamento(lancamento.tipo);
    setEditandoId(lancamento.id);

    setFormulario({
      descricao: lancamento.descricao || "",
      valor: String(lancamento.valor || "").replace(".", ","),
      grupo:
        lancamento.grupo ||
        (lancamento.tipo === "receita"
          ? "Receita Operacional"
          : "CMV - Insumos"),
      categoria:
        lancamento.categoria ||
        (lancamento.tipo === "receita"
          ? "Vendas"
          : "Fornecedores"),
      subcategoria: lancamento.subcategoria || "",
      fornecedor: lancamento.fornecedor || "",
      observacao: lancamento.observacao || "",
      foto: lancamento.foto || "",
      data:
        lancamento.data ||
        new Date().toISOString().slice(0, 10),
    });

    setModalAberto(true);
  }

  function fecharModal() {
    setModalAberto(false);
    setEditandoId(null);
  }

  function alterarCampo(campo, valor) {
    setFormulario((anterior) => ({
      ...anterior,
      [campo]: valor,
    }));
  }

  async function salvarLancamento(evento) {
    evento.preventDefault();

    const valorNumerico = Number(
      String(formulario.valor)
        .replace(/\./g, "")
        .replace(",", ".")
    );

    if (!formulario.descricao.trim()) {
      alert("Informe a descrição.");
      return;
    }

    if (!valorNumerico || valorNumerico <= 0) {
      alert("Informe um valor válido.");
      return;
    }

    const dados = {
      tipo: tipoLancamento,
      descricao: formulario.descricao.trim(),
      valor: valorNumerico,
      grupo: formulario.grupo,
      categoria: formulario.categoria,
      subcategoria: formulario.subcategoria.trim(),
      fornecedor: formulario.fornecedor.trim(),
      observacao: formulario.observacao.trim(),
      foto: formulario.foto || "",
      data: formulario.data,
    };

    try {
      const salvo = editandoId
        ? await atualizarLancamento(editandoId, dados)
        : await criarLancamento(dados);

      setLancamentos((anteriores) =>
        editandoId
          ? anteriores.map((item) =>
              item.id === editandoId ? salvo : item
            )
          : [salvo, ...anteriores]
      );

      fecharModal();
    } catch (erro) {
      console.error("Erro ao salvar lançamento:", erro);
      alert(
        "Não foi possível salvar. Confirme se o backend está funcionando."
      );
    }
  }

  async function removerLancamento(id) {
    const confirmar = window.confirm(
      "Deseja realmente excluir este lançamento?"
    );

    if (!confirmar) return;

    try {
      await excluirLancamento(id);

      setLancamentos((anteriores) =>
        anteriores.filter((item) => item.id !== id)
      );
    } catch (erro) {
      console.error("Erro ao excluir lançamento:", erro);
      alert("Não foi possível excluir o lançamento.");
    }
  }

  function adicionarCategoria(novaCategoria) {
    const nomeNormalizado = novaCategoria.nome.trim();

    const duplicada = categoriasCadastradas.some(
      (categoria) =>
        categoria.nome.toLowerCase() ===
        nomeNormalizado.toLowerCase()
    );

    if (duplicada) {
      alert("Já existe uma categoria com esse nome.");
      return;
    }

    setCategoriasCadastradas((anteriores) => [
      ...anteriores,
      {
        ...novaCategoria,
        id: `categoria-${Date.now()}`,
        nome: nomeNormalizado,
      },
    ]);
  }

  function editarCategoria(id, dadosAtualizados) {
    const nomeNormalizado = dadosAtualizados.nome.trim();

    const duplicada = categoriasCadastradas.some(
      (categoria) =>
        categoria.id !== id &&
        categoria.nome.toLowerCase() ===
          nomeNormalizado.toLowerCase()
    );

    if (duplicada) {
      alert("Já existe outra categoria com esse nome.");
      return;
    }

    setCategoriasCadastradas((anteriores) =>
      anteriores.map((categoria) =>
        categoria.id === id
          ? {
              ...categoria,
              ...dadosAtualizados,
              nome: nomeNormalizado,
            }
          : categoria
      )
    );
  }

  function excluirCategoria(id) {
    const categoria = categoriasCadastradas.find(
      (item) => item.id === id
    );

    if (!categoria) return;

    const categoriaEmUso = lancamentos.some(
      (item) => item.categoria === categoria.nome
    );

    if (categoriaEmUso) {
      alert(
        "Essa categoria está vinculada a lançamentos e não pode ser excluída."
      );
      return;
    }

    setCategoriasCadastradas((anteriores) =>
      anteriores.filter((item) => item.id !== id)
    );
  }

  function exportarRelatorioCSV() {
    const cabecalho = [
      "Data",
      "Tipo",
      "Descrição",
      "Grupo",
      "Categoria",
      "Subcategoria",
      "Fornecedor",
      "Valor",
      "Observação",
    ];

    const linhas = lancamentosRelatorio.map((item) => [
      item.data || "",
      item.tipo || "",
      item.descricao || "",
      item.grupo || "",
      item.categoria || "",
      item.subcategoria || "",
      item.fornecedor || "",
      Number(item.valor || 0).toFixed(2).replace(".", ","),
      item.observacao || "",
    ]);

    const escapar = (valor) =>
      `"${String(valor).replace(/"/g, '""')}"`;

    const csv = [
      cabecalho.map(escapar).join(";"),
      ...linhas.map((linha) => linha.map(escapar).join(";")),
    ].join("\n");

    const arquivo = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(arquivo);
    const link = document.createElement("a");
    link.href = url;
    link.download = `relatorio-${dataInicialRelatorio}-a-${dataFinalRelatorio}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function imprimirRelatorio() {
    window.print();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">FP</div>
          <div>
            <strong>FinancePro</strong>
            <span>Gestão Financeira</span>
          </div>
        </div>

        <nav className="menu">
          <button
            className={pagina === "dashboard" ? "active" : ""}
            onClick={() => setPagina("dashboard")}
          >
            Dashboard
          </button>

          <button
            className={pagina === "receitas" ? "active" : ""}
            onClick={() => setPagina("receitas")}
          >
            Receitas
          </button>

          <button
            className={pagina === "despesas" ? "active" : ""}
            onClick={() => setPagina("despesas")}
          >
            Despesas
          </button>

          <button
            className={pagina === "categorias" ? "active" : ""}
            onClick={() => setPagina("categorias")}
          >
            Categorias
          </button>

          <button
            className={pagina === "fluxo" ? "active" : ""}
            onClick={() => setPagina("fluxo")}
          >
            Fluxo de Caixa
          </button>

          <button
            className={pagina === "relatorios" ? "active" : ""}
            onClick={() => setPagina("relatorios")}
          >
            Relatórios
          </button>
        </nav>
      </aside>

      <main className="main-content">
  {pagina !== "dashboard" && (
    <header className="topbar">
      <div>
        <span className="eyebrow">FinancePro</span>

        <h1>
          {pagina === "receitas"
            ? "Receitas"
            : pagina === "despesas"
            ? "Despesas"
            : pagina === "categorias"
            ? "Categorias"
            : pagina === "fluxo"
            ? "Fluxo de Caixa"
            : pagina === "relatorios"
            ? "Relatórios"
            : "FinancePro"}
        </h1>

        <p>Gestão financeira profissional e centralizada.</p>
      </div>

      <div className="topbar-actions">
        {pagina === "despesas" && (
          <button
            type="button"
            className="secondary-button"
            onClick={() => abrirModal("despesa")}
          >
            Nova despesa
          </button>
        )}

        {pagina === "receitas" && (
          <button
            type="button"
            className="primary-button"
            onClick={() => abrirModal("receita")}
          >
            Nova receita
          </button>
        )}
      </div>
    </header>
  )}

  {pagina === "dashboard" && (
    <DashboardPremium
      totais={totais}
      cmvStatus={cmvStatus}
      margemStatus={margemStatus}
      despesasPorCategoria={despesasPorCategoria}
      mesDashboard={mesDashboard}
      setMesDashboard={setMesDashboard}
      lancamentos={lancamentos}
      formatarMoeda={formatarMoeda}
      formatarData={formatarData}
    />
  )}
  

        {(pagina === "receitas" || pagina === "despesas") && (
          <section className="panel">
            <h2>Lançamentos</h2>

            {carregando && <p>Carregando...</p>}

            {!carregando && lancamentosFiltrados.length === 0 && (
              <p className="empty-state">Nenhum lançamento encontrado.</p>
            )}

            {!carregando &&
              lancamentosFiltrados.map((item) => (
                <div key={item.id} className="transaction-item">
                  <div>
                    <strong>{item.descricao}</strong>
                    <span>{item.grupo || "-"}</span>
                    <span>{item.categoria || "-"}</span>
                    <span>{item.fornecedor || "-"}</span>
                    <span>{formatarData(item.data)}</span>
                  </div>

                  <div>
                    <strong
                      className={
                        item.tipo === "receita"
                          ? "value-revenue"
                          : "value-expense"
                      }
                    >
                      {formatarMoeda(item.valor)}
                    </strong>

                    <div className="transaction-actions">
                      <button
                        type="button"
                        className="edit-button"
                        onClick={() => abrirEdicao(item)}
                      >
                        Editar
                      </button>

                      {pagina === "despesas" && item.foto && (
                        <button
                          type="button"
                          className="view-receipt-button"
                          onClick={() => {
                            const novaAba = window.open();

                            if (novaAba) {
                              novaAba.document.write(
                                `<img src="${item.foto}" alt="Comprovante" style="max-width:100%;height:auto;display:block;margin:0 auto;" />`
                              );
                              novaAba.document.close();
                            }
                          }}
                        >
                          📷 Ver foto
                        </button>
                      )}

                      <button
                        type="button"
                        className="delete-button"
                        onClick={() => removerLancamento(item.id)}
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                </div>
              ))}
          </section>
        )}

        {pagina === "categorias" && (
          <>
            <CadastroCategorias
              categorias={categoriasCadastradas}
              adicionarCategoria={adicionarCategoria}
              editarCategoria={editarCategoria}
              excluirCategoria={excluirCategoria}
            />

            <section className="panel categorias-analise">
              <div className="panel-header">
                <div>
                  <span className="eyebrow">Análise de custos</span>
                  <h2>Despesas por categoria</h2>
                </div>
              </div>

              {despesasPorCategoria.length === 0 ? (
                <p>Nenhuma despesa cadastrada.</p>
              ) : (
                despesasPorCategoria.map((item) => {
                  const percentual =
                    totais.despesas > 0
                      ? (item.valor / totais.despesas) * 100
                      : 0;

                  const status =
                    percentual >= 40
                      ? "Risco"
                      : percentual >= 25
                      ? "Atenção"
                      : "Controlado";

                  return (
                    <div
                      className="transaction-item"
                      key={item.categoria}
                    >
                      <div>
                        <strong>{item.categoria}</strong>
                        <span>{percentual.toFixed(1)}% das despesas</span>
                      </div>

                      <div>
                        <strong>{formatarMoeda(item.valor)}</strong>
                        <span>{status}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </section>
          </>
        )}

        {pagina === "fluxo" && (
          <section className="panel fluxo-panel">
            <div className="panel-header fluxo-header">
              <div>
                <span className="eyebrow">
                  Movimentação financeira
                </span>
                <h2>Fluxo de Caixa</h2>
                <p>
                  Acompanhe entradas, saídas, saldo do período e
                  evolução acumulada.
                </p>
              </div>
            </div>

            <div className="fluxo-filters">
              <label>
                Data inicial
                <input
                  type="date"
                  value={dataInicialFluxo}
                  onChange={(evento) =>
                    setDataInicialFluxo(evento.target.value)
                  }
                />
              </label>

              <label>
                Data final
                <input
                  type="date"
                  value={dataFinalFluxo}
                  onChange={(evento) =>
                    setDataFinalFluxo(evento.target.value)
                  }
                />
              </label>

              <label>
                Visualização
                <select
                  value={agrupamentoFluxo}
                  onChange={(evento) =>
                    setAgrupamentoFluxo(evento.target.value)
                  }
                >
                  <option value="diario">Diária</option>
                  <option value="semanal">Semanal</option>
                  <option value="mensal">Mensal</option>
                </select>
              </label>
            </div>

            <div className="summary-grid fluxo-summary">
              <article className="summary-card revenue">
                <span>Entradas no período</span>
                <strong>
                  {formatarMoeda(totaisFluxo.entradas)}
                </strong>
              </article>

              <article className="summary-card expense">
                <span>Saídas no período</span>
                <strong>
                  {formatarMoeda(totaisFluxo.saidas)}
                </strong>
              </article>

              <article
                className={`summary-card ${
                  totaisFluxo.saldo >= 0
                    ? "balance"
                    : "expense"
                }`}
              >
                <span>Saldo do período</span>
                <strong>
                  {formatarMoeda(totaisFluxo.saldo)}
                </strong>
              </article>

              <article
                className={`summary-card ${
                  periodosNegativosFluxo === 0
                    ? "balance"
                    : "expense"
                }`}
              >
                <span>Períodos negativos</span>
                <strong>{periodosNegativosFluxo}</strong>
                <small>
                  {periodosNegativosFluxo === 0
                    ? "Nenhum alerta"
                    : "Requer atenção"}
                </small>
              </article>
            </div>

          

            <div className="fluxo-table-section">
              <div className="panel-header">
                <div>
                  <span className="eyebrow">Detalhamento</span>
                  <h3>Movimentações do período</h3>
                </div>
              </div>

              <div className="table-wrapper">
                <table className="fluxo-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Descrição</th>
                      <th>Categoria</th>
                      <th>Tipo</th>
                      <th>Entrada</th>
                      <th>Saída</th>
                    </tr>
                  </thead>

                  <tbody>
                    {lancamentosFluxo.length === 0 ? (
                      <tr>
                        <td colSpan="6">
                          Nenhuma movimentação no período.
                        </td>
                      </tr>
                    ) : (
                      lancamentosFluxo.map((item) => (
                        <tr key={item.id}>
                          <td>{formatarData(item.data)}</td>
                          <td>{item.descricao}</td>
                          <td>{item.categoria || "-"}</td>
                          <td>
                            <span
                              className={`badge ${item.tipo}`}
                            >
                              {item.tipo === "receita"
                                ? "Receita"
                                : "Despesa"}
                            </span>
                          </td>
                          <td className="value-revenue">
                            {item.tipo === "receita"
                              ? formatarMoeda(item.valor)
                              : "-"}
                          </td>
                          <td className="value-expense">
                            {item.tipo === "despesa"
                              ? formatarMoeda(item.valor)
                              : "-"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {pagina === "relatorios" && (
          <section className="panel report-print-area">
            <div className="panel-header report-header">
              <div>
                <span className="eyebrow">Relatório financeiro</span>
                <h2>Análise por período</h2>
              </div>

              <div className="report-actions no-print">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={exportarRelatorioCSV}
                >
                  Exportar Excel/CSV
                </button>

                <button
                  type="button"
                  className="primary-button"
                  onClick={imprimirRelatorio}
                >
                  Imprimir / Salvar PDF
                </button>
              </div>
            </div>

            <div className="report-filters no-print">
              <label>
                Data inicial
                <input
                  type="date"
                  value={dataInicialRelatorio}
                  onChange={(evento) =>
                    setDataInicialRelatorio(evento.target.value)
                  }
                />
              </label>

              <label>
                Data final
                <input
                  type="date"
                  value={dataFinalRelatorio}
                  onChange={(evento) =>
                    setDataFinalRelatorio(evento.target.value)
                  }
                />
              </label>
            </div>

            <p className="report-period">
              Período: {formatarData(dataInicialRelatorio)} até{" "}
              {formatarData(dataFinalRelatorio)}
            </p>

            <div className="reports-grid">
              <article className="panel report-card">
                <span>Faturamento</span>
                <strong>
                  {formatarMoeda(totaisRelatorio.receitas)}
                </strong>
              </article>

              <article className="panel report-card">
                <span>Despesas</span>
                <strong>
                  {formatarMoeda(totaisRelatorio.despesas)}
                </strong>
              </article>

              <article className="panel report-card">
                <span>Resultado</span>
                <strong>
                  {formatarMoeda(totaisRelatorio.saldo)}
                </strong>
              </article>

             <article
  className={`panel report-card ${
    totaisRelatorio.cmvPercentual <= 35
      ? "status-saudavel"
      : totaisRelatorio.cmvPercentual <= 40
      ? "status-atencao"
      : "status-critico"
  }`}
>
  <span>CMV</span>

  <strong>
    {totaisRelatorio.cmvPercentual.toFixed(1)}%
  </strong>

  <small>
    {totaisRelatorio.cmvPercentual <= 35
      ? "Dentro da meta"
      : totaisRelatorio.cmvPercentual <= 40
      ? "Atenção"
      : "Crítico"}
  </small>
</article>

              <article
  className={`panel report-card ${
    totaisRelatorio.margemPercentual >= 15
      ? "status-saudavel"
      : totaisRelatorio.margemPercentual >= 5
      ? "status-atencao"
      : "status-critico"
  }`}
>
  <span>Margem</span>

  <strong>
    {totaisRelatorio.margemPercentual.toFixed(1)}%
  </strong>

  <small>
    {totaisRelatorio.margemPercentual >= 15
      ? "Saudável"
      : totaisRelatorio.margemPercentual >= 5
      ? "Atenção"
      : "Crítica"}
  </small>
</article>
    

              <article className="panel report-card">
                <span>Lançamentos</span>
                <strong>{lancamentosRelatorio.length}</strong>
              </article>
            </div>

            <div className="report-section">
              <h3>Ranking de despesas por categoria</h3>

              {rankingCategoriasRelatorio.length === 0 ? (
                <p>Nenhuma despesa no período.</p>
              ) : (
                rankingCategoriasRelatorio.map((item, index) => (
                  <div
                    className="ranking-row"
                    key={item.categoria}
                  >
                    <span>
                      {index + 1}. {item.categoria}
                    </span>
                    <strong>{formatarMoeda(item.valor)}</strong>
                  </div>
                ))
              )}
            </div>

            <div className="report-section">
              <h3>Lançamentos do período</h3>

              <div className="table-wrapper">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Tipo</th>
                      <th>Descrição</th>
                      <th>Categoria</th>
                      <th>Fornecedor</th>
                      <th>Valor</th>
                    </tr>
                  </thead>

                  <tbody>
                    {lancamentosRelatorio.length === 0 ? (
                      <tr>
                        <td colSpan="6">
                          Nenhum lançamento no período.
                        </td>
                      </tr>
                    ) : (
                      lancamentosRelatorio.map((item) => (
                        <tr key={item.id}>
                          <td>{formatarData(item.data)}</td>
                          <td
                            className={
                              item.tipo === "receita"
                                ? "tipo-receita"
                                : "tipo-despesa"
                            }
                          >
                            {item.tipo === "receita" ? "Receita" : "Despesa"}
                          </td>

<td>{item.descricao}</td>
<td>{item.categoria || "-"}</td>
<td>{item.fornecedor || ""}</td>

<td
  className={
    item.tipo === "receita"
      ? "valor-receita"
      : "valor-despesa"
  }
>
  {item.tipo === "despesa"
    ? `-${formatarMoeda(item.valor)}`
    : formatarMoeda(item.valor)}
</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </main>

      {modalAberto && (
        <div
          className="modal-overlay"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget) {
              fecharModal();
            }
          }}
        >
          <div className="modal">
            <div className="modal-header">
              <div>
                <span className="eyebrow">
                  {editandoId
                    ? "Editar lançamento"
                    : "Novo lançamento"}
                </span>

                <h2>
                  {tipoLancamento === "receita"
                    ? "Receita"
                    : "Despesa"}
                </h2>
              </div>

              <button
                type="button"
                className="close-button"
                onClick={fecharModal}
              >
                ×
              </button>
            </div>

            <form onSubmit={salvarLancamento}>
              <label>
                Descrição
                <input
                  type="text"
                  value={formulario.descricao}
                  onChange={(evento) =>
                    alterarCampo("descricao", evento.target.value)
                  }
                  placeholder="Ex.: Compra de carne"
                  required
                />
              </label>

              <div className="form-row">
                <label>
                  Valor
                  <input
                    type="text"
                    value={formulario.valor}
                    onChange={(evento) =>
                      alterarCampo("valor", evento.target.value)
                    }
                    placeholder="0,00"
                    required
                  />
                </label>

                <label>
                  Data
                  <input
                    type="date"
                    value={formulario.data}
                    onChange={(evento) =>
                      alterarCampo("data", evento.target.value)
                    }
                    required
                  />
                </label>
              </div>

              <label>
                Grupo financeiro
                <select
                  value={formulario.grupo}
                  onChange={(evento) =>
                    alterarCampo("grupo", evento.target.value)
                  }
                >
                  {gruposFinanceiros.map((grupo) => (
                    <option key={grupo} value={grupo}>
                      {grupo}
                    </option>
                  ))}
                </select>
              </label>

              <div className="form-row">
                <label>
                  Categoria
                  <select
                    value={formulario.categoria}
                    onChange={(evento) =>
                      alterarCampo("categoria", evento.target.value)
                    }
                  >
                    {categoriasCadastradas.map((categoria) => (
                      <option
                        key={categoria.id}
                        value={categoria.nome}
                      >
                        {categoria.icone} {categoria.nome}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Subcategoria
                  <input
                    type="text"
                    value={formulario.subcategoria}
                    onChange={(evento) =>
                      alterarCampo(
                        "subcategoria",
                        evento.target.value
                      )
                    }
                    placeholder="Ex.: Carne, pão, salário"
                  />
                </label>
              </div>

              <label>
                Fornecedor
                <input
                  type="text"
                  value={formulario.fornecedor}
                  onChange={(evento) =>
                    alterarCampo("fornecedor", evento.target.value)
                  }
                  placeholder="Ex.: Distribuidora ABC"
                />
              </label>

              <label>
                Observação
                <textarea
                  value={formulario.observacao}
                  onChange={(evento) =>
                    alterarCampo("observacao", evento.target.value)
                  }
                  placeholder="Informações adicionais"
                  rows="3"
                />
              </label>
              <div className="foto-upload">
                <span className="foto-upload-title">
                  Foto do comprovante
                </span>

                <input
                  id="foto-comprovante"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(evento) => {
                    const arquivo = evento.target.files?.[0];

                    if (!arquivo) return;

                    const leitor = new FileReader();

                    leitor.onload = () => {
                      alterarCampo("foto", leitor.result);
                    };

                    leitor.readAsDataURL(arquivo);
                  }}
                />

                <label
                  htmlFor="foto-comprovante"
                  className="foto-button"
                >
                  📷 Anexar comprovante
                </label>
              </div>

              {formulario.foto && (
                <div className="foto-preview">
                  <img
                    src={formulario.foto}
                    alt="Pré-visualização do comprovante"
                  />

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => alterarCampo("foto", "")}
                  >
                    Remover foto
                  </button>
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={fecharModal}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="primary-button"
                >
                  {editandoId
                    ? "Salvar alterações"
                    : "Salvar lançamento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;