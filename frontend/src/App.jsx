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
  buscarChavePublicaPush,
  inscreverPush,
  desinscreverPush,
  criarLancamento,
  lerNotaFiscal,
  atualizarCustosPorCompra,
  atualizarLancamento,
  excluirLancamento,
  buscarCategorias,
  criarCategoria as criarCategoriaApi,
  atualizarCategoria as atualizarCategoriaApi,
  excluirCategoria as excluirCategoriaApi,
  buscarFormasPagamento,
  buscarDinheiroInformado,
  buscarStatusWhatsapp,
  buscarResumoRetiradasSocios,
  buscarRetiradasSocios,
  criarRetiradaSocio,
  excluirRetiradaSocio,
  buscarResumoEmprestimosEntreLojas,
  buscarEmprestimosEntreLojas,
  criarEmprestimoEntreLojas,
  registrarPagamentoEmprestimo,
  excluirEmprestimoEntreLojas,
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
  editarDataPagamentoContaPagar,
  excluirContaPagar,
  buscarDespesasRecorrentes,
  criarDespesaRecorrente,
  editarDespesaRecorrente,
  excluirDespesaRecorrente,
  buscarHistoricoFornecedores,
  baixarBackupCompleto,
  listarBackupsAutomaticos,
  baixarBackupAutomatico,
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
  corrigirValorFechamentoCaixa,
  buscarFotoFundoRetiradaCaixa,
  excluirFechamentoCaixa,
  buscarFinalizacoesFechamentoCaixa,
  finalizarFechamentoCaixa,
  reabrirFechamentoCaixa,
  lerValorFechamentoCaixa,
  trocarFotoFechamentoCaixa,
  buscarWhatsappFila,
  removerItemWhatsappFila,
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
  aprovarTrocaFoto,
  rejeitarTrocaFoto,
  atualizarConfiguracaoAprovacao,
  buscarInsumos,
  criarInsumo,
  atualizarInsumo,
  excluirInsumo,
  registrarMovimentacaoEstoque,
  buscarReceitaInsumo,
  salvarReceitaInsumo,
  recalcularReceitaInsumo,
  buscarFichasTecnicas,
  criarFichaTecnica,
  editarFichaTecnica,
  excluirFichaTecnica,
  buscarProdutosVendidosSaipos,
  importarCardapioFoto,
  buscarVendasCanceladasHoje,
  buscarLogAuditoria,
  buscarFundoRetiradasCaixa,
  criarFundoRetiradaCaixa,
  aprovarExclusaoLancamento,
  rejeitarExclusaoLancamento,
} from "./services/api";

import CadastroCategorias from "./components/CadastroCategorias";
import CadastroClientes from "./components/CadastroClientes";
import ContasPagar, { diasAte } from "./components/ContasPagar";
import DespesasRecorrentes from "./components/DespesasRecorrentes";
import RetiradasSocios from "./components/RetiradasSocios";
import EmprestimosEntreLojas from "./components/EmprestimosEntreLojas";
import Fornecedores from "./components/Fornecedores";
import ContasReceber from "./components/ContasReceber";
import LogAuditoria from "./components/LogAuditoria";
import VendasSaipos from "./components/VendasSaipos";
import Conciliacao from "./components/Conciliacao";
import CadastroFechamentoCaixa from "./components/CadastroFechamentoCaixa";
import WhatsAppFila from "./components/WhatsAppFila";
import NotasFiscais from "./components/NotasFiscais";
import CadastroLojas from "./components/CadastroLojas";
import CadastroUsuarios from "./components/CadastroUsuarios";
import CadastroInsumos from "./components/CadastroInsumos";
import FichaTecnica from "./components/FichaTecnica";
import CampoValor, { paraNumero } from "./components/CampoValor";
import Notificacoes from "./components/Notificacoes";
import UserMenu from "./components/UserMenu";
import FeedLancamentos from "./components/FeedLancamentos";

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
    item: "",
    quantidade: "",
    unidade: "kg",
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
    fundo_retirada_id: "",
    valor_pago_cofre: "",
    data: hojeLocal(),
  };
}
// Pedido do usuário (24/08/2026): reajuste de saldo — o valor real em
// conta nessa data era R$ 79.804,87 (o sistema estava mostrando
// R$ 86.925,58). Novo ponto de partida fixo do card "Saldo" do Dashboard —
// a partir daqui, toda venda recebida soma e toda despesa (incluindo
// contas a pagar que forem pagas, que já viram despesa lançada) desconta
// automaticamente, sem precisar mexer em nada. Lançamentos de antes dessa
// data não entram de novo na conta porque já estão embutidos nesse valor.
// (Ajuste anterior, 18/08/2026, era R$ 106.430,13 — mantido aqui só de
// histórico, não usado mais.)
const SALDO_INICIAL_VALOR = 79804.87;
const SALDO_INICIAL_DATA = "2026-08-24";
// O valor acima é o saldo real da loja Uberlândia (a única em operação de
// fato quando esse valor foi informado) — não é um caixa único somado de
// todas as lojas. Usado pra o card Saldo não mostrar esse valor quando
// outra loja (sem nenhuma movimentação própria) estiver selecionada.
const LOJA_INICIAL_ID = "4";

// Bug real corrigido (19/08/2026): o valor do banco às vezes vem SEM
// indicar o fuso (sem "Z" no final) — é UTC de verdade, mas sem o "Z" o
// navegador tenta adivinhar o fuso sozinho e erra o horário mostrado
// (confirmado comparando com o horário real de um comprovante Pix).
function paraDataUtc(bruto) {
  if (!bruto) return null;
  const jaTemFuso = /[Zz]|[+-]\d{2}:\d{2}$/.test(bruto);
  const data = new Date(jaTemFuso ? bruto : `${bruto}Z`);
  return Number.isNaN(data.getTime()) ? null : data;
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

  // Pedido do usuário (12/08/2026): Lojas/Usuários/Log de Auditoria/
  // Estoque/Clientes/Categorias juntos num só botão "⚙️ Mais" (accordion),
  // pra aba lateral não ficar gigante. Começa aberto se a página atual (ex:
  // recarregou a tela em "usuarios") já for uma dessas, senão fica
  // fechado.
  const PAGINAS_MENU_MAIS = [
    "categorias",
    "clientes",
    "estoque",
    "lojas",
    "usuarios",
    "auditoria",
    "backup",
  ];
  const [menuMaisAberto, setMenuMaisAberto] = useState(() =>
    PAGINAS_MENU_MAIS.includes(searchParams.get("pagina") || "dashboard")
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

  // Pedido do usuário (25/08/2026): notificação push de verdade (estilo
  // WhatsApp, funciona com o app fechado) a cada lançamento novo — Feed
  // do Dia. "indisponivel" cobre navegador sem suporte (ex: Safari
  // antigo) e HTTP sem certificado (Push exige HTTPS, exceto localhost).
  const [notificacaoStatus, setNotificacaoStatus] = useState("desconhecido");

  useEffect(() => {
    async function conferirStatusNotificacao() {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        typeof Notification === "undefined"
      ) {
        setNotificacaoStatus("indisponivel");
        return;
      }

      if (Notification.permission === "denied") {
        setNotificacaoStatus("indisponivel");
        return;
      }

      try {
        const registro = await navigator.serviceWorker.ready;
        const inscricaoAtual = await registro.pushManager.getSubscription();
        setNotificacaoStatus(inscricaoAtual ? "ativa" : "inativa");
      } catch {
        setNotificacaoStatus("inativa");
      }
    }

    conferirStatusNotificacao();
  }, []);

  // Converte a chave pública VAPID (texto base64) pro formato binário
  // que a Push API do navegador exige — trecho padrão, sempre igual em
  // qualquer projeto que use Web Push.
  function base64ParaUint8Array(base64) {
    const preenchimento = "=".repeat((4 - (base64.length % 4)) % 4);
    const base64Normalizado = (base64 + preenchimento)
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const bruto = window.atob(base64Normalizado);
    const saida = new Uint8Array(bruto.length);
    for (let i = 0; i < bruto.length; i += 1) {
      saida[i] = bruto.charCodeAt(i);
    }
    return saida;
  }

  async function ativarNotificacaoHandler() {
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setNotificacaoStatus("inativa");
        return;
      }

      const { publicKey } = await buscarChavePublicaPush();
      const registro = await navigator.serviceWorker.ready;
      const inscricao = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ParaUint8Array(publicKey),
      });

      await inscreverPush(inscricao.toJSON());
      setNotificacaoStatus("ativa");
    } catch (erro) {
      console.error("Erro ao ativar notificações:", erro);
      alert(
        erro.message ||
          "Não foi possível ativar as notificações nesse aparelho."
      );
    }
  }

  async function desativarNotificacaoHandler() {
    try {
      const registro = await navigator.serviceWorker.ready;
      const inscricaoAtual = await registro.pushManager.getSubscription();

      if (inscricaoAtual) {
        await desinscreverPush(inscricaoAtual.endpoint).catch(() => {});
        await inscricaoAtual.unsubscribe();
      }

      setNotificacaoStatus("inativa");
    } catch (erro) {
      console.error("Erro ao desativar notificações:", erro);
    }
  }

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
  const [trocaFotoVisualizada, setTrocaFotoVisualizada] = useState(null);
  const [carregandoTrocaFotoId, setCarregandoTrocaFotoId] = useState(null);
  const [processandoTrocaFotoId, setProcessandoTrocaFotoId] = useState(null);
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
  const [finalizacoesFechamentoCaixa, setFinalizacoesFechamentoCaixa] =
    useState([]);

  const [notasFiscais, setNotasFiscais] = useState([]);
  const [carregandoNotasFiscais, setCarregandoNotasFiscais] = useState(true);

  const [whatsappFila, setWhatsappFila] = useState([]);
  const [carregandoWhatsappFila, setCarregandoWhatsappFila] = useState(true);

  // Pedido do usuário (20/08/2026): avisar sozinho no topo quando o robô
  // do WhatsApp parar de mandar sinal de vida (crash, sem internet,
  // desconectado do WhatsApp) — antes só dava pra descobrir cavando o
  // log manualmente.
  const [statusWhatsappBot, setStatusWhatsappBot] = useState(null);

  // Retiradas de Sócios (20/08/2026) — só admin.
  const [retiradasSocios, setRetiradasSocios] = useState([]);
  const [carregandoRetiradasSocios, setCarregandoRetiradasSocios] =
    useState(true);

  // Resumo (sem nome do sócio) pra QUALQUER usuário — usado só pra dar
  // baixa no Saldo certo, mesmo pra quem não é admin e não vê a tela.
  const [resumoRetiradasSocios, setResumoRetiradasSocios] = useState([]);

  useEffect(() => {
    buscarResumoRetiradasSocios()
      .then((dados) => setResumoRetiradasSocios(Array.isArray(dados) ? dados : []))
      .catch((erro) =>
        console.error("Erro ao buscar resumo de retiradas de sócios:", erro)
      );
  }, []);

  // Empréstimo entre Lojas (21/08/2026) — só admin gerencia, mas o
  // resumo (sem detalhe sensível, é operacional) é buscado por
  // QUALQUER usuário, pra dar baixa no Saldo certo de cada loja.
  const [emprestimosEntreLojas, setEmprestimosEntreLojas] = useState([]);
  const [carregandoEmprestimosEntreLojas, setCarregandoEmprestimosEntreLojas] =
    useState(true);
  const [resumoEmprestimosEntreLojas, setResumoEmprestimosEntreLojas] = useState([]);

  useEffect(() => {
    buscarResumoEmprestimosEntreLojas()
      .then((dados) =>
        setResumoEmprestimosEntreLojas(Array.isArray(dados) ? dados : [])
      )
      .catch((erro) =>
        console.error("Erro ao buscar resumo de empréstimos entre lojas:", erro)
      );
  }, []);

  // Fundo de Retirada de Caixa (22/08/2026) — retirada genérica de
  // frente de caixa (sem destino específico ainda) guardada pra gasto
  // futuro. Buscado por QUALQUER usuário (não é sigiloso), pra mostrar
  // no Dashboard e pra escolher na hora de lançar uma despesa "paga com
  // esse fundo".
  const [fundosRetiradas, setFundosRetiradas] = useState([]);

  // Pedido do usuário (22/08/2026): dá pra fechar (X) o aviso de
  // "abertura não bate com fechamento anterior" — some da tela até uma
  // divergência NOVA aparecer (fechamento diferente), não é permanente.
  // Bug real corrigido (22/08/2026): fechar (X) esse aviso só ficava
  // guardado em memória — clicar na marca (que dá um reload de página
  // de verdade) ou fechar/abrir o navegador fazia o aviso já fechado
  // voltar a aparecer. Agora fica salvo no localStorage, sobrevive a
  // reload de página de verdade.
  const [divergenciasFechadas, setDivergenciasFechadas] = useState(() => {
    try {
      const salvo = localStorage.getItem("financepro_divergencias_fechadas");
      return salvo ? new Set(JSON.parse(salvo)) : new Set();
    } catch {
      return new Set();
    }
  });

  function fecharDivergencia(chave) {
    setDivergenciasFechadas((anteriores) => {
      const novo = new Set([...anteriores, chave]);
      try {
        localStorage.setItem(
          "financepro_divergencias_fechadas",
          JSON.stringify([...novo])
        );
      } catch {
        // localStorage indisponível — só não persiste entre recarregamentos.
      }
      return novo;
    });
  }

  function carregarFundosRetiradas() {
    buscarFundoRetiradasCaixa()
      .then((dados) => setFundosRetiradas(Array.isArray(dados) ? dados : []))
      .catch((erro) =>
        console.error("Erro ao buscar fundo de retiradas de caixa:", erro)
      );
  }

  useEffect(() => {
    carregarFundosRetiradas();
  }, []);

  const [clientes, setClientes] = useState([]);
  const [carregandoClientes, setCarregandoClientes] = useState(true);

  const [contasPagar, setContasPagar] = useState([]);
  const [carregandoContasPagar, setCarregandoContasPagar] = useState(true);
  const [despesasRecorrentes, setDespesasRecorrentes] = useState([]);
  const [carregandoDespesasRecorrentes, setCarregandoDespesasRecorrentes] =
    useState(true);
  // Ficha Técnica (21/08/2026) — reaproveita o state "insumos" que já
  // existe mais abaixo (tela Estoque); só o de Fichas Técnicas é novo.
  const [fichasTecnicas, setFichasTecnicas] = useState([]);
  const [carregandoFichasTecnicas, setCarregandoFichasTecnicas] =
    useState(true);
  const [historicoFornecedores, setHistoricoFornecedores] = useState([]);
  const [carregandoFornecedores, setCarregandoFornecedores] = useState(true);

  const [formasPagamento, setFormasPagamento] = useState([]);
  const [carregandoFormasPagamento, setCarregandoFormasPagamento] =
    useState(true);
  // Cada fechamento confirmado na Conciliação vira uma linha aqui (com sua
  // loja) — guardamos a lista inteira, e não já a soma pronta, porque a
  // soma tem que ser filtrada por loja no Dashboard (senão o dinheiro de
  // uma loja aparece misturado com o das outras).
  const [registrosDinheiroInformado, setRegistrosDinheiroInformado] =
    useState([]);

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
  // Pedido do usuário (14/08/2026): relatório "fechado por mês" pronto pra
  // mandar pro contador — em vez de escolher data inicial/final na mão,
  // escolhe direto o mês (input type="month") e o sistema já calcula o
  // primeiro e o último dia daquele mês sozinho.
  const [mesRelatorioSelecionado, setMesRelatorioSelecionado] = useState(
    hoje.slice(0, 7)
  );

  function selecionarMesRelatorio(mesAnoTexto) {
    setMesRelatorioSelecionado(mesAnoTexto);

    if (!mesAnoTexto) return;

    const [ano, mes] = mesAnoTexto.split("-").map(Number);
    const ultimoDiaDoMes = new Date(ano, mes, 0).getDate();

    setDataInicialRelatorio(`${mesAnoTexto}-01`);
    setDataFinalRelatorio(
      `${mesAnoTexto}-${String(ultimoDiaDoMes).padStart(2, "0")}`
    );
  }

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
        // Cada registro já é só o dinheiro NOVO daquele fechamento (Em
        // caixa menos Abertura) — a soma por loja é feita depois, no
        // useMemo de totais, pra não misturar uma loja com a outra.
        setRegistrosDinheiroInformado(
          Array.isArray(dados?.registros) ? dados.registros : []
        );
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

  async function carregarDespesasRecorrentes() {
    try {
      setCarregandoDespesasRecorrentes(true);
      const dados = await buscarDespesasRecorrentes();
      setDespesasRecorrentes(Array.isArray(dados) ? dados : []);
    } catch (erro) {
      console.error("Erro ao carregar despesas recorrentes:", erro);
    } finally {
      setCarregandoDespesasRecorrentes(false);
    }
  }

  useEffect(() => {
    carregarDespesasRecorrentes();
  }, []);

  // Ficha Técnica (21/08/2026) — usa o mesmo state/funções "insumos" que
  // já existiam pra tela Estoque (adicionarInsumo/editarInsumoHandler/
  // removerInsumo/registrarMovimentacaoHandler, mais abaixo neste
  // arquivo); só carrega/gerencia fichasTecnicas, que é novo.
  async function carregarFichasTecnicas() {
    try {
      setCarregandoFichasTecnicas(true);
      const dados = await buscarFichasTecnicas();
      setFichasTecnicas(Array.isArray(dados) ? dados : []);
    } catch (erro) {
      console.error("Erro ao carregar fichas técnicas:", erro);
    } finally {
      setCarregandoFichasTecnicas(false);
    }
  }

  useEffect(() => {
    carregarFichasTecnicas();
  }, []);

  async function adicionarFichaTecnicaHandler(dados) {
    await criarFichaTecnica(dados);
    await carregarFichasTecnicas();
  }

  async function editarFichaTecnicaHandler(id, dados) {
    await editarFichaTecnica(id, dados);
    await carregarFichasTecnicas();
  }

  async function removerFichaTecnicaHandler(id) {
    await excluirFichaTecnica(id);
    setFichasTecnicas((anteriores) => anteriores.filter((item) => item.id !== id));
  }

  async function carregarHistoricoFornecedores() {
    try {
      setCarregandoFornecedores(true);
      const dados = await buscarHistoricoFornecedores();
      setHistoricoFornecedores(Array.isArray(dados) ? dados : []);
    } catch (erro) {
      console.error("Erro ao carregar histórico de fornecedores:", erro);
    } finally {
      setCarregandoFornecedores(false);
    }
  }

  useEffect(() => {
    carregarHistoricoFornecedores();
  }, []);

  const [gerandoBackup, setGerandoBackup] = useState(false);
  const [ultimoBackupGeradoEm, setUltimoBackupGeradoEm] = useState(null);
  const [backupsAutomaticos, setBackupsAutomaticos] = useState([]);
  const [carregandoBackupsAutomaticos, setCarregandoBackupsAutomaticos] =
    useState(false);
  const [baixandoBackupAutomaticoId, setBaixandoBackupAutomaticoId] =
    useState(null);

  function salvarArquivoJson(objeto, nomeArquivo) {
    const arquivo = new Blob([JSON.stringify(objeto, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(arquivo);
    const link = document.createElement("a");
    link.href = url;
    link.download = nomeArquivo;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function baixarBackup() {
    setGerandoBackup(true);

    try {
      const backup = await baixarBackupCompleto();
      salvarArquivoJson(backup, `financepro-backup-${hojeLocal()}.json`);
      setUltimoBackupGeradoEm(new Date());
    } catch (erro) {
      alert(erro.message || "Não foi possível gerar o backup.");
    } finally {
      setGerandoBackup(false);
    }
  }

  async function carregarBackupsAutomaticos() {
    try {
      setCarregandoBackupsAutomaticos(true);
      const dados = await listarBackupsAutomaticos();
      setBackupsAutomaticos(Array.isArray(dados) ? dados : []);
    } catch (erro) {
      console.error("Erro ao carregar backups automáticos:", erro);
    } finally {
      setCarregandoBackupsAutomaticos(false);
    }
  }

  useEffect(() => {
    if (pagina === "backup" && ehAdministrador) {
      carregarBackupsAutomaticos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina]);

  async function baixarUmBackupAutomatico(backup) {
    setBaixandoBackupAutomaticoId(backup.id);

    try {
      const conteudo = await baixarBackupAutomatico(backup.id);
      const dataArquivo = (backup.criado_em || "").slice(0, 10);
      salvarArquivoJson(
        conteudo,
        `financepro-backup-automatico-${dataArquivo}.json`
      );
    } catch (erro) {
      alert(erro.message || "Não foi possível baixar esse backup.");
    } finally {
      setBaixandoBackupAutomaticoId(null);
    }
  }

  async function adicionarDespesaRecorrente(dados) {
    await criarDespesaRecorrente(dados);
    await carregarDespesasRecorrentes();
  }

  async function editarDespesaRecorrenteHandler(id, dados) {
    await editarDespesaRecorrente(id, dados);
    await carregarDespesasRecorrentes();
  }

  async function removerDespesaRecorrente(id) {
    await excluirDespesaRecorrente(id);
    await carregarDespesasRecorrentes();
  }

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

    async function carregarFinalizacoes() {
      try {
        const dados = await buscarFinalizacoesFechamentoCaixa();
        setFinalizacoesFechamentoCaixa(Array.isArray(dados) ? dados : []);
      } catch (erro) {
        console.error("Erro ao carregar finalizações de fechamento:", erro);
      }
    }

    carregarFinalizacoes();

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

    // Pra sumir a lista pra todo mundo assim que alguém finalizar o
    // fechamento, mesmo em outro dispositivo/aba.
    const canalFinalizacoes = supabase
      .channel("fechamento-caixa-finalizacoes-tempo-real")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "fechamento_caixa_finalizacoes",
        },
        (payload) => {
          setFinalizacoesFechamentoCaixa((anteriores) => {
            if (anteriores.some((item) => item.id === payload.new.id)) {
              return anteriores;
            }

            return [payload.new, ...anteriores];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canalFechamentos);
      supabase.removeChannel(canalFinalizacoes);
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

  // Fila do WhatsApp (17/08/2026) — só admin, mesma regra da rota no
  // backend (verificarAdmin). Não busca pra quem não é admin, pra não
  // gerar erro 403 à toa no console de todo mundo.
  useEffect(() => {
    if (!ehAdministrador) {
      setCarregandoWhatsappFila(false);
      return;
    }

    async function carregarWhatsappFila() {
      try {
        setCarregandoWhatsappFila(true);
        const dados = await buscarWhatsappFila();
        setWhatsappFila(Array.isArray(dados) ? dados : []);
      } catch (erro) {
        console.error("Erro ao carregar fila do WhatsApp:", erro);
      } finally {
        setCarregandoWhatsappFila(false);
      }
    }

    carregarWhatsappFila();
  }, [ehAdministrador]);

  // Status do robô do WhatsApp (20/08/2026) — só admin. Confere de novo a
  // cada 3 minutos pra pegar se ele cair (ou voltar) enquanto a pessoa
  // está com a tela aberta, sem precisar recarregar a página.
  useEffect(() => {
    if (!ehAdministrador) return;

    async function carregarStatusWhatsapp() {
      try {
        const dados = await buscarStatusWhatsapp();
        setStatusWhatsappBot(dados);
      } catch (erro) {
        console.error("Erro ao buscar status do robô do WhatsApp:", erro);
      }
    }

    carregarStatusWhatsapp();
    const intervalo = setInterval(carregarStatusWhatsapp, 3 * 60 * 1000);
    return () => clearInterval(intervalo);
  }, [ehAdministrador]);

  // Pedido do usuário (21/08/2026): notificação em tempo real na tela —
  // venda cancelada (Saipos) e lançamento excluído — visível em
  // QUALQUER página do sistema, não só numa tela específica. "Tempo
  // real" aqui é por polling (a Saipos é uma API consultada, não manda
  // aviso sozinha) — a cada 1 minuto é rápido o bastante pra sentir como
  // instantâneo sem sobrecarregar a Saipos. Só admin (mesma
  // sensibilidade dos dados: log de auditoria e vendas por loja).
  const [notificacoes, setNotificacoes] = useState([]);
  const idsVendasCanceladasVistasRef = useRef(new Set());
  const primeiraChecadaFeitaRef = useRef(false);
  const ultimoLogVistoEmRef = useRef(null);

  function adicionarNotificacao(notificacao) {
    const id = `${Date.now()}-${Math.random()}`;
    setNotificacoes((anteriores) => [...anteriores, { ...notificacao, id }]);
    // Some sozinha depois de 20s, mas continua podendo fechar na mão antes.
    setTimeout(() => {
      setNotificacoes((anteriores) => anteriores.filter((item) => item.id !== id));
    }, 20000);
  }

  function fecharNotificacao(id) {
    setNotificacoes((anteriores) => anteriores.filter((item) => item.id !== id));
  }

  useEffect(() => {
    if (!ehAdministrador) return;

    async function verificarVendasCanceladas() {
      try {
        const vendas = await buscarVendasCanceladasHoje();

        vendas.forEach((venda) => {
          if (idsVendasCanceladasVistasRef.current.has(venda.id_sale)) return;
          idsVendasCanceladasVistasRef.current.add(venda.id_sale);

          // Na primeira checada do dia, só marca como "já visto" sem
          // notificar tudo de uma vez — senão toda vez que a página
          // carrega de manhã aparece uma enxurrada de avisos de
          // cancelamentos de ontem/hoje cedo que já foram vistos.
          if (!primeiraChecadaFeitaRef.current) return;

          adicionarNotificacao({
            titulo: "🚫 Venda cancelada",
            mensagem: `${venda.loja_nome} — ${formatarMoeda(venda.valor)} (${venda.canal})`,
            cor: "#ff3545",
          });
        });

        primeiraChecadaFeitaRef.current = true;
      } catch (erro) {
        console.error("Erro ao verificar vendas canceladas:", erro);
      }
    }

    async function verificarLogAuditoria() {
      try {
        const registros = await buscarLogAuditoria();
        const exclusoesLancamento = registros.filter(
          (item) => item.acao === "excluiu" && item.tabela_afetada === "lancamentos"
        );

        if (ultimoLogVistoEmRef.current == null) {
          // Primeira checada: só marca o mais recente como referência,
          // não notifica exclusões antigas de antes de abrir a tela.
          ultimoLogVistoEmRef.current =
            exclusoesLancamento[0]?.criado_em || new Date(0).toISOString();
          return;
        }

        const novos = exclusoesLancamento.filter(
          (item) => item.criado_em > ultimoLogVistoEmRef.current
        );

        novos.forEach((item) => {
          adicionarNotificacao({
            titulo: "🗑️ Lançamento excluído",
            mensagem: `${item.usuario_nome || "Alguém"} excluiu: ${item.detalhes || "sem detalhes"}`,
            cor: "#ff9800",
          });
        });

        if (exclusoesLancamento[0]) {
          ultimoLogVistoEmRef.current = exclusoesLancamento[0].criado_em;
        }
      } catch (erro) {
        console.error("Erro ao verificar log de auditoria:", erro);
      }
    }

    verificarVendasCanceladas();
    verificarLogAuditoria();
    const intervaloNotificacoes = setInterval(() => {
      verificarVendasCanceladas();
      verificarLogAuditoria();
    }, 60 * 1000);

    return () => clearInterval(intervaloNotificacoes);
  }, [ehAdministrador]);

  // Retiradas de Sócios (20/08/2026) — só admin, mesma regra da rota no
  // backend (verificarAdmin).
  useEffect(() => {
    if (!ehAdministrador) {
      setCarregandoRetiradasSocios(false);
      return;
    }

    async function carregarRetiradasSocios() {
      try {
        setCarregandoRetiradasSocios(true);
        const dados = await buscarRetiradasSocios();
        setRetiradasSocios(Array.isArray(dados) ? dados : []);
      } catch (erro) {
        console.error("Erro ao carregar retiradas de sócios:", erro);
      } finally {
        setCarregandoRetiradasSocios(false);
      }
    }

    carregarRetiradasSocios();
  }, [ehAdministrador]);

  async function adicionarRetiradaSocioHandler(dados) {
    const criada = await criarRetiradaSocio(dados);
    setRetiradasSocios((anteriores) => [criada, ...anteriores]);
  }

  async function removerRetiradaSocioHandler(id) {
    await excluirRetiradaSocio(id);
    setRetiradasSocios((anteriores) =>
      anteriores.filter((item) => item.id !== id)
    );
  }

  // Empréstimo entre Lojas (21/08/2026) — só admin gerencia.
  useEffect(() => {
    if (!ehAdministrador) {
      setCarregandoEmprestimosEntreLojas(false);
      return;
    }

    async function carregarEmprestimosEntreLojas() {
      try {
        setCarregandoEmprestimosEntreLojas(true);
        const dados = await buscarEmprestimosEntreLojas();
        setEmprestimosEntreLojas(Array.isArray(dados) ? dados : []);
      } catch (erro) {
        console.error("Erro ao carregar empréstimos entre lojas:", erro);
      } finally {
        setCarregandoEmprestimosEntreLojas(false);
      }
    }

    carregarEmprestimosEntreLojas();
  }, [ehAdministrador]);

  async function adicionarEmprestimoEntreLojasHandler(dados) {
    const criado = await criarEmprestimoEntreLojas(dados);
    setEmprestimosEntreLojas((anteriores) => [criado, ...anteriores]);
    buscarResumoEmprestimosEntreLojas()
      .then((dados) => setResumoEmprestimosEntreLojas(Array.isArray(dados) ? dados : []))
      .catch(() => {});
  }

  async function registrarPagamentoEmprestimoHandler(id, dados) {
    const atualizado = await registrarPagamentoEmprestimo(id, dados);
    setEmprestimosEntreLojas((anteriores) =>
      anteriores.map((item) => (item.id === id ? atualizado : item))
    );
    buscarResumoEmprestimosEntreLojas()
      .then((dados) => setResumoEmprestimosEntreLojas(Array.isArray(dados) ? dados : []))
      .catch(() => {});
  }

  async function removerEmprestimoEntreLojasHandler(id) {
    await excluirEmprestimoEntreLojas(id);
    setEmprestimosEntreLojas((anteriores) =>
      anteriores.filter((item) => item.id !== id)
    );
    buscarResumoEmprestimosEntreLojas()
      .then((dados) => setResumoEmprestimosEntreLojas(Array.isArray(dados) ? dados : []))
      .catch(() => {});
  }

  async function removerItemWhatsappFilaHandler(id) {
    await removerItemWhatsappFila(id);
    setWhatsappFila((anteriores) => anteriores.filter((item) => item.id !== id));
  }

  async function criarDespesaDoWhatsapp(dados) {
    const salvo = await criarLancamento(dados);
    setLancamentos((anteriores) => [salvo, ...anteriores]);
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

// Pedido do usuário: toda despesa lançada já é dinheiro que saiu (pago) —
// aparece listada também em "Contas Pagas" (só nessa aba, nunca em "Contas
// a Pagar"), sem duplicar nada no banco — é a mesma despesa, só mostrada
// junto.
const despesasParaContasPagas = useMemo(() => {
  return lancamentosAprovados.filter((item) => item.tipo === "despesa");
}, [lancamentosAprovados]);

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

// Pedido do usuário (21/08/2026): trocado de "variação acumulada desde a
// data-base" (podia ficar negativo, confuso — não existe dinheiro
// negativo de verdade numa gaveta) pro "fundo de caixa" real: o valor
// "Em caixa" do ÚLTIMO fechamento de Dinheiro confirmado de cada loja —
// já contado de verdade, já líquido de qualquer retirada/pagamento em
// dinheiro daquele turno (diária, boy, etc). Com "Todas as lojas", soma
// o último fundo de caixa de CADA loja (nunca a variação de uma
// misturada com o valor absoluto de outra).
const dinheiroEmCaixaFiltrado = useMemo(() => {
  const registrosFiltrados = registrosDinheiroInformado.filter(
    (registro) =>
      lojaDashboard === "todas" ||
      String(registro.loja_id || "") === String(lojaDashboard)
  );

  if (lojaDashboard === "todas") {
    const maisRecentePorLoja = new Map();

    registrosFiltrados.forEach((registro) => {
      const chave = String(registro.loja_id || "");
      const atual = maisRecentePorLoja.get(chave);

      if (!atual || registro.criado_em > atual.criado_em) {
        maisRecentePorLoja.set(chave, registro);
      }
    });

    return Array.from(maisRecentePorLoja.values()).reduce(
      (total, registro) => total + Number(registro.em_caixa || 0),
      0
    );
  }

  const maisRecente = registrosFiltrados.reduce((atual, registro) => {
    if (!atual || registro.criado_em > atual.criado_em) return registro;
    return atual;
  }, null);

  return maisRecente ? Number(maisRecente.em_caixa || 0) : 0;
}, [registrosDinheiroInformado, lojaDashboard]);

// Pedido do usuário (22/08/2026): saldo disponível do Fundo de
// Retirada de Caixa (retirada genérica ainda não gasta) — soma
// (valor - valor_usado) de todos os fundos "aberto" da loja
// selecionada (ou de todas, se "Todas as lojas").
// Pedido do usuário (23/08/2026): só conta como Cofre de verdade o que
// veio pelo botão dedicado "🔒 Retirada pro Cofre" (conta_para_cofre =
// true) — retiradas genéricas detectadas automaticamente (ou lançadas
// pela Conciliação sem esse botão) continuam existindo como Fundo
// disponível pra pagar despesa, só não somam mais nesse card.
const fundoRetiradaDisponivel = useMemo(() => {
  return fundosRetiradas
    .filter(
      (fundo) =>
        fundo.status === "aberto" &&
        fundo.conta_para_cofre !== false &&
        (lojaDashboard === "todas" ||
          String(fundo.loja_id || "") === String(lojaDashboard))
    )
    .reduce(
      (total, fundo) =>
        total + Number(fundo.valor || 0) - Number(fundo.valor_usado || 0),
      0
    );
}, [fundosRetiradas, lojaDashboard]);

// Pedido do usuário (21/08/2026): antes era um botão manual dentro da
// Conciliação ("conferirAberturaVsFechamentoAnterior") — só avisava se
// alguém lembrasse de clicar. Agora é automático, igual o aviso de
// "Contas a pagar precisando de atenção": compara sozinho, pra TODAS
// as lojas, a Abertura do fechamento mais recente com o "Em caixa" do
// fechamento anterior — se não bater, é sinal de que alguém mexeu no
// dinheiro do caixa entre os dois turnos sem registrar.
const divergenciasAberturaFechamento = useMemo(() => {
  const porLoja = new Map();

  registrosDinheiroInformado
    .filter((registro) => registro.fechamento_id != null) // só fechamento de verdade (lido de foto), não ajuste manual
    .forEach((registro) => {
      const chave = String(registro.loja_id || "");
      if (!porLoja.has(chave)) porLoja.set(chave, []);
      porLoja.get(chave).push(registro);
    });

  const divergencias = [];

  porLoja.forEach((registros, lojaIdChave) => {
    if (registros.length < 2) return;

    const ordenados = [...registros].sort(
      (a, b) => new Date(a.criado_em) - new Date(b.criado_em)
    );
    const maisRecente = ordenados[ordenados.length - 1];
    const anterior = ordenados[ordenados.length - 2];

    const aberturaMaisRecente = Number(maisRecente.abertura || 0);
    const fechamentoAnterior = Number(anterior.em_caixa || 0);
    const diferenca = Number(
      (aberturaMaisRecente - fechamentoAnterior).toFixed(2)
    );

    if (Math.abs(diferenca) > 0.02) {
      divergencias.push({
        // Pedido do usuário (22/08/2026): usa o próprio ID do fechamento
        // como chave — assim, se a mesma divergência aparecer nas
        // checagens seguintes (nada mudou), o "fechado" continua
        // fechado; some sozinho da lista só quando um NOVO fechamento
        // realmente muda o cálculo.
        chave: `${lojaIdChave}-${maisRecente.id}`,
        loja_id: lojaIdChave,
        loja_nome: lojas.find((loja) => String(loja.id) === lojaIdChave)?.nome || "Loja",
        diferenca,
        aberturaMaisRecente,
        fechamentoAnterior,
        // Data de abertura desse turno, pra identificar QUAL caixa é —
        // sem isso não dava pra saber a qual fechamento a divergência
        // se referia.
        criadoEm: maisRecente.criado_em,
      });
    }
  });

  return divergencias;
}, [registrosDinheiroInformado, lojas]);

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

    // Pedido do usuário (21/08/2026): esse indicador não é mais uma
    // variação acumulada desde uma data-base (podia dar negativo, o que
    // não existe de verdade numa gaveta de dinheiro) — agora é o "Fundo
    // de Caixa" real, o valor "Em caixa" do ÚLTIMO fechamento de Dinheiro
    // confirmado (dinheiroEmCaixaFiltrado, calculado mais acima). Esse
    // "Em caixa" já é o valor CONTADO DE VERDADE na Conciliação, já
    // líquido de qualquer retirada/pagamento em dinheiro daquele turno
    // (diária, boy, fornecedor, etc — tudo que aparece impresso em
    // "Retiradas" no comprovante Saipos já saiu dali antes da contagem) —
    // por isso não desconta despesa nenhuma aqui de novo, senão duplica o
    // desconto que a própria contagem já fez.
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

    // Pedido do usuário (18/08/2026): o saldo real da conta hoje é
    // R$ 106.430,13 — esse é o ponto de partida fixo do card "Saldo" do
    // Dashboard a partir de agora. Diferente do resto do card (que
    // recalcula tudo com base só no mês/loja escolhidos no filtro), o
    // Saldo soma/desconta automaticamente TODO lançamento (receita
    // recebida entra, despesa sai) com data DEPOIS de hoje, sem filtrar
    // por mês nem por loja — é o saldo real da empresa, não um recorte.
    // Lançamentos antigos (antes de hoje) não entram nessa conta porque
    // já estão embutidos no valor de R$ 106.430,13 informado.
    //
    // BUG encontrado e corrigido (19/08/2026): uma venda de cartão/iFood
    // feita ANTES da data-base (ex.: vendida dia 15/08) mas cujo dinheiro
    // só cai DEPOIS (ex.: prevista pra 19/08) nunca entrava no Saldo —
    // ficava só em "Próximos Recebimentos" até vencer, e quando vencia
    // (deixava de estar pendente) já tinha sumido de lá SEM nunca ter
    // somado aqui, porque o filtro olhava a data da VENDA (sempre antes da
    // base), não a data que o dinheiro CAI de verdade. Por isso o "a
    // receber" some da lista mas o Saldo não sobe. Corrigido usando a data
    // EFETIVA de recebimento (data_prevista_recebimento — ou a própria
    // data da venda, pras formas sem prazo) como referência.
    const dataEfetivaRecebimento = (item) =>
      item.data_prevista_recebimento || item.data;

    // Pedido do usuário (19/08/2026): Sinop, Sorriso e Rondonópolis ainda
    // não têm nenhuma movimentação própria — selecionar uma delas tem que
    // mostrar Saldo zerado, não o saldo da Uberlândia. O Saldo agora
    // respeita o filtro de loja do topo, igual todo o resto do Dashboard
    // (só "Todas as lojas" soma tudo junto).
    const lojaCombinaComSaldo = (item) =>
      lojaDashboard === "todas" ||
      String(item.loja_id || "") === String(lojaDashboard);

    const receitasRecebidasDesdeAjusteSaldo = lancamentosAprovados
      .filter(
        (item) =>
          item.tipo === "receita" &&
          lojaCombinaComSaldo(item) &&
          dataEfetivaRecebimento(item) > SALDO_INICIAL_DATA
      )
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

    // Mesma coisa, mas em valor bruto (sem descontar taxa de cartão/iFood/
    // etc.) — só pra mostrar "Bruto R$ X — Taxas R$ Y" embaixo do valor
    // principal do card. Tem que usar a mesma base (desde 18/08/2026), senão
    // esse detalhe mostra um número de outro período, sem nenhuma relação
    // com o Saldo de cima.
    const receitasRecebidasBrutoDesdeAjusteSaldo = lancamentosAprovados
      .filter(
        (item) =>
          item.tipo === "receita" &&
          lojaCombinaComSaldo(item) &&
          dataEfetivaRecebimento(item) > SALDO_INICIAL_DATA
      )
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

    const despesasDesdeAjusteSaldo = lancamentosAprovados
      .filter(
        (item) =>
          item.tipo === "despesa" &&
          lojaCombinaComSaldo(item) &&
          item.data > SALDO_INICIAL_DATA
      )
      .reduce((total, item) => {
        // Pedido do usuário (22/08/2026): despesa paga com o Cofre
        // (fundo de retirada) NUNCA desconta o Saldo geral na parte
        // que veio de lá — o dinheiro já tinha saído do caixa antes
        // (retirada) e ficou guardado. Pode ser PARCIAL: só a parte
        // que sobrou (valor − valor_pago_cofre) desconta o Saldo,
        // igual sempre. O backend só permite valor_pago_cofre até o
        // que o Cofre realmente tinha disponível — então subtrair
        // aqui é sempre seguro (nunca fica negativo).
        const valorQueDescontaSaldo =
          Number(item.valor || 0) - Number(item.valor_pago_cofre || 0);

        return total + valorQueDescontaSaldo;
      }, 0);

    // Pedido do usuário (20/08/2026): retirada de dinheiro pros sócios
    // também dá baixa no Saldo, igual uma despesa — só que não aparece
    // em Despesas/Contas Pagas (tabela própria, tela só-admin). Usa o
    // "resumo" (sem nome do sócio) pra funcionar igual pra QUALQUER
    // usuário que vê o Saldo, não só admin.
    const retiradasSociosDesdeAjusteSaldo = resumoRetiradasSocios
      .filter(
        (item) => lojaCombinaComSaldo(item) && item.data > SALDO_INICIAL_DATA
      )
      .reduce((total, item) => total + Number(item.valor || 0), 0);

    // Pedido do usuário (21/08/2026): Empréstimo entre Lojas — a loja
    // credora (emprestou) desconta do Saldo o quanto ainda não recebeu
    // de volta; a devedora (pegou emprestado) aumenta o Saldo pelo
    // mesmo tanto (recebeu ajuda, ainda não é despesa própria dela até
    // pagar de volta). Com "Todas as lojas", as duas pontas se cancelam
    // — dinheiro só mudou de loja, não sumiu nem apareceu do nada.
    const emprestimosEntreLojasAjusteSaldo = resumoEmprestimosEntreLojas
      .filter((item) => item.data > SALDO_INICIAL_DATA)
      .reduce((total, item) => {
        const dividaRestante = Number(
          (Number(item.valor || 0) - Number(item.valor_pago || 0)).toFixed(2)
        );
        let ajuste = 0;

        if (
          lojaDashboard === "todas" ||
          String(item.loja_devedora_id) === String(lojaDashboard)
        ) {
          ajuste += dividaRestante;
        }

        if (
          lojaDashboard === "todas" ||
          String(item.loja_credora_id) === String(lojaDashboard)
        ) {
          ajuste -= dividaRestante;
        }

        return total + ajuste;
      }, 0);

    // Base de R$106.430,13 só entra quando "Todas as lojas" ou a própria
    // Uberlândia estiver selecionada — outra loja específica começa do
    // zero (não tem esse dinheiro).
    const baseSaldoAplicavel =
      lojaDashboard === "todas" || lojaDashboard === LOJA_INICIAL_ID
        ? SALDO_INICIAL_VALOR
        : 0;

    const saldo =
      baseSaldoAplicavel +
      receitasRecebidasDesdeAjusteSaldo -
      despesasDesdeAjusteSaldo -
      retiradasSociosDesdeAjusteSaldo +
      emprestimosEntreLojasAjusteSaldo;
    const saldoBruto =
      baseSaldoAplicavel +
      receitasRecebidasBrutoDesdeAjusteSaldo -
      despesasDesdeAjusteSaldo -
      retiradasSociosDesdeAjusteSaldo +
      emprestimosEntreLojasAjusteSaldo;
    const totalTaxas =
      receitasRecebidasBrutoDesdeAjusteSaldo -
      receitasRecebidasDesdeAjusteSaldo;
    // Percentual médio de taxa sobre o que já caiu (mistura cartão, iFood,
    // Brendi, etc. — cada um com sua própria taxa cadastrada) — usado só
    // pra mostrar "Taxa X%" ao lado do valor no card de Saldo.
    const percentualTaxas =
      receitasRecebidasBrutoDesdeAjusteSaldo > 0
        ? (totalTaxas / receitasRecebidasBrutoDesdeAjusteSaldo) * 100
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
      dinheiroEmCaixa: dinheiroEmCaixaFiltrado,
      fundoRetirada: fundoRetiradaDisponivel,
    };
  }, [
    lancamentosDashboard,
    lancamentosAprovados,
    dinheiroEmCaixaFiltrado,
    resumoRetiradasSocios,
    resumoEmprestimosEntreLojas,
    fundoRetiradaDisponivel,
  ]);

  // Pedido do usuário (21/08/2026): mesmo Ponto de Equilíbrio do
  // Relatório financeiro, só que aqui no Dashboard já filtrado pela loja
  // selecionada no topo (custo fixo/aluguel é por loja) — cálculo NOVO e
  // SEPARADO, só lê totais.cmvPercentual (já existente), não altera nada.
  const pontoDeEquilibrioDashboard = useMemo(() => {
    const custoFixoMensal = despesasRecorrentes
      .filter(
        (recorrente) =>
          recorrente.ativo !== false &&
          (lojaDashboard === "todas" ||
            !recorrente.loja_id ||
            String(recorrente.loja_id) === String(lojaDashboard))
      )
      .reduce((total, recorrente) => total + Number(recorrente.valor || 0), 0);

    const margemContribuicaoPercentual = 100 - totais.cmvPercentual;

    const faturamentoNecessario =
      margemContribuicaoPercentual > 0
        ? custoFixoMensal / (margemContribuicaoPercentual / 100)
        : null;

    return {
      custoFixoMensal,
      margemContribuicaoPercentual,
      faturamentoNecessario,
    };
  }, [despesasRecorrentes, lojaDashboard, totais.cmvPercentual]);

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

const [dataBuscaDespesa, setDataBuscaDespesa] = useState("");

const lancamentosFiltrados = useMemo(() => {
  if (pagina === "receitas") {
    return lancamentosVisiveis.filter((item) => item.tipo === "receita");
  }

  if (pagina === "despesas") {
    // Pedido do usuário: por padrão só mostra as despesas de hoje — pra
    // ver dias anteriores, pesquisa pela data no campo da própria tela
    // (senão a lista cresce pra sempre com o tempo).
    const dataAlvo = dataBuscaDespesa || hojeLocal();

    return lancamentosVisiveis.filter(
      (item) => item.tipo === "despesa" && item.data === dataAlvo
    );
  }

  return lancamentosVisiveis;
}, [lancamentosVisiveis, pagina, dataBuscaDespesa]);

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

// Pedido do usuário (21/08/2026): Ponto de Equilíbrio — quanto a empresa
// precisa faturar por mês só pra cobrir custo fixo + custo variável, sem
// lucro nem prejuízo. Cálculo NOVO e SEPARADO — não lê nem altera nada
// de totaisRelatorio/totais/saldo já existente, só empresta o
// cmvPercentual já calculado ali (leitura, sem mexer). Fórmula clássica:
// Ponto de Equilíbrio = Custo Fixo / Margem de Contribuição.
// - Custo Fixo Mensal = soma das Despesas Recorrentes ativas (aluguel,
//   contabilidade, folha fixa, etc — o que já está cadastrado ali).
// - Margem de Contribuição = 100% − CMV% do período selecionado no
//   relatório (aproximação: quanto sobra de cada R$1 vendido depois do
//   custo direto do produto/insumo).
const pontoDeEquilibrio = useMemo(() => {
  const custoFixoMensal = despesasRecorrentes
    .filter((recorrente) => recorrente.ativo !== false)
    .reduce((total, recorrente) => total + Number(recorrente.valor || 0), 0);

  const margemContribuicaoPercentual = 100 - totaisRelatorio.cmvPercentual;

  const faturamentoNecessario =
    margemContribuicaoPercentual > 0
      ? custoFixoMensal / (margemContribuicaoPercentual / 100)
      : null;

  return {
    custoFixoMensal,
    margemContribuicaoPercentual,
    faturamentoNecessario,
  };
}, [despesasRecorrentes, totaisRelatorio.cmvPercentual]);

  
   

  // Pedido do usuário (14/08/2026): previsão de DAS (Simples Nacional) só
  // pra loja de Uberlândia — é a única com CNPJ próprio hoje (as outras 3
  // são matriz/filiais de outro CNPJ, cálculo diferente que não fazemos
  // aqui ainda). Anexo I (Comércio), confirmado pelo usuário. Tabela
  // oficial vigente desde a LC 155/2016 (Jan/2018), sem mudança até
  // 2026 — se a Receita reajustar as faixas/alíquotas no futuro, essa
  // tabela precisa ser atualizada à mão.
  const LOJA_ID_UBERLANDIA = 4;
  const TABELA_SIMPLES_ANEXO_I = [
    { ate: 180000, aliquota: 0.04, deduzir: 0 },
    { ate: 360000, aliquota: 0.073, deduzir: 5940 },
    { ate: 720000, aliquota: 0.095, deduzir: 13860 },
    { ate: 1800000, aliquota: 0.107, deduzir: 22500 },
    { ate: 3600000, aliquota: 0.143, deduzir: 87300 },
    { ate: 4800000, aliquota: 0.19, deduzir: 378000 },
  ];

  const [mesImpostoSelecionado, setMesImpostoSelecionado] = useState(
    hoje.slice(0, 7)
  );

  const previsaoImpostoUberlandia = useMemo(() => {
    const [anoRef, mesRef] = mesImpostoSelecionado.split("-").map(Number);

    if (!anoRef || !mesRef) return null;

    // RBT12 = soma da receita bruta dos 12 MESES ANTERIORES ao mês
    // escolhido (não inclui o próprio mês) — é assim que a Receita
    // Federal define pra achar a alíquota efetiva (mesma regra do
    // PGDAS-D).
    function chaveMes(ano, mes) {
      return `${ano}-${String(mes).padStart(2, "0")}`;
    }

    const mesesRbt12 = [];
    let anoIter = anoRef;
    let mesIter = mesRef;

    for (let i = 0; i < 12; i++) {
      mesIter -= 1;
      if (mesIter === 0) {
        mesIter = 12;
        anoIter -= 1;
      }
      mesesRbt12.push(chaveMes(anoIter, mesIter));
    }

    const receitasUberlandia = lancamentos.filter(
      (item) =>
        item.tipo === "receita" &&
        String(item.loja_id) === String(LOJA_ID_UBERLANDIA) &&
        (item.status || "aprovado") === "aprovado"
    );

    const rbt12 = receitasUberlandia
      .filter((item) => mesesRbt12.includes((item.data || "").slice(0, 7)))
      .reduce((soma, item) => soma + Number(item.valor || 0), 0);

    const faturamentoDoMes = receitasUberlandia
      .filter(
        (item) => (item.data || "").slice(0, 7) === mesImpostoSelecionado
      )
      .reduce((soma, item) => soma + Number(item.valor || 0), 0);

    // RBT12 usa os últimos 12 meses ANTERIORES — se a loja tem menos de 12
    // meses de histórico no sistema, o cálculo abaixo já reflete isso (só
    // soma o que existir), o que pode SUBESTIMAR a faixa real se ela já
    // faturava antes de usar o FinancePro — aviso disso na tela.
    const faixa =
      TABELA_SIMPLES_ANEXO_I.find((linha) => rbt12 <= linha.ate) ||
      TABELA_SIMPLES_ANEXO_I[TABELA_SIMPLES_ANEXO_I.length - 1];

    const aliquotaEfetiva =
      rbt12 > 0
        ? Math.max(
            0,
            (rbt12 * faixa.aliquota - faixa.deduzir) / rbt12
          )
        : faixa.aliquota;

    const dasEstimado = faturamentoDoMes * aliquotaEfetiva;

    return {
      rbt12,
      faturamentoDoMes,
      faixa,
      aliquotaEfetiva,
      dasEstimado,
      mesesComDados: mesesRbt12.filter((mesChave) =>
        receitasUberlandia.some(
          (item) => (item.data || "").slice(0, 7) === mesChave
        )
      ).length,
    };
  }, [lancamentos, mesImpostoSelecionado]);

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
      item: lancamento.item || "",
      quantidade:
        lancamento.quantidade != null ? String(lancamento.quantidade) : "",
      unidade: lancamento.unidade || "kg",
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
      } else {
        // Fallback: fecha o modal de qualquer outra tela (Contas a Pagar,
        // Fechamento de Caixa, Nota Fiscal, etc.) — cada uma tem seu
        // próprio estado, mas todas usam o mesmo padrão de fechar ao
        // clicar fora (".modal-overlay" com onMouseDown). Simula esse
        // clique no overlay mais de cima, sem precisar duplicar estado
        // aqui pra cada tela nova que ganhar um modal no futuro.
        const overlays = document.querySelectorAll(".modal-overlay");
        const ultimoOverlay = overlays[overlays.length - 1];

        ultimoOverlay?.dispatchEvent(
          new MouseEvent("mousedown", { bubbles: true })
        );
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

      // Pedido do usuário (23/08/2026): quando a nota lida for de compra
      // de insumo (a IA já separou os itens), casa cada um com o Estoque
      // e preenche o custo unitário sozinho — só quem ainda estiver
      // R$0,00. Silencioso quando não tem nada a fazer (nota comum, sem
      // itens); só avisa quando de fato mexeu em algum custo.
      if (resultado.itens?.length > 0 && formulario.loja_id) {
        try {
          const resumo = await atualizarCustosPorCompra(
            formulario.loja_id,
            resultado.itens
          );

          if (resumo.atualizados?.length > 0) {
            setInsumos((anteriores) =>
              anteriores.map((insumo) => {
                const achado = resumo.atualizados.find(
                  (a) => a.nome === insumo.nome
                );
                return achado
                  ? { ...insumo, custo_unitario: achado.custo_unitario }
                  : insumo;
              })
            );

            alert(
              `Custo unitário preenchido automaticamente pra ${resumo.atualizados.length} insumo(s): ${resumo.atualizados
                .map((a) => `${a.nome} (R$${a.custo_unitario.toFixed(2)})`)
                .join(", ")}.` +
                (resumo.nao_encontrados?.length
                  ? `\n\nNão encontrei no Estoque: ${resumo.nao_encontrados.join(", ")} — cadastre esses insumos se quiser que a próxima nota já reconheça.`
                  : "")
            );
          }
        } catch (erroCusto) {
          console.error("Erro ao atualizar custos por compra:", erroCusto);
        }
      }
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
      item: tipoLancamento === "despesa" ? formulario.item.trim() : "",
      quantidade:
        tipoLancamento === "despesa" && formulario.quantidade
          ? Number(String(formulario.quantidade).replace(",", "."))
          : null,
      unidade: tipoLancamento === "despesa" ? formulario.unidade : "",
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
      fundo_retirada_id:
        tipoLancamento === "despesa" && formulario.fundo_retirada_id
          ? formulario.fundo_retirada_id
          : null,
      valor_pago_cofre:
        tipoLancamento === "despesa" && formulario.fundo_retirada_id
          ? paraNumero(formulario.valor_pago_cofre)
          : 0,
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

      // Se a despesa foi paga com um Fundo de Retirada, o backend já
      // abateu de lá — busca o fundo de novo pra refletir o saldo
      // atualizado na tela.
      if (dados.fundo_retirada_id) {
        carregarFundosRetiradas();
      }

      fecharModal();

      if (salvo?.aguardando_aprovacao_foto) {
        alert(
          "Essa nota já tinha uma foto anexada, então a troca precisa ser autorizada pelo administrador. A foto antiga continua valendo até lá."
        );
      }
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

  // Pedido do usuário (18/08/2026): admin conseguir excluir, direto da
  // tela Contas Pagas, uma despesa que apareceu ali (ex: lançada
  // automática via WhatsApp) sem precisar ir até a tela Despesas. Mesma
  // exclusão de sempre — se o lançamento for de um mês já encerrado, o
  // backend rejeita e pede senha, então avisa em vez de travar calado.
  async function removerDespesaDeContasPagas(id) {
    try {
      const resultado = await excluirLancamento(id);

      if (resultado?.pendente) {
        setLancamentos((anteriores) =>
          anteriores.map((item) => (item.id === id ? resultado.lancamento : item))
        );
        alert(resultado.mensagem);
        return;
      }

      setLancamentos((anteriores) => anteriores.filter((item) => item.id !== id));
    } catch (erro) {
      alert(
        erro.message ||
          "Não foi possível excluir — se for de um mês já encerrado, exclua pela tela Despesas (pede sua senha)."
      );
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
      const resultado = await excluirLancamento(
        id,
        senhaExclusaoMesEncerrado || undefined
      );

      if (resultado?.pendente) {
        setLancamentos((anteriores) =>
          anteriores.map((item) => (item.id === id ? resultado.lancamento : item))
        );
        alert(resultado.mensagem);
        return;
      }

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

  // Pedido do usuário (21/08/2026): aprovação de exclusão de lançamento.
  async function aprovarExclusaoLancamentoHandler(id) {
    setProcessandoAprovacaoId(id);

    try {
      await aprovarExclusaoLancamento(id);
      setLancamentos((anteriores) => anteriores.filter((item) => item.id !== id));
    } catch (erro) {
      alert(erro.message || "Não foi possível aprovar a exclusão.");
    } finally {
      setProcessandoAprovacaoId(null);
    }
  }

  async function rejeitarExclusaoLancamentoHandler(id) {
    setProcessandoAprovacaoId(id);

    try {
      const atualizado = await rejeitarExclusaoLancamento(id);
      setLancamentos((anteriores) =>
        anteriores.map((item) => (item.id === id ? atualizado : item))
      );
    } catch (erro) {
      alert(erro.message || "Não foi possível rejeitar a exclusão.");
    } finally {
      setProcessandoAprovacaoId(null);
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

  async function verTrocaFoto(item) {
    setCarregandoTrocaFotoId(item.id);

    try {
      const resultado = await buscarFotoLancamento(item.id);

      setTrocaFotoVisualizada({
        id: item.id,
        descricao: item.descricao,
        fotoAtual: resultado?.foto || "",
        fotoPendente: resultado?.foto_pendente || "",
      });
    } catch (erro) {
      console.error("Erro ao buscar troca de foto:", erro);
      alert(erro.message || "Não foi possível carregar a troca de foto.");
    } finally {
      setCarregandoTrocaFotoId(null);
    }
  }

  async function aprovarTrocaFotoHandler(id) {
    setProcessandoTrocaFotoId(id);

    try {
      const atualizado = await aprovarTrocaFoto(id);

      setLancamentos((anteriores) =>
        anteriores.map((item) => (item.id === id ? atualizado : item))
      );
      setTrocaFotoVisualizada(null);
    } catch (erro) {
      console.error("Erro ao aprovar troca de foto:", erro);
      alert(erro.message || "Não foi possível aprovar a troca de foto.");
    } finally {
      setProcessandoTrocaFotoId(null);
    }
  }

  async function rejeitarTrocaFotoHandler(id) {
    setProcessandoTrocaFotoId(id);

    try {
      const atualizado = await rejeitarTrocaFoto(id);

      setLancamentos((anteriores) =>
        anteriores.map((item) => (item.id === id ? atualizado : item))
      );
      setTrocaFotoVisualizada(null);
    } catch (erro) {
      console.error("Erro ao rejeitar troca de foto:", erro);
      alert(erro.message || "Não foi possível rejeitar a troca de foto.");
    } finally {
      setProcessandoTrocaFotoId(null);
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

  // Pedido do usuário (23/08/2026): lê uma nota de compra na tela de
  // Estoque (foto não fica salva em lugar nenhum) e preenche o custo
  // unitário dos insumos que baterem pelo nome — só quem ainda estiver
  // R$0,00. Wrapper porque CadastroInsumos.jsx não tem acesso direto ao
  // setInsumos pra refletir o resultado na lista sem precisar recarregar.
  async function atualizarCustosPorCompraHandler(lojaId, itens) {
    const resumo = await atualizarCustosPorCompra(lojaId, itens);

    if (resumo.atualizados?.length > 0) {
      setInsumos((anteriores) =>
        anteriores.map((insumo) => {
          const achado = resumo.atualizados.find((a) => a.nome === insumo.nome);
          return achado
            ? { ...insumo, custo_unitario: achado.custo_unitario }
            : insumo;
        })
      );
    }

    return resumo;
  }

  // Pedido do usuário (23/08/2026): insumo feito na casa (ex: maionese)
  // — custo unitário calculado por receita (outros insumos + rendimento)
  // em vez de digitado. Wrapper igual acima, só pra refletir o
  // custo_unitario/rendimento recalculados na lista local sem recarregar.
  async function salvarReceitaInsumoHandler(id, rendimento, itens) {
    const salvo = await salvarReceitaInsumo(id, rendimento, itens);

    setInsumos((anteriores) =>
      anteriores.map((item) => (item.id === id ? salvo : item))
    );

    return salvo;
  }

  async function recalcularReceitaInsumoHandler(id) {
    const resultado = await recalcularReceitaInsumo(id);

    setInsumos((anteriores) =>
      anteriores.map((item) =>
        item.id === id
          ? { ...item, custo_unitario: resultado.custo_unitario }
          : item
      )
    );

    return resultado;
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

  async function pagarContaPagar(id, lojaCredoraId, dataPagamento) {
    const salva = await marcarContaPagarComoPaga(id, lojaCredoraId, dataPagamento);
    setContasPagar((anteriores) =>
      anteriores.map((item) => (item.id === id ? salva : item))
    );

    // Se foi paga com saldo de outra loja, o backend já criou o
    // Empréstimo entre Lojas vinculado — busca o resumo de novo pra
    // refletir no Saldo na hora, sem precisar recarregar a página.
    if (lojaCredoraId) {
      buscarResumoEmprestimosEntreLojas()
        .then((dados) => setResumoEmprestimosEntreLojas(Array.isArray(dados) ? dados : []))
        .catch(() => {});
    }
  }

  // Pedido do usuário (24/08/2026): editar a data de um pagamento já
  // confirmado, direto na tela — antes só dava pra corrigir no banco.
  async function editarDataPagamento(id, dataPagamento) {
    const salva = await editarDataPagamentoContaPagar(id, dataPagamento);
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

  async function corrigirValorFechamentoCaixaHandler(id, valor) {
    const salvo = await corrigirValorFechamentoCaixa(id, valor);

    setFechamentosCaixa((anteriores) =>
      anteriores.map((item) => (item.id === id ? salvo : item))
    );
  }

  // Pedido do usuário (23/08/2026): botão "Retirada pro Cofre" direto no
  // Fechamento de Caixa — tira/anexa foto do comprovante, confirma o
  // valor lido (mesmo fluxo já usado pra Diária Boy/Cozinha) e cria um
  // Fundo de Retirada de verdade (não é só arquivo/exibição como os
  // outros tipos — esse realmente entra no saldo do Cofre).
  async function adicionarFundoRetiradaCaixaHandler(dados) {
    const salvo = await criarFundoRetiradaCaixa(dados);

    setFundosRetiradas((anteriores) => [salvo, ...anteriores]);
  }

  async function trocarFotoFechamentoCaixaHandler(id, foto) {
    await trocarFotoFechamentoCaixa(id, foto);

    // A foto mudou — a leitura salva anteriormente não vale mais (mesma
    // regra do backend), senão a conciliação usaria o valor da foto antiga.
    setFechamentosCaixa((anteriores) =>
      anteriores.map((item) =>
        item.id === id ? { ...item, valores_informados: null } : item
      )
    );
  }

  async function finalizarFechamentoCaixaHandler() {
    const salvo = await finalizarFechamentoCaixa();

    setFinalizacoesFechamentoCaixa((anteriores) => [salvo, ...anteriores]);

    const contasCriadas = salvo?.contas_pagar_criadas || 0;
    const despesasCriadas = salvo?.despesas_dinheiro_criadas || 0;

    if (contasCriadas > 0) {
      const dadosContasPagar = await buscarContasPagar().catch(() => null);

      if (dadosContasPagar) {
        setContasPagar(dadosContasPagar);
      }
    }

    if (despesasCriadas > 0) {
      const dadosLancamentos = await buscarLancamentos().catch(() => null);

      if (dadosLancamentos) {
        setLancamentos(dadosLancamentos);
      }
    }

    if (contasCriadas > 0 || despesasCriadas > 0) {
      const partes = [];

      if (despesasCriadas > 0) {
        partes.push(
          `${despesasCriadas} despesa(s) lançada(s) já como paga (parte em dinheiro, deu baixa no saldo)`
        );
      }

      if (contasCriadas > 0) {
        partes.push(
          `${contasCriadas} conta(s) a pagar criada(s) (o que ainda falta pagar)`
        );
      }

      alert(`Diárias processadas: ${partes.join(" e ")}.`);
    }

    // Pedido do usuário (25/08/2026): antes, se um item falhasse ao criar
    // a conta a pagar/despesa/receita (ex: instabilidade momentânea do
    // banco bem na hora do clique), a resposta dizia "sucesso" mesmo
    // assim — o registro ficava preso só no Fechamento de Caixa, sem
    // ninguém saber (foi o que aconteceu com uma Diária Boy e uma Janta).
    // Agora, se sobrar alguma falha, avisa explicitamente quais registros
    // precisam de atenção manual (usar "Ler foto de novo" ou me chamar).
    if (salvo?.falhas?.length > 0) {
      const lista = salvo.falhas
        .map(
          (falha) =>
            `#${falha.registro} (${falha.tipo}, R$ ${Number(falha.valor).toFixed(2)})`
        )
        .join(", ");

      alert(
        `⚠️ ${salvo.falhas.length} registro(s) NÃO foram lançados por um erro momentâneo: ${lista}. Confira Contas a Pagar/Receber — se não aparecerem lá, avise pra corrigir manualmente.`
      );
    }
  }

  // Pedido do usuário (16/08/2026): só admin, reabre o ÚLTIMO fechamento
  // de caixa finalizado — apaga a marca de "finalizado" (não mexe em
  // fotos/lançamentos), fazendo aqueles registros voltarem pra
  // "Fechamento em aberto", editáveis/excluíveis de novo. Usado quando um
  // lançamento saiu errado (ex: venda categorizada errado no PDV da
  // Saipos) e o operador precisa corrigir e fechar de novo.
  async function reabrirFechamentoCaixaHandler(id) {
    if (
      !window.confirm(
        "Reabrir esse fechamento de caixa pra correção? Ele volta pra 'Fechamento em aberto', editável de novo, até ser finalizado outra vez."
      )
    ) {
      return;
    }

    try {
      await reabrirFechamentoCaixa(id);

      setFinalizacoesFechamentoCaixa((anteriores) =>
        anteriores.filter((item) => item.id !== id)
      );
    } catch (erro) {
      alert(erro.message || "Não foi possível reabrir esse fechamento.");
    }
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

    // Pedido do usu\u00E1rio (14/08/2026): relat\u00F3rio pro contador tamb\u00E9m sai
    // com o resumo por categoria no final (Impostos, Fornecedores etc.),
    // n\u00E3o s\u00F3 a lista solta de lan\u00E7amentos.
    const linhasResumo = [
      [],
      ["RESUMO DO PER\u00CDODO"],
      ["Faturamento", Number(totaisRelatorio.receitas).toFixed(2).replace(".", ",")],
      ["Despesas", Number(totaisRelatorio.despesas).toFixed(2).replace(".", ",")],
      ["Resultado", Number(totaisRelatorio.saldo).toFixed(2).replace(".", ",")],
      [],
      ["DESPESAS POR CATEGORIA"],
      ...rankingCategoriasRelatorio.map((item) => [
        item.categoria,
        Number(item.valor).toFixed(2).replace(".", ","),
      ]),
    ];

    const csv = [
      cabecalho.map(escapar).join(";"),
      ...linhas.map((linha) => linha.map(escapar).join(";")),
      ...linhasResumo.map((linha) => linha.map(escapar).join(";")),
    ].join("\n");

    const arquivo = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(arquivo);
    const link = document.createElement("a");
    link.href = url;
    link.download = `relatorio-contador-${dataInicialRelatorio}-a-${dataFinalRelatorio}.csv`;
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

    // Pedido do usuário (14/08/2026): relatório pronto pra mandar pro
    // contador precisa mostrar despesas resumidas por categoria (é onde
    // aparecem Impostos, Fornecedores etc.), não só a lista solta de
    // lançamentos — facilita a vida de quem só quer o resumo do mês.
    documento.setFontSize(12);
    documento.setTextColor(20, 20, 20);
    documento.text("Despesas por categoria", 14, 58);

    autoTable(documento, {
      startY: 62,
      head: [["Categoria", "Valor", "% do total de despesas"]],
      body: rankingCategoriasRelatorio.map((item) => [
        item.categoria,
        formatarMoeda(item.valor),
        totaisRelatorio.despesas > 0
          ? `${((item.valor / totaisRelatorio.despesas) * 100).toFixed(1)}%`
          : "-",
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [239, 68, 68] },
    });

    const proximoY = documento.lastAutoTable.finalY + 8;

    documento.setFontSize(12);
    documento.text("Lançamentos do período", 14, proximoY);

    autoTable(documento, {
      startY: proximoY + 4,
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
      `relatorio-contador-${dataInicialRelatorio}-a-${dataFinalRelatorio}.pdf`
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
      <Notificacoes notificacoes={notificacoes} fechar={fecharNotificacao} />

      <aside className="sidebar">
        <div
          className={`brand${pagina === "dashboard" ? " active" : ""}`}
          role="button"
          tabIndex={0}
          style={{ cursor: "pointer" }}
          title="Ir para o Dashboard"
          onClick={() => {
            // Pedido do usuário (13/08/2026): clicar na marca sempre leva
            // pro Dashboard E recarrega a página (não só troca de aba) —
            // útil como um "botão de reset" rápido se algo ficar travado.
            window.location.href = window.location.pathname + "?pagina=dashboard";
          }}
          onKeyDown={(evento) => {
            if (evento.key === "Enter" || evento.key === " ") {
              window.location.href =
                window.location.pathname + "?pagina=dashboard";
            }
          }}
        >
          <div className="brand-icon">FP</div>
          <div>
            <strong>FinancePro</strong>
            <span>Gestão Financeira</span>
            {/* Pedido do usuário (24/08/2026): deixa explícito que clicar
                aqui abre o Dashboard, já que o botão dedicado saiu do
                menu. */}
            <span className="brand-dashboard-label">Dashboard</span>
          </div>
        </div>

        {/* Pedido do usuário (24/08/2026): "coloque em ordem alfabética a
            coluna da esquerda" — reordenado só visualmente (mesmos
            botões, mesmas condições de permissão, nada de comportamento
            mudou), pela letra inicial do texto visível (ignorando
            emoji). "Mais ▾" entra na posição de "M" como um item normal;
            os itens de DENTRO do submenu também foram alfabetizados
            entre si, separado do resto. */}
        <nav className="menu">
          {temPermissaoFechamento("conciliacao") && (
            <button
              className={pagina === "conciliacao" ? "active" : ""}
              onClick={() => setPagina("conciliacao")}
            >
              Conciliação
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

          {temPermissaoFinanceira("contas_pagar") && (
            <button
              className={pagina === "contas-pagas" ? "active" : ""}
              onClick={() => setPagina("contas-pagas")}
            >
              ✅ Contas Pagas
            </button>
          )}

          {/* Pedido do usuário (24/08/2026): removido daqui — o logo
              "FinancePro" no topo do menu já leva pro Dashboard (ver
              <div className="brand"> acima), ficava duplicado. Também
              resolve o Dashboard ter "caído" pra 5ª posição na ordenação
              alfabética. */}

          {temPermissaoFinanceira("despesas") && (
            <button
              className={pagina === "despesas" ? "active" : ""}
              onClick={() => setPagina("despesas")}
            >
              Despesas
            </button>
          )}

          {temPermissaoFinanceira("contas_pagar") && (
            <button
              className={pagina === "despesas-recorrentes" ? "active" : ""}
              onClick={() => setPagina("despesas-recorrentes")}
            >
              🔁 Despesas Recorrentes
            </button>
          )}

          {ehAdministrador && (
            <button
              className={pagina === "emprestimos-entre-lojas" ? "active" : ""}
              onClick={() => setPagina("emprestimos-entre-lojas")}
            >
              🔁 Empréstimo entre Lojas
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

          {(temPermissaoFinanceira("despesas") ||
            temPermissaoFinanceira("receitas")) && (
            <button
              className={pagina === "feed" ? "active" : ""}
              onClick={() => setPagina("feed")}
            >
              📢 Feed do Dia
            </button>
          )}

          {ehAdministrador && (
            <button
              className={pagina === "whatsapp-fila" ? "active" : ""}
              onClick={() => setPagina("whatsapp-fila")}
            >
              📲 Fila WhatsApp
              {whatsappFila.length > 0 ? ` (${whatsappFila.length})` : ""}
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

          {temPermissaoFinanceira("contas_pagar") && (
            <button
              className={pagina === "fornecedores" ? "active" : ""}
              onClick={() => setPagina("fornecedores")}
            >
              🏭 Fornecedores
            </button>
          )}

          {(temPermissaoFinanceira("categorias") ||
            temPermissao("clientes") ||
            temPermissao("estoque") ||
            temPermissaoFinanceira("despesas") ||
            ehAdministrador) && (
            <>
              <button
                className={menuMaisAberto ? "active" : ""}
                onClick={() => setMenuMaisAberto((anterior) => !anterior)}
              >
                ⚙️ Mais {menuMaisAberto ? "▲" : "▼"}
              </button>

              {menuMaisAberto && (
                <div style={{ paddingLeft: 16 }}>
                  {ehAdministrador && (
                    <button
                      className={pagina === "backup" ? "active" : ""}
                      onClick={() => setPagina("backup")}
                    >
                      💾 Backup
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

                  {temPermissaoFinanceira("despesas") && (
                    <button
                      className={pagina === "ficha-tecnica" ? "active" : ""}
                      onClick={() => setPagina("ficha-tecnica")}
                    >
                      📋 Ficha Técnica
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
                </div>
              )}
            </>
          )}

          {temPermissao("notas_fiscais") && (
            <button
              className={pagina === "notas-fiscais" ? "active" : ""}
              onClick={() => setPagina("notas-fiscais")}
            >
              Nota Fiscal
            </button>
          )}

          {temPermissaoFinanceira("receitas") && (
            <button
              className={pagina === "receitas" ? "active" : ""}
              onClick={() => setPagina("receitas")}
            >
              Receitas
            </button>
          )}

          {/* Pedido do usuário (20/08/2026): Relatórios agora tem as
              Retiradas de Sócios dentro (informação sensível) — a tela
              inteira passou a ser só-admin, não é mais liberada por
              permissão granular pra gerente/equipe. */}
          {ehAdministrador && (
            <button
              className={pagina === "relatorios" ? "active" : ""}
              onClick={() => setPagina("relatorios")}
            >
              Relatórios
            </button>
          )}

          {ehAdministrador && (
            <button
              className={pagina === "retiradas-socios" ? "active" : ""}
              onClick={() => setPagina("retiradas-socios")}
            >
              💸 Retiradas de Sócios
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
        </nav>

        {/* Pedido do usuário (24/08/2026): removido o botão de
            aprovação/menu — despesa nova de qualquer usuário já entra
            liberada de vez (aprovacao_despesas_ativa = false no banco).
            Se precisar religar no futuro, é direto no backend, sem
            precisar desse botão na tela. */}

        {/* Etiqueta de versão — pra confirmar com certeza qual versão do
        app está rodando num aparelho, em vez de ter que supor se é cache
        de navegador/PWA travado. */}
        <small
          style={{
            display: "block",
            textAlign: "center",
            color: "#5b6b82",
            fontSize: "10px",
            padding: "6px 0 2px",
          }}
        >
          v{typeof __COMMIT_SHA__ !== "undefined" ? __COMMIT_SHA__.slice(0, 7) : "dev"}
        </small>
      </aside>

      <main className="main-content">
  {temPermissaoFinanceira("contas_pagar") &&
    (() => {
      // BUG REAL corrigido (24/08/2026): usuário reparou que o aviso de
      // "Contas a pagar precisando de atenção" demora a aparecer — não é
      // atraso de verdade, é que ele só existe DEPOIS de contasPagar
      // terminar de carregar (antes disso a lista está vazia, o filtro
      // não acha nada e o aviso simplesmente não aparece ainda, sem
      // nenhuma pista de que ainda está carregando). Mostra um "..."
      // enquanto isso, pra não parecer que sumiu ou não existe.
      if (carregandoContasPagar) {
        return (
          <div className="alerta-contas-pagar" style={{ opacity: 0.6 }}>
            Carregando avisos de contas a pagar...
          </div>
        );
      }

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

  {temPermissaoFechamento("conciliacao") &&
    (() => {
      const divergenciasVisiveis = divergenciasAberturaFechamento.filter(
        (divergencia) => !divergenciasFechadas.has(divergencia.chave)
      );

      if (divergenciasVisiveis.length === 0) return null;

      return (
      <div className="alerta-contas-pagar" style={{ background: "rgba(239, 68, 68, 0.15)" }}>
        <strong>⚠️ Abertura de caixa não bate com o fechamento anterior:</strong>

        <ul>
          {divergenciasVisiveis.map((divergencia) => (
            <li
              key={divergencia.chave}
              style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
            >
              <span>
                {divergencia.loja_nome} — fechamento de{" "}
                {paraDataUtc(divergencia.criadoEm)?.toLocaleString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                }) || "data desconhecida"}
                : fechou com{" "}
                {formatarMoeda(divergencia.fechamentoAnterior)}, abriu com{" "}
                {formatarMoeda(divergencia.aberturaMaisRecente)} —{" "}
                {divergencia.diferenca > 0 ? "sobrou" : "faltou"}{" "}
                {formatarMoeda(Math.abs(divergencia.diferenca))}
              </span>

              <button
                type="button"
                onClick={() => fecharDivergencia(divergencia.chave)}
                title="Fechar esse aviso"
                style={{
                  background: "none",
                  border: "none",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 14,
                  padding: 0,
                }}
              >
                ✖️
              </button>
            </li>
          ))}
        </ul>
      </div>
      );
    })()}

  {ehAdministrador &&
    statusWhatsappBot &&
    statusWhatsappBot.ligado === false && (
      <div className="alerta-contas-pagar" style={{ background: "rgba(239, 68, 68, 0.15)" }}>
        <strong>
          🔴 Robô do WhatsApp parece desligado
          {statusWhatsappBot.minutos_desde_ultimo_sinal != null
            ? ` — sem sinal há ${Math.round(statusWhatsappBot.minutos_desde_ultimo_sinal)} minuto(s)`
            : " — nunca recebi sinal dele"}
          . Fotos e PDFs mandados no grupo não estão sendo processados.
        </strong>
      </div>
    )}

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
            : pagina === "ficha-tecnica"
            ? "Ficha Técnica"
            : "FinancePro"}
        </h1>

        <p>
          {pagina === "conciliacao"
            ? "Conciliação de pagamentos"
            : "Gestão financeira profissional e centralizada."}
        </p>
      </div>

      <div className="topbar-actions">
        {pagina !== "vendas-saipos" && (
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
      pontoDeEquilibrio={pontoDeEquilibrioDashboard}
      carregando={carregando}
    />
  )}
  

        {(pagina === "receitas" || pagina === "despesas") && (
          <section className="panel">
            <h2>Lançamentos</h2>

            {pagina === "despesas" && (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  gap: "1rem",
                  flexWrap: "wrap",
                  marginBottom: "12px",
                }}
              >
                <label style={{ margin: 0 }}>
                  Ver despesas do dia
                  <input
                    type="date"
                    value={dataBuscaDespesa || hojeLocal()}
                    onChange={(evento) =>
                      setDataBuscaDespesa(evento.target.value)
                    }
                  />
                </label>

                {dataBuscaDespesa && dataBuscaDespesa !== hojeLocal() && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setDataBuscaDespesa("")}
                  >
                    Voltar pra hoje
                  </button>
                )}

                <small className="foto-ajuda">
                  Só mostra o dia de hoje por padrão — escolha outra data
                  pra ver despesas de dias anteriores.
                </small>
              </div>
            )}

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
                      {/* Pedido do usuário (22/08/2026): rastro visível de
                          se uma despesa foi paga com o Cofre (não desconta
                          o Saldo geral) ou não (desconta o Saldo normal) —
                          "tudo que envolva dinheiro tem que ser
                          rastreável". */}
                      {item.tipo === "despesa" && item.fundo_retirada_id && (
                        <span
                          className="badge-status badge-status-pendente"
                          title={
                            Number(item.valor_pago_cofre || 0) >= Number(item.valor || 0) - 0.01
                              ? "Pago inteiro com dinheiro do Cofre — não descontou o Saldo geral"
                              : `Pago parcial: ${formatarMoeda(item.valor_pago_cofre)} do Cofre + ${formatarMoeda(Number(item.valor || 0) - Number(item.valor_pago_cofre || 0))} do Saldo geral`
                          }
                        >
                          💰{" "}
                          {Number(item.valor_pago_cofre || 0) >= Number(item.valor || 0) - 0.01
                            ? "Pago com Cofre"
                            : `Cofre ${formatarMoeda(item.valor_pago_cofre)} + Saldo`}
                        </span>
                      )}
                      {item.exclusao_solicitada_em && (
                        <span
                          className="badge-status badge-status-rejeitado"
                          title={`Pedido de exclusão por ${item.exclusao_solicitada_por || "alguém"}`}
                        >
                          🗑️ Exclusão pendente
                        </span>
                      )}
                    </strong>
                    <span>{item.grupo || "-"}</span>
                    <span>{item.categoria || "-"}</span>
                    <span>{item.descricao}</span>
                    <span>
                      🏬{" "}
                      {/* Bug real corrigido (20/08/2026): comparação com
                          "===" estrito falhava quando um lado vinha como
                          número e o outro como texto (ex: loja_id salvo
                          via WhatsApp/script) — mostrava "Sem loja" mesmo
                          com o dado certo gravado. Mesmo padrão de
                          comparação (String() dos dois lados) já usado no
                          resto do sistema. */}
                      {lojas.find(
                        (loja) => String(loja.id) === String(item.loja_id)
                      )?.nome || "Sem loja"}
                    </span>
                    {item.tem_foto_mercadoria &&
                      (() => {
                        const loja = lojas.find(
                          (item2) =>
                            String(item2.id) === String(item.loja_id)
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
                        item.foto_pendente_em &&
                        (temPermissao("aprovar_despesas") ? (
                          <button
                            type="button"
                            className="view-receipt-button"
                            disabled={carregandoTrocaFotoId === item.id}
                            onClick={() => verTrocaFoto(item)}
                          >
                            {carregandoTrocaFotoId === item.id
                              ? "Carregando..."
                              : "🕓 Ver troca de foto"}
                          </button>
                        ) : (
                          <span
                            className="badge-status badge-status-pendente"
                            title="A foto nova só substitui a atual depois que o administrador autorizar."
                          >
                            🕓 Foto aguardando aprovação
                          </span>
                        ))}

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

                      {/* Pedido do usuário (24/08/2026): "ela tem que
                          entrar como despesa, qualquer um que lançar
                          deixe liberado pra todos com acesso ao sistema"
                          — desativado o modo de aprovação (config
                          aprovacao_despesas_ativa = false), então despesa
                          nova nunca mais nasce "pendente". Botão Aprovar/
                          Rejeitar removido daqui a pedido — ficava sem
                          uso (nenhum status "pendente" nasce mais), e o
                          botão de aprovar EXCLUSÃO logo abaixo é outra
                          coisa (não mexido). */}

                      {temPermissao("aprovar_despesas") &&
                        item.exclusao_solicitada_em && (
                          <>
                            <button
                              type="button"
                              className="approve-button"
                              disabled={processandoAprovacaoId === item.id}
                              onClick={() =>
                                aprovarExclusaoLancamentoHandler(item.id)
                              }
                            >
                              ✅ Confirmar exclusão
                            </button>

                            <button
                              type="button"
                              className="reject-button"
                              disabled={processandoAprovacaoId === item.id}
                              onClick={() =>
                                rejeitarExclusaoLancamentoHandler(item.id)
                              }
                            >
                              ❌ Cancelar exclusão
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
            lerNotaFiscal={lerNotaFiscal}
            atualizarCustosPorCompra={atualizarCustosPorCompraHandler}
          />
        )}

        {pagina === "ficha-tecnica" && (
          <FichaTecnica
            insumos={insumos}
            fichas={fichasTecnicas}
            carregandoFichas={carregandoFichasTecnicas}
            lojas={lojas}
            lojaPadrao={
              vePermissaoTotal
                ? lojaDashboard !== "todas"
                  ? lojaDashboard
                  : null
                : perfil?.loja_id || null
            }
            adicionarFicha={adicionarFichaTecnicaHandler}
            editarFichaExistente={editarFichaTecnicaHandler}
            removerFicha={removerFichaTecnicaHandler}
            buscarProdutosVendidos={buscarProdutosVendidosSaipos}
            importarCardapioFoto={importarCardapioFoto}
            adicionarInsumo={adicionarInsumo}
            editarInsumo={editarInsumoHandler}
          />
        )}

        {pagina === "auditoria" && ehAdministrador && <LogAuditoria />}

        {pagina === "vendas-saipos" && temPermissaoFechamento("vendas_saipos") && (
          <VendasSaipos lojas={lojas} ehAdministrador={ehAdministrador} />
        )}

        {pagina === "conciliacao" && temPermissaoFechamento("conciliacao") && (
          <Conciliacao
            lojaId={
              !vePermissaoTotal
                ? perfil?.loja_id || null
                : lojaDashboard !== "todas"
                ? lojaDashboard
                : null
            }
          />
        )}

        {pagina === "feed" &&
          (temPermissaoFinanceira("despesas") ||
            temPermissaoFinanceira("receitas")) && (
            <FeedLancamentos
              lancamentos={lancamentos}
              lojas={lojas}
              lojaPadrao={
                !vePermissaoTotal
                  ? perfil?.loja_id || null
                  : lojaDashboard !== "todas"
                  ? lojaDashboard
                  : null
              }
              buscarFoto={buscarFotoLancamento}
              notificacaoStatus={notificacaoStatus}
              ativarNotificacao={ativarNotificacaoHandler}
              desativarNotificacao={desativarNotificacaoHandler}
            />
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

        {(pagina === "contas-pagar" || pagina === "contas-pagas") && (
          <ContasPagar
            key={pagina}
            modo={pagina === "contas-pagas" ? "pagas" : "pendentes"}
            aoConfirmarPagamento={() => setPagina("contas-pagas")}
            contas={contasPagarFiltradas}
            despesas={despesasParaContasPagas}
            buscarFotoDespesa={buscarFotoLancamento}
            carregando={carregandoContasPagar}
            adicionarConta={adicionarContaPagar}
            editarConta={editarContaPagar}
            marcarComoPaga={pagarContaPagar}
            editarDataPagamento={editarDataPagamento}
            removerConta={removerContaPagar}
            removerDespesa={removerDespesaDeContasPagas}
            ehAdministrador={ehAdministrador}
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

        {pagina === "despesas-recorrentes" && (
          <DespesasRecorrentes
            recorrentes={despesasRecorrentes}
            carregando={carregandoDespesasRecorrentes}
            lojas={lojas}
            lojaPadrao={
              !vePermissaoTotal
                ? perfil?.loja_id || null
                : lojaDashboard !== "todas"
                ? lojaDashboard
                : null
            }
            adicionar={adicionarDespesaRecorrente}
            editar={editarDespesaRecorrenteHandler}
            remover={removerDespesaRecorrente}
          />
        )}

        {pagina === "retiradas-socios" && ehAdministrador && (
          <RetiradasSocios
            retiradas={retiradasSocios}
            carregando={carregandoRetiradasSocios}
            lojas={lojas}
            lojaPadrao={lojaDashboard !== "todas" ? lojaDashboard : null}
            adicionar={adicionarRetiradaSocioHandler}
            remover={removerRetiradaSocioHandler}
          />
        )}

        {pagina === "emprestimos-entre-lojas" && ehAdministrador && (
          <EmprestimosEntreLojas
            emprestimos={emprestimosEntreLojas}
            carregando={carregandoEmprestimosEntreLojas}
            lojas={lojas}
            adicionar={adicionarEmprestimoEntreLojasHandler}
            registrarPagamento={registrarPagamentoEmprestimoHandler}
            remover={removerEmprestimoEntreLojasHandler}
          />
        )}

        {pagina === "fornecedores" && (
          <Fornecedores
            historico={historicoFornecedores}
            carregando={carregandoFornecedores}
            lojas={lojas}
          />
        )}

        {pagina === "backup" && ehAdministrador && (
          <section className="categorias-layout">
            <article className="panel categoria-form-panel">
              <div className="panel-header">
                <div>
                  <span className="eyebrow">Segurança</span>
                  <h2>Backup dos dados</h2>
                </div>
              </div>

              <p style={{ color: "#9fb0c4", fontSize: 13.5 }}>
                Baixa um arquivo com todos os dados financeiros do sistema
                (lançamentos, contas a pagar, categorias, clientes, lojas,
                fechamentos de caixa, estoque, notas fiscais etc.) — uma
                cópia extra de segurança, caso algo dê errado no Supabase ou
                algum registro seja apagado por engano.
              </p>

              <p style={{ color: "#9fb0c4", fontSize: 13.5 }}>
                As fotos anexadas (comprovantes, notas) <strong>não</strong>{" "}
                entram nesse arquivo — deixaria o download gigante, e elas
                continuam seguras no próprio Supabase. Isso não substitui um
                backup do banco de dados em si.
              </p>

              <button
                type="button"
                className="primary-button"
                onClick={baixarBackup}
                disabled={gerandoBackup}
              >
                {gerandoBackup
                  ? "Gerando backup..."
                  : "💾 Baixar backup completo (JSON)"}
              </button>

              {ultimoBackupGeradoEm && (
                <p style={{ color: "#16ca50", fontSize: 13, marginTop: 10 }}>
                  ✅ Último backup baixado em{" "}
                  {ultimoBackupGeradoEm.toLocaleString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                  })}
                  .
                </p>
              )}
            </article>

            <article className="panel categoria-lista-panel">
              <div className="panel-header">
                <div>
                  <span className="eyebrow">Automático</span>
                  <h2>Backups gerados às 5h da manhã</h2>
                </div>
              </div>

              <p style={{ color: "#9fb0c4", fontSize: 13.5 }}>
                Todo dia às 5h o sistema gera um backup sozinho e guarda
                aqui — mantém os últimos 30 dias. Baixar direto pro
                notebook automaticamente não é possível sem o navegador
                aberto naquele horário, então é só entrar aqui quando
                precisar e baixar o dia que quiser.
              </p>

              {carregandoBackupsAutomaticos ? (
                <p>Carregando...</p>
              ) : backupsAutomaticos.length === 0 ? (
                <div className="empty-state">
                  Nenhum backup automático gerado ainda — o primeiro sai na
                  próxima passagem das 5h da manhã.
                </div>
              ) : (
                <div className="categorias-lista">
                  {backupsAutomaticos.map((backup) => (
                    <div key={backup.id} className="categoria-item">
                      <div className="categoria-identificacao">
                        <div className="categoria-icone">💾</div>
                        <div>
                          <strong>
                            {new Date(backup.criado_em).toLocaleString(
                              "pt-BR",
                              { timeZone: "America/Sao_Paulo" }
                            )}
                          </strong>
                          <div>
                            {backup.tamanho_bytes
                              ? `${(backup.tamanho_bytes / 1024).toFixed(1)} KB`
                              : "-"}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="secondary-button"
                        disabled={baixandoBackupAutomaticoId === backup.id}
                        onClick={() => baixarUmBackupAutomatico(backup)}
                      >
                        {baixandoBackupAutomaticoId === backup.id
                          ? "Baixando..."
                          : "⬇️ Baixar"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </section>
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
            corrigirValor={corrigirValorFechamentoCaixaHandler}
            fundosRetiradas={fundosRetiradas}
            adicionarFundoRetirada={adicionarFundoRetiradaCaixaHandler}
            buscarFotoFundo={buscarFotoFundoRetiradaCaixa}
            buscarFoto={buscarFotoFechamentoCaixa}
            lerValorFoto={lerValorFechamentoCaixa}
            finalizacoes={finalizacoesFechamentoCaixa}
            finalizarFechamento={finalizarFechamentoCaixaHandler}
            reabrirFechamento={reabrirFechamentoCaixaHandler}
            ehAdministrador={ehAdministrador}
            trocarFoto={trocarFotoFechamentoCaixaHandler}
            lojaId={
              !vePermissaoTotal
                ? perfil?.loja_id || null
                : lojaDashboard !== "todas"
                ? lojaDashboard
                : null
            }
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

        {pagina === "whatsapp-fila" && ehAdministrador && (
          <WhatsAppFila
            itens={whatsappFila}
            carregando={carregandoWhatsappFila}
            lojas={lojas}
            lojaPadrao={vePermissaoTotal ? null : perfil?.loja_id || null}
            criarFechamento={adicionarFechamentoCaixa}
            criarDespesa={criarDespesaDoWhatsapp}
            criarContaPagar={adicionarContaPagar}
            removerItem={removerItemWhatsappFilaHandler}
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

        {pagina === "relatorios" && ehAdministrador && (
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

            <button
              type="button"
              className={tipoRelatorio === "impostos" ? "active" : ""}
              onClick={() => setTipoRelatorio("impostos")}
            >
              💰 Impostos (Simples Nacional)
            </button>
          </div>
        )}

        {pagina === "relatorios" && ehAdministrador && tipoRelatorio === "impostos" && (
          <section className="panel report-print-area">
            <div className="panel-header report-header">
              <div>
                <span className="eyebrow">X Calota Uberlândia</span>
                <h2>Previsão de DAS (Simples Nacional — Anexo I)</h2>
              </div>
            </div>

            <p style={{ color: "#9fb0c4", fontSize: 13.5 }}>
              Cálculo só pra loja de Uberlândia, que tem CNPJ próprio (as
              outras lojas são matriz/filiais de outro CNPJ). Usa a tabela
              oficial do Simples Nacional, Anexo I, e o faturamento já
              lançado neste sistema. É uma <strong>estimativa</strong> — não
              substitui o cálculo oficial do contador/PGDAS-D, que pode
              considerar sublimites, retenções, ISS ou outros fatores não
              vistos aqui.
            </p>

            <div className="report-filters no-print">
              <label>
                Mês de apuração
                <input
                  type="month"
                  value={mesImpostoSelecionado}
                  onChange={(evento) =>
                    setMesImpostoSelecionado(evento.target.value)
                  }
                />
              </label>
            </div>

            {previsaoImpostoUberlandia && (
              <>
                {previsaoImpostoUberlandia.mesesComDados < 12 && (
                  <div className="empty-state" style={{ color: "#f59e0b" }}>
                    ⚠️ Esse cálculo só encontrou faturamento lançado em{" "}
                    {previsaoImpostoUberlandia.mesesComDados} dos 12 meses
                    anteriores a{" "}
                    {mesImpostoSelecionado.split("-").reverse().join("/")}. Se
                    a loja já faturava antes de usar o FinancePro, o RBT12
                    abaixo pode estar SUBESTIMADO — confira com o contador.
                  </div>
                )}

                <div className="reports-grid">
                  <article className="panel report-card">
                    <span>Faturamento do mês</span>
                    <strong>
                      {formatarMoeda(
                        previsaoImpostoUberlandia.faturamentoDoMes
                      )}
                    </strong>
                  </article>

                  <article className="panel report-card">
                    <span>RBT12 (últimos 12 meses)</span>
                    <strong>
                      {formatarMoeda(previsaoImpostoUberlandia.rbt12)}
                    </strong>
                  </article>

                  <article className="panel report-card">
                    <span>Alíquota efetiva</span>
                    <strong>
                      {(
                        previsaoImpostoUberlandia.aliquotaEfetiva * 100
                      ).toFixed(2)}
                      %
                    </strong>
                    <small>
                      Faixa: até{" "}
                      {formatarMoeda(previsaoImpostoUberlandia.faixa.ate)} —
                      alíquota nominal{" "}
                      {(previsaoImpostoUberlandia.faixa.aliquota * 100).toFixed(
                        2
                      )}
                      %
                    </small>
                  </article>

                  <article
                    className="panel report-card"
                    style={{ borderColor: "#1476ff" }}
                  >
                    <span>DAS estimado do mês</span>
                    <strong>
                      {formatarMoeda(previsaoImpostoUberlandia.dasEstimado)}
                    </strong>
                  </article>
                </div>
              </>
            )}
          </section>
        )}

        {pagina === "relatorios" && ehAdministrador && tipoRelatorio === "financeiro" && (
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
                Fechar por mês (pra mandar pro contador)
                <input
                  type="month"
                  value={mesRelatorioSelecionado}
                  onChange={(evento) =>
                    selecionarMesRelatorio(evento.target.value)
                  }
                />
              </label>

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
    

              {/* Pedido do usuário (21/08/2026): Ponto de Equilíbrio. */}
              <article className="panel report-card">
                <span>⚖️ Ponto de Equilíbrio (mês)</span>
                <strong>
                  {pontoDeEquilibrio.faturamentoNecessario != null
                    ? formatarMoeda(pontoDeEquilibrio.faturamentoNecessario)
                    : "—"}
                </strong>
                <small>
                  Custo fixo {formatarMoeda(pontoDeEquilibrio.custoFixoMensal)}
                  {" — "}
                  margem {pontoDeEquilibrio.margemContribuicaoPercentual.toFixed(1)}%
                </small>
              </article>

              {/* Pedido do usuário (20/08/2026): Retiradas de Sócios
                  dentro do Relatório financeiro — só aparece aqui porque
                  essa seção inteira agora é admin-only (não entra em
                  Contas Pagas/Despesas nem em nenhum outro relatório que
                  a equipe acesse). */}
              <article className="panel report-card">
                <span>💸 Retiradas de Sócios</span>
                <strong>
                  {formatarMoeda(
                    retiradasSocios
                      .filter(
                        (item) =>
                          item.data >= dataInicialRelatorio &&
                          item.data <= dataFinalRelatorio
                      )
                      .reduce((soma, item) => soma + Number(item.valor || 0), 0)
                  )}
                </strong>
              </article>

              {/* Pedido do usuário (21/08/2026): Empréstimo entre Lojas —
                  mostra o total emprestado (bruto) no período; dívidas
                  em aberto vs quitadas dá pra ver na tela própria. */}
              <article className="panel report-card">
                <span>🔁 Empréstimo entre Lojas</span>
                <strong>
                  {formatarMoeda(
                    emprestimosEntreLojas
                      .filter(
                        (item) =>
                          item.data >= dataInicialRelatorio &&
                          item.data <= dataFinalRelatorio
                      )
                      .reduce((soma, item) => soma + Number(item.valor || 0), 0)
                  )}
                </strong>
                <small>
                  {emprestimosEntreLojas.filter((item) => item.status === "aberto").length}{" "}
                  em aberto
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

        {pagina === "relatorios" && ehAdministrador && tipoRelatorio === "caixa" && (
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
                              {paraDataUtc(registro.criado_em)?.toLocaleTimeString(
                                "pt-BR",
                                { timeZone: "America/Sao_Paulo" }
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

              {tipoLancamento === "despesa" && (
                <div className="form-row">
                  <label>
                    Item comprado (opcional)
                    <input
                      type="text"
                      value={formulario.item}
                      onChange={(evento) =>
                        alterarCampo("item", evento.target.value)
                      }
                      placeholder="Ex.: Carne moída"
                    />
                  </label>

                  <label>
                    Quantidade
                    <input
                      type="text"
                      inputMode="decimal"
                      value={formulario.quantidade}
                      onChange={(evento) =>
                        alterarCampo("quantidade", evento.target.value)
                      }
                      placeholder="Ex.: 50"
                    />
                  </label>

                  <label>
                    Unidade
                    <select
                      value={formulario.unidade}
                      onChange={(evento) =>
                        alterarCampo("unidade", evento.target.value)
                      }
                    >
                      <option value="kg">kg</option>
                      <option value="g">g</option>
                      <option value="litro">litro</option>
                      <option value="unidade">unidade</option>
                      <option value="caixa">caixa</option>
                      <option value="pacote">pacote</option>
                    </select>
                  </label>
                </div>
              )}

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

              {/* Pedido do usuário (22/08/2026): despesa paga com dinheiro
                  de um Fundo de Retirada (retirada genérica de caixa
                  ainda não gasta) — se não marcar nada aqui, desconta do
                  Saldo geral normal, sem mexer em fundo nenhum. Só
                  aparece se tiver algum fundo aberto pra loja escolhida. */}
              {tipoLancamento === "despesa" &&
                fundosRetiradas.some(
                  (fundo) =>
                    fundo.status === "aberto" &&
                    String(fundo.loja_id) === String(formulario.loja_id)
                ) && (
                  <div className="form-row">
                    <label>
                      💰 Pago com dinheiro do Cofre
                      <select
                        value={formulario.fundo_retirada_id}
                        onChange={(evento) => {
                          const novoFundoId = evento.target.value;
                          alterarCampo("fundo_retirada_id", novoFundoId);

                          // Pedido do usuário (22/08/2026): pode ser
                          // pagamento PARCIAL (ex: conta de R$600, R$200
                          // do Cofre e R$400 do Saldo) — ao escolher um
                          // Cofre, já sugere o valor total da despesa
                          // (ou o disponível no Cofre, o que for menor)
                          // como ponto de partida, editável.
                          if (novoFundoId) {
                            const fundoEscolhido = fundosRetiradas.find(
                              (fundo) => String(fundo.id) === String(novoFundoId)
                            );
                            const disponivel = fundoEscolhido
                              ? Number(fundoEscolhido.valor) -
                                Number(fundoEscolhido.valor_usado || 0)
                              : 0;
                            const valorDespesa = paraNumero(formulario.valor) || 0;
                            const sugestao = Math.min(disponivel, valorDespesa);
                            alterarCampo(
                              "valor_pago_cofre",
                              sugestao.toLocaleString("pt-BR", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })
                            );
                          } else {
                            alterarCampo("valor_pago_cofre", "");
                          }
                        }}
                      >
                        <option value="">Não — descontar do Saldo normal</option>
                        {fundosRetiradas
                          .filter(
                            (fundo) =>
                              fundo.status === "aberto" &&
                              String(fundo.loja_id) === String(formulario.loja_id)
                          )
                          .map((fundo) => (
                            <option key={fundo.id} value={fundo.id}>
                              {fundo.descricao || "Cofre"} — disponível{" "}
                              {formatarMoeda(
                                Number(fundo.valor) - Number(fundo.valor_usado || 0)
                              )}
                            </option>
                          ))}
                      </select>
                    </label>

                    {formulario.fundo_retirada_id && (
                      <label>
                        Quanto vem do Cofre? (resto desconta do Saldo)
                        <CampoValor
                          value={formulario.valor_pago_cofre}
                          onChange={(novoValor) =>
                            alterarCampo("valor_pago_cofre", novoValor)
                          }
                        />
                      </label>
                    )}
                  </div>
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
                    : "📷📄 Tirar foto ou anexar e ler nota automaticamente"}
                </label>

                <small className="foto-ajuda">
                  Escolhe da câmera ou da galeria — sem localização, pode
                  anexar de qualquer lugar.
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

      {trocaFotoVisualizada && (
        <div
          className="modal-overlay"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget) {
              setTrocaFotoVisualizada(null);
            }
          }}
        >
          <div className="modal">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Autorização necessária</span>
                <h2>Troca de foto: {trocaFotoVisualizada.descricao}</h2>
              </div>

              <button
                type="button"
                className="close-button"
                onClick={() => setTrocaFotoVisualizada(null)}
              >
                ×
              </button>
            </div>

            <div
              style={{
                display: "flex",
                gap: 16,
                flexWrap: "wrap",
                marginBottom: 16,
              }}
            >
              <div style={{ flex: "1 1 200px" }}>
                <strong>Foto atual</strong>
                {trocaFotoVisualizada.fotoAtual ? (
                  <img
                    src={trocaFotoVisualizada.fotoAtual}
                    alt="Foto atual"
                    className="foto-modal-imagem"
                  />
                ) : (
                  <p>Sem foto.</p>
                )}
              </div>

              <div style={{ flex: "1 1 200px" }}>
                <strong>Foto nova (pedida)</strong>
                {trocaFotoVisualizada.fotoPendente ? (
                  <img
                    src={trocaFotoVisualizada.fotoPendente}
                    alt="Foto nova pedida"
                    className="foto-modal-imagem"
                  />
                ) : (
                  <p>Pedido é remover a foto (deixar sem foto).</p>
                )}
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="reject-button"
                disabled={
                  processandoTrocaFotoId === trocaFotoVisualizada.id
                }
                onClick={() =>
                  rejeitarTrocaFotoHandler(trocaFotoVisualizada.id)
                }
              >
                ❌ Rejeitar (mantém a foto atual)
              </button>

              <button
                type="button"
                className="approve-button"
                disabled={
                  processandoTrocaFotoId === trocaFotoVisualizada.id
                }
                onClick={() =>
                  aprovarTrocaFotoHandler(trocaFotoVisualizada.id)
                }
              >
                ✅ Autorizar troca
              </button>
            </div>
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