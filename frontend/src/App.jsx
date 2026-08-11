import React, { useState, useEffect, useMemo, useRef } from "react";
import DashboardPremium from "./components/dashboardPremium";
import "./App.css";
import "./paginasInternas.css";
import {
  BrowserRouter,
  Routes,
  Route,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import Login from "./pages/Login";
import ProtectedRoute from "./routes/ProtectedRoute";
import { useAuth } from "./context/AuthContext";
import { supabase } from "./services/supabaseClient";
import {
  buscarLancamentos,
  buscarFotoLancamento,
  buscarFotoMercadoriaLancamento,
  criarLancamento,
  lerNotaFiscal,
  atualizarLancamento,
  excluirLancamento,
  buscarCategorias,
  criarCategoria as criarCategoriaApi,
  atualizarCategoria as atualizarCategoriaApi,
  excluirCategoria as excluirCategoriaApi,
  buscarFormasPagamento,
  buscarDinheiroInformado,
  buscarNotasFiscais,
  criarNotaFiscal,
  excluirNotaFiscal,
  buscarFotoNotaFiscal,
  criarFormaPagamento,
  atualizarFormaPagamento,
  excluirFormaPagamento,
  buscarContasPagar,
  criarContaPagar,
  atualizarContaPagar,
  marcarContaPagarComoPaga,
  excluirContaPagar,
  buscarClientes,
  criarCliente,
  atualizarCliente,
  excluirCliente,
  buscarAtendimentosCliente,
  criarAtendimentoCliente,
  excluirAtendimento,
  buscarFechamentosCaixa,
  buscarFotoFechamentoCaixa,
  criarFechamentoCaixa,
  excluirFechamentoCaixa,
  buscarLojas,
  criarLoja,
  atualizarLoja,
  excluirLoja,
  buscarUsuarios,
  criarUsuario,
  atualizarUsuario,
  excluirUsuario,
  aprovarLancamento,
  rejeitarLancamento,
  atualizarConfiguracaoAprovacao,
  buscarInsumos,
  criarInsumo,
  atualizarInsumo,
  excluirInsumo,
  registrarMovimentacaoEstoque,
} from "./services/api";

import CadastroCategorias from "./components/CadastroCategorias";
import CadastroClientes from "./components/CadastroClientes";
import ContasPagar, { diasAte } from "./components/ContasPagar";
import ContasReceber from "./components/ContasReceber";
import LogAuditoria from "./components/LogAuditoria";
import VendasSaipos from "./components/VendasSaipos";
import Conciliacao from "./components/Conciliacao";
import CadastroFechamentoCaixa from "./components/CadastroFechamentoCaixa";
import NotasFiscais from "./components/NotasFiscais";
import CadastroLojas from "./components/CadastroLojas";
import CadastroUsuarios from "./components/CadastroUsuarios";
import CadastroInsumos from "./components/CadastroInsumos";
import UserMenu from "./components/UserMenu";

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

function formatarValorDigitado(textoDigitado) {
  const somenteDigitos = textoDigitado.replace(/\D/g, "");
  const valorEmCentavos = Number(somenteDigitos || 0);

  return (valorEmCentavos / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
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

function formatarData(data) {
  if (!data) return "Sem data";
  return new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR");
}

function capturarLocalizacao() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        resolve({
          latitude: posicao.coords.latitude,
          longitude: posicao.coords.longitude,
          precisao_metros: posicao.coords.accuracy,
          capturado_em: new Date().toISOString(),
        });
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

function baixarImagem(dataUrl, nomeArquivo) {
  if (!dataUrl) return;

  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function calcularDistanciaMetros(lat1, lon1, lat2, lon2) {
  const raioTerra = 6371000;
  const paraRad = (grau) => (grau * Math.PI) / 180;

  const deltaLat = paraRad(lat2 - lat1);
  const deltaLon = paraRad(lon2 - lon1);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(paraRad(lat1)) *
      Math.cos(paraRad(lat2)) *
      Math.sin(deltaLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return raioTerra * c;
}

// Usa o fuso horário do próprio dispositivo (não força UTC) — toISOString()
// converte pra UTC, e isso já causou lançamento salvando com a data de
// amanhã pra quem está num fuso mais atrasado (ex.: Mato Grosso, UTC-4)
// perto da meia-noite local (que já é o dia seguinte em UTC).
function hojeLocal() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

// Confirmado com o print real do portal do iFood (10/08/2026): o repasse é
// por SEMANA fechada (segunda a domingo), pago sempre na quarta da semana
// SEGUINTE — não é "a próxima quarta depois da venda". Uma venda de
// segunda/terça ainda está dentro de uma semana que não fechou, então cai
// na quarta da semana seguinte à essa, não na mais próxima.
function proximaDataSemanalAposFechamento(dataBase, diaSemanaAlvo) {
  const diaSemanaVenda = dataBase.getDay();
  const diffParaSegunda = diaSemanaVenda === 0 ? -6 : 1 - diaSemanaVenda;

  const segundaDaSemana = new Date(dataBase);
  segundaDaSemana.setDate(segundaDaSemana.getDate() + diffParaSegunda);

  const deslocamentoDoAlvo =
    Number(diaSemanaAlvo) === 0 ? 6 : Number(diaSemanaAlvo) - 1;

  segundaDaSemana.setDate(segundaDaSemana.getDate() + 7 + deslocamentoDoAlvo);

  return segundaDaSemana;
}

// "Venda a Prazo Funcionário": tudo consumido dentro do mês é descontado
// no próximo dia útil do mês seguinte (só pula fim de semana).
function proximoDiaUtilDoMesSeguinte(dataBase) {
  const primeiroDiaMesSeguinte = new Date(
    dataBase.getFullYear(),
    dataBase.getMonth() + 1,
    1,
    12,
    0,
    0
  );

  while (
    primeiroDiaMesSeguinte.getDay() === 0 ||
    primeiroDiaMesSeguinte.getDay() === 6
  ) {
    primeiroDiaMesSeguinte.setDate(primeiroDiaMesSeguinte.getDate() + 1);
  }

  return primeiroDiaMesSeguinte;
}

// Mês fechado automaticamente: qualquer lançamento de um mês anterior ao
// mês atual não pode mais ser editado/excluído. Sem botão de "fechar mês" —
// assim que o mês vira, o mês anterior já fica travado sozinho.
function mesLancamentoBloqueado(item) {
  if (!item?.data) return false;

  const mesAtual = hojeLocal().slice(0, 7);

  return item.data.slice(0, 7) < mesAtual;
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
    foto_mercadoria: "",
    fotos_extra: [],
    latitude: null,
    longitude: null,
    precisao_metros: null,
    capturado_em: null,
    loja_id: "",
    forma_pagamento_id: "",
    pago_em_dinheiro: false,
    data: hojeLocal(),
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
  const { usuario, logout, perfil, ehAdministrador } = useAuth();

  const vePermissaoTotal =
    ehAdministrador || (perfil?.perfil === "gerente" && !perfil?.loja_id);

  function temPermissao(chave) {
    return ehAdministrador || (perfil?.permissoes || []).includes(chave);
  }

  // As permissões "financeiro" e "fechamento_caixa" eram grupos únicos que
  // davam acesso a várias telas de uma vez; agora cada tela tem sua própria
  // permissão específica. Quem já tinha o grupo antigo marcado continua com
  // acesso a tudo que esse grupo cobria, sem precisar remarcar nada.
  // Removida a compatibilidade com os grupos antigos "financeiro" e
  // "fechamento_caixa" (que davam acesso a várias telas de uma vez) — a
  // pedido do usuário, cada caixinha de permissão agora vale exatamente o
  // que está marcado, sem nenhuma exceção/atalho por trás.
  function temPermissaoFinanceira(chave) {
    return temPermissao(chave);
  }

  function temPermissaoFechamento(chave) {
    return temPermissao(chave);
  }

  // O Dashboard mostra numeros financeiros (Receitas, Despesas, Saldo...) —
  // so deve mostrar isso pra quem tem pelo menos uma permissao financeira.
  // Sem essa checagem, ate um usuario com TODAS as permissoes zeradas via
  // ver o resumo financeiro completo ao abrir o sistema.
  const temAcessoFinanceiroDashboard =
    ehAdministrador ||
    [
      "saldo",
      "receitas",
      "despesas",
      "categorias",
      "fluxo_caixa",
      "relatorios",
      "contas_pagar",
      "contas_receber",
      "proximos_recebimentos",
    ].some((chave) => temPermissao(chave));

  // Cada card do Dashboard tem a própria permissão — usuário pode ter
  // Despesas sem ver Saldo, por exemplo. Sem nenhum atalho por trás: só o
  // que está marcado individualmente vale.
  const acessoCardSaldo = ehAdministrador || temPermissaoFinanceira("saldo");
  const acessoCardReceitas =
    ehAdministrador || temPermissaoFinanceira("receitas");
  const acessoCardDespesas =
    ehAdministrador || temPermissaoFinanceira("despesas");
  const acessoCardFluxoCaixa =
    ehAdministrador || temPermissaoFinanceira("fluxo_caixa");
  const acessoCardProximosRecebimentos =
    ehAdministrador || temPermissaoFinanceira("proximos_recebimentos");
  const navigate = useNavigate();

  async function sair() {
    await logout();
    navigate("/login", { replace: true });
  }

  const [searchParams, setSearchParams] = useSearchParams();
  const [pagina, setPaginaEstado] = useState(
    () => searchParams.get("pagina") || "dashboard"
  );

  // Mantém a aba atual salva na URL (?pagina=despesas), assim atualizar
  // a página (F5) não volta sozinho pro dashboard.
  function setPagina(novaPagina) {
    setPaginaEstado(novaPagina);
    setSearchParams((parametrosAtuais) => {
      const proximosParametros = new URLSearchParams(parametrosAtuais);
      proximosParametros.set("pagina", novaPagina);
      return proximosParametros;
    });
  }
  const [lancamentos, setLancamentos] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const [modalAberto, setModalAberto] = useState(false);
  const [tipoLancamento, setTipoLancamento] = useState("receita");
  const [editandoId, setEditandoId] = useState(null);
  const [fotoVisualizada, setFotoVisualizada] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [processandoFoto, setProcessandoFoto] = useState(false);
  const [processandoFotoMercadoria, setProcessandoFotoMercadoria] =
    useState(false);
  const [lendoNota, setLendoNota] = useState(false);
  const [adicionandoFotoExtra, setAdicionandoFotoExtra] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(null);
  const [senhaExclusaoMesEncerrado, setSenhaExclusaoMesEncerrado] =
    useState("");
  const [carregandoFotoId, setCarregandoFotoId] = useState(null);
  const [carregandoFotoMercadoriaId, setCarregandoFotoMercadoriaId] =
    useState(null);
  const [fotoMercadoriaVisualizada, setFotoMercadoriaVisualizada] =
    useState(null);
  const editandoIdRef = useRef(null);

  const [lojas, setLojas] = useState([]);
  const [carregandoLojas, setCarregandoLojas] = useState(true);

  const [usuarios, setUsuarios] = useState([]);
  const [carregandoUsuarios, setCarregandoUsuarios] = useState(true);
  const [aprovacaoAtiva, setAprovacaoAtiva] = useState(true);
  const [processandoAprovacaoId, setProcessandoAprovacaoId] =
    useState(null);
  const [insumos, setInsumos] = useState([]);
  const [carregandoInsumos, setCarregandoInsumos] = useState(true);

  const [fechamentosCaixa, setFechamentosCaixa] = useState([]);
  const [carregandoFechamentos, setCarregandoFechamentos] = useState(true);

  const [notasFiscais, setNotasFiscais] = useState([]);
  const [carregandoNotasFiscais, setCarregandoNotasFiscais] = useState(true);

  const [clientes, setClientes] = useState([]);
  const [carregandoClientes, setCarregandoClientes] = useState(true);

  const [contasPagar, setContasPagar] = useState([]);
  const [carregandoContasPagar, setCarregandoContasPagar] = useState(true);

  const [formasPagamento, setFormasPagamento] = useState([]);
  const [carregandoFormasPagamento, setCarregandoFormasPagamento] =
    useState(true);
  // Último valor de "Dinheiro" confirmado na tela de Conciliação — usado
  // pra mostrar "em dinheiro R$X" no card de Saldo do Dashboard.
  const [dinheiroEmCaixa, setDinheiroEmCaixa] = useState(0);

  const [formulario, setFormulario] = useState(
    criarFormularioInicial("receita")
  );

  const [categoriasCadastradas, setCategoriasCadastradas] = useState([]);
  const [carregandoCategorias, setCarregandoCategorias] = useState(true);

  const hoje = hojeLocal();
  const primeiroDiaMes = `${hoje.slice(0, 7)}-01`;

  const [dataInicialRelatorio, setDataInicialRelatorio] =
    useState(primeiroDiaMes);
  const [dataFinalRelatorio, setDataFinalRelatorio] = useState(hoje);

  const [tipoRelatorio, setTipoRelatorio] = useState("financeiro");
  const [dataRelatorioCaixa, setDataRelatorioCaixa] = useState(hoje);
  const [fotoRelatorioCaixaVisualizada, setFotoRelatorioCaixaVisualizada] =
    useState(null);
  const [carregandoFotoRelatorioCaixaId, setCarregandoFotoRelatorioCaixaId] =
    useState(null);

  const [dataInicialFluxo, setDataInicialFluxo] =
    useState(primeiroDiaMes);
  const [dataFinalFluxo, setDataFinalFluxo] = useState(hoje);
  const [agrupamentoFluxo, setAgrupamentoFluxo] =
    useState("diario");

  useEffect(() => {
    async function carregarCategoriasSalvas() {
      try {
        setCarregandoCategorias(true);
        const dados = await buscarCategorias();
        setCategoriasCadastradas(Array.isArray(dados) ? dados : []);
      } catch (erro) {
        console.error("Erro ao carregar categorias:", erro);
      } finally {
        setCarregandoCategorias(false);
      }
    }

    carregarCategoriasSalvas();

    const canalCategorias = supabase
      .channel("categorias-tempo-real")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "categorias" },
        (payload) => {
          setCategoriasCadastradas((anteriores) => {
            if (payload.eventType === "INSERT") {
              if (anteriores.some((item) => item.id === payload.new.id)) {
                return anteriores;
              }
              return [...anteriores, payload.new];
            }

            if (payload.eventType === "UPDATE") {
              return anteriores.map((item) =>
                item.id === payload.new.id ? payload.new : item
              );
            }

            if (payload.eventType === "DELETE") {
              return anteriores.filter(
                (item) => item.id !== payload.old.id
              );
            }

            return anteriores;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canalCategorias);
    };
  }, []);

  useEffect(() => {
    async function carregarFormasPagamentoSalvas() {
      try {
        setCarregandoFormasPagamento(true);
        const dados = await buscarFormasPagamento();
        setFormasPagamento(Array.isArray(dados) ? dados : []);
      } catch (erro) {
        console.error("Erro ao carregar formas de pagamento:", erro);
      } finally {
        setCarregandoFormasPagamento(false);
      }
    }

    carregarFormasPagamentoSalvas();

    async function carregarDinheiroInformado() {
      try {
        const dados = await buscarDinheiroInformado();
        // Soma de todos os fechamentos confirmados (cada um já é só o
        // dinheiro NOVO daquele fechamento — Em caixa menos Abertura —
        // então a soma acumulada é o total de dinheiro que já entrou.
        setDinheiroEmCaixa(Number(dados?.soma || 0));
      } catch (erro) {
        console.error("Erro ao carregar dinheiro informado:", erro);
      }
    }

    carregarDinheiroInformado();

    const canalFormasPagamento = supabase
      .channel("formas-pagamento-tempo-real")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "formas_pagamento" },
        (payload) => {
          setFormasPagamento((anteriores) => {
            if (payload.eventType === "INSERT") {
              if (anteriores.some((item) => item.id === payload.new.id)) {
                return anteriores;
              }
              return [...anteriores, payload.new];
            }

            if (payload.eventType === "UPDATE") {
              return anteriores.map((item) =>
                item.id === payload.new.id ? payload.new : item
              );
            }

            if (payload.eventType === "DELETE") {
              return anteriores.filter(
                (item) => item.id !== payload.old.id
              );
            }

            return anteriores;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canalFormasPagamento);
    };
  }, []);

  useEffect(() => {
    async function carregarContasPagarSalvas() {
      try {
        setCarregandoContasPagar(true);
        const dados = await buscarContasPagar();
        setContasPagar(Array.isArray(dados) ? dados : []);
      } catch (erro) {
        console.error("Erro ao carregar contas a pagar:", erro);
      } finally {
        setCarregandoContasPagar(false);
      }
    }

    carregarContasPagarSalvas();

    const canalContasPagar = supabase
      .channel("contas-pagar-tempo-real")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "contas_pagar" },
        (payload) => {
          setContasPagar((anteriores) => {
            if (payload.eventType === "INSERT") {
              if (anteriores.some((item) => item.id === payload.new.id)) {
                return anteriores;
              }
              return [...anteriores, payload.new];
            }

            if (payload.eventType === "UPDATE") {
              return anteriores.map((item) =>
                item.id === payload.new.id ? payload.new : item
              );
            }

            if (payload.eventType === "DELETE") {
              return anteriores.filter(
                (item) => item.id !== payload.old.id
              );
            }

            return anteriores;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canalContasPagar);
    };
  }, []);

  useEffect(() => {
    async function carregarClientesSalvos() {
      try {
        setCarregandoClientes(true);
        const dados = await buscarClientes();
        setClientes(Array.isArray(dados) ? dados : []);
      } catch (erro) {
        console.error("Erro ao carregar clientes:", erro);
      } finally {
        setCarregandoClientes(false);
      }
    }

    carregarClientesSalvos();

    const canalClientes = supabase
      .channel("clientes-tempo-real")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "clientes" },
        (payload) => {
          setClientes((anteriores) => {
            if (payload.eventType === "INSERT") {
              if (anteriores.some((item) => item.id === payload.new.id)) {
                return anteriores;
              }
              return [...anteriores, payload.new];
            }

            if (payload.eventType === "UPDATE") {
              return anteriores.map((item) =>
                item.id === payload.new.id ? payload.new : item
              );
            }

            if (payload.eventType === "DELETE") {
              return anteriores.filter(
                (item) => item.id !== payload.old.id
              );
            }

            return anteriores;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canalClientes);
    };
  }, []);

  useEffect(() => {
    async function carregarFechamentosSalvos() {
      try {
        setCarregandoFechamentos(true);
        const dados = await buscarFechamentosCaixa();
        setFechamentosCaixa(Array.isArray(dados) ? dados : []);
      } catch (erro) {
        console.error("Erro ao carregar fechamentos de caixa:", erro);
      } finally {
        setCarregandoFechamentos(false);
      }
    }

    carregarFechamentosSalvos();

    const canalFechamentos = supabase
      .channel("fechamentos-caixa-tempo-real")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fechamentos_caixa" },
        (payload) => {
          setFechamentosCaixa((anteriores) => {
            if (payload.eventType === "INSERT") {
              const { foto, ...resto } = payload.new;

              if (anteriores.some((item) => item.id === resto.id)) {
                return anteriores;
              }

              return [resto, ...anteriores];
            }

            if (payload.eventType === "DELETE") {
              return anteriores.filter(
                (item) => item.id !== payload.old.id
              );
            }

            return anteriores;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canalFechamentos);
    };
  }, []);

  useEffect(() => {
    async function carregarNotasFiscaisSalvas() {
      try {
        setCarregandoNotasFiscais(true);
        const dados = await buscarNotasFiscais();
        setNotasFiscais(Array.isArray(dados) ? dados : []);
      } catch (erro) {
        console.error("Erro ao carregar notas fiscais:", erro);
      } finally {
        setCarregandoNotasFiscais(false);
      }
    }

    carregarNotasFiscaisSalvas();
  }, []);

  async function adicionarNotaFiscal(dados) {
    const salva = await criarNotaFiscal(dados);
    setNotasFiscais((anteriores) => [salva, ...anteriores]);
  }

  async function removerNotaFiscal(id) {
    await excluirNotaFiscal(id);
    setNotasFiscais((anteriores) => anteriores.filter((item) => item.id !== id));
  }

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

  useEffect(() => {
    const canal = supabase
      .channel("lancamentos-tempo-real")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lancamentos" },
        (payload) => {
          setLancamentos((anteriores) => {
            if (payload.eventType === "INSERT") {
              const { foto, ...resto } = payload.new;

              if (anteriores.some((item) => item.id === resto.id)) {
                return anteriores;
              }

              return [resto, ...anteriores];
            }

            if (payload.eventType === "UPDATE") {
              const { foto, ...resto } = payload.new;

              return anteriores.map((item) =>
                item.id === resto.id ? { ...item, ...resto } : item
              );
            }

            if (payload.eventType === "DELETE") {
              return anteriores.filter(
                (item) => item.id !== payload.old.id
              );
            }

            return anteriores;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, []);

  useEffect(() => {
    async function carregarLojas() {
      try {
        setCarregandoLojas(true);
        const dados = await buscarLojas();
        setLojas(Array.isArray(dados) ? dados : []);
      } catch (erro) {
        console.error("Erro ao carregar lojas:", erro);
      } finally {
        setCarregandoLojas(false);
      }
    }

    carregarLojas();

    const canalLojas = supabase
      .channel("lojas-tempo-real")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lojas" },
        (payload) => {
          setLojas((anteriores) => {
            if (payload.eventType === "INSERT") {
              if (anteriores.some((item) => item.id === payload.new.id)) {
                return anteriores;
              }
              return [...anteriores, payload.new];
            }

            if (payload.eventType === "UPDATE") {
              return anteriores.map((item) =>
                item.id === payload.new.id ? payload.new : item
              );
            }

            if (payload.eventType === "DELETE") {
              return anteriores.filter(
                (item) => item.id !== payload.old.id
              );
            }

            return anteriores;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canalLojas);
    };
  }, []);

  useEffect(() => {
    if (!ehAdministrador) {
      setUsuarios([]);
      setCarregandoUsuarios(false);
      return;
    }

    async function carregarUsuarios() {
      try {
        setCarregandoUsuarios(true);
        const dados = await buscarUsuarios();
        setUsuarios(Array.isArray(dados) ? dados : []);
      } catch (erro) {
        console.error("Erro ao carregar usuários:", erro);
      } finally {
        setCarregandoUsuarios(false);
      }
    }

    carregarUsuarios();
  }, [ehAdministrador]);

  useEffect(() => {
    async function carregarConfiguracoes() {
      const { data } = await supabase
        .from("configuracoes")
        .select("aprovacao_despesas_ativa")
        .eq("id", 1)
        .single();

      if (data) {
        setAprovacaoAtiva(data.aprovacao_despesas_ativa !== false);
      }
    }

    carregarConfiguracoes();

    const canalConfig = supabase
      .channel("configuracoes-tempo-real")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "configuracoes" },
        (payload) => {
          if (payload.new) {
            setAprovacaoAtiva(
              payload.new.aprovacao_despesas_ativa !== false
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canalConfig);
    };
  }, []);

  useEffect(() => {
    async function carregarInsumos() {
      try {
        setCarregandoInsumos(true);
        const dados = await buscarInsumos();
        setInsumos(Array.isArray(dados) ? dados : []);
      } catch (erro) {
        console.error("Erro ao carregar insumos:", erro);
      } finally {
        setCarregandoInsumos(false);
      }
    }

    carregarInsumos();

    const canalInsumos = supabase
      .channel("insumos-tempo-real")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "insumos" },
        (payload) => {
          setInsumos((anteriores) => {
            if (payload.eventType === "INSERT") {
              if (anteriores.some((item) => item.id === payload.new.id)) {
                return anteriores;
              }
              return [...anteriores, payload.new];
            }

            if (payload.eventType === "UPDATE") {
              return anteriores.map((item) =>
                item.id === payload.new.id ? payload.new : item
              );
            }

            if (payload.eventType === "DELETE") {
              return anteriores.filter(
                (item) => item.id !== payload.old.id
              );
            }

            return anteriores;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canalInsumos);
    };
  }, []);

const [mesDashboard, setMesDashboard] = useState(
  hojeLocal().slice(0, 7)
);
const [lojaDashboard, setLojaDashboard] = useState(() => {
  try {
    return localStorage.getItem("financepro_loja_selecionada") || "todas";
  } catch {
    return "todas";
  }
});

// Guarda a loja escolhida pra continuar a mesma depois de recarregar a
// página (sem isso, sempre voltava pra "Todas as lojas" a cada atualização).
useEffect(() => {
  try {
    localStorage.setItem("financepro_loja_selecionada", lojaDashboard);
  } catch {
    // localStorage indisponível (aba anônima, etc.) — segue sem salvar.
  }
}, [lojaDashboard]);

useEffect(() => {
  if (!vePermissaoTotal && perfil?.loja_id) {
    setLojaDashboard(perfil.loja_id);
  }
}, [vePermissaoTotal, perfil]);

const lancamentosVisiveis = useMemo(() => {
  if (!vePermissaoTotal && perfil) {
    return lancamentos.filter(
      (item) => String(item.loja_id || "") === String(perfil.loja_id || "")
    );
  }

  if (vePermissaoTotal && lojaDashboard !== "todas") {
    return lancamentos.filter(
      (item) => String(item.loja_id || "") === String(lojaDashboard)
    );
  }

  return lancamentos;
}, [lancamentos, vePermissaoTotal, perfil, lojaDashboard]);

const lancamentosAprovados = useMemo(() => {
  return lancamentosVisiveis.filter(
    (item) => (item.status || "aprovado") === "aprovado"
  );
}, [lancamentosVisiveis]);

const lancamentosDashboard = useMemo(() => {
  return lancamentosAprovados.filter((item) => {
    if (!item.data) return false;

    const noMes = item.data.slice(0, 7) === mesDashboard;

    const naLoja =
      lojaDashboard === "todas" ||
      String(item.loja_id || "") === String(lojaDashboard);

    return noMes && naLoja;
  });
}, [lancamentosAprovados, mesDashboard, lojaDashboard]);
  const totais = useMemo(() => {
   const receitas = lancamentosDashboard
      .filter((item) => item.tipo === "receita")
      .reduce((total, item) => total + Number(item.valor || 0), 0);

    // Saldo = só o dinheiro que já caiu de verdade. Uma receita com forma
    // de pagamento a prazo (data_prevista_recebimento ainda no futuro e
    // não conciliada) não entra aqui — ela já aparece separada no card
    // "A Receber". Sem isso, o mesmo dinheiro contava duas vezes (uma no
    // Saldo, outra no A Receber). Pra quem já "venceu" o prazo, conta o
    // valor líquido esperado (depois da taxa), não o valor bruto da venda.
    const hoje = hojeLocal();

    // Duas versões do que já caiu: bruta (valor cheio da venda) e líquida
    // (depois da taxa da forma de pagamento) — a diferença entre as duas é
    // o total de taxas, que o card de Saldo mostra separado.
    const receitasRecebidasBruto = lancamentosDashboard
      .filter((item) => item.tipo === "receita")
      .reduce((total, item) => {
        const aindaPendente =
          item.data_prevista_recebimento &&
          item.data_prevista_recebimento > hoje &&
          item.status_conciliacao !== "conciliado";

        if (aindaPendente) {
          return total;
        }

        return total + Number(item.valor || 0);
      }, 0);

    const receitasRecebidas = lancamentosDashboard
      .filter((item) => item.tipo === "receita")
      .reduce((total, item) => {
        const aindaPendente =
          item.data_prevista_recebimento &&
          item.data_prevista_recebimento > hoje &&
          item.status_conciliacao !== "conciliado";

        if (aindaPendente) {
          return total;
        }

        return (
          total + Number(item.valor_liquido_esperado ?? item.valor ?? 0)
        );
      }, 0);

    const despesas = lancamentosDashboard
      .filter((item) => item.tipo === "despesa")
      .reduce((total, item) => total + Number(item.valor || 0), 0);

    // "Em dinheiro" (card Saldo) = soma dos fechamentos confirmados MENOS
    // as despesas pagas em dinheiro — senão o dinheiro que já saiu do
    // caixa pra pagar uma despesa ainda apareceria como se estivesse lá.
    const despesasEmDinheiro = lancamentosDashboard
      .filter((item) => item.tipo === "despesa" && item.pago_em_dinheiro)
      .reduce((total, item) => total + Number(item.valor || 0), 0);

    const cmvValor = lancamentosDashboard
      .filter(
        (item) =>
          item.tipo === "despesa" &&
          item.grupo === "CMV - Insumos"
      )
      .reduce((total, item) => total + Number(item.valor || 0), 0);

    // Líquido do que ainda está pendente (Próximos Recebimentos) — usado
    // pra tirar do Saldo, já que Fluxo de Caixa conta tudo (accrual) mas
    // Saldo só deve contar o que já caiu de verdade.
    const receitasPendentesLiquido = lancamentosDashboard
      .filter((item) => item.tipo === "receita")
      .reduce((total, item) => {
        const aindaPendente =
          item.data_prevista_recebimento &&
          item.data_prevista_recebimento > hoje &&
          item.status_conciliacao !== "conciliado";

        if (!aindaPendente) {
          return total;
        }

        return (
          total + Number(item.valor_liquido_esperado ?? item.valor ?? 0)
        );
      }, 0);

    // Fluxo de Caixa (card do Dashboard) = todas as receitas do período
    // (accrual, igual o card "Receitas") menos despesas. Saldo = isso
    // menos o que ainda está pendente (a receber) — pra confirmar com o
    // usuário: Fluxo de Caixa é mais "otimista" (conta tudo que entrou),
    // Saldo é mais conservador (só o que já é dinheiro de verdade agora).
    const fluxoCaixa = receitas - despesas;
    const saldo = fluxoCaixa - receitasPendentesLiquido;
    const saldoBruto = receitasRecebidasBruto - despesas;
    const totalTaxas = receitasRecebidasBruto - receitasRecebidas;
    // Percentual médio de taxa sobre o que já caiu (mistura cartão, iFood,
    // Brendi, etc. — cada um com sua própria taxa cadastrada) — usado só
    // pra mostrar "Taxa X%" ao lado do valor no card de Saldo.
    const percentualTaxas =
      receitasRecebidasBruto > 0
        ? (totalTaxas / receitasRecebidasBruto) * 100
        : 0;
    const cmvPercentual =
      receitas > 0 ? (cmvValor / receitas) * 100 : 0;
    const margemPercentual =
      receitas > 0 ? (saldo / receitas) * 100 : 0;

    return {
      receitas,
      saldoBruto,
      totalTaxas,
      percentualTaxas,
      despesas,
      fluxoCaixa,
      saldo,
      cmvValor,
      cmvPercentual,
      margemPercentual,
      dinheiroEmCaixa: dinheiroEmCaixa - despesasEmDinheiro,
    };
  }, [lancamentosDashboard, dinheiroEmCaixa]);

  const despesasPorCategoria = useMemo(() => {
  const agrupadas = lancamentosAprovados
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
}, [lancamentosAprovados]);

  const despesasPorCategoriaDashboard = useMemo(() => {
    const agrupadas = lancamentosDashboard
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
  }, [lancamentosDashboard]);

const lancamentosFiltrados = useMemo(() => {
  if (pagina === "receitas") {
    return lancamentosVisiveis.filter((item) => item.tipo === "receita");
  }

  if (pagina === "despesas") {
    return lancamentosVisiveis.filter((item) => item.tipo === "despesa");
  }

  return lancamentosVisiveis;
}, [lancamentosVisiveis, pagina]);

const contasPagarFiltradas = useMemo(() => {
  if (!vePermissaoTotal && perfil) {
    return contasPagar.filter(
      (conta) =>
        !conta.loja_id ||
        String(conta.loja_id) === String(perfil.loja_id || "")
    );
  }

  if (vePermissaoTotal && lojaDashboard !== "todas") {
    return contasPagar.filter(
      (conta) =>
        !conta.loja_id || String(conta.loja_id) === String(lojaDashboard)
    );
  }

  return contasPagar;
}, [contasPagar, vePermissaoTotal, perfil, lojaDashboard]);

const lancamentosRelatorio = useMemo(() => {
  return lancamentosAprovados.filter((item) => {
    if (!item.data) return false;

    return (
      item.data >= dataInicialRelatorio &&
      item.data <= dataFinalRelatorio
       );
  });
}, [lancamentosAprovados, dataInicialRelatorio, dataFinalRelatorio]);
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
    return lancamentosAprovados
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
  }, [lancamentosAprovados, dataInicialFluxo, dataFinalFluxo]);

  const totaisFluxo = useMemo(() => {
    const entradas = lancamentosFluxo
      .filter((item) => item.tipo === "receita")
      .reduce(
        (total, item) => total + Number(item.valor || 0),
        0
      );

    // Mesma regra do Dashboard: só conta como "caiu de verdade" quem já
    // não está mais pendente (prazo vencido ou conciliado), e usa o valor
    // líquido (depois da taxa da forma de pagamento) pra quem já caiu.
    const hoje = hojeLocal();

    const entradasRecebidasBruto = lancamentosFluxo
      .filter((item) => item.tipo === "receita")
      .reduce((total, item) => {
        const aindaPendente =
          item.data_prevista_recebimento &&
          item.data_prevista_recebimento > hoje &&
          item.status_conciliacao !== "conciliado";

        if (aindaPendente) return total;

        return total + Number(item.valor || 0);
      }, 0);

    const entradasRecebidasLiquido = lancamentosFluxo
      .filter((item) => item.tipo === "receita")
      .reduce((total, item) => {
        const aindaPendente =
          item.data_prevista_recebimento &&
          item.data_prevista_recebimento > hoje &&
          item.status_conciliacao !== "conciliado";

        if (aindaPendente) return total;

        return (
          total + Number(item.valor_liquido_esperado ?? item.valor ?? 0)
        );
      }, 0);

    const saidas = lancamentosFluxo
      .filter((item) => item.tipo === "despesa")
      .reduce(
        (total, item) => total + Number(item.valor || 0),
        0
      );

    const totalTaxasFluxo = entradasRecebidasBruto - entradasRecebidasLiquido;

    return {
      entradas,
      saidas,
      saldo: entradasRecebidasLiquido - saidas,
      saldoBruto: entradasRecebidasBruto - saidas,
      totalTaxas: totalTaxasFluxo,
      percentualTaxas:
        entradasRecebidasBruto > 0
          ? (totalTaxasFluxo / entradasRecebidasBruto) * 100
          : 0,
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
    editandoIdRef.current = null;

    const formularioInicial = criarFormularioInicial(tipo);

    if (!vePermissaoTotal && perfil?.loja_id) {
      formularioInicial.loja_id = perfil.loja_id;
    } else if (vePermissaoTotal && lojaDashboard !== "todas") {
      formularioInicial.loja_id = lojaDashboard;
    }

    setFormulario(formularioInicial);
    setModalAberto(true);
  }

  async function abrirEdicao(lancamento) {
    setTipoLancamento(lancamento.tipo);
    setEditandoId(lancamento.id);
    editandoIdRef.current = lancamento.id;

    setFormulario({
      descricao: lancamento.descricao || "",
      valor: Number(lancamento.valor || 0).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
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
      foto: "",
      foto_mercadoria: "",
      fotos_extra: [],
      latitude: lancamento.latitude ?? null,
      longitude: lancamento.longitude ?? null,
      precisao_metros: lancamento.precisao_metros ?? null,
      capturado_em: lancamento.capturado_em || null,
      loja_id: lancamento.loja_id || "",
      pago_em_dinheiro: Boolean(lancamento.pago_em_dinheiro),
      data: lancamento.data || hojeLocal(),
    });

    setModalAberto(true);

    // Busca sempre (não só quando tem_foto) porque um lançamento pode ter
    // fotos extras anexadas mesmo sem ter a foto principal da nota.
    try {
      const resultado = await buscarFotoLancamento(lancamento.id);

      setFormulario((anterior) => {
        if (editandoIdRef.current !== lancamento.id) {
          return anterior;
        }

        return {
          ...anterior,
          foto: resultado?.foto || "",
          fotos_extra: Array.isArray(resultado?.fotos_extra)
            ? resultado.fotos_extra
            : [],
        };
      });
    } catch (erro) {
      console.error("Erro ao buscar foto do lançamento:", erro);
    }

    if (lancamento.tem_foto_mercadoria) {
      try {
        const resultado = await buscarFotoMercadoriaLancamento(
          lancamento.id
        );

        setFormulario((anterior) => {
          if (editandoIdRef.current !== lancamento.id) {
            return anterior;
          }

          return {
            ...anterior,
            foto_mercadoria: resultado?.foto_mercadoria || "",
          };
        });
      } catch (erro) {
        console.error("Erro ao buscar foto da mercadoria:", erro);
      }
    }
  }

  function fecharModal() {
    setModalAberto(false);
    setEditandoId(null);
    editandoIdRef.current = null;
  }

  // Tecla Esc fecha o modal aberto (foto ou formulário de lançamento), sem
  // precisar clicar no ×. Fecha só o de "cima" (foto tem prioridade, porque
  // pode estar aberta em cima do formulário de lançamento).
  useEffect(() => {
    function aoTeclarEsc(evento) {
      if (evento.key !== "Escape") return;

      if (fotoVisualizada) {
        setFotoVisualizada(null);
      } else if (fotoMercadoriaVisualizada) {
        setFotoMercadoriaVisualizada(null);
      } else if (fotoRelatorioCaixaVisualizada) {
        setFotoRelatorioCaixaVisualizada(null);
      } else if (modalAberto) {
        fecharModal();
      }
    }

    window.addEventListener("keydown", aoTeclarEsc);
    return () => window.removeEventListener("keydown", aoTeclarEsc);
  }, [
    fotoVisualizada,
    fotoMercadoriaVisualizada,
    fotoRelatorioCaixaVisualizada,
    modalAberto,
  ]);

  function alterarCampo(campo, valor) {
    setFormulario((anterior) => ({
      ...anterior,
      [campo]: valor,
    }));
  }

  async function lerNotaAutomaticamente(fotoParaLer) {
    const foto = fotoParaLer || formulario.foto;

    if (!foto || lendoNota) return;

    setLendoNota(true);

    try {
      const resultado = await lerNotaFiscal(foto);

      if (resultado.valor == null) {
        alert(
          resultado.erro_leitura ||
            "Não consegui identificar o valor dessa nota. Preencha manualmente."
        );
        return;
      }

      setFormulario((anterior) => ({
        ...anterior,
        valor: Number(resultado.valor).toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        fornecedor: resultado.fornecedor || anterior.fornecedor,
        // A data do campo é a data de lançamento (hoje) — não a data da nota
        // fiscal lida pela foto. A leitura automática só preenche valor e
        // fornecedor, nunca troca a data escolhida/padrão do formulário.
      }));
    } catch (erro) {
      alert(erro.message || "Não foi possível ler a nota fiscal.");
    } finally {
      setLendoNota(false);
    }
  }

  async function salvarLancamento(evento) {
    evento.preventDefault();

    if (salvando) return;

    const valorNumerico = Number(
      String(formulario.valor)
        .replace(/\./g, "")
        .replace(",", ".")
    );


    if (!valorNumerico || valorNumerico <= 0) {
      alert("Informe um valor válido.");
      return;
    }

    if (!formulario.loja_id) {
      alert(
        "Selecione uma loja no seletor do topo da tela antes de salvar."
      );
      return;
    }

    const formaPagamentoSelecionada = formasPagamento.find(
      (item) => String(item.id) === String(formulario.forma_pagamento_id)
    );

    let valorLiquidoEsperado = null;
    let dataPrevistaRecebimento = null;

    if (tipoLancamento === "receita" && formaPagamentoSelecionada) {
      const taxa = Number(formaPagamentoSelecionada.taxa_percentual || 0);
      const prazo = Number(formaPagamentoSelecionada.prazo_dias || 0);
      const diaSemanaAlvo = formaPagamentoSelecionada.dia_semana_pagamento;

      valorLiquidoEsperado = valorNumerico - (valorNumerico * taxa) / 100;

      const dataBase = new Date(`${formulario.data}T12:00:00`);

      if (diaSemanaAlvo != null) {
        // Paga sempre na semana seguinte, num dia fixo (ex.: iFood: semana
        // fecha segunda a domingo, paga na quarta da semana seguinte) —
        // ver proximaDataSemanalAposFechamento().
        const dataCalculada = proximaDataSemanalAposFechamento(
          dataBase,
          diaSemanaAlvo
        );
        dataBase.setTime(dataCalculada.getTime());
      } else {
        dataBase.setDate(dataBase.getDate() + prazo);
      }

      dataPrevistaRecebimento = dataBase.toISOString().slice(0, 10);
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
      foto_mercadoria: formulario.foto_mercadoria || "",
      fotos_extra: formulario.fotos_extra || [],
      latitude: formulario.latitude,
      longitude: formulario.longitude,
      precisao_metros: formulario.precisao_metros,
      capturado_em: formulario.capturado_em,
      loja_id: formulario.loja_id ? Number(formulario.loja_id) : null,
      forma_pagamento_id: formulario.forma_pagamento_id || null,
      pago_em_dinheiro:
        tipoLancamento === "despesa" ? Boolean(formulario.pago_em_dinheiro) : false,
      valor_bruto:
        tipoLancamento === "receita" && formaPagamentoSelecionada
          ? valorNumerico
          : null,
      valor_liquido_esperado: valorLiquidoEsperado,
      data_prevista_recebimento: dataPrevistaRecebimento,
      data: formulario.data,
    };

    let senhaMesEncerrado;

    if (editandoId) {
      const itemOriginal = lancamentos.find(
        (item) => item.id === editandoId
      );

      if (mesLancamentoBloqueado(itemOriginal)) {
        senhaMesEncerrado = window.prompt(
          "Esse lançamento é de um mês já encerrado. Digite sua senha de login pra confirmar a edição:"
        );

        if (!senhaMesEncerrado) {
          return;
        }
      }
    }

    setSalvando(true);

    try {
      const salvo = editandoId
        ? await atualizarLancamento(editandoId, dados, senhaMesEncerrado)
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
        erro.message ||
          "Não foi possível salvar. Confirme se o backend está funcionando."
      );
    } finally {
      setSalvando(false);
    }
  }

  function pedirConfirmacaoExclusao(id) {
    setConfirmandoExclusao(id);
    setSenhaExclusaoMesEncerrado("");
  }

  function cancelarExclusao() {
    setConfirmandoExclusao(null);
    setSenhaExclusaoMesEncerrado("");
  }

  async function confirmarExclusao() {
    const id = confirmandoExclusao;

    if (!id) return;

    try {
      await excluirLancamento(id, senhaExclusaoMesEncerrado || undefined);

      setLancamentos((anteriores) =>
        anteriores.filter((item) => item.id !== id)
      );
    } catch (erro) {
      console.error("Erro ao excluir lançamento:", erro);
      alert(
        erro.message || "Não foi possível excluir o lançamento."
      );
    } finally {
      setConfirmandoExclusao(null);
      setSenhaExclusaoMesEncerrado("");
    }
  }

  async function aprovarLancamentoHandler(id) {
    setProcessandoAprovacaoId(id);

    try {
      const atualizado = await aprovarLancamento(id);

      setLancamentos((anteriores) =>
        anteriores.map((item) => (item.id === id ? atualizado : item))
      );
    } catch (erro) {
      console.error("Erro ao aprovar lançamento:", erro);
      alert(erro.message || "Não foi possível aprovar o lançamento.");
    } finally {
      setProcessandoAprovacaoId(null);
    }
  }

  async function rejeitarLancamentoHandler(id) {
    setProcessandoAprovacaoId(id);

    try {
      const atualizado = await rejeitarLancamento(id);

      setLancamentos((anteriores) =>
        anteriores.map((item) => (item.id === id ? atualizado : item))
      );
    } catch (erro) {
      console.error("Erro ao rejeitar lançamento:", erro);
      alert(erro.message || "Não foi possível rejeitar o lançamento.");
    } finally {
      setProcessandoAprovacaoId(null);
    }
  }

  async function alternarAprovacaoAtiva() {
    const novoValor = !aprovacaoAtiva;
    setAprovacaoAtiva(novoValor);

    try {
      await atualizarConfiguracaoAprovacao(novoValor);
    } catch (erro) {
      console.error("Erro ao atualizar configuração:", erro);
      alert(
        erro.message || "Não foi possível atualizar a configuração."
      );
      setAprovacaoAtiva(!novoValor);
    }
  }

  async function adicionarCategoria(novaCategoria) {
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

    try {
      const salva = await criarCategoriaApi({
        ...novaCategoria,
        nome: nomeNormalizado,
      });

      setCategoriasCadastradas((anteriores) => {
        if (anteriores.some((item) => item.id === salva.id)) {
          return anteriores;
        }
        return [...anteriores, salva];
      });
    } catch (erro) {
      alert(erro.message || "Não foi possível criar a categoria.");
    }
  }

  async function editarCategoria(id, dadosAtualizados) {
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

    try {
      const salva = await atualizarCategoriaApi(id, {
        ...dadosAtualizados,
        nome: nomeNormalizado,
      });

      setCategoriasCadastradas((anteriores) =>
        anteriores.map((categoria) =>
          categoria.id === id ? salva : categoria
        )
      );
    } catch (erro) {
      alert(erro.message || "Não foi possível atualizar a categoria.");
    }
  }

  async function excluirCategoria(id) {
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

    try {
      await excluirCategoriaApi(id);

      setCategoriasCadastradas((anteriores) =>
        anteriores.filter((item) => item.id !== id)
      );
    } catch (erro) {
      alert(erro.message || "Não foi possível excluir a categoria.");
    }
  }

  async function adicionarLoja(dadosLoja) {
    const salva = await criarLoja(dadosLoja);

    setLojas((anteriores) => {
      if (anteriores.some((item) => item.id === salva.id)) {
        return anteriores;
      }
      return [...anteriores, salva];
    });
  }

  async function editarLoja(id, dadosLoja) {
    const salva = await atualizarLoja(id, dadosLoja);

    setLojas((anteriores) =>
      anteriores.map((item) => (item.id === id ? salva : item))
    );
  }

  async function removerLoja(id) {
    const lojaEmUso = lancamentos.some((item) => item.loja_id === id);

    if (lojaEmUso) {
      throw new Error(
        "Essa loja está vinculada a lançamentos e não pode ser excluída."
      );
    }

    await excluirLoja(id);

    setLojas((anteriores) => anteriores.filter((item) => item.id !== id));
  }

  async function adicionarUsuario(dadosUsuario) {
    const salvo = await criarUsuario(dadosUsuario);
    setUsuarios((anteriores) => [...anteriores, salvo]);
  }

  async function editarUsuario(id, dadosUsuario) {
    const salvo = await atualizarUsuario(id, dadosUsuario);

    setUsuarios((anteriores) =>
      anteriores.map((item) =>
        item.user_id === id ? { ...item, ...salvo } : item
      )
    );
  }

  async function removerUsuario(id) {
    await excluirUsuario(id);

    setUsuarios((anteriores) =>
      anteriores.filter((item) => item.user_id !== id)
    );
  }

  async function adicionarInsumo(dadosInsumo) {
    const salvo = await criarInsumo(dadosInsumo);

    setInsumos((anteriores) => {
      if (anteriores.some((item) => item.id === salvo.id)) {
        return anteriores;
      }
      return [...anteriores, salvo];
    });
  }

  async function editarInsumoHandler(id, dadosInsumo) {
    const salvo = await atualizarInsumo(id, dadosInsumo);

    setInsumos((anteriores) =>
      anteriores.map((item) => (item.id === id ? salvo : item))
    );
  }

  async function removerInsumo(id) {
    await excluirInsumo(id);

    setInsumos((anteriores) =>
      anteriores.filter((item) => item.id !== id)
    );
  }

  async function registrarMovimentacaoHandler(id, dadosMovimentacao) {
    const salvo = await registrarMovimentacaoEstoque(
      id,
      dadosMovimentacao
    );

    setInsumos((anteriores) =>
      anteriores.map((item) => (item.id === id ? salvo : item))
    );
  }

  async function adicionarFormaPagamento(dados) {
    const salva = await criarFormaPagamento(dados);
    setFormasPagamento((anteriores) => [...anteriores, salva]);
  }

  async function editarFormaPagamento(id, dados) {
    const salva = await atualizarFormaPagamento(id, dados);
    setFormasPagamento((anteriores) =>
      anteriores.map((item) => (item.id === id ? salva : item))
    );
  }

  async function removerFormaPagamento(id) {
    await excluirFormaPagamento(id);
    setFormasPagamento((anteriores) =>
      anteriores.filter((item) => item.id !== id)
    );
  }

  async function adicionarContaPagar(dados) {
    const salva = await criarContaPagar(dados);
    setContasPagar((anteriores) => [...anteriores, salva]);
  }

  async function editarContaPagar(id, dados) {
    const salva = await atualizarContaPagar(id, dados);
    setContasPagar((anteriores) =>
      anteriores.map((item) => (item.id === id ? salva : item))
    );
  }

  async function pagarContaPagar(id) {
    const salva = await marcarContaPagarComoPaga(id);
    setContasPagar((anteriores) =>
      anteriores.map((item) => (item.id === id ? salva : item))
    );
  }

  async function removerContaPagar(id) {
    await excluirContaPagar(id);
    setContasPagar((anteriores) =>
      anteriores.filter((item) => item.id !== id)
    );
  }

  async function adicionarCliente(dados) {
    const salvo = await criarCliente(dados);
    setClientes((anteriores) => [...anteriores, salvo]);
  }

  async function editarCliente(id, dados) {
    const salvo = await atualizarCliente(id, dados);
    setClientes((anteriores) =>
      anteriores.map((item) => (item.id === id ? salvo : item))
    );
  }

  async function removerCliente(id) {
    await excluirCliente(id);
    setClientes((anteriores) => anteriores.filter((item) => item.id !== id));
  }

  async function adicionarAtendimentoCliente(clienteId, dados) {
    return criarAtendimentoCliente(clienteId, dados);
  }

  async function removerAtendimentoCliente(id) {
    await excluirAtendimento(id);
  }

  async function adicionarFechamentoCaixa(dados) {
    const salvo = await criarFechamentoCaixa(dados);

    setFechamentosCaixa((anteriores) => [salvo, ...anteriores]);
  }

  async function removerFechamentoCaixa(id) {
    await excluirFechamentoCaixa(id);

    setFechamentosCaixa((anteriores) =>
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

  async function exportarRelatorioPDF() {
    // Carrega as bibliotecas de PDF só na hora de usar (em vez de no
    // carregamento inicial do sistema) — deixa o resto do sistema mais
    // rápido pra quem nunca exporta PDF.
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);

    const nomeLoja =
      lojaDashboard === "todas"
        ? "Todas as lojas"
        : lojas.find((loja) => String(loja.id) === String(lojaDashboard))
            ?.nome || "-";

    const documento = new jsPDF();

    documento.setFontSize(16);
    documento.text("Relatório financeiro", 14, 18);

    documento.setFontSize(10);
    documento.setTextColor(90, 90, 90);
    documento.text(
      `Período: ${formatarData(dataInicialRelatorio)} a ${formatarData(
        dataFinalRelatorio
      )}`,
      14,
      26
    );
    documento.text(`Loja: ${nomeLoja}`, 14, 32);
    documento.text(
      `Emitido em ${new Date().toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      })}`,
      14,
      38
    );

    documento.setTextColor(20, 20, 20);
    documento.setFontSize(11);
    documento.text(
      `Receitas: ${formatarMoeda(totaisRelatorio.receitas)}    Despesas: ${formatarMoeda(
        totaisRelatorio.despesas
      )}    Saldo: ${formatarMoeda(totaisRelatorio.saldo)}`,
      14,
      47
    );

    autoTable(documento, {
      startY: 53,
      head: [
        [
          "Data",
          "Tipo",
          "Descrição",
          "Categoria",
          "Fornecedor",
          "Valor",
        ],
      ],
      body: lancamentosRelatorio.map((item) => [
        formatarData(item.data),
        item.tipo === "receita" ? "Receita" : "Despesa",
        item.descricao || "",
        item.categoria || "-",
        item.fornecedor || "-",
        formatarMoeda(item.valor),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [20, 118, 255] },
    });

    documento.save(
      `relatorio-${dataInicialRelatorio}-a-${dataFinalRelatorio}.pdf`
    );
  }

  function imprimirPagina() {
    window.print();
  }

  function exportarFluxoCSV() {
    const cabecalho = [
      "Data",
      "Descrição",
      "Categoria",
      "Tipo",
      "Entrada",
      "Saída",
    ];

    const linhas = lancamentosFluxo.map((item) => [
      item.data || "",
      item.descricao || "",
      item.categoria || "",
      item.tipo === "receita" ? "Receita" : "Despesa",
      item.tipo === "receita"
        ? Number(item.valor || 0).toFixed(2).replace(".", ",")
        : "",
      item.tipo === "despesa"
        ? Number(item.valor || 0).toFixed(2).replace(".", ",")
        : "",
    ]);

    const linhaTotais = [
      "",
      "",
      "",
      "TOTAIS DO PERÍODO",
      Number(totaisFluxo.entradas || 0).toFixed(2).replace(".", ","),
      Number(totaisFluxo.saidas || 0).toFixed(2).replace(".", ","),
    ];

    const escapar = (valor) =>
      `"${String(valor).replace(/"/g, '""')}"`;

    const csv = [
      cabecalho.map(escapar).join(";"),
      ...linhas.map((linha) => linha.map(escapar).join(";")),
      linhaTotais.map(escapar).join(";"),
    ].join("\n");

    const arquivo = new Blob(["﻿" + csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(arquivo);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fluxo-caixa-${dataInicialFluxo}-a-${dataFinalFluxo}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function exportarFluxoPDF() {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);

    const nomeLoja =
      lojaDashboard === "todas"
        ? "Todas as lojas"
        : lojas.find((loja) => String(loja.id) === String(lojaDashboard))
            ?.nome || "-";

    const documento = new jsPDF();

    documento.setFontSize(16);
    documento.text("Fluxo de Caixa", 14, 18);

    documento.setFontSize(10);
    documento.setTextColor(90, 90, 90);
    documento.text(
      `Período: ${formatarData(dataInicialFluxo)} a ${formatarData(
        dataFinalFluxo
      )}`,
      14,
      26
    );
    documento.text(`Loja: ${nomeLoja}`, 14, 32);
    documento.text(
      `Emitido em ${new Date().toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      })}`,
      14,
      38
    );

    documento.setTextColor(20, 20, 20);
    documento.setFontSize(11);
    documento.text(
      `Entradas: ${formatarMoeda(totaisFluxo.entradas)}    Saídas: ${formatarMoeda(
        totaisFluxo.saidas
      )}    Saldo: ${formatarMoeda(totaisFluxo.saldo)}`,
      14,
      47
    );

    autoTable(documento, {
      startY: 53,
      head: [["Data", "Descrição", "Categoria", "Tipo", "Entrada", "Saída"]],
      body: lancamentosFluxo.map((item) => [
        formatarData(item.data),
        item.descricao || "",
        item.categoria || "-",
        item.tipo === "receita" ? "Receita" : "Despesa",
        item.tipo === "receita" ? formatarMoeda(item.valor) : "-",
        item.tipo === "despesa" ? formatarMoeda(item.valor) : "-",
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [20, 118, 255] },
    });

    documento.save(
      `fluxo-caixa-${dataInicialFluxo}-a-${dataFinalFluxo}.pdf`
    );
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

          {temPermissaoFinanceira("receitas") && (
            <button
              className={pagina === "receitas" ? "active" : ""}
              onClick={() => setPagina("receitas")}
            >
              Receitas
            </button>
          )}

          {temPermissaoFinanceira("despesas") && (
            <button
              className={pagina === "despesas" ? "active" : ""}
              onClick={() => setPagina("despesas")}
            >
              Despesas
            </button>
          )}

          {temPermissaoFinanceira("categorias") && (
            <button
              className={pagina === "categorias" ? "active" : ""}
              onClick={() => setPagina("categorias")}
            >
              Categorias
            </button>
          )}

          {temPermissaoFinanceira("fluxo_caixa") && (
            <button
              className={pagina === "fluxo" ? "active" : ""}
              onClick={() => setPagina("fluxo")}
            >
              Fluxo de Caixa
            </button>
          )}

          {temPermissaoFinanceira("relatorios") && (
            <button
              className={pagina === "relatorios" ? "active" : ""}
              onClick={() => setPagina("relatorios")}
            >
              Relatórios
            </button>
          )}

          {temPermissaoFinanceira("contas_pagar") && (
            <button
              className={pagina === "contas-pagar" ? "active" : ""}
              onClick={() => setPagina("contas-pagar")}
            >
              Contas a Pagar
            </button>
          )}

          {temPermissaoFinanceira("contas_receber") && (
            <button
              className={pagina === "contas-receber" ? "active" : ""}
              onClick={() => setPagina("contas-receber")}
            >
              Contas a Receber
            </button>
          )}

          {temPermissao("clientes") && (
            <button
              className={pagina === "clientes" ? "active" : ""}
              onClick={() => setPagina("clientes")}
            >
              Clientes
            </button>
          )}

          {temPermissao("estoque") && (
            <button
              className={pagina === "estoque" ? "active" : ""}
              onClick={() => setPagina("estoque")}
            >
              Estoque
            </button>
          )}

          {temPermissao("fechamento_caixa") && (
            <button
              className={pagina === "fechamento" ? "active" : ""}
              onClick={() => setPagina("fechamento")}
            >
              Fechamento de Caixa
            </button>
          )}

          {temPermissao("notas_fiscais") && (
            <button
              className={pagina === "notas-fiscais" ? "active" : ""}
              onClick={() => setPagina("notas-fiscais")}
            >
              Nota Fiscal
            </button>
          )}

          {temPermissaoFechamento("vendas_saipos") && (
            <button
              className={pagina === "vendas-saipos" ? "active" : ""}
              onClick={() => setPagina("vendas-saipos")}
            >
              Vendas (Saipos)
            </button>
          )}

          {temPermissaoFechamento("conciliacao") && (
            <button
              className={pagina === "conciliacao" ? "active" : ""}
              onClick={() => setPagina("conciliacao")}
            >
              Conciliação
            </button>
          )}

          {ehAdministrador && (
            <button
              className={pagina === "lojas" ? "active" : ""}
              onClick={() => setPagina("lojas")}
            >
              Lojas
            </button>
          )}

          {ehAdministrador && (
            <button
              className={pagina === "usuarios" ? "active" : ""}
              onClick={() => setPagina("usuarios")}
            >
              Usuários
            </button>
          )}

          {ehAdministrador && (
            <button
              className={pagina === "auditoria" ? "active" : ""}
              onClick={() => setPagina("auditoria")}
            >
              Log de Auditoria
            </button>
          )}
        </nav>

        {ehAdministrador && (
          <button
            type="button"
            className="aprovacao-toggle"
            onClick={alternarAprovacaoAtiva}
            title={
              aprovacaoAtiva
                ? "Aprovação de despesas está ATIVA — clique para desligar"
                : "Aprovação de despesas está DESLIGADA — clique para ligar"
            }
          >
            <span>{aprovacaoAtiva ? "🔒" : "🔓"}</span>
            Aprovação{" "}
            {aprovacaoAtiva ? "ativa" : "desligada"}
          </button>
        )}
      </aside>

      <main className="main-content">
  {temPermissaoFinanceira("contas_pagar") &&
    (() => {
      const contasAlerta = contasPagar
        .filter((conta) => conta.status !== "pago")
        .map((conta) => ({
          ...conta,
          _dias: diasAte(conta.data_vencimento),
        }))
        .filter((conta) => conta._dias <= 2)
        .sort((a, b) => a._dias - b._dias);

      if (contasAlerta.length === 0) return null;

      return (
        <div className="alerta-contas-pagar">
          <strong>⚠️ Contas a pagar precisando de atenção:</strong>

          <ul>
            {contasAlerta.map((conta) => (
              <li key={conta.id}>
                {conta.descricao} —{" "}
                {conta._dias < 0
                  ? `atrasada há ${Math.abs(conta._dias)} dia(s)`
                  : conta._dias === 0
                  ? "vence hoje"
                  : `vence em ${conta._dias} dia(s)`}{" "}
                ({formatarMoeda(conta.valor)})
              </li>
            ))}
          </ul>
        </div>
      );
    })()}

  {pagina !== "dashboard" && (
    <header className="topbar">
      <div>
        {pagina !== "conciliacao" && (
          <span className="eyebrow">FinancePro</span>
        )}

        <h1
          style={
            pagina === "conciliacao"
              ? { fontSize: "1.6rem", color: "#fff", marginTop: 0 }
              : undefined
          }
        >
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
            : pagina === "lojas"
            ? "Lojas"
            : pagina === "usuarios"
            ? "Usuários"
            : pagina === "estoque"
            ? "Estoque"
            : "FinancePro"}
        </h1>

        <p>
          {pagina === "conciliacao"
            ? "Conciliação de pagamentos"
            : "Gestão financeira profissional e centralizada."}
        </p>
      </div>

      <div className="topbar-actions">
        {pagina !== "conciliacao" && pagina !== "vendas-saipos" && (
          vePermissaoTotal ? (
            <select
              className="topbar-loja-select no-print"
              value={lojaDashboard}
              onChange={(evento) => setLojaDashboard(evento.target.value)}
              title="Filtrar tudo por loja"
            >
              <option value="todas">🏬 Todas as lojas</option>
              {lojas.map((loja) => (
                <option key={loja.id} value={String(loja.id)}>
                  🏬 {loja.nome}
                </option>
              ))}
            </select>
          ) : (
            <span className="topbar-loja-atual no-print">
              🏬{" "}
              {lojas.find(
                (loja) => String(loja.id) === String(perfil?.loja_id)
              )?.nome || "Sua loja"}
            </span>
          )
        )}

        {pagina === "despesas" && (
          <button
            type="button"
            className="secondary-button"
            onClick={() => abrirModal("despesa")}
          >
            Nova despesa
          </button>
        )}

        {pagina === "receitas" && ehAdministrador && (
          <button
            type="button"
            className="primary-button"
            onClick={() => abrirModal("receita")}
          >
            Nova receita
          </button>
        )}

        <UserMenu usuario={usuario} sair={sair} />
      </div>
    </header>
  )}

  {pagina === "dashboard" && (
    <DashboardPremium
      totais={totais}
      cmvStatus={cmvStatus}
      margemStatus={margemStatus}
      despesasPorCategoria={despesasPorCategoriaDashboard}
      mesDashboard={mesDashboard}
      setMesDashboard={setMesDashboard}
      lancamentos={lancamentosDashboard}
      todosLancamentos={lancamentosAprovados}
      formasPagamento={formasPagamento}
      formatarMoeda={formatarMoeda}
      formatarData={formatarData}
      usuario={usuario}
      sair={sair}
      lojas={lojas}
      lojaDashboard={lojaDashboard}
      setLojaDashboard={setLojaDashboard}
      ehAdministrador={ehAdministrador}
      temAcessoFinanceiro={temAcessoFinanceiroDashboard}
      acessoCardSaldo={acessoCardSaldo}
      acessoCardReceitas={acessoCardReceitas}
      acessoCardDespesas={acessoCardDespesas}
      acessoCardFluxoCaixa={acessoCardFluxoCaixa}
      acessoCardProximosRecebimentos={acessoCardProximosRecebimentos}
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
                    <strong>
                      {item.fornecedor || "-"}
                      {item.status === "pendente" && (
                        <span className="badge-status badge-status-pendente">
                          ⏳ Pendente
                        </span>
                      )}
                      {item.status === "rejeitado" && (
                        <span className="badge-status badge-status-rejeitado">
                          ❌ Rejeitado
                        </span>
                      )}
                      {item.tipo === "despesa" && item.pago_em_dinheiro && (
                        <span className="badge-status badge-status-pendente">
                          💵 Dinheiro
                        </span>
                      )}
                    </strong>
                    <span>{item.grupo || "-"}</span>
                    <span>{item.categoria || "-"}</span>
                    <span>{item.descricao}</span>
                    <span>
                      🏬{" "}
                      {lojas.find((loja) => loja.id === item.loja_id)
                        ?.nome || "Sem loja"}
                    </span>
                    {item.tem_foto_mercadoria &&
                      (() => {
                        const loja = lojas.find(
                          (item2) => item2.id === item.loja_id
                        );

                        if (
                          !loja?.latitude ||
                          !loja?.longitude ||
                          !item.latitude ||
                          !item.longitude
                        ) {
                          return null;
                        }

                        const distancia = calcularDistanciaMetros(
                          item.latitude,
                          item.longitude,
                          loja.latitude,
                          loja.longitude
                        );

                        const dentroDoRaio =
                          distancia <= (loja.raio_metros || 200);

                        return (
                          <span
                            className={
                              dentroDoRaio
                                ? "badge-geo badge-geo-ok"
                                : "badge-geo badge-geo-alerta"
                            }
                          >
                            {dentroDoRaio
                              ? `📍 Na loja (${Math.round(distancia)}m)`
                              : `⚠️ Fora do raio (${Math.round(
                                  distancia
                                )}m)`}
                          </span>
                        );
                      })()}
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

                    {item.tipo === "receita" &&
                      item.valor_liquido_esperado != null &&
                      Number(item.valor_liquido_esperado) !==
                        Number(item.valor) && (
                        <small className="foto-ajuda">
                          Líquido: {formatarMoeda(item.valor_liquido_esperado)}{" "}
                          (taxa{" "}
                          {(
                            ((Number(item.valor) -
                              Number(item.valor_liquido_esperado)) /
                              Number(item.valor)) *
                            100
                          ).toFixed(2)}
                          %)
                        </small>
                      )}

                    <div className="transaction-actions">
                      {mesLancamentoBloqueado(item) && (
                        <span
                          className="badge-status badge-status-pendente"
                          title={
                            ehAdministrador
                              ? "Lançamento de mês encerrado — só editando/excluindo com sua senha."
                              : "Lançamento de um mês já encerrado — não pode mais editar ou excluir."
                          }
                        >
                          🔒 Mês encerrado
                        </span>
                      )}

                      {(!mesLancamentoBloqueado(item) || ehAdministrador) &&
                        (item.tipo !== "receita" || ehAdministrador) && (
                        <button
                          type="button"
                          className="edit-button"
                          onClick={() => abrirEdicao(item)}
                        >
                          Editar
                        </button>
                      )}

                      {pagina === "despesas" && item.tem_foto && (
                        <button
                          type="button"
                          className="view-receipt-button"
                          disabled={carregandoFotoId === item.id}
                          onClick={async () => {
                            setCarregandoFotoId(item.id);

                            try {
                              const resultado =
                                await buscarFotoLancamento(item.id);
                              setFotoVisualizada(resultado?.foto || "");
                            } catch (erro) {
                              console.error(
                                "Erro ao buscar foto:",
                                erro
                              );
                              alert(
                                erro.message ||
                                  "Não foi possível carregar a foto."
                              );
                            } finally {
                              setCarregandoFotoId(null);
                            }
                          }}
                        >
                          {carregandoFotoId === item.id
                            ? "Carregando..."
                            : "📄 Ver nota"}
                        </button>
                      )}

                      {pagina === "despesas" &&
                        item.tem_foto_mercadoria && (
                          <button
                            type="button"
                            className="view-receipt-button"
                            disabled={
                              carregandoFotoMercadoriaId === item.id
                            }
                            onClick={async () => {
                              setCarregandoFotoMercadoriaId(item.id);

                              try {
                                const resultado =
                                  await buscarFotoMercadoriaLancamento(
                                    item.id
                                  );
                                setFotoMercadoriaVisualizada(
                                  resultado?.foto_mercadoria || ""
                                );
                              } catch (erro) {
                                console.error(
                                  "Erro ao buscar foto da mercadoria:",
                                  erro
                                );
                                alert(
                                  erro.message ||
                                    "Não foi possível carregar a foto da mercadoria."
                                );
                              } finally {
                                setCarregandoFotoMercadoriaId(null);
                              }
                            }}
                          >
                            {carregandoFotoMercadoriaId === item.id
                              ? "Carregando..."
                              : "📦 Ver mercadoria"}
                          </button>
                        )}

                      {temPermissao("aprovar_despesas") &&
                        pagina === "despesas" &&
                        item.status === "pendente" && (
                          <>
                            <button
                              type="button"
                              className="approve-button"
                              disabled={
                                processandoAprovacaoId === item.id
                              }
                              onClick={() =>
                                aprovarLancamentoHandler(item.id)
                              }
                            >
                              ✅ Aprovar
                            </button>

                            <button
                              type="button"
                              className="reject-button"
                              disabled={
                                processandoAprovacaoId === item.id
                              }
                              onClick={() =>
                                rejeitarLancamentoHandler(item.id)
                              }
                            >
                              ❌ Rejeitar
                            </button>
                          </>
                        )}

                      {(!mesLancamentoBloqueado(item) || ehAdministrador) &&
                        (item.tipo !== "receita" || ehAdministrador) && (
                      <button
                        type="button"
                        className="delete-button"
                        onClick={() => pedirConfirmacaoExclusao(item.id)}
                      >
                        Excluir
                      </button>
                      )}
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

        {pagina === "lojas" && (
          <CadastroLojas
            lojas={lojas}
            carregando={carregandoLojas}
            adicionarLoja={adicionarLoja}
            editarLoja={editarLoja}
            excluirLoja={removerLoja}
          />
        )}

        {pagina === "usuarios" && (
          <CadastroUsuarios
            usuarios={usuarios}
            lojas={lojas}
            carregando={carregandoUsuarios}
            usuarioAtualId={usuario?.id}
            adicionarUsuario={adicionarUsuario}
            editarUsuario={editarUsuario}
            removerUsuario={removerUsuario}
          />
        )}

        {pagina === "estoque" && (
          <CadastroInsumos
            insumos={insumos}
            lojas={lojas}
            carregando={carregandoInsumos}
            vePermissaoTotal={vePermissaoTotal}
            lojaFixaId={
              vePermissaoTotal ? null : perfil?.loja_id || null
            }
            adicionarInsumo={adicionarInsumo}
            editarInsumo={editarInsumoHandler}
            excluirInsumo={removerInsumo}
            registrarMovimentacao={registrarMovimentacaoHandler}
          />
        )}

        {pagina === "auditoria" && ehAdministrador && <LogAuditoria />}

        {pagina === "vendas-saipos" && temPermissaoFechamento("vendas_saipos") && (
          <VendasSaipos lojas={lojas} ehAdministrador={ehAdministrador} />
        )}

        {pagina === "conciliacao" && temPermissaoFechamento("conciliacao") && (
          <Conciliacao />
        )}

        {pagina === "contas-receber" && (
          <ContasReceber
            lancamentos={lancamentos}
            formasPagamento={formasPagamento}
            carregandoFormas={carregandoFormasPagamento}
            adicionarFormaPagamento={adicionarFormaPagamento}
            editarFormaPagamento={editarFormaPagamento}
            removerFormaPagamento={removerFormaPagamento}
            buscarFoto={buscarFotoLancamento}
          />
        )}

        {pagina === "contas-pagar" && (
          <ContasPagar
            contas={contasPagarFiltradas}
            carregando={carregandoContasPagar}
            adicionarConta={adicionarContaPagar}
            editarConta={editarContaPagar}
            marcarComoPaga={pagarContaPagar}
            removerConta={removerContaPagar}
            lojas={lojas}
            vePermissaoTotal={vePermissaoTotal}
            lojaPadrao={
              !vePermissaoTotal
                ? perfil?.loja_id || null
                : lojaDashboard !== "todas"
                ? lojaDashboard
                : null
            }
          />
        )}

        {pagina === "clientes" && (
          <CadastroClientes
            clientes={clientes}
            carregando={carregandoClientes}
            adicionarCliente={adicionarCliente}
            editarCliente={editarCliente}
            removerCliente={removerCliente}
            buscarAtendimentos={buscarAtendimentosCliente}
            adicionarAtendimento={adicionarAtendimentoCliente}
            removerAtendimento={removerAtendimentoCliente}
          />
        )}

        {pagina === "fechamento" && (
          <CadastroFechamentoCaixa
            registros={fechamentosCaixa}
            carregando={carregandoFechamentos}
            adicionarFechamento={adicionarFechamentoCaixa}
            removerFechamento={removerFechamentoCaixa}
            buscarFoto={buscarFotoFechamentoCaixa}
          />
        )}

        {pagina === "notas-fiscais" && (
          <NotasFiscais
            notas={notasFiscais}
            carregando={carregandoNotasFiscais}
            lojas={lojas}
            lojaPadrao={vePermissaoTotal ? null : perfil?.loja_id || null}
            adicionarNota={adicionarNotaFiscal}
            removerNota={removerNotaFiscal}
            buscarFoto={buscarFotoNotaFiscal}
          />
        )}

        {pagina === "fluxo" && (
          <section className="panel fluxo-panel report-print-area">
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

              <div className="report-actions no-print">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={exportarFluxoCSV}
                >
                  Exportar Excel/CSV
                </button>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={exportarFluxoPDF}
                >
                  📄 Exportar PDF
                </button>

                <button
                  type="button"
                  className="primary-button"
                  onClick={imprimirPagina}
                >
                  🖨️ Imprimir
                </button>
              </div>
            </div>

            <div className="print-only fluxo-print-header">
              <strong>
                Fechamento — {formatarData(dataInicialFluxo)} a{" "}
                {formatarData(dataFinalFluxo)}
              </strong>
              <span>
                Loja:{" "}
                {lojaDashboard === "todas"
                  ? "Todas as lojas"
                  : lojas.find(
                      (loja) => String(loja.id) === String(lojaDashboard)
                    )?.nome || "-"}
              </span>
              <span>
                Emitido em {new Date().toLocaleString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                })}
              </span>
            </div>

            <div className="fluxo-filters no-print">
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
                {totaisFluxo.totalTaxas > 0 && (
                  <small style={{ display: "block", opacity: 0.75 }}>
                    {formatarMoeda(totaisFluxo.saldoBruto)} — Taxas{" "}
                    {formatarMoeda(totaisFluxo.totalTaxas)} (
                    {totaisFluxo.percentualTaxas.toFixed(2)}%)
                  </small>
                )}
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
                            {item.tipo === "receita" ? (
                              <>
                                {formatarMoeda(item.valor)}
                                {item.valor_liquido_esperado != null &&
                                  Number(item.valor_liquido_esperado) !==
                                    Number(item.valor) && (
                                    <small
                                      style={{
                                        display: "block",
                                        opacity: 0.7,
                                      }}
                                    >
                                      Líq.{" "}
                                      {formatarMoeda(
                                        item.valor_liquido_esperado
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
                                  )}
                              </>
                            ) : (
                              "-"
                            )}
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
          <div className="report-tipo-toggle no-print">
            <button
              type="button"
              className={tipoRelatorio === "financeiro" ? "active" : ""}
              onClick={() => setTipoRelatorio("financeiro")}
            >
              Financeiro
            </button>

            <button
              type="button"
              className={tipoRelatorio === "caixa" ? "active" : ""}
              onClick={() => setTipoRelatorio("caixa")}
            >
              Caixa
            </button>
          </div>
        )}

        {pagina === "relatorios" && tipoRelatorio === "financeiro" && (
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
                  className="secondary-button"
                  onClick={exportarRelatorioPDF}
                >
                  📄 Exportar PDF
                </button>

                <button
                  type="button"
                  className="primary-button"
                  onClick={imprimirPagina}
                >
                  🖨️ Imprimir
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

        {pagina === "relatorios" && tipoRelatorio === "caixa" && (
          <section className="panel">
            <div className="panel-header">
              <div>
                <span className="eyebrow">Fechamento de Caixa</span>
                <h2>Consultar por data</h2>
              </div>
            </div>

            <div className="report-filters no-print">
              <label>
                Data
                <input
                  type="date"
                  value={dataRelatorioCaixa}
                  onChange={(evento) =>
                    setDataRelatorioCaixa(evento.target.value)
                  }
                />
              </label>
            </div>

            {(() => {
              const rotulosPorTipo = {
                caixa: { icone: "📷", nome: "Fechamento de Caixa" },
                boy: { icone: "🏍️", nome: "Diária Boy" },
                cozinha: { icone: "👨‍🍳", nome: "Diária Cozinha" },
                venda_prazo: {
                  icone: "🧾",
                  nome: "Venda a Prazo Funcionário",
                },
                funcionario: { icone: "👷", nome: "Diária Funcionário" },
              };

              const registrosDoDia = fechamentosCaixa.filter((item) => {
                const data = new Date(item.criado_em);
                const dataLocal = `${data.getFullYear()}-${String(
                  data.getMonth() + 1
                ).padStart(2, "0")}-${String(data.getDate()).padStart(
                  2,
                  "0"
                )}`;
                return dataLocal === dataRelatorioCaixa;
              });

              if (registrosDoDia.length === 0) {
                return (
                  <div className="empty-state">
                    Nenhum registro de fechamento de caixa nesse dia.
                  </div>
                );
              }

              return (
                <div className="categorias-lista">
                  {registrosDoDia.map((registro) => {
                    const info = rotulosPorTipo[registro.tipo] || {
                      icone: "🗂️",
                      nome: registro.tipo,
                    };

                    return (
                      <div className="categoria-item" key={registro.id}>
                        <div className="categoria-identificacao">
                          <div className="categoria-icone">
                            {info.icone}
                          </div>

                          <div>
                            <strong>{info.nome}</strong>
                            <div>
                              {new Date(registro.criado_em).toLocaleTimeString(
                                "pt-BR"
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="transaction-actions">
                          <button
                            type="button"
                            className="edit-button"
                            disabled={
                              carregandoFotoRelatorioCaixaId === registro.id
                            }
                            onClick={async () => {
                              setCarregandoFotoRelatorioCaixaId(registro.id);

                              try {
                                const resultado =
                                  await buscarFotoFechamentoCaixa(
                                    registro.id
                                  );
                                setFotoRelatorioCaixaVisualizada(
                                  resultado?.foto || ""
                                );
                              } catch (erro) {
                                alert(
                                  erro.message ||
                                    "Não foi possível carregar a foto."
                                );
                              } finally {
                                setCarregandoFotoRelatorioCaixaId(null);
                              }
                            }}
                          >
                            {carregandoFotoRelatorioCaixaId === registro.id
                              ? "Carregando..."
                              : "Ver foto"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </section>
        )}
      </main>

      {fotoRelatorioCaixaVisualizada && (
        <div
          className="modal-overlay"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget) {
              setFotoRelatorioCaixaVisualizada(null);
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
                onClick={() => setFotoRelatorioCaixaVisualizada(null)}
              >
                ×
              </button>
            </div>

            <img
              src={fotoRelatorioCaixaVisualizada}
              alt="Foto arquivada"
              className="foto-modal-imagem"
            />
          </div>
        </div>
      )}

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

              <div className="form-row">
                <label>
                  <span className="rotulo-campo">
                    Valor
                    <span className="campo-obrigatorio">Obrigatório</span>
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formulario.valor}
                    onChange={(evento) =>
                      alterarCampo(
                        "valor",
                        formatarValorDigitado(evento.target.value)
                      )
                    }
                    placeholder="0,00"
                    required
                  />
                </label>

                <label>
                  <span className="rotulo-campo">
                    Data
                    <span className="campo-obrigatorio">Obrigatório</span>
                  </span>
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
                <span className="rotulo-campo">
                  Grupo financeiro
                  <span className="campo-obrigatorio">Obrigatório</span>
                </span>
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
                  <span className="rotulo-campo">
                    Categoria
                    <span className="campo-obrigatorio">Obrigatório</span>
                  </span>
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


              {tipoLancamento === "despesa" && (
                <label className="permissao-item">
                  <input
                    type="checkbox"
                    checked={formulario.pago_em_dinheiro}
                    onChange={(evento) =>
                      alterarCampo("pago_em_dinheiro", evento.target.checked)
                    }
                  />
                  💵 Pago em dinheiro (saiu do caixa)
                </label>
              )}

              {tipoLancamento === "receita" && (
                <label>
                  Forma de pagamento (pra Contas a Receber)
                  <select
                    value={formulario.forma_pagamento_id}
                    onChange={(evento) =>
                      alterarCampo(
                        "forma_pagamento_id",
                        evento.target.value
                      )
                    }
                  >
                    <option value="">Não informado</option>
                    {formasPagamento.map((forma) => (
                      <option key={forma.id} value={forma.id}>
                        {forma.nome} (D+{forma.prazo_dias},{" "}
                        {forma.taxa_percentual}%)
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label>
                Descrição
                <input
                  type="text"
                  value={formulario.descricao}
                  onChange={(evento) =>
                    alterarCampo("descricao", evento.target.value)
                  }
                  placeholder="Ex.: Compra de carne"
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
                  📄 Foto da nota
                </span>

                <input
                  id="foto-comprovante"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  disabled={processandoFoto}
                  onChange={async (evento) => {
                    const arquivo = evento.target.files?.[0];

                    if (!arquivo) return;

                    setProcessandoFoto(true);

                    try {
                      const fotoComprimida = await comprimirImagem(arquivo);
                      alterarCampo("foto", fotoComprimida);
                      await lerNotaAutomaticamente(fotoComprimida);
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
                  htmlFor="foto-comprovante"
                  className="foto-button"
                  style={
                    processandoFoto || lendoNota
                      ? { opacity: 0.6, pointerEvents: "none" }
                      : undefined
                  }
                >
                  {processandoFoto
                    ? "Processando foto..."
                    : lendoNota
                    ? "🤖 Lendo nota automaticamente..."
                    : "📄🤖 Anexar e ler nota automaticamente"}
                </label>

                <small className="foto-ajuda">
                  Sem localização — pode anexar de qualquer lugar.
                </small>
              </div>

              {formulario.foto && (
                <div className="foto-preview">
                  <img
                    src={formulario.foto}
                    alt="Pré-visualização da nota"
                  />

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => lerNotaAutomaticamente()}
                    disabled={lendoNota}
                  >
                    {lendoNota ? "Lendo nota..." : "🤖 Ler novamente"}
                  </button>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => alterarCampo("foto", "")}
                  >
                    Remover foto
                  </button>
                </div>
              )}

              <div className="foto-upload">
                <input
                  id="tirar-mais-foto"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  disabled={adicionandoFotoExtra}
                  onChange={async (evento) => {
                    const arquivo = evento.target.files?.[0];

                    if (!arquivo) return;

                    setAdicionandoFotoExtra(true);

                    try {
                      const fotoComprimida = await comprimirImagem(arquivo);

                      setFormulario((anterior) => ({
                        ...anterior,
                        fotos_extra: [
                          ...(anterior.fotos_extra || []),
                          fotoComprimida,
                        ],
                      }));
                    } catch (erro) {
                      console.error("Erro ao anexar foto extra:", erro);
                      alert(
                        erro.message || "Não foi possível anexar essa foto."
                      );
                    } finally {
                      setAdicionandoFotoExtra(false);
                      evento.target.value = "";
                    }
                  }}
                />

                <label
                  htmlFor="tirar-mais-foto"
                  className="primary-button"
                  style={
                    adicionandoFotoExtra
                      ? { opacity: 0.6, pointerEvents: "none" }
                      : { display: "inline-block", textAlign: "center" }
                  }
                >
                  {adicionandoFotoExtra ? "Anexando..." : "📷 Tirar mais foto"}
                </label>

                <input
                  id="anexar-mais-fotos"
                  type="file"
                  accept="image/*"
                  disabled={adicionandoFotoExtra}
                  onChange={async (evento) => {
                    const arquivo = evento.target.files?.[0];

                    if (!arquivo) return;

                    setAdicionandoFotoExtra(true);

                    try {
                      const fotoComprimida = await comprimirImagem(arquivo);

                      setFormulario((anterior) => ({
                        ...anterior,
                        fotos_extra: [
                          ...(anterior.fotos_extra || []),
                          fotoComprimida,
                        ],
                      }));
                    } catch (erro) {
                      console.error("Erro ao anexar foto extra:", erro);
                      alert(
                        erro.message || "Não foi possível anexar essa foto."
                      );
                    } finally {
                      setAdicionandoFotoExtra(false);
                      evento.target.value = "";
                    }
                  }}
                />

                <label
                  htmlFor="anexar-mais-fotos"
                  className="primary-button"
                  style={
                    adicionandoFotoExtra
                      ? { opacity: 0.6, pointerEvents: "none" }
                      : {
                          display: "inline-block",
                          textAlign: "center",
                          marginTop: 8,
                        }
                  }
                >
                  {adicionandoFotoExtra
                    ? "Anexando..."
                    : "📎 Anexar mais foto"}
                </label>

                <small className="foto-ajuda">
                  Um botão tira a foto na hora, o outro escolhe da galeria —
                  pode clicar quantas vezes quiser pra anexar mais de uma.
                </small>
              </div>

              {formulario.fotos_extra?.length > 0 && (
                <div
                  className="foto-preview"
                  style={{ display: "flex", flexWrap: "wrap", gap: 10 }}
                >
                  {formulario.fotos_extra.map((fotoExtra, indice) => (
                    <div key={indice} style={{ position: "relative" }}>
                      <img
                        src={fotoExtra}
                        alt={`Foto extra ${indice + 1}`}
                        style={{
                          width: 90,
                          height: 90,
                          objectFit: "cover",
                          borderRadius: 8,
                        }}
                      />

                      <button
                        type="button"
                        className="delete-button"
                        style={{
                          position: "absolute",
                          top: -6,
                          right: -6,
                          padding: "2px 6px",
                          fontSize: 12,
                        }}
                        onClick={() =>
                          setFormulario((anterior) => ({
                            ...anterior,
                            fotos_extra: anterior.fotos_extra.filter(
                              (_, i) => i !== indice
                            ),
                          }))
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="foto-upload">
                <span className="foto-upload-title">
                  📦 Foto da mercadoria
                </span>

                <input
                  id="foto-mercadoria"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  disabled={processandoFotoMercadoria}
                  onChange={async (evento) => {
                    const arquivo = evento.target.files?.[0];

                    if (!arquivo) return;

                    setProcessandoFotoMercadoria(true);

                    try {
                      const [fotoComprimida, localizacao] =
                        await Promise.all([
                          comprimirImagem(arquivo),
                          capturarLocalizacao(),
                        ]);

                      setFormulario((anterior) => ({
                        ...anterior,
                        foto_mercadoria: fotoComprimida,
                        latitude: localizacao?.latitude ?? null,
                        longitude: localizacao?.longitude ?? null,
                        precisao_metros:
                          localizacao?.precisao_metros ?? null,
                        capturado_em: localizacao?.capturado_em ?? null,
                      }));

                      if (!localizacao) {
                        alert(
                          "Não foi possível capturar a localização. A foto foi salva mesmo assim, mas sem o registro do local."
                        );
                      }
                    } catch (erro) {
                      console.error(
                        "Erro ao processar a foto da mercadoria:",
                        erro
                      );
                      alert(
                        erro.message ||
                          "Não foi possível processar a foto selecionada."
                      );
                    } finally {
                      setProcessandoFotoMercadoria(false);
                      evento.target.value = "";
                    }
                  }}
                />

                <label
                  htmlFor="foto-mercadoria"
                  className="foto-button"
                  style={
                    processandoFotoMercadoria
                      ? { opacity: 0.6, pointerEvents: "none" }
                      : undefined
                  }
                >
                  {processandoFotoMercadoria
                    ? "Capturando foto e local..."
                    : "📦 Anexar foto da mercadoria"}
                </label>

                <small className="foto-ajuda">
                  Registra a localização no momento da foto — precisa
                  ser tirada na hora, na loja.
                </small>
              </div>

              {formulario.foto_mercadoria && (
                <div className="foto-preview">
                  <img
                    src={formulario.foto_mercadoria}
                    alt="Pré-visualização da mercadoria"
                  />

                  {formulario.latitude && formulario.longitude ? (
                    <span className="foto-geo-status">
                      📍 Localização capturada
                      {formulario.precisao_metros
                        ? ` (±${Math.round(
                            formulario.precisao_metros
                          )}m)`
                        : ""}
                    </span>
                  ) : (
                    <span className="foto-geo-status foto-geo-status-alerta">
                      ⚠️ Sem localização registrada
                    </span>
                  )}

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      setFormulario((anterior) => ({
                        ...anterior,
                        foto_mercadoria: "",
                        latitude: null,
                        longitude: null,
                        precisao_metros: null,
                        capturado_em: null,
                      }))
                    }
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
                  disabled={salvando}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={salvando}
                >
                  {salvando
                    ? "Salvando..."
                    : editandoId
                    ? "Salvar alterações"
                    : "Salvar lançamento"}
                </button>
              </div>
            </form>
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
                <span className="eyebrow">Comprovante</span>
                <h2>Foto da despesa</h2>
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
              alt="Foto do comprovante"
              className="foto-modal-imagem"
            />

            <button
              type="button"
              className="secondary-button foto-modal-baixar"
              onClick={() =>
                baixarImagem(fotoVisualizada, `nota-${Date.now()}.jpg`)
              }
            >
              ⬇ Baixar foto
            </button>
          </div>
        </div>
      )}

      {fotoMercadoriaVisualizada && (
        <div
          className="modal-overlay"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget) {
              setFotoMercadoriaVisualizada(null);
            }
          }}
        >
          <div className="modal modal-foto">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Mercadoria</span>
                <h2>Foto da mercadoria</h2>
              </div>

              <button
                type="button"
                className="close-button"
                onClick={() => setFotoMercadoriaVisualizada(null)}
              >
                ×
              </button>
            </div>

            <img
              src={fotoMercadoriaVisualizada}
              alt="Foto da mercadoria"
              className="foto-modal-imagem"
            />

            <button
              type="button"
              className="secondary-button foto-modal-baixar"
              onClick={() =>
                baixarImagem(
                  fotoMercadoriaVisualizada,
                  `mercadoria-${Date.now()}.jpg`
                )
              }
            >
              ⬇ Baixar foto
            </button>
          </div>
        </div>
      )}

      {confirmandoExclusao && (
        <div
          className="modal-overlay"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget) {
              cancelarExclusao();
            }
          }}
        >
          <div className="modal modal-confirmacao">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Atenção</span>
                <h2>Excluir lançamento?</h2>
              </div>
            </div>

            <p>Essa ação não pode ser desfeita.</p>

            {(() => {
              const itemExclusao = lancamentos.find(
                (item) => item.id === confirmandoExclusao
              );

              if (!mesLancamentoBloqueado(itemExclusao)) {
                return null;
              }

              return (
                <label>
                  <span className="rotulo-campo">
                    🔒 Mês encerrado — digite sua senha pra confirmar
                    <span className="campo-obrigatorio">Obrigatório</span>
                  </span>
                  <input
                    type="password"
                    value={senhaExclusaoMesEncerrado}
                    onChange={(evento) =>
                      setSenhaExclusaoMesEncerrado(evento.target.value)
                    }
                    placeholder="Sua senha de login"
                  />
                </label>
              );
            })()}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={cancelarExclusao}
              >
                Não
              </button>

              <button
                type="button"
                className="primary-button"
                onClick={confirmarExclusao}
                disabled={
                  mesLancamentoBloqueado(
                    lancamentos.find(
                      (item) => item.id === confirmandoExclusao
                    )
                  ) && !senhaExclusaoMesEncerrado
                }
              >
                Sim
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;