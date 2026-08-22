require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const { XMLParser } = require("fast-xml-parser");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
const PORT = process.env.PORT || 3001;

// Grupos de permissão granular. Removida a compatibilidade com as chaves
// "legado" ("financeiro"/"fechamento_caixa" davam acesso a várias telas de
// uma vez) — a pedido do usuário, cada caixinha de permissão vale
// exatamente o que está marcado, sem nenhum atalho por trás que libere
// telas extras sem querer.
const PERM_LANCAMENTOS = ["receitas", "despesas", "fluxo_caixa", "relatorios"];
const PERM_DESPESAS = ["despesas"];
const PERM_CATEGORIAS = ["categorias"];
const PERM_CONTAS_PAGAR = ["contas_pagar"];
const PERM_CONTAS_RECEBER = ["contas_receber"];
const PERM_FECHAMENTO_CAIXA = ["fechamento_caixa"];
const PERM_VENDAS_SAIPOS = ["vendas_saipos"];
const PERM_CONCILIACAO = ["conciliacao"];
const PERM_NOTAS_FISCAIS = ["notas_fiscais"];

app.use(cors());

app.use(
  express.json({
    limit: "15mb",
  })
);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  console.error(
    "Erro: SUPABASE_URL e SUPABASE_SECRET_KEY precisam estar no arquivo backend/.env"
  );

  process.exit(1);
}

const supabase = createClient(
  supabaseUrl,
  supabaseSecretKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

async function verificarAdmin(req, res, next) {
  try {
    const cabecalho = req.headers.authorization || "";
    const token = cabecalho.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        erro: "É necessário estar logado.",
      });
    }

    const { data: dadosUsuario, error: erroUsuario } =
      await supabase.auth.getUser(token);

    if (erroUsuario || !dadosUsuario?.user) {
      return res.status(401).json({
        erro: "Sessão inválida ou expirada.",
      });
    }

    const { data: perfil, error: erroPerfil } = await supabase
      .from("perfis")
      .select("*")
      .eq("user_id", dadosUsuario.user.id)
      .single();

    if (erroPerfil || !perfil || perfil.perfil !== "administrador") {
      return res.status(403).json({
        erro: "Apenas administradores podem fazer isso.",
      });
    }

    req.usuarioLogado = dadosUsuario.user;
    req.perfilLogado = perfil;
    next();
  } catch (erro) {
    console.error("Erro ao verificar administrador:", erro.message);

    res.status(500).json({
      erro: "Não foi possível verificar as permissões.",
    });
  }
}

// Aceita uma chave só ("estoque") ou uma lista de chaves aceitas
// (["receitas", "despesas", ...]) — usado quando várias permissões
// granulares diferentes dão acesso à mesma rota (ex.: a rota de
// lançamentos serve Receitas, Despesas, Fluxo de Caixa e Relatórios ao
// mesmo tempo, cada um com seu próprio checkbox de permissão).
function verificarPermissao(chaveOuChaves) {
  const chavesAceitas = Array.isArray(chaveOuChaves)
    ? chaveOuChaves
    : [chaveOuChaves];

  return async function (req, res, next) {
    try {
      const cabecalho = req.headers.authorization || "";
      const token = cabecalho.replace("Bearer ", "");

      if (!token) {
        return res.status(401).json({
          erro: "É necessário estar logado.",
        });
      }

      const { data: dadosUsuario, error: erroUsuario } =
        await supabase.auth.getUser(token);

      if (erroUsuario || !dadosUsuario?.user) {
        return res.status(401).json({
          erro: "Sessão inválida ou expirada.",
        });
      }

      const { data: perfil, error: erroPerfil } = await supabase
        .from("perfis")
        .select("*")
        .eq("user_id", dadosUsuario.user.id)
        .single();

      const permissoesDoUsuario = perfil?.permissoes || [];

      const temAcesso =
        !erroPerfil &&
        perfil &&
        (perfil.perfil === "administrador" ||
          chavesAceitas.some((chave) =>
            permissoesDoUsuario.includes(chave)
          ));

      if (!temAcesso) {
        return res.status(403).json({
          erro: "Você não tem permissão para fazer isso.",
        });
      }

      req.usuarioLogado = dadosUsuario.user;
      req.perfilLogado = perfil;
      next();
    } catch (erro) {
      console.error("Erro ao verificar permissão:", erro.message);

      res.status(500).json({
        erro: "Não foi possível verificar as permissões.",
      });
    }
  };
}

async function obterPerfilOpcional(req) {
  try {
    const cabecalho = req.headers.authorization || "";
    const token = cabecalho.replace("Bearer ", "");

    if (!token) {
      return { usuario: null, perfil: null };
    }

    const { data: dadosUsuario, error: erroUsuario } =
      await supabase.auth.getUser(token);

    if (erroUsuario || !dadosUsuario?.user) {
      return { usuario: null, perfil: null };
    }

    const { data: perfil } = await supabase
      .from("perfis")
      .select("*")
      .eq("user_id", dadosUsuario.user.id)
      .single();

    return { usuario: dadosUsuario.user, perfil: perfil || null };
  } catch (erro) {
    console.error("Erro ao obter perfil da requisição:", erro.message);
    return { usuario: null, perfil: null };
  }
}

async function registrarAuditoria(req, acao, tabelaAfetada, registroId, detalhes) {
  try {
    const { usuario, perfil } = await obterPerfilOpcional(req);

    await supabase.from("log_auditoria").insert([
      {
        usuario_id: usuario?.id || null,
        usuario_nome: perfil?.nome || usuario?.email || "Desconhecido",
        acao,
        tabela_afetada: tabelaAfetada,
        registro_id: registroId != null ? String(registroId) : null,
        detalhes: detalhes || null,
      },
    ]);
  } catch (erro) {
    console.error("Erro ao registrar log de auditoria:", erro.message);
  }
}

// Blindagem (19/08/2026): antes, quando uma automação (importação
// Saipos, backup, despesas recorrentes) falhava, o erro só ia pro
// console.error — visível só olhando o log do servidor no Render, que
// ninguém checa no dia a dia. Isso já causou pelo menos um problema real
// (vendas de um dia inteiro sem importar, sem ninguém saber até o saldo
// não bater). Agora toda falha de automação também vira uma linha bem
// marcada no log_auditoria (ação "FALHOU"), pra dar pra ver na tela.
async function registrarFalhaAutomacao(nomeAutomacao, mensagemErro) {
  try {
    await supabase.from("log_auditoria").insert([
      {
        usuario_id: null,
        usuario_nome: `Automação (${nomeAutomacao})`,
        acao: "FALHOU",
        tabela_afetada: "sistema",
        registro_id: null,
        detalhes: mensagemErro || "Erro desconhecido.",
      },
    ]);
  } catch (erroLog) {
    console.error(
      "Não consegui nem registrar a falha da automação:",
      erroLog.message
    );
  }
}

async function aprovacaoDespesasAtiva() {
  try {
    const { data } = await supabase
      .from("configuracoes")
      .select("aprovacao_despesas_ativa")
      .eq("id", 1)
      .single();

    return data?.aprovacao_despesas_ativa !== false;
  } catch (erro) {
    console.error(
      "Erro ao buscar configuração de aprovação:",
      erro.message
    );
    return true;
  }
}

function prepararLancamento(dados = {}) {
  return {
    tipo: dados.tipo || "",
    descricao: dados.descricao || "",
    valor: Number(dados.valor || 0),
    data: dados.data || null,
    grupo: dados.grupo || "",
    categoria: dados.categoria || "",
    subcategoria: dados.subcategoria || "",
    fornecedor: dados.fornecedor || "",
    item: (dados.item || "").trim(),
    quantidade: dados.quantidade != null ? Number(dados.quantidade) : null,
    unidade: (dados.unidade || "").trim(),
    observacao: dados.observacao || "",
    foto: dados.foto || "",
    foto_mercadoria: dados.foto_mercadoria || "",
    fotos_extra: Array.isArray(dados.fotos_extra) ? dados.fotos_extra : [],
    latitude: dados.latitude ?? null,
    longitude: dados.longitude ?? null,
    precisao_metros: dados.precisao_metros ?? null,
    capturado_em: dados.capturado_em || null,
    loja_id: dados.loja_id || null,
    forma_pagamento_id: dados.forma_pagamento_id || null,
    pago_em_dinheiro: Boolean(dados.pago_em_dinheiro),
    valor_bruto: dados.valor_bruto != null ? Number(dados.valor_bruto) : null,
    valor_liquido_esperado:
      dados.valor_liquido_esperado != null
        ? Number(dados.valor_liquido_esperado)
        : null,
    data_prevista_recebimento: dados.data_prevista_recebimento || null,
  };
}

function prepararLoja(dados = {}) {
  return {
    nome: (dados.nome || "").trim(),
    endereco: (dados.endereco || "").trim(),
    latitude: dados.latitude ?? null,
    longitude: dados.longitude ?? null,
    raio_metros: dados.raio_metros ? Number(dados.raio_metros) : 200,
    saipos_id_store: dados.saipos_id_store
      ? Number(dados.saipos_id_store)
      : null,
  };
}

function prepararFechamentoCaixa(dados = {}) {
  return {
    loja_id: dados.loja_id ? Number(dados.loja_id) : null,
    tipo: dados.tipo || "",
    nome_pessoa: (dados.nome_pessoa || "").trim(),
    valor: dados.valor !== "" && dados.valor != null ? Number(dados.valor) : null,
    // Diária pode ser paga em duas partes (ex.: parte em dinheiro na hora,
    // resto em Pix depois) — esse é só o pedaço que já saiu do caixa.
    valor_pago_dinheiro:
      dados.valor_pago_dinheiro != null ? Number(dados.valor_pago_dinheiro) : 0,
    foto: dados.foto || "",
    observacao: (dados.observacao || "").trim(),
    // Usado hoje só pelo tipo "comandas_canceladas" — lido automaticamente
    // da foto (nome do cliente já usa nome_pessoa, que já existia).
    telefone: (dados.telefone || "").trim(),
  };
}

function prepararInsumo(dados = {}) {
  return {
    loja_id: dados.loja_id ? Number(dados.loja_id) : null,
    nome: (dados.nome || "").trim(),
    unidade_medida: (dados.unidade_medida || "un").trim(),
    estoque_minimo: dados.estoque_minimo ? Number(dados.estoque_minimo) : 0,
    unidade_compra: (dados.unidade_compra || "").trim() || null,
    fator_conversao: dados.fator_conversao
      ? Number(dados.fator_conversao)
      : 1,
    // Pedido do usuário (21/08/2026): custo por unidade — usado pela
    // Ficha Técnica pra calcular o custo real de cada prato. Campo
    // opcional, novo, não muda nada do que já existia aqui.
    custo_unitario:
      dados.custo_unitario != null ? Number(dados.custo_unitario) : 0,
  };
}

app.get("/", function (req, res) {
  res.send("FinancePro API funcionando!");
});

// Pedido do usuário (14/08/2026): "backup/exportação de dados — hoje tudo
// depende só do Supabase". Baixa um JSON com todas as tabelas principais,
// SEM as fotos em base64 (deixaria o arquivo gigante e as fotos já ficam
// seguras dentro do próprio Supabase) — é o que protege contra perder
// lançamento/registro por engano, não substitui backup do banco em si.
// Só administrador pode baixar (dado financeiro completo de todas as lojas).
const CAMPOS_FOTO_PARA_REMOVER = [
  "foto",
  "foto_mercadoria",
  "fotos_extra",
  "comprovante_pagamento",
];

function removerFotosDoRegistro(registro) {
  const copia = { ...registro };
  CAMPOS_FOTO_PARA_REMOVER.forEach((campo) => {
    if (campo in copia) {
      copia[campo] = copia[campo] ? "(removido do backup)" : copia[campo];
    }
  });
  return copia;
}

const TABELAS_BACKUP = [
  "lancamentos",
  "contas_pagar",
  "categorias",
  "clientes",
  "lojas",
  "formas_pagamento",
  "despesas_recorrentes",
  "fechamentos_caixa",
  "fechamento_caixa_finalizacoes",
  "fechamento_saipos",
  "caixa_dinheiro_informado",
  "insumos",
  "movimentacoes_estoque",
  "notas_fiscais",
  "atendimentos_clientes",
  "configuracoes",
  "perfis",
];

async function gerarBackupCompleto() {
  const resultado = {};

  for (const tabela of TABELAS_BACKUP) {
    const { data, error } = await supabase.from(tabela).select("*");

    if (error) {
      resultado[tabela] = { erro: error.message };
      continue;
    }

    resultado[tabela] = (data || []).map(removerFotosDoRegistro);
  }

  return {
    gerado_em: new Date().toISOString(),
    observacao:
      "Backup sem fotos (removidas pra não deixar o arquivo gigante — elas continuam seguras no Supabase). Não substitui backup do banco de dados em si, é uma cópia de segurança dos registros.",
    tabelas: resultado,
  };
}

app.get("/backup/exportar", verificarAdmin, async function (req, res) {
  try {
    const backup = await gerarBackupCompleto();

    registrarAuditoria(
      req,
      "baixou backup completo dos dados",
      "sistema",
      null,
      null
    );

    res.json(backup);
  } catch (erro) {
    console.error("Erro ao gerar backup:", erro.message);

    res.status(500).json({
      erro: "Não foi possível gerar o backup.",
      detalhes: erro.message,
    });
  }
});

// Pedido do usuário (14/08/2026): backup automático todo dia às 5h da
// manhã. Baixar direto pro notebook do usuário não é possível sem o
// navegador aberto naquele horário — em vez disso, o servidor gera e
// GUARDA o backup dentro do próprio sistema; o usuário entra na tela
// Backup quando quiser e baixa qualquer um dos últimos gerados.
app.get(
  "/backup/automaticos",
  verificarAdmin,
  async function (req, res) {
    try {
      const { data, error } = await supabase
        .from("backups_automaticos")
        .select("id, criado_em, tamanho_bytes")
        .order("criado_em", { ascending: false })
        .limit(30);

      if (error) {
        throw error;
      }

      res.json(data || []);
    } catch (erro) {
      console.error("Erro ao listar backups automáticos:", erro.message);

      res.status(500).json({
        erro: "Não foi possível listar os backups automáticos.",
        detalhes: erro.message,
      });
    }
  }
);

app.get(
  "/backup/automaticos/:id",
  verificarAdmin,
  async function (req, res) {
    try {
      const id = Number(req.params.id);

      if (!Number.isFinite(id)) {
        return res.status(400).json({ erro: "ID do backup inválido." });
      }

      const { data, error } = await supabase
        .from("backups_automaticos")
        .select("conteudo")
        .eq("id", id)
        .single();

      if (error) {
        throw error;
      }

      registrarAuditoria(
        req,
        "baixou backup automático dos dados",
        "sistema",
        id,
        null
      );

      res.json(data.conteudo);
    } catch (erro) {
      console.error("Erro ao buscar backup automático:", erro.message);

      res.status(500).json({
        erro: "Não foi possível buscar esse backup.",
        detalhes: erro.message,
      });
    }
  }
);

let ultimoDiaBackupAutomatico = null;

// Bug encontrado e corrigido (19/08/2026, mesmo padrão achado na
// importação da Saipos): marcava "já fiz o backup hoje" ANTES de
// confirmar que o backup deu certo — se desse erro, o dia inteiro ficava
// marcado como feito e nunca mais tentava. Agora só marca como feito
// depois de terminar sem erro, e tenta o dia inteiro (não só entre
// 5h–5h05) até conseguir.
async function rodarBackupAutomaticoDiario() {
  const hojeStr = dataBrasilia(0);

  if (ultimoDiaBackupAutomatico === hojeStr) {
    return;
  }

  try {
    const backup = await gerarBackupCompleto();
    const conteudoTexto = JSON.stringify(backup);
    const tamanhoBytes = Buffer.byteLength(conteudoTexto, "utf8");

    const { error: erroInsert } = await supabase
      .from("backups_automaticos")
      .insert([{ conteudo: backup, tamanho_bytes: tamanhoBytes }]);

    if (erroInsert) {
      throw erroInsert;
    }

    await supabase.from("log_auditoria").insert([
      {
        usuario_id: null,
        usuario_nome: "Automação (Backup diário)",
        acao: "gerou backup automático dos dados",
        tabela_afetada: "sistema",
        registro_id: null,
        detalhes: `Backup gerado às 5h — ${(tamanhoBytes / 1024).toFixed(1)} KB.`,
      },
    ]);

    // Não guarda backup pra sempre — mantém só os últimos 30 dias, pra
    // tabela não crescer sem limite.
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

    await supabase
      .from("backups_automaticos")
      .delete()
      .lt("criado_em", trintaDiasAtras.toISOString());

    ultimoDiaBackupAutomatico = hojeStr;
  } catch (erro) {
    console.error(
      "Erro no backup automático diário — vai tentar de novo no próximo minuto:",
      erro.message
    );
    await registrarFalhaAutomacao("Backup diário", erro.message);
  }
}

// Confere a cada minuto se o backup de hoje ainda não rodou — antes só
// tentava na janela 05:00–05:04; agora tenta o dia inteiro até conseguir
// (mesmo padrão da importação da Saipos).
setInterval(function () {
  rodarBackupAutomaticoDiario();
}, 60 * 1000);

const colunasListagem =
  "id, created_at, tipo, descricao, valor, data, grupo, categoria, subcategoria, fornecedor, item, quantidade, unidade, observacao, tem_foto, tem_foto_mercadoria, foto_pendente_em, latitude, longitude, precisao_metros, capturado_em, loja_id, status, forma_pagamento_id, pago_em_dinheiro, valor_bruto, valor_liquido_esperado, data_prevista_recebimento, status_conciliacao";

app.get("/lancamentos", verificarPermissao(PERM_LANCAMENTOS), async function (req, res) {
  try {
    const { data, error } = await supabase
      .from("lancamentos")
      .select(colunasListagem)
      .order("data", { ascending: false })
      .order("id", { ascending: false });

    if (error) {
      throw error;
    }

    res.json(data || []);
  } catch (erro) {
    console.error(
      "Erro ao buscar lançamentos:",
      erro.message
    );

    res.status(500).json({
      erro: "Não foi possível buscar os lançamentos.",
      detalhes: erro.message,
    });
  }
});

// Pedido do usuário (13/08/2026): histórico de preço pago por fornecedor,
// pra identificar quem tá cobrando caro e quem tá com bom preço. Usa só a
// tabela `lancamentos` (despesas) — quando uma Conta a Pagar é paga, ela já
// vira uma despesa automaticamente lá (rota /contas-pagar/:id/pagar), então
// não precisa somar as duas tabelas (isso duplicaria os valores).
const PERM_FORNECEDORES = ["despesas", "contas_pagar", "relatorios"];

app.get(
  "/fornecedores/historico",
  verificarPermissao(PERM_FORNECEDORES),
  async function (req, res) {
    try {
      const { data, error } = await supabase
        .from("lancamentos")
        .select(
          "id, descricao, valor, data, fornecedor, item, quantidade, unidade, loja_id, categoria"
        )
        .eq("tipo", "despesa")
        .not("fornecedor", "is", null)
        .neq("fornecedor", "")
        .order("data", { ascending: true });

      if (error) {
        throw error;
      }

      // Limiar de 15% pra cima/baixo da própria média histórica —
      // simples de explicar pro usuário.
      const LIMIAR_VARIACAO = 15;

      function calcularIndicador(valorAtual, valorMedio) {
        const variacao =
          valorMedio > 0 ? ((valorAtual - valorMedio) / valorMedio) * 100 : 0;

        return {
          variacao_percentual: Number(variacao.toFixed(1)),
          indicador:
            variacao >= LIMIAR_VARIACAO
              ? "abusivo"
              : variacao <= -LIMIAR_VARIACAO
              ? "bom"
              : "normal",
        };
      }

      // Preferência do usuário (13/08/2026): comparar por ITEM (preço por
      // kg/litro/unidade), não só o valor total da compra — só cai no
      // "valor total" quando a compra não tem item+quantidade preenchidos
      // (ex.: aluguel, conta de luz, essas não tem "preço por unidade").
      const gruposFornecedor = {};

      (data || []).forEach((lancamento) => {
        const nomeFornecedor = (lancamento.fornecedor || "").trim();

        if (!nomeFornecedor) return;

        if (!gruposFornecedor[nomeFornecedor]) {
          gruposFornecedor[nomeFornecedor] = { itens: {}, semItem: [] };
        }

        const quantidade = Number(lancamento.quantidade || 0);
        const nomeItem = (lancamento.item || "").trim();
        const valor = Number(lancamento.valor || 0);

        if (nomeItem && quantidade > 0) {
          const chaveItem = nomeItem.toLowerCase();

          if (!gruposFornecedor[nomeFornecedor].itens[chaveItem]) {
            gruposFornecedor[nomeFornecedor].itens[chaveItem] = {
              item: nomeItem,
              unidade: lancamento.unidade || "",
              compras: [],
            };
          }

          gruposFornecedor[nomeFornecedor].itens[chaveItem].compras.push({
            id: lancamento.id,
            descricao: lancamento.descricao,
            data: lancamento.data,
            valor,
            quantidade,
            preco_unidade: Number((valor / quantidade).toFixed(4)),
          });
        } else {
          gruposFornecedor[nomeFornecedor].semItem.push({
            id: lancamento.id,
            descricao: lancamento.descricao,
            data: lancamento.data,
            valor,
          });
        }
      });

      const fornecedores = Object.entries(gruposFornecedor)
        .map(([fornecedor, grupo]) => {
          const itens = Object.values(grupo.itens)
            .map((itemGrupo) => {
              const precoTotal = itemGrupo.compras.reduce(
                (soma, c) => soma + c.preco_unidade,
                0
              );
              const precoMedioUnidade = precoTotal / itemGrupo.compras.length;

              const comprasComIndicador = itemGrupo.compras.map((compra) => ({
                ...compra,
                ...calcularIndicador(compra.preco_unidade, precoMedioUnidade),
              }));

              const ultimaCompra =
                comprasComIndicador[comprasComIndicador.length - 1];

              return {
                item: itemGrupo.item,
                unidade: itemGrupo.unidade,
                total_compras: itemGrupo.compras.length,
                preco_medio_unidade: Number(precoMedioUnidade.toFixed(2)),
                menor_preco_unidade: Number(
                  Math.min(...itemGrupo.compras.map((c) => c.preco_unidade)).toFixed(2)
                ),
                maior_preco_unidade: Number(
                  Math.max(...itemGrupo.compras.map((c) => c.preco_unidade)).toFixed(2)
                ),
                ultima_compra: ultimaCompra,
                compras: comprasComIndicador.slice().reverse(),
              };
            })
            .sort((a, b) => b.total_compras - a.total_compras);

          const semItemValorTotal = grupo.semItem.reduce(
            (soma, c) => soma + c.valor,
            0
          );
          const semItemValorMedio =
            grupo.semItem.length > 0
              ? semItemValorTotal / grupo.semItem.length
              : 0;

          const semItem =
            grupo.semItem.length > 0
              ? {
                  total_compras: grupo.semItem.length,
                  valor_total: Number(semItemValorTotal.toFixed(2)),
                  valor_medio: Number(semItemValorMedio.toFixed(2)),
                  compras: grupo.semItem
                    .map((compra) => ({
                      ...compra,
                      ...calcularIndicador(compra.valor, semItemValorMedio),
                    }))
                    .slice()
                    .reverse(),
                }
              : null;

          const totalCompras =
            itens.reduce((soma, i) => soma + i.total_compras, 0) +
            (semItem?.total_compras || 0);

          return {
            fornecedor,
            total_compras: totalCompras,
            itens,
            sem_item: semItem,
          };
        })
        .sort((a, b) => b.total_compras - a.total_compras);

      res.json(fornecedores);
    } catch (erro) {
      console.error("Erro ao montar histórico de fornecedores:", erro.message);

      res.status(500).json({
        erro: "Não foi possível montar o histórico de fornecedores.",
        detalhes: erro.message,
      });
    }
  }
);

app.get("/lancamentos/:id/foto", verificarPermissao(PERM_LANCAMENTOS), async function (req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({
        erro: "ID do lançamento inválido.",
      });
    }

    const { data, error } = await supabase
      .from("lancamentos")
      .select("foto, fotos_extra, foto_pendente, foto_pendente_em")
      .eq("id", id)
      .single();

    if (error) {
      throw error;
    }

    res.json({
      foto: data?.foto || "",
      fotos_extra: Array.isArray(data?.fotos_extra) ? data.fotos_extra : [],
      foto_pendente: data?.foto_pendente_em ? data.foto_pendente || "" : null,
    });
  } catch (erro) {
    console.error(
      "Erro ao buscar foto do lançamento:",
      erro.message
    );

    res.status(500).json({
      erro: "Não foi possível buscar a foto.",
      detalhes: erro.message,
    });
  }
});

app.get("/lancamentos/:id/foto-mercadoria", verificarPermissao(PERM_LANCAMENTOS), async function (req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({
        erro: "ID do lançamento inválido.",
      });
    }

    const { data, error } = await supabase
      .from("lancamentos")
      .select("foto_mercadoria")
      .eq("id", id)
      .single();

    if (error) {
      throw error;
    }

    res.json({ foto_mercadoria: data?.foto_mercadoria || "" });
  } catch (erro) {
    console.error(
      "Erro ao buscar foto da mercadoria:",
      erro.message
    );

    res.status(500).json({
      erro: "Não foi possível buscar a foto da mercadoria.",
      detalhes: erro.message,
    });
  }
});

app.post("/lancamentos", verificarPermissao(PERM_LANCAMENTOS), async function (req, res) {
  try {
    const { perfil } = await obterPerfilOpcional(req);
    const dadosPreparados = prepararLancamento(req.body);

    if (
      dadosPreparados.tipo === "receita" &&
      perfil?.perfil !== "administrador"
    ) {
      return res.status(403).json({
        erro: "Só o administrador pode lançar receitas manualmente.",
      });
    }

    let status = "aprovado";

    if (dadosPreparados.tipo === "despesa" && perfil?.perfil !== "administrador") {
      const precisaAprovacao = await aprovacaoDespesasAtiva();

      if (precisaAprovacao) {
        status = "pendente";
      }
    }

    const novoLancamento = {
      id: Date.now(),
      ...dadosPreparados,
      status,
    };

    const { data, error } = await supabase
      .from("lancamentos")
      .insert([novoLancamento])
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    registrarAuditoria(
      req,
      "criou",
      "lancamentos",
      data.id,
      `${data.tipo}: ${data.descricao} (${data.valor})`
    );

    res.status(201).json(data);
  } catch (erro) {
    console.error(
      "Erro ao criar lançamento:",
      erro.message
    );

    res.status(500).json({
      erro: "Não foi possível criar o lançamento.",
      detalhes: erro.message,
    });
  }
});

app.put("/lancamentos/:id", verificarPermissao(PERM_LANCAMENTOS), async function (req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({
        erro: "ID do lançamento inválido.",
      });
    }

    const lancamentoAtualizado =
      prepararLancamento(req.body);

    if (
      lancamentoAtualizado.tipo === "receita" &&
      (await obterPerfilOpcional(req)).perfil?.perfil !== "administrador"
    ) {
      return res.status(403).json({
        erro: "Só o administrador pode editar lançamentos de receita.",
      });
    }

    const { data: lancamentoExistente, error: erroBusca } = await supabase
      .from("lancamentos")
      .select("data, foto")
      .eq("id", id)
      .single();

    if (erroBusca) {
      throw erroBusca;
    }

    // Trocar (ou remover) uma foto que já estava anexada precisa de
    // autorização do administrador — só o primeiro anexo (lançamento sem
    // foto ainda) segue direto. O administrador não passa por essa
    // trava, já que é ele mesmo quem autoriza.
    const ehAdminEditando = req.perfilLogado?.perfil === "administrador";
    const fotoAtual = lancamentoExistente?.foto || "";
    const fotoSolicitada = lancamentoAtualizado.foto || "";
    const estaAlterandoFotoJaExistente =
      fotoAtual && fotoSolicitada !== fotoAtual;
    let aguardandoAprovacaoFoto = false;

    if (estaAlterandoFotoJaExistente && !ehAdminEditando) {
      aguardandoAprovacaoFoto = true;
      lancamentoAtualizado.foto = fotoAtual;
      lancamentoAtualizado.foto_pendente = fotoSolicitada;
      lancamentoAtualizado.foto_pendente_em = new Date().toISOString();
    }

    if (mesBloqueado(lancamentoExistente?.data)) {
      const ehAdmin = req.perfilLogado?.perfil === "administrador";
      const senhaOk =
        ehAdmin &&
        (await senhaAdminConfirmada(
          req.usuarioLogado.email,
          req.body.senha_confirmacao
        ));

      if (!senhaOk) {
        return res.status(403).json({
          erro: ehAdmin
            ? "Senha incorreta. Digite sua senha pra confirmar a edição de um lançamento de mês encerrado."
            : "Esse lançamento é de um mês já encerrado e não pode mais ser editado.",
        });
      }

      registrarAuditoria(
        req,
        "destravou mês encerrado (editar)",
        "lancamentos",
        id,
        null
      );
    }

    const { data, error } = await supabase
      .from("lancamentos")
      .update(lancamentoAtualizado)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    registrarAuditoria(
      req,
      aguardandoAprovacaoFoto ? "solicitou troca de foto" : "editou",
      "lancamentos",
      data.id,
      `${data.tipo}: ${data.descricao} (${data.valor})`
    );

    res.json({ ...data, aguardando_aprovacao_foto: aguardandoAprovacaoFoto });
  } catch (erro) {
    console.error(
      "Erro ao atualizar lançamento:",
      erro.message
    );

    res.status(500).json({
      erro: "Não foi possível atualizar o lançamento.",
      detalhes: erro.message,
    });
  }
});

app.delete(
  "/lancamentos/:id",
  verificarPermissao(PERM_LANCAMENTOS),
  async function (req, res) {
    try {
      const id = Number(req.params.id);

      if (!Number.isFinite(id)) {
        return res.status(400).json({
          erro: "ID do lançamento inválido.",
        });
      }

      const { data: lancamentoExistente, error: erroBusca } = await supabase
        .from("lancamentos")
        .select("data")
        .eq("id", id)
        .single();

      if (erroBusca) {
        throw erroBusca;
      }

      if (mesBloqueado(lancamentoExistente?.data)) {
        const ehAdmin = req.perfilLogado?.perfil === "administrador";
        const senhaOk =
          ehAdmin &&
          (await senhaAdminConfirmada(
            req.usuarioLogado.email,
            req.body?.senha_confirmacao
          ));

        if (!senhaOk) {
          return res.status(403).json({
            erro: ehAdmin
              ? "Senha incorreta. Digite sua senha pra confirmar a exclusão de um lançamento de mês encerrado."
              : "Esse lançamento é de um mês já encerrado e não pode mais ser excluído.",
          });
        }

        registrarAuditoria(
          req,
          "destravou mês encerrado (excluir)",
          "lancamentos",
          id,
          null
        );
      }

      // Pedido do usuário (21/08/2026): aprovação de exclusão — mesma
      // trava que já existia pra CRIAR despesa (aprovacao_despesas_ativa),
      // agora também pra EXCLUIR. Quem não é admin não apaga na hora —
      // só fica marcado como "pedido de exclusão pendente", visível pra
      // um admin aprovar ou rejeitar. O admin sempre exclui direto (é
      // ele mesmo quem aprovaria, não faz sentido pedir pra si mesmo).
      const { perfil: perfilQuemExclui } = await obterPerfilOpcional(req);
      const ehAdminExcluindo = perfilQuemExclui?.perfil === "administrador";

      if (!ehAdminExcluindo && (await aprovacaoDespesasAtiva())) {
        const { data: pendente, error: erroPendente } = await supabase
          .from("lancamentos")
          .update({
            exclusao_solicitada_em: new Date().toISOString(),
            exclusao_solicitada_por: perfilQuemExclui?.nome || "",
          })
          .eq("id", id)
          .select("*")
          .single();

        if (erroPendente) {
          throw erroPendente;
        }

        registrarAuditoria(
          req,
          "solicitou exclusão",
          "lancamentos",
          id,
          `Aguardando aprovação de um administrador.`
        );

        return res.status(202).json({
          pendente: true,
          mensagem:
            "Pedido de exclusão enviado — aguardando aprovação de um administrador.",
          lancamento: pendente,
        });
      }

      // BUG REAL corrigido (18/08/2026): excluir uma despesa que nasceu de
      // pagar uma Conta a Pagar (ou que o admin excluiu direto pela tela
      // Contas Pagas) deixava a Conta a Pagar "órfã" — continuava marcada
      // "pago", com lancamento_id apontando pra um lançamento que não
      // existe mais. Isso escondia o valor de qualquer relatório E
      // travava a Despesa Recorrente de gerar uma conta nova no mês
      // seguinte (o marcador [RECORRENTE:...:mês] continuava "existindo").
      // Mesma lógica já usada no sentido contrário (excluir a conta a
      // pagar reverte a despesa) — aqui reverte a conta a pagar pra
      // pendente de novo, como se nunca tivesse sido paga.
      const { data: contaVinculada } = await supabase
        .from("contas_pagar")
        .select("id, descricao, valor")
        .eq("lancamento_id", id)
        .maybeSingle();

      if (contaVinculada) {
        await supabase
          .from("contas_pagar")
          .update({ status: "pendente", data_pagamento: null, lancamento_id: null })
          .eq("id", contaVinculada.id);

        registrarAuditoria(
          req,
          "reverteu pra pendente (despesa excluída)",
          "contas_pagar",
          contaVinculada.id,
          `${contaVinculada.descricao} (${contaVinculada.valor}) voltou a ser Conta a Pagar pendente porque a despesa vinculada foi excluída.`
        );
      }

      const { error } = await supabase
        .from("lancamentos")
        .delete()
        .eq("id", id);

      if (error) {
        throw error;
      }

      registrarAuditoria(req, "excluiu", "lancamentos", id, null);

      res.status(204).send();
    } catch (erro) {
      console.error(
        "Erro ao excluir lançamento:",
        erro.message
      );

      res.status(500).json({
        erro: "Não foi possível excluir o lançamento.",
        detalhes: erro.message,
      });
    }
  }
);

app.put(
  "/lancamentos/:id/aprovar",
  verificarPermissao("aprovar_despesas"),
  async function (req, res) {
    try {
      const id = Number(req.params.id);

      if (!Number.isFinite(id)) {
        return res.status(400).json({
          erro: "ID do lançamento inválido.",
        });
      }

      const { data, error } = await supabase
        .from("lancamentos")
        .update({ status: "aprovado" })
        .eq("id", id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      registrarAuditoria(req, "aprovou", "lancamentos", id, null);

      res.json(data);
    } catch (erro) {
      console.error("Erro ao aprovar lançamento:", erro.message);

      res.status(500).json({
        erro: "Não foi possível aprovar o lançamento.",
        detalhes: erro.message,
      });
    }
  }
);

app.put(
  "/lancamentos/:id/rejeitar",
  verificarPermissao("aprovar_despesas"),
  async function (req, res) {
    try {
      const id = Number(req.params.id);

      if (!Number.isFinite(id)) {
        return res.status(400).json({
          erro: "ID do lançamento inválido.",
        });
      }

      const { data, error } = await supabase
        .from("lancamentos")
        .update({ status: "rejeitado" })
        .eq("id", id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      registrarAuditoria(req, "rejeitou", "lancamentos", id, null);

      res.json(data);
    } catch (erro) {
      console.error("Erro ao rejeitar lançamento:", erro.message);

      res.status(500).json({
        erro: "Não foi possível rejeitar o lançamento.",
        detalhes: erro.message,
      });
    }
  }
);

// Pedido do usuário (21/08/2026): aprovação de EXCLUSÃO de lançamento —
// mesmo espírito de aprovar-foto acima, só que pra apagar em vez de
// trocar foto. "Aprovar exclusão" de fato apaga (reaproveita a mesma
// lógica de reverter conta a pagar vinculada que o DELETE normal já
// tinha). "Rejeitar exclusão" só limpa a marcação, o lançamento
// continua existindo normal.
app.put(
  "/lancamentos/:id/aprovar-exclusao",
  verificarPermissao("aprovar_despesas"),
  async function (req, res) {
    try {
      const id = Number(req.params.id);

      if (!Number.isFinite(id)) {
        return res.status(400).json({ erro: "ID do lançamento inválido." });
      }

      const { data: contaVinculada } = await supabase
        .from("contas_pagar")
        .select("id, descricao, valor")
        .eq("lancamento_id", id)
        .maybeSingle();

      if (contaVinculada) {
        await supabase
          .from("contas_pagar")
          .update({ status: "pendente", data_pagamento: null, lancamento_id: null })
          .eq("id", contaVinculada.id);

        registrarAuditoria(
          req,
          "reverteu pra pendente (despesa excluída)",
          "contas_pagar",
          contaVinculada.id,
          `${contaVinculada.descricao} (${contaVinculada.valor}) voltou a ser Conta a Pagar pendente porque a despesa vinculada foi excluída.`
        );
      }

      const { error } = await supabase.from("lancamentos").delete().eq("id", id);

      if (error) {
        throw error;
      }

      registrarAuditoria(req, "excluiu", "lancamentos", id, "Exclusão aprovada.");

      res.status(204).send();
    } catch (erro) {
      console.error("Erro ao aprovar exclusão de lançamento:", erro.message);
      res.status(500).json({
        erro: "Não foi possível aprovar a exclusão.",
        detalhes: erro.message,
      });
    }
  }
);

app.put(
  "/lancamentos/:id/rejeitar-exclusao",
  verificarPermissao("aprovar_despesas"),
  async function (req, res) {
    try {
      const id = Number(req.params.id);

      if (!Number.isFinite(id)) {
        return res.status(400).json({ erro: "ID do lançamento inválido." });
      }

      const { data, error } = await supabase
        .from("lancamentos")
        .update({ exclusao_solicitada_em: null, exclusao_solicitada_por: null })
        .eq("id", id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      registrarAuditoria(req, "rejeitou exclusão", "lancamentos", id, null);

      res.json(data);
    } catch (erro) {
      console.error("Erro ao rejeitar exclusão de lançamento:", erro.message);
      res.status(500).json({
        erro: "Não foi possível rejeitar a exclusão.",
        detalhes: erro.message,
      });
    }
  }
);

// Aprova/rejeita uma troca (ou remoção) de foto que um usuário sem
// permissão de administrador pediu num lançamento que já tinha foto —
// pedido do usuário: "só alterar a foto de despesas depois de um aviso
// para eu autorizar". A foto antiga só é substituída na aprovação.
app.put(
  "/lancamentos/:id/aprovar-foto",
  verificarPermissao("aprovar_despesas"),
  async function (req, res) {
    try {
      const id = Number(req.params.id);

      if (!Number.isFinite(id)) {
        return res.status(400).json({
          erro: "ID do lançamento inválido.",
        });
      }

      const { data: atual, error: erroBusca } = await supabase
        .from("lancamentos")
        .select("foto_pendente, foto_pendente_em, descricao, valor")
        .eq("id", id)
        .single();

      if (erroBusca) {
        throw erroBusca;
      }

      if (!atual?.foto_pendente_em) {
        return res.status(400).json({
          erro: "Esse lançamento não tem nenhuma troca de foto pendente.",
        });
      }

      const { data, error } = await supabase
        .from("lancamentos")
        .update({
          foto: atual.foto_pendente || "",
          foto_pendente: null,
          foto_pendente_em: null,
        })
        .eq("id", id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      registrarAuditoria(
        req,
        "aprovou troca de foto",
        "lancamentos",
        id,
        `${atual.descricao} (${atual.valor})`
      );

      res.json(data);
    } catch (erro) {
      console.error("Erro ao aprovar troca de foto:", erro.message);

      res.status(500).json({
        erro: "Não foi possível aprovar a troca de foto.",
        detalhes: erro.message,
      });
    }
  }
);

app.put(
  "/lancamentos/:id/rejeitar-foto",
  verificarPermissao("aprovar_despesas"),
  async function (req, res) {
    try {
      const id = Number(req.params.id);

      if (!Number.isFinite(id)) {
        return res.status(400).json({
          erro: "ID do lançamento inválido.",
        });
      }

      const { data, error } = await supabase
        .from("lancamentos")
        .update({ foto_pendente: null, foto_pendente_em: null })
        .eq("id", id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      registrarAuditoria(req, "rejeitou troca de foto", "lancamentos", id, null);

      res.json(data);
    } catch (erro) {
      console.error("Erro ao rejeitar troca de foto:", erro.message);

      res.status(500).json({
        erro: "Não foi possível rejeitar a troca de foto.",
        detalhes: erro.message,
      });
    }
  }
);

app.get("/lojas", verificarAdmin, async function (req, res) {
  try {
    const { data, error } = await supabase
      .from("lojas")
      .select("*")
      .order("nome", { ascending: true });

    if (error) {
      throw error;
    }

    res.json(data || []);
  } catch (erro) {
    console.error("Erro ao buscar lojas:", erro.message);

    res.status(500).json({
      erro: "Não foi possível buscar as lojas.",
      detalhes: erro.message,
    });
  }
});

app.post("/lojas", verificarAdmin, async function (req, res) {
  try {
    const dadosLoja = prepararLoja(req.body);

    if (!dadosLoja.nome) {
      return res.status(400).json({
        erro: "Informe o nome da loja.",
      });
    }

    const { data, error } = await supabase
      .from("lojas")
      .insert([dadosLoja])
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    registrarAuditoria(req, "criou", "lojas", data.id, data.nome);

    res.status(201).json(data);
  } catch (erro) {
    console.error("Erro ao criar loja:", erro.message);

    res.status(500).json({
      erro: "Não foi possível criar a loja.",
      detalhes: erro.message,
    });
  }
});

app.put("/lojas/:id", verificarAdmin, async function (req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({
        erro: "ID da loja inválido.",
      });
    }

    const dadosLoja = prepararLoja(req.body);

    if (!dadosLoja.nome) {
      return res.status(400).json({
        erro: "Informe o nome da loja.",
      });
    }

    const { data, error } = await supabase
      .from("lojas")
      .update(dadosLoja)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    registrarAuditoria(req, "editou", "lojas", data.id, data.nome);

    res.json(data);
  } catch (erro) {
    console.error("Erro ao atualizar loja:", erro.message);

    res.status(500).json({
      erro: "Não foi possível atualizar a loja.",
      detalhes: erro.message,
    });
  }
});

app.delete("/lojas/:id", verificarAdmin, async function (req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({
        erro: "ID da loja inválido.",
      });
    }

    const { error } = await supabase
      .from("lojas")
      .delete()
      .eq("id", id);

    if (error) {
      throw error;
    }

    registrarAuditoria(req, "excluiu", "lojas", id, null);

    res.status(204).send();
  } catch (erro) {
    console.error("Erro ao excluir loja:", erro.message);

    res.status(500).json({
      erro: "Não foi possível excluir a loja.",
      detalhes: erro.message,
    });
  }
});

app.get("/categorias", verificarPermissao(PERM_CATEGORIAS), async function (req, res) {
  try {
    const { data, error } = await supabase
      .from("categorias")
      .select("*")
      .order("nome", { ascending: true });

    if (error) {
      throw error;
    }

    res.json(data || []);
  } catch (erro) {
    console.error("Erro ao buscar categorias:", erro.message);

    res.status(500).json({
      erro: "Não foi possível buscar as categorias.",
      detalhes: erro.message,
    });
  }
});

app.post("/categorias", verificarPermissao(PERM_CATEGORIAS), async function (req, res) {
  try {
    const nome = (req.body.nome || "").trim();

    if (!nome) {
      return res.status(400).json({
        erro: "Informe o nome da categoria.",
      });
    }

    const dadosCategoria = {
      nome,
      cor: req.body.cor || "#2563eb",
      icone: req.body.icone || "📁",
    };

    const { data, error } = await supabase
      .from("categorias")
      .insert([dadosCategoria])
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    res.status(201).json(data);
  } catch (erro) {
    console.error("Erro ao criar categoria:", erro.message);

    res.status(500).json({
      erro: "Não foi possível criar a categoria.",
      detalhes: erro.message,
    });
  }
});

app.put("/categorias/:id", verificarPermissao(PERM_CATEGORIAS), async function (req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({
        erro: "ID da categoria inválido.",
      });
    }

    const nome = (req.body.nome || "").trim();

    if (!nome) {
      return res.status(400).json({
        erro: "Informe o nome da categoria.",
      });
    }

    const dadosCategoria = {
      nome,
      cor: req.body.cor || "#2563eb",
      icone: req.body.icone || "📁",
    };

    const { data, error } = await supabase
      .from("categorias")
      .update(dadosCategoria)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    res.json(data);
  } catch (erro) {
    console.error("Erro ao atualizar categoria:", erro.message);

    res.status(500).json({
      erro: "Não foi possível atualizar a categoria.",
      detalhes: erro.message,
    });
  }
});

app.delete("/categorias/:id", verificarPermissao(PERM_CATEGORIAS), async function (req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({
        erro: "ID da categoria inválido.",
      });
    }

    const { error } = await supabase
      .from("categorias")
      .delete()
      .eq("id", id);

    if (error) {
      throw error;
    }

    res.status(204).send();
  } catch (erro) {
    console.error("Erro ao excluir categoria:", erro.message);

    res.status(500).json({
      erro: "Não foi possível excluir a categoria.",
      detalhes: erro.message,
    });
  }
});

function prepararCliente(dados = {}) {
  return {
    loja_id: dados.loja_id ? Number(dados.loja_id) : null,
    nome: (dados.nome || "").trim(),
    telefone: (dados.telefone || "").trim(),
    email: (dados.email || "").trim(),
    endereco: (dados.endereco || "").trim(),
    observacoes: (dados.observacoes || "").trim(),
  };
}

app.get("/clientes", verificarPermissao("clientes"), async function (req, res) {
  try {
    const { data, error } = await supabase
      .from("clientes")
      .select("*")
      .order("nome", { ascending: true });

    if (error) {
      throw error;
    }

    res.json(data || []);
  } catch (erro) {
    console.error("Erro ao buscar clientes:", erro.message);

    res.status(500).json({
      erro: "Não foi possível buscar os clientes.",
      detalhes: erro.message,
    });
  }
});

app.post("/clientes", verificarPermissao("clientes"), async function (req, res) {
  try {
    const dadosCliente = prepararCliente(req.body);

    if (!dadosCliente.nome) {
      return res.status(400).json({
        erro: "Informe o nome do cliente.",
      });
    }

    const { data, error } = await supabase
      .from("clientes")
      .insert([dadosCliente])
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    res.status(201).json(data);
  } catch (erro) {
    console.error("Erro ao criar cliente:", erro.message);

    res.status(500).json({
      erro: "Não foi possível criar o cliente.",
      detalhes: erro.message,
    });
  }
});

app.put("/clientes/:id", verificarPermissao("clientes"), async function (req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({
        erro: "ID do cliente inválido.",
      });
    }

    const dadosCliente = prepararCliente(req.body);

    if (!dadosCliente.nome) {
      return res.status(400).json({
        erro: "Informe o nome do cliente.",
      });
    }

    const { data, error } = await supabase
      .from("clientes")
      .update(dadosCliente)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    res.json(data);
  } catch (erro) {
    console.error("Erro ao atualizar cliente:", erro.message);

    res.status(500).json({
      erro: "Não foi possível atualizar o cliente.",
      detalhes: erro.message,
    });
  }
});

app.delete("/clientes/:id", verificarPermissao("clientes"), async function (req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({
        erro: "ID do cliente inválido.",
      });
    }

    const { error } = await supabase
      .from("clientes")
      .delete()
      .eq("id", id);

    if (error) {
      throw error;
    }

    res.status(204).send();
  } catch (erro) {
    console.error("Erro ao excluir cliente:", erro.message);

    res.status(500).json({
      erro: "Não foi possível excluir o cliente.",
      detalhes: erro.message,
    });
  }
});

app.get("/clientes/:id/atendimentos", verificarPermissao("clientes"), async function (req, res) {
  try {
    const clienteId = Number(req.params.id);

    if (!Number.isFinite(clienteId)) {
      return res.status(400).json({
        erro: "ID do cliente inválido.",
      });
    }

    const { data, error } = await supabase
      .from("atendimentos_clientes")
      .select("*")
      .eq("cliente_id", clienteId)
      .order("data", { ascending: false })
      .order("id", { ascending: false });

    if (error) {
      throw error;
    }

    res.json(data || []);
  } catch (erro) {
    console.error("Erro ao buscar atendimentos:", erro.message);

    res.status(500).json({
      erro: "Não foi possível buscar os atendimentos.",
      detalhes: erro.message,
    });
  }
});

app.post("/clientes/:id/atendimentos", verificarPermissao("clientes"), async function (req, res) {
  try {
    const clienteId = Number(req.params.id);

    if (!Number.isFinite(clienteId)) {
      return res.status(400).json({
        erro: "ID do cliente inválido.",
      });
    }

    const dadosAtendimento = {
      cliente_id: clienteId,
      data: req.body.data || new Date().toISOString().slice(0, 10),
      valor:
        req.body.valor !== "" && req.body.valor != null
          ? Number(req.body.valor)
          : null,
      observacao: (req.body.observacao || "").trim(),
    };

    const { data, error } = await supabase
      .from("atendimentos_clientes")
      .insert([dadosAtendimento])
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    res.status(201).json(data);
  } catch (erro) {
    console.error("Erro ao criar atendimento:", erro.message);

    res.status(500).json({
      erro: "Não foi possível registrar o atendimento.",
      detalhes: erro.message,
    });
  }
});

app.delete("/atendimentos/:id", verificarPermissao("clientes"), async function (req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({
        erro: "ID do atendimento inválido.",
      });
    }

    const { error } = await supabase
      .from("atendimentos_clientes")
      .delete()
      .eq("id", id);

    if (error) {
      throw error;
    }

    res.status(204).send();
  } catch (erro) {
    console.error("Erro ao excluir atendimento:", erro.message);

    res.status(500).json({
      erro: "Não foi possível excluir o atendimento.",
      detalhes: erro.message,
    });
  }
});

function prepararFormaPagamento(dados = {}) {
  return {
    loja_id: dados.loja_id ? Number(dados.loja_id) : null,
    nome: (dados.nome || "").trim(),
    operadora: (dados.operadora || "").trim(),
    prazo_dias: dados.prazo_dias ? Number(dados.prazo_dias) : 0,
    taxa_percentual: dados.taxa_percentual
      ? Number(dados.taxa_percentual)
      : 0,
    // Pra quem paga sempre num dia fixo da semana (ex.: iFood paga toda
    // quarta), em vez de "N dias depois da venda". 0=domingo...6=sábado,
    // igual o Date.getDay() do JavaScript. null = usa só prazo_dias, como
    // antes.
    dia_semana_pagamento:
      dados.dia_semana_pagamento !== "" &&
      dados.dia_semana_pagamento != null
        ? Number(dados.dia_semana_pagamento)
        : null,
    ativo: dados.ativo !== false,
  };
}

app.get("/log-auditoria", verificarAdmin, async function (req, res) {
  try {
    const { data, error } = await supabase
      .from("log_auditoria")
      .select("*")
      .order("criado_em", { ascending: false })
      .limit(500);

    if (error) {
      throw error;
    }

    res.json(data || []);
  } catch (erro) {
    console.error("Erro ao buscar log de auditoria:", erro.message);

    res.status(500).json({
      erro: "Não foi possível buscar o log de auditoria.",
      detalhes: erro.message,
    });
  }
});

app.get("/formas-pagamento", verificarPermissao(PERM_CONTAS_RECEBER), async function (req, res) {
  try {
    const { data, error } = await supabase
      .from("formas_pagamento")
      .select("*")
      .order("nome", { ascending: true });

    if (error) {
      throw error;
    }

    res.json(data || []);
  } catch (erro) {
    console.error("Erro ao buscar formas de pagamento:", erro.message);

    res.status(500).json({
      erro: "Não foi possível buscar as formas de pagamento.",
      detalhes: erro.message,
    });
  }
});

app.post("/formas-pagamento", verificarPermissao(PERM_CONTAS_RECEBER), async function (req, res) {
  try {
    const dados = prepararFormaPagamento(req.body);

    if (!dados.nome) {
      return res.status(400).json({
        erro: "Informe o nome da forma de pagamento.",
      });
    }

    const { data, error } = await supabase
      .from("formas_pagamento")
      .insert([dados])
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    registrarAuditoria(
      req,
      "criou",
      "formas_pagamento",
      data.id,
      `${data.nome}: D+${data.prazo_dias}, taxa ${data.taxa_percentual}%${
        data.dia_semana_pagamento != null
          ? ` (dia fixo ${data.dia_semana_pagamento})`
          : ""
      }`
    );

    res.status(201).json(data);
  } catch (erro) {
    console.error("Erro ao criar forma de pagamento:", erro.message);

    res.status(500).json({
      erro: "Não foi possível criar a forma de pagamento.",
      detalhes: erro.message,
    });
  }
});

app.put("/formas-pagamento/:id", verificarPermissao(PERM_CONTAS_RECEBER), async function (req, res) {
  try {
    const dados = prepararFormaPagamento(req.body);

    if (!dados.nome) {
      return res.status(400).json({
        erro: "Informe o nome da forma de pagamento.",
      });
    }

    const { data: antes } = await supabase
      .from("formas_pagamento")
      .select("prazo_dias, taxa_percentual, dia_semana_pagamento")
      .eq("id", req.params.id)
      .single();

    const { data, error } = await supabase
      .from("formas_pagamento")
      .update(dados)
      .eq("id", req.params.id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    registrarAuditoria(
      req,
      "editou",
      "formas_pagamento",
      data.id,
      `${data.nome}: de (D+${antes?.prazo_dias}, taxa ${antes?.taxa_percentual}%) para (D+${data.prazo_dias}, taxa ${data.taxa_percentual}%)${
        data.dia_semana_pagamento != null
          ? `, dia fixo ${data.dia_semana_pagamento}`
          : ""
      }`
    );

    res.json(data);
  } catch (erro) {
    console.error("Erro ao atualizar forma de pagamento:", erro.message);

    res.status(500).json({
      erro: "Não foi possível atualizar a forma de pagamento.",
      detalhes: erro.message,
    });
  }
});

app.delete("/formas-pagamento/:id", verificarPermissao(PERM_CONTAS_RECEBER), async function (req, res) {
  try {
    const { data: existente } = await supabase
      .from("formas_pagamento")
      .select("nome")
      .eq("id", req.params.id)
      .single();

    const { error } = await supabase
      .from("formas_pagamento")
      .delete()
      .eq("id", req.params.id);

    if (error) {
      throw error;
    }

    registrarAuditoria(
      req,
      "excluiu",
      "formas_pagamento",
      req.params.id,
      existente?.nome || null
    );

    res.status(204).send();
  } catch (erro) {
    console.error("Erro ao excluir forma de pagamento:", erro.message);

    res.status(500).json({
      erro: "Não foi possível excluir a forma de pagamento.",
      detalhes: erro.message,
    });
  }
});

function prepararContaPagar(dados = {}) {
  return {
    loja_id: dados.loja_id ? Number(dados.loja_id) : null,
    descricao: (dados.descricao || "").trim(),
    fornecedor: (dados.fornecedor || "").trim(),
    valor: Number(dados.valor || 0),
    data_vencimento: dados.data_vencimento || null,
    observacao: (dados.observacao || "").trim(),
    foto: dados.foto || "",
    pix: (dados.pix || "").trim(),
  };
}

app.get("/contas-pagar", verificarPermissao(PERM_CONTAS_PAGAR), async function (req, res) {
  try {
    const { data, error } = await supabase
      .from("contas_pagar")
      .select("*")
      .order("data_vencimento", { ascending: true });

    if (error) {
      throw error;
    }

    res.json(data || []);
  } catch (erro) {
    console.error("Erro ao buscar contas a pagar:", erro.message);

    res.status(500).json({
      erro: "Não foi possível buscar as contas a pagar.",
      detalhes: erro.message,
    });
  }
});

app.post("/contas-pagar", verificarPermissao(PERM_CONTAS_PAGAR), async function (req, res) {
  try {
    const dadosConta = prepararContaPagar(req.body);

    if (!dadosConta.descricao || !dadosConta.data_vencimento) {
      return res.status(400).json({
        erro: "Informe a descrição e a data de vencimento.",
      });
    }

    const { data, error } = await supabase
      .from("contas_pagar")
      .insert([dadosConta])
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    registrarAuditoria(
      req,
      "criou",
      "contas_pagar",
      data.id,
      `${data.descricao} (${data.valor})`
    );

    res.status(201).json(data);
  } catch (erro) {
    console.error("Erro ao criar conta a pagar:", erro.message);

    res.status(500).json({
      erro: "Não foi possível criar a conta a pagar.",
      detalhes: erro.message,
    });
  }
});

app.put("/contas-pagar/:id", verificarPermissao(PERM_CONTAS_PAGAR), async function (req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({
        erro: "ID da conta inválido.",
      });
    }

    const dadosConta = prepararContaPagar(req.body);

    if (!dadosConta.descricao || !dadosConta.data_vencimento) {
      return res.status(400).json({
        erro: "Informe a descrição e a data de vencimento.",
      });
    }

    const { data, error } = await supabase
      .from("contas_pagar")
      .update(dadosConta)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    registrarAuditoria(
      req,
      "editou",
      "contas_pagar",
      data.id,
      `${data.descricao} (${data.valor})`
    );

    res.json(data);
  } catch (erro) {
    console.error("Erro ao atualizar conta a pagar:", erro.message);

    res.status(500).json({
      erro: "Não foi possível atualizar a conta a pagar.",
      detalhes: erro.message,
    });
  }
});

app.put("/contas-pagar/:id/pagar", verificarPermissao(PERM_CONTAS_PAGAR), async function (req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({
        erro: "ID da conta inválido.",
      });
    }

    const { data: contaAtual, error: erroBusca } = await supabase
      .from("contas_pagar")
      .select("*")
      .eq("id", id)
      .single();

    if (erroBusca) {
      throw erroBusca;
    }

    // Guarda de idempotência: se já está paga (ex.: clique duplo, retry de
    // rede), não paga de novo nem duplica a despesa — só devolve o registro.
    if (contaAtual.status === "pago") {
      return res.json(contaAtual);
    }

    const agora = new Date();
    const dataPagamento = agora.toISOString().slice(0, 10);
    // Pedido do usuário (18/08/2026): guarda o HORÁRIO exato do
    // pagamento (não só a data) — usado pra ordenar/mostrar a lista de
    // Contas Pagas na ordem real de quando cada uma foi paga no
    // sistema, não da data impressa em nenhuma nota/comprovante.
    const pagoEm = agora.toISOString();

    // Pagar uma conta a pagar precisa dar baixa de verdade no saldo — cria
    // a despesa correspondente, do jeito que o usuário pediu: "toda conta
    // paga no contas a pagar confirmada tem que dar baixa no saldo".
    const novaDespesa = {
      id: Date.now(),
      tipo: "despesa",
      descricao: contaAtual.descricao,
      valor: Number(contaAtual.valor || 0),
      data: dataPagamento,
      grupo: "",
      categoria: "Outros",
      subcategoria: "",
      fornecedor: contaAtual.fornecedor || "",
      observacao: `Gerado automaticamente ao pagar a conta a pagar #${contaAtual.id} (${contaAtual.descricao}).`,
      foto: contaAtual.foto || "",
      loja_id: contaAtual.loja_id,
      status: "aprovado",
    };

    const { data: despesaCriada, error: erroDespesa } = await supabase
      .from("lancamentos")
      .insert([novaDespesa])
      .select("*")
      .single();

    if (erroDespesa) {
      throw erroDespesa;
    }

    const { data, error } = await supabase
      .from("contas_pagar")
      .update({
        status: "pago",
        data_pagamento: dataPagamento,
        pago_em: pagoEm,
        lancamento_id: despesaCriada.id,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    registrarAuditoria(
      req,
      "pagou",
      "contas_pagar",
      data.id,
      `${data.descricao} (${data.valor}) — despesa #${despesaCriada.id} lançada no saldo`
    );

    // Pedido do usuário (21/08/2026): "paguei essa conta com o saldo de
    // OUTRA loja" — em vez de um formulário separado, é uma marcação
    // aqui mesmo na hora de pagar. A despesa acima já ficou lançada
    // normal na loja da conta (devedora); aqui só cria o registro do
    // empréstimo, que soma de volta o valor no Saldo da devedora
    // (cancela o efeito da despesa que acabou de sair da própria
    // loja, já que quem realmente desembolsou foi a credora) e
    // desconta o mesmo valor da loja credora.
    const lojaCredoraId = Number(req.body?.loja_credora_id) || null;

    if (lojaCredoraId && lojaCredoraId !== Number(contaAtual.loja_id)) {
      const { usuario, perfil } = await obterPerfilOpcional(req);

      const { data: emprestimoCriado, error: erroEmprestimo } = await supabase
        .from("emprestimos_entre_lojas")
        .insert({
          loja_credora_id: lojaCredoraId,
          loja_devedora_id: contaAtual.loja_id,
          valor: Number(contaAtual.valor || 0),
          data: dataPagamento,
          descricao: `Pagamento da conta "${contaAtual.descricao}"`,
          origem_conta_pagar_id: contaAtual.id,
          criado_por: perfil?.nome || usuario?.email || "",
        })
        .select("*")
        .single();

      if (erroEmprestimo) {
        console.error(
          "Conta paga, mas falhou ao criar o empréstimo entre lojas vinculado:",
          erroEmprestimo.message
        );
      } else {
        registrarAuditoria(
          req,
          "criou",
          "emprestimos_entre_lojas",
          emprestimoCriado.id,
          `Empréstimo automático ao pagar a conta #${contaAtual.id} — loja ${lojaCredoraId} emprestou pra loja ${contaAtual.loja_id}`
        );
      }
    }

    res.json(data);
  } catch (erro) {
    console.error("Erro ao marcar conta como paga:", erro.message);

    res.status(500).json({
      erro: "Não foi possível marcar a conta como paga.",
      detalhes: erro.message,
    });
  }
  }
);

// Rota dedicada (não passa pelo prepararContaPagar/PUT normal) pra anexar o
// comprovante de pagamento sem correr risco de nenhuma outra edição (valor,
// pix, etc.) sobrescrever esse campo sem querer — só mexe nessa coluna.
app.put(
  "/contas-pagar/:id/comprovante",
  verificarPermissao(PERM_CONTAS_PAGAR),
  async function (req, res) {
    try {
      const id = Number(req.params.id);

      if (!Number.isFinite(id)) {
        return res.status(400).json({
          erro: "ID da conta inválido.",
        });
      }

      const { comprovante_pagamento } = req.body;

      const { data, error } = await supabase
        .from("contas_pagar")
        .update({ comprovante_pagamento: comprovante_pagamento || null })
        .eq("id", id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      registrarAuditoria(
        req,
        "anexou comprovante de pagamento em",
        "contas_pagar",
        data.id,
        data.descricao
      );

      res.json(data);
    } catch (erro) {
      console.error("Erro ao anexar comprovante de pagamento:", erro.message);

      res.status(500).json({
        erro: "Não foi possível anexar o comprovante.",
        detalhes: erro.message,
      });
    }
  }
);

// Despesas Recorrentes (12/08/2026) — pedido do usuário: aluguel, internet,
// contador etc. se repetem todo mês e hoje precisam ser lançadas na mão
// sempre. Isso é só o "molde"; quem gera a Conta a Pagar de verdade todo
// mês é a automação (rodarGeracaoDespesasRecorrentes, mais abaixo).
function prepararDespesaRecorrente(dados = {}) {
  // Pedido do usuário (19/08/2026): "mes_inicio" (formato AAAA-MM) define
  // a partir de qual mês essa recorrente vale de verdade — se a pessoa
  // cadastra hoje (ex: dia 19) uma recorrente com vencimento no dia 10
  // (já passado esse mês), ela pode escolher se isso conta como "já
  // atrasada agora" (deixa null/mês atual) ou "só a partir do mês que
  // vem" (manda o mês seguinte aqui).
  const mesInicioValido =
    typeof dados.mes_inicio === "string" &&
    /^\d{4}-\d{2}$/.test(dados.mes_inicio)
      ? dados.mes_inicio
      : null;

  return {
    descricao: (dados.descricao || "").trim(),
    fornecedor: (dados.fornecedor || "").trim(),
    valor: Number(dados.valor || 0),
    dia_vencimento: Number(dados.dia_vencimento || 1),
    loja_id: dados.loja_id ? Number(dados.loja_id) : null,
    observacao: (dados.observacao || "").trim(),
    ativo: dados.ativo !== false,
    mes_inicio: mesInicioValido,
  };
}

app.get(
  "/despesas-recorrentes",
  verificarPermissao(PERM_CONTAS_PAGAR),
  async function (req, res) {
    try {
      const { data, error } = await supabase
        .from("despesas_recorrentes")
        .select("*")
        .order("descricao", { ascending: true });

      if (error) {
        throw error;
      }

      res.json(data || []);
    } catch (erro) {
      console.error("Erro ao buscar despesas recorrentes:", erro.message);

      res.status(500).json({
        erro: "Não foi possível buscar as despesas recorrentes.",
        detalhes: erro.message,
      });
    }
  }
);

app.post(
  "/despesas-recorrentes",
  verificarPermissao(PERM_CONTAS_PAGAR),
  async function (req, res) {
    try {
      const dados = prepararDespesaRecorrente(req.body);

      if (!dados.descricao || !dados.valor || !dados.dia_vencimento) {
        return res.status(400).json({
          erro: "Informe a descrição, o valor e o dia do vencimento.",
        });
      }

      if (dados.dia_vencimento < 1 || dados.dia_vencimento > 31) {
        return res.status(400).json({
          erro: "O dia do vencimento tem que estar entre 1 e 31.",
        });
      }

      const { data, error } = await supabase
        .from("despesas_recorrentes")
        .insert([{ id: Date.now(), ...dados }])
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      // BUG REAL corrigido (17/08/2026): a Conta a Pagar só nascia da
      // automação que roda uma vez por dia de madrugada (05h) — cadastrar
      // uma despesa recorrente nova em qualquer outro horário deixava ela
      // "no molde" até o dia seguinte, sem opção de clicar/pagar. Agora já
      // gera a conta a pagar do mês atual na hora, assim que cadastra.
      try {
        await gerarContaPagarDeRecorrenteSeNecessario(data, dataBrasilia(0));
      } catch (erroGeracao) {
        console.error(
          "Erro ao gerar conta a pagar imediata da nova recorrência:",
          erroGeracao.message
        );
      }

      registrarAuditoria(
        req,
        "criou",
        "despesas_recorrentes",
        data.id,
        `${data.descricao} (${data.valor}, todo dia ${data.dia_vencimento})`
      );

      res.status(201).json(data);
    } catch (erro) {
      console.error("Erro ao criar despesa recorrente:", erro.message);

      res.status(500).json({
        erro: "Não foi possível criar a despesa recorrente.",
        detalhes: erro.message,
      });
    }
  }
);

app.put(
  "/despesas-recorrentes/:id",
  verificarPermissao(PERM_CONTAS_PAGAR),
  async function (req, res) {
    try {
      const id = Number(req.params.id);

      if (!Number.isFinite(id)) {
        return res.status(400).json({ erro: "ID inválido." });
      }

      const dados = prepararDespesaRecorrente(req.body);

      if (!dados.descricao || !dados.valor || !dados.dia_vencimento) {
        return res.status(400).json({
          erro: "Informe a descrição, o valor e o dia do vencimento.",
        });
      }

      const { data, error } = await supabase
        .from("despesas_recorrentes")
        .update(dados)
        .eq("id", id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      registrarAuditoria(
        req,
        "editou",
        "despesas_recorrentes",
        data.id,
        `${data.descricao} (${data.valor}, todo dia ${data.dia_vencimento})`
      );

      res.json(data);
    } catch (erro) {
      console.error("Erro ao editar despesa recorrente:", erro.message);

      res.status(500).json({
        erro: "Não foi possível editar a despesa recorrente.",
        detalhes: erro.message,
      });
    }
  }
);

app.delete(
  "/despesas-recorrentes/:id",
  verificarPermissao(PERM_CONTAS_PAGAR),
  async function (req, res) {
    try {
      const id = Number(req.params.id);

      if (!Number.isFinite(id)) {
        return res.status(400).json({ erro: "ID inválido." });
      }

      const { error } = await supabase
        .from("despesas_recorrentes")
        .delete()
        .eq("id", id);

      if (error) {
        throw error;
      }

      registrarAuditoria(req, "excluiu", "despesas_recorrentes", id, null);

      res.status(204).send();
    } catch (erro) {
      console.error("Erro ao excluir despesa recorrente:", erro.message);

      res.status(500).json({
        erro: "Não foi possível excluir a despesa recorrente.",
        detalhes: erro.message,
      });
    }
  }
);

// Pedido do usuário (21/08/2026): Ficha Técnica — CMV real por prato
// (quantidade de cada insumo × custo unitário), em vez de só o CMV
// aproximado por categoria de despesa que o Dashboard já usava.
// IMPORTANTE: reaproveita a tabela `insumos` e as rotas /insumos* que JÁ
// EXISTEM (tela "Estoque"/CadastroInsumos.jsx, permissão "estoque") —
// não duplica nada disso. Só foi adicionada a coluna custo_unitario
// nessa tabela (ver sql/ficha_tecnica_e_insumos.sql), usada aqui pra
// calcular o custo de cada Ficha Técnica.
const PERM_FICHA_TECNICA = PERM_DESPESAS;

// Ficha Técnica — produto (prato) + lista de insumos usados. Vem sempre
// com "itens" (array de {insumo_id, quantidade}) no corpo da requisição;
// pra editar, apaga os itens antigos e recria — mais simples e seguro do
// que tentar diferenciar o que mudou linha a linha.
app.get(
  "/fichas-tecnicas",
  verificarPermissao(PERM_FICHA_TECNICA),
  async function (req, res) {
    try {
      const { data: fichas, error } = await supabase
        .from("fichas_tecnicas")
        .select("*")
        .order("nome_produto", { ascending: true });

      if (error) throw error;

      const { data: itens, error: erroItens } = await supabase
        .from("ficha_tecnica_itens")
        .select("*, insumos(nome, unidade_medida, custo_unitario)");

      if (erroItens) throw erroItens;

      const fichasComItens = (fichas || []).map((ficha) => {
        const itensDaFicha = (itens || []).filter(
          (item) => item.ficha_tecnica_id === ficha.id
        );

        const custoTotal = itensDaFicha.reduce((total, item) => {
          const custoUnitario = Number(item.insumos?.custo_unitario || 0);
          return total + Number(item.quantidade || 0) * custoUnitario;
        }, 0);

        return { ...ficha, itens: itensDaFicha, custo_total: custoTotal };
      });

      res.json(fichasComItens);
    } catch (erro) {
      console.error("Erro ao buscar fichas técnicas:", erro.message);
      res.status(500).json({
        erro: "Não foi possível buscar as fichas técnicas.",
        detalhes: erro.message,
      });
    }
  }
);

async function salvarItensDaFicha(fichaTecnicaId, itens) {
  await supabase
    .from("ficha_tecnica_itens")
    .delete()
    .eq("ficha_tecnica_id", fichaTecnicaId);

  const itensValidos = (Array.isArray(itens) ? itens : [])
    .filter((item) => item.insumo_id && Number(item.quantidade) > 0)
    .map((item) => ({
      ficha_tecnica_id: fichaTecnicaId,
      insumo_id: Number(item.insumo_id),
      quantidade: Number(item.quantidade),
    }));

  if (itensValidos.length === 0) return;

  const { error } = await supabase
    .from("ficha_tecnica_itens")
    .insert(itensValidos);

  if (error) throw error;
}

app.post(
  "/fichas-tecnicas",
  verificarPermissao(PERM_FICHA_TECNICA),
  async function (req, res) {
    try {
      const nomeProduto = (req.body.nome_produto || "").trim();

      if (!nomeProduto) {
        return res.status(400).json({ erro: "Informe o nome do produto." });
      }

      const { usuario, perfil } = await obterPerfilOpcional(req);

      const dados = {
        nome_produto: nomeProduto,
        preco_venda:
          req.body.preco_venda != null ? Number(req.body.preco_venda) : null,
        nome_item_saipos: (req.body.nome_item_saipos || "").trim() || null,
        loja_id: req.body.loja_id || null,
        ativo: req.body.ativo !== false,
        observacao: (req.body.observacao || "").trim(),
        criado_por: perfil?.nome || usuario?.email || "",
      };

      const { data: ficha, error } = await supabase
        .from("fichas_tecnicas")
        .insert(dados)
        .select()
        .single();

      if (error) throw error;

      await salvarItensDaFicha(ficha.id, req.body.itens);

      registrarAuditoria(req, "criou", "fichas_tecnicas", ficha.id, nomeProduto);

      res.status(201).json(ficha);
    } catch (erro) {
      console.error("Erro ao criar ficha técnica:", erro.message);
      res.status(500).json({
        erro: "Não foi possível salvar a ficha técnica.",
        detalhes: erro.message,
      });
    }
  }
);

app.put(
  "/fichas-tecnicas/:id",
  verificarPermissao(PERM_FICHA_TECNICA),
  async function (req, res) {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ erro: "ID inválido." });
      }

      const nomeProduto = (req.body.nome_produto || "").trim();

      if (!nomeProduto) {
        return res.status(400).json({ erro: "Informe o nome do produto." });
      }

      const dados = {
        nome_produto: nomeProduto,
        preco_venda:
          req.body.preco_venda != null ? Number(req.body.preco_venda) : null,
        nome_item_saipos: (req.body.nome_item_saipos || "").trim() || null,
        loja_id: req.body.loja_id || null,
        ativo: req.body.ativo !== false,
        observacao: (req.body.observacao || "").trim(),
        atualizado_em: new Date().toISOString(),
      };

      const { data: ficha, error } = await supabase
        .from("fichas_tecnicas")
        .update(dados)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      await salvarItensDaFicha(id, req.body.itens);

      registrarAuditoria(req, "editou", "fichas_tecnicas", id, nomeProduto);

      res.json(ficha);
    } catch (erro) {
      console.error("Erro ao editar ficha técnica:", erro.message);
      res.status(500).json({
        erro: "Não foi possível editar a ficha técnica.",
        detalhes: erro.message,
      });
    }
  }
);

app.delete(
  "/fichas-tecnicas/:id",
  verificarPermissao(PERM_FICHA_TECNICA),
  async function (req, res) {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ erro: "ID inválido." });
      }

      const { error } = await supabase
        .from("fichas_tecnicas")
        .delete()
        .eq("id", id);

      if (error) throw error;

      registrarAuditoria(req, "excluiu", "fichas_tecnicas", id, null);

      res.status(204).send();
    } catch (erro) {
      console.error("Erro ao excluir ficha técnica:", erro.message);
      res.status(500).json({
        erro: "Não foi possível excluir a ficha técnica.",
        detalhes: erro.message,
      });
    }
  }
);

app.delete("/contas-pagar/:id", verificarPermissao(PERM_CONTAS_PAGAR), async function (req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({
        erro: "ID da conta inválido.",
      });
    }

    const { data: contaAtual, error: erroBusca } = await supabase
      .from("contas_pagar")
      .select("*")
      .eq("id", id)
      .single();

    if (erroBusca) {
      throw erroBusca;
    }

    // Excluir uma conta já paga tem que devolver o dinheiro pro saldo —
    // remove a despesa que foi gerada automaticamente no pagamento.
    if (contaAtual.status === "pago" && contaAtual.lancamento_id) {
      const { error: erroExclusaoDespesa } = await supabase
        .from("lancamentos")
        .delete()
        .eq("id", contaAtual.lancamento_id);

      if (erroExclusaoDespesa) {
        throw erroExclusaoDespesa;
      }

      registrarAuditoria(
        req,
        "excluiu",
        "lancamentos",
        contaAtual.lancamento_id,
        `Despesa revertida ao excluir a conta a pagar: ${contaAtual.descricao} (${contaAtual.valor})`
      );
    }

    const { error } = await supabase
      .from("contas_pagar")
      .delete()
      .eq("id", id);

    if (error) {
      throw error;
    }

    registrarAuditoria(req, "excluiu", "contas_pagar", id, null);

    res.status(204).send();
  } catch (erro) {
    console.error("Erro ao excluir conta a pagar:", erro.message);

    res.status(500).json({
      erro: "Não foi possível excluir a conta a pagar.",
      detalhes: erro.message,
    });
  }
});

const colunasFechamentoListagem =
  "id, loja_id, tipo, nome_pessoa, valor, valor_pago_dinheiro, telefone, tem_foto, observacao, criado_em, valores_informados, sistema_manual, conciliacao_finalizada_em, ordem_formas_pagamento, data_abertura_turno";

app.get("/fechamentos-caixa", verificarPermissao(PERM_FECHAMENTO_CAIXA), async function (req, res) {
  try {
    const { data, error } = await supabase
      .from("fechamentos_caixa")
      .select(colunasFechamentoListagem)
      .order("criado_em", { ascending: false });

    if (error) {
      throw error;
    }

    res.json(data || []);
  } catch (erro) {
    console.error("Erro ao buscar fechamentos de caixa:", erro.message);

    res.status(500).json({
      erro: "Não foi possível buscar os fechamentos de caixa.",
      detalhes: erro.message,
    });
  }
});

app.get("/fechamentos-caixa/:id/foto", verificarPermissao(PERM_FECHAMENTO_CAIXA), async function (req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({
        erro: "ID do fechamento inválido.",
      });
    }

    const { data, error } = await supabase
      .from("fechamentos_caixa")
      .select("foto")
      .eq("id", id)
      .single();

    if (error) {
      throw error;
    }

    res.json({ foto: data?.foto || "" });
  } catch (erro) {
    console.error("Erro ao buscar foto do fechamento:", erro.message);

    res.status(500).json({
      erro: "Não foi possível buscar a foto.",
      detalhes: erro.message,
    });
  }
});

app.post("/fechamentos-caixa", verificarPermissao(PERM_FECHAMENTO_CAIXA), async function (req, res) {
  try {
    const dados = prepararFechamentoCaixa(req.body);

    if (
      ![
        "caixa",
        "boy",
        "cozinha",
        "venda_prazo",
        "funcionario",
        "pago_dinheiro_caixa",
        "comandas_canceladas",
      ].includes(dados.tipo)
    ) {
      return res.status(400).json({
        erro:
          "Tipo inválido. Use caixa, boy, cozinha, venda_prazo, funcionario, pago_dinheiro_caixa ou comandas_canceladas.",
      });
    }

    if (!dados.foto) {
      return res.status(400).json({
        erro: "A foto do comprovante é obrigatória.",
      });
    }

    // Pedido do usuário (19/08/2026): "Comandas Canceladas" era só arquivo
    // (a foto ficava salva, sem nenhum dado extraído). Agora lê sozinha o
    // nome do cliente, o valor do pedido e o telefone, pra mostrar isso
    // direto na Conciliação — o operador continua só tirando a foto,
    // igual sempre fez.
    if (dados.tipo === "comandas_canceladas") {
      try {
        const textoResposta = await lerImagemComIA(
          dados.foto,
          'Essa é a foto de uma comanda/pedido CANCELADO de uma hamburgueria. Extraia: o NOME do cliente, o VALOR total do pedido, e o TELEFONE do cliente (se estiver visível, mesmo formato brasileiro com DDD). Dê sua melhor estimativa mesmo sem 100% de certeza. Responda SOMENTE em JSON válido, sem texto antes ou depois, no formato exato: {"nome": "Nome ou null", "valor": 45.90, "telefone": "11999998888 ou null"}. Se não conseguir ler algum desses dados, use null nesse campo.',
          2048
        );
        const jsonEncontrado = textoResposta.match(/\{[\s\S]*\}/);
        const dadosLidos = JSON.parse(
          jsonEncontrado ? jsonEncontrado[0] : textoResposta
        );

        if (dadosLidos.nome) dados.nome_pessoa = String(dadosLidos.nome).trim();
        if (dadosLidos.valor != null) dados.valor = Number(dadosLidos.valor);
        if (dadosLidos.telefone) dados.telefone = String(dadosLidos.telefone).trim();
      } catch (erroLeitura) {
        console.error(
          "Erro ao ler dados da comanda cancelada:",
          erroLeitura.message
        );
        // Não impede de salvar a foto mesmo se a leitura falhar — só fica
        // sem nome/valor/telefone preenchido, o operador confere na mão.
      }
    }

    const { data, error } = await supabase
      .from("fechamentos_caixa")
      .insert([dados])
      .select(colunasFechamentoListagem)
      .single();

    if (error) {
      throw error;
    }

    res.status(201).json(data);
  } catch (erro) {
    console.error("Erro ao criar fechamento de caixa:", erro.message);

    res.status(500).json({
      erro: "Não foi possível salvar o fechamento de caixa.",
      detalhes: erro.message,
    });
  }
});

// Salva a leitura por IA da foto de fechamento — uma vez lida, o valor
// fica gravado nesse fechamento pra sempre; refazer a conciliação depois
// usa esse valor salvo em vez de chamar a IA de novo (evita que o valor
// mude sozinho entre uma conciliação e outra). Só um novo pedido explícito
// de "ler de novo" sobrescreve.
app.put(
  "/fechamentos-caixa/:id/valores-informados",
  verificarPermissao(["fechamento_caixa", "conciliacao"]),
  async function (req, res) {
    try {
      const id = Number(req.params.id);

      if (!Number.isFinite(id)) {
        return res.status(400).json({
          erro: "ID do fechamento inválido.",
        });
      }

      const valores =
        req.body?.valores && typeof req.body.valores === "object"
          ? req.body.valores
          : null;

      // "sistema" vem da própria leitura da foto (coluna "Esperado" do
      // comprovante) — não é mais só ajuste manual, a leitura automática
      // também grava aqui. Mescla com o que já existia em vez de
      // sobrescrever tudo, pra não perder um ajuste manual anterior.
      const sistemaNovo =
        req.body?.sistema && typeof req.body.sistema === "object"
          ? req.body.sistema
          : null;

      // Pedido do usuário (17/08/2026): a ordem das formas de pagamento
      // na tela de Conciliação tem que seguir exatamente a ordem impressa
      // no comprovante da Saipos (topo → base) — guardada à parte num
      // array (não no JSON de "sistema", que não garante ordem de
      // chaves ao salvar/reler do banco).
      const ordemNova =
        Array.isArray(req.body?.ordem) && req.body.ordem.length > 0
          ? req.body.ordem
          : null;

      const atualizacao = { valores_informados: valores };

      if (sistemaNovo) {
        const { data: atual } = await supabase
          .from("fechamentos_caixa")
          .select("sistema_manual")
          .eq("id", id)
          .single();

        atualizacao.sistema_manual = {
          ...(atual?.sistema_manual || {}),
          ...sistemaNovo,
        };
      }

      if (ordemNova) {
        atualizacao.ordem_formas_pagamento = ordemNova;
      }

      // BUG REAL corrigido (17/08/2026): o sistema agrupava/buscava
      // Saipos e PagSeguro pela data de quando a FOTO foi enviada
      // (criado_em), não pela data real de abertura do caixa impressa
      // no comprovante — se a foto fosse enviada bem depois do
      // fechamento físico, o sistema procurava dinheiro no dia errado.
      // Só aceita formato AAAA-MM-DD (já validado antes de chegar aqui).
      const dataAberturaNova =
        typeof req.body?.data_abertura === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(req.body.data_abertura)
          ? req.body.data_abertura
          : null;

      if (dataAberturaNova) {
        atualizacao.data_abertura_turno = dataAberturaNova;
      }

      const { data, error } = await supabase
        .from("fechamentos_caixa")
        .update(atualizacao)
        .eq("id", id)
        .select(
          "id, valores_informados, sistema_manual, ordem_formas_pagamento, data_abertura_turno"
        )
        .single();

      if (error) {
        throw error;
      }

      registrarAuditoria(
        req,
        "salvou leitura de foto",
        "fechamentos_caixa",
        id,
        null
      );

      res.json(data);
    } catch (erro) {
      console.error(
        "Erro ao salvar valores informados do fechamento:",
        erro.message
      );

      res.status(500).json({
        erro: "Não foi possível salvar a leitura da foto.",
        detalhes: erro.message,
      });
    }
  }
);

// Pedido do usuário (12/08/2026): depois de conciliar um fechamento, um
// botão "Finalizar Conciliação" marca ele como concluído — some da lista
// padrão de "Escolha o fechamento" e só volta a aparecer buscando pela
// data em "Conciliações".
app.put(
  "/fechamentos-caixa/:id/finalizar-conciliacao",
  verificarPermissao(["fechamento_caixa", "conciliacao"]),
  async function (req, res) {
    try {
      const id = Number(req.params.id);

      if (!Number.isFinite(id)) {
        return res.status(400).json({
          erro: "ID do fechamento inválido.",
        });
      }

      const { data, error } = await supabase
        .from("fechamentos_caixa")
        .update({ conciliacao_finalizada_em: new Date().toISOString() })
        .eq("id", id)
        .select("id, conciliacao_finalizada_em")
        .single();

      if (error) {
        throw error;
      }

      registrarAuditoria(
        req,
        "finalizou conciliação",
        "fechamentos_caixa",
        id,
        null
      );

      res.json(data);
    } catch (erro) {
      console.error("Erro ao finalizar conciliação:", erro.message);

      res.status(500).json({
        erro: "Não foi possível finalizar a conciliação.",
        detalhes: erro.message,
      });
    }
  }
);

// Trocar a foto de um fechamento já registrado — pedido do usuário, só
// pra administrador (sem passar pelo fluxo de autorização usado em
// Despesas, porque aqui é o próprio admin fazendo a troca).
app.put(
  "/fechamentos-caixa/:id/foto",
  verificarAdmin,
  async function (req, res) {
    try {
      const id = Number(req.params.id);

      if (!Number.isFinite(id)) {
        return res.status(400).json({
          erro: "ID do fechamento inválido.",
        });
      }

      const novaFoto = req.body?.foto;

      if (!novaFoto) {
        return res.status(400).json({
          erro: "Envie a nova foto.",
        });
      }

      const { data, error } = await supabase
        .from("fechamentos_caixa")
        .update({
          foto: novaFoto,
          // A foto mudou — a leitura salva anteriormente não vale mais,
          // senão a conciliação ficaria usando o valor da foto antiga.
          valores_informados: null,
        })
        .eq("id", id)
        .select("id")
        .single();

      if (error) {
        throw error;
      }

      registrarAuditoria(req, "trocou foto", "fechamentos_caixa", id, null);

      res.json(data);
    } catch (erro) {
      console.error("Erro ao trocar foto do fechamento:", erro.message);

      res.status(500).json({
        erro: "Não foi possível trocar a foto.",
        detalhes: erro.message,
      });
    }
  }
);

app.delete("/fechamentos-caixa/:id", verificarPermissao(PERM_FECHAMENTO_CAIXA), async function (req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({
        erro: "ID do fechamento inválido.",
      });
    }

    const { error } = await supabase
      .from("fechamentos_caixa")
      .delete()
      .eq("id", id);

    if (error) {
      throw error;
    }

    res.status(204).send();
  } catch (erro) {
    console.error("Erro ao excluir fechamento de caixa:", erro.message);

    res.status(500).json({
      erro: "Não foi possível excluir o fechamento de caixa.",
      detalhes: erro.message,
    });
  }
});

// Marca "esse fechamento de caixa (dia/turno) está encerrado" — pedido do
// usuário: enquanto não clicar aqui, nenhum registro (foto de fechamento,
// diária, etc.) pode desaparecer da lista, mesmo passando da meia-noite.
app.get(
  "/fechamento-caixa-finalizacoes",
  verificarPermissao(PERM_FECHAMENTO_CAIXA),
  async function (req, res) {
    try {
      const { data, error } = await supabase
        .from("fechamento_caixa_finalizacoes")
        .select("*")
        .order("criado_em", { ascending: false })
        .limit(30);

      if (error) {
        throw error;
      }

      res.json(data || []);
    } catch (erro) {
      console.error("Erro ao buscar finalizações de fechamento:", erro.message);

      res.status(500).json({
        erro: "Não foi possível buscar as finalizações de fechamento.",
        detalhes: erro.message,
      });
    }
  }
);

// Nomes legíveis pros tipos de fechamento que geram conta a pagar
// automaticamente — hoje só Diária Boy/Cozinha (pedido do usuário).
const NOMES_DIARIA_PARA_CONTA_PAGAR = {
  boy: "Diária Boy",
  cozinha: "Diária Cozinha",
  // Pedido do usuário (12/08/2026): "Pago com dinheiro do caixa" (retirada
  // de frente de caixa — diária avulsa, compra rápida, etc, tudo pago na
  // hora com o dinheiro físico do caixa) usa a mesma automação — mas é
  // SEMPRE 100% em dinheiro (ver tratamento especial abaixo), nunca sobra
  // "a pagar".
  pago_dinheiro_caixa: "Pago com dinheiro do caixa",
};

app.post(
  "/fechamento-caixa-finalizacoes",
  verificarPermissao(PERM_FECHAMENTO_CAIXA),
  async function (req, res) {
    try {
      // Pega a finalização anterior ANTES de inserir a nova — define a
      // "janela" desse fechamento (tudo que ficou pendurado desde a última
      // vez que alguém finalizou, ou desde sempre, se for a primeira vez).
      const { data: finalizacaoAnterior, error: erroAnterior } =
        await supabase
          .from("fechamento_caixa_finalizacoes")
          .select("criado_em")
          .order("criado_em", { ascending: false })
          .limit(1)
          .maybeSingle();

      if (erroAnterior) {
        throw erroAnterior;
      }

      const { data, error } = await supabase
        .from("fechamento_caixa_finalizacoes")
        .insert([{}])
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      registrarAuditoria(
        req,
        "finalizou fechamento de caixa",
        "fechamento_caixa_finalizacoes",
        data.id,
        null
      );

      // A pedido do usuário: toda foto de Diária Boy/Cozinha desse
      // fechamento que está sendo finalizado agora vai direto pra Contas a
      // Pagar (com a foto anexada), já com o valor lido por IA no momento
      // do registro. Se a diária foi paga em duas partes (parte em
      // dinheiro na hora, resto em Pix depois), a parte em dinheiro dá
      // baixa direto no saldo agora (mesma modalidade do "pago em dinheiro
      // (saiu do caixa)" já usado em Despesas) e só o restante vira conta
      // a pagar.
      let contasPagarCriadas = 0;
      let despesasDinheiroCriadas = 0;

      try {
        let consultaDiarias = supabase
          .from("fechamentos_caixa")
          .select(
            "id, tipo, foto, valor, valor_pago_dinheiro, nome_pessoa, criado_em, loja_id"
          )
          .in("tipo", Object.keys(NOMES_DIARIA_PARA_CONTA_PAGAR))
          .lte("criado_em", data.criado_em);

        if (finalizacaoAnterior?.criado_em) {
          consultaDiarias = consultaDiarias.gt(
            "criado_em",
            finalizacaoAnterior.criado_em
          );
        }

        const { data: diarias, error: erroDiarias } = await consultaDiarias;

        if (erroDiarias) {
          throw erroDiarias;
        }

        for (const diaria of diarias || []) {
          const nomeDiaria = NOMES_DIARIA_PARA_CONTA_PAGAR[diaria.tipo];
          const valorTotal = diaria.valor != null ? Number(diaria.valor) : 0;
          // "Pago com dinheiro do caixa" é sempre 100% em dinheiro, por
          // definição — não faz sentido perguntar "quanto foi pago em
          // dinheiro", o valor todo já é isso.
          const pagoDinheiro =
            diaria.tipo === "pago_dinheiro_caixa"
              ? valorTotal
              : diaria.valor_pago_dinheiro != null
              ? Number(diaria.valor_pago_dinheiro)
              : 0;
          const valorAPagar = Math.max(0, valorTotal - pagoDinheiro);
          const dataDiaria = dataBrasiliaDe(diaria.criado_em);

          if (pagoDinheiro > 0) {
            const ehPagoDinheiroCaixa = diaria.tipo === "pago_dinheiro_caixa";
            const novaDespesa = {
              id: Date.now() + diaria.id,
              tipo: "despesa",
              descricao:
                ehPagoDinheiroCaixa && diaria.nome_pessoa
                  ? diaria.nome_pessoa
                  : nomeDiaria,
              valor: pagoDinheiro,
              data: dataDiaria,
              grupo: "",
              categoria: ehPagoDinheiroCaixa ? "Retirada de Caixa" : "Outros",
              subcategoria: "",
              fornecedor: "",
              observacao: `Gerado automaticamente ao finalizar o fechamento de caixa (registro #${diaria.id}) — parte paga em dinheiro na hora.`,
              foto: diaria.foto || "",
              // BUG REAL corrigido (17/08/2026): vinha sempre null, mesmo
              // a diária tendo loja própria — a despesa gerada ficava
              // sem loja, some do Dashboard quando filtra por loja
              // específica (só aparecia em "Todas as lojas").
              loja_id: diaria.loja_id || null,
              forma_pagamento_id: null,
              pago_em_dinheiro: true,
              status: "aprovado",
            };

            const { data: despesaCriada, error: erroDespesa } = await supabase
              .from("lancamentos")
              .insert([novaDespesa])
              .select("id")
              .single();

            if (erroDespesa) {
              console.error(
                "Erro ao criar despesa da diária (parte em dinheiro):",
                erroDespesa.message
              );
            } else {
              despesasDinheiroCriadas += 1;

              registrarAuditoria(
                req,
                "criou",
                "lancamentos",
                despesaCriada.id,
                `Despesa automática (parte em dinheiro) do fechamento de caixa #${diaria.id} (${diaria.tipo}): R$ ${pagoDinheiro.toFixed(2)}`
              );
            }
          }

          // Se o valor todo já saiu em dinheiro, não sobra nada a pagar —
          // não cria conta a pagar de R$0.
          if (valorAPagar <= 0) {
            continue;
          }

          // Tenta puxar automaticamente a chave Pix da própria foto da
          // diária (é comum o funcionário anotar valor + chave Pix no
          // mesmo bilhete) — não bloqueia a criação da conta se falhar,
          // o campo fica editável na tela pra preencher/corrigir na mão.
          let pixLidoDaFoto = "";

          if (diaria.foto) {
            try {
              const textoRespostaPix = await lerImagemComIA(
                diaria.foto,
                'Essa é a foto de um bilhete/anotação de uma diária paga a um funcionário de hamburgueria. Procure uma CHAVE PIX ou código Pix copia-e-cola anotado nela (pode ser CPF, telefone, e-mail, chave aleatória ou um código longo começando com algo como "00020126"). Responda SOMENTE em JSON válido: {"pix": "chave ou código encontrado, ou null se não houver nenhuma anotação de Pix nessa foto"}.',
                1024,
                "claude-haiku-4-5-20251001"
              );

              const jsonPix = textoRespostaPix.match(/\{[\s\S]*\}/);
              const dadosPix = JSON.parse(
                jsonPix ? jsonPix[0] : textoRespostaPix
              );

              pixLidoDaFoto = dadosPix?.pix || "";
            } catch (erroPix) {
              console.error(
                "Erro ao ler Pix da foto da diária:",
                erroPix.message
              );
            }
          }

          const dadosConta = {
            descricao: nomeDiaria,
            fornecedor: "",
            valor: valorAPagar,
            pix: pixLidoDaFoto,
            // Guarda estruturado (não só no texto da observação) o quanto
            // já saiu em dinheiro na hora — pedido do usuário: mostrar
            // "Pago R$X em dinheiro — pagar somente R$Y" na lista, com
            // cor verde pro que já foi pago e vermelho pro que falta.
            valor_pago_dinheiro: pagoDinheiro > 0 ? pagoDinheiro : null,
            data_vencimento: dataDiaria,
            observacao:
              pagoDinheiro > 0
                ? `Gerado automaticamente ao finalizar o fechamento de caixa (registro #${diaria.id}). R$ ${pagoDinheiro.toFixed(2)} já foi pago em dinheiro na hora — esse valor aqui é só o restante.`
                : diaria.valor != null
                ? `Gerado automaticamente ao finalizar o fechamento de caixa (registro #${diaria.id}). Valor lido da foto — confira antes de pagar.`
                : `Gerado automaticamente ao finalizar o fechamento de caixa (registro #${diaria.id}). Preencha o valor antes de pagar.`,
            foto: diaria.foto || "",
            // BUG REAL corrigido (17/08/2026): mesma coisa da despesa
            // acima — vinha sempre null, contas ficavam sem loja.
            loja_id: diaria.loja_id || null,
          };

          const { data: contaCriada, error: erroConta } = await supabase
            .from("contas_pagar")
            .insert([dadosConta])
            .select("id")
            .single();

          if (erroConta) {
            console.error(
              "Erro ao criar conta a pagar a partir da diária:",
              erroConta.message
            );
            continue;
          }

          contasPagarCriadas += 1;

          registrarAuditoria(
            req,
            "criou",
            "contas_pagar",
            contaCriada.id,
            `Gerado a partir do fechamento de caixa #${diaria.id} (${diaria.tipo}), valor a pagar: R$ ${valorAPagar.toFixed(2)}`
          );
        }
      } catch (erroDiarias) {
        // Não deixa a finalização falhar por causa disso — o fechamento em
        // si já foi salvo; só loga pra investigar depois.
        console.error(
          "Erro ao gerar contas a pagar das diárias:",
          erroDiarias.message
        );
      }

      res.status(201).json({
        ...data,
        contas_pagar_criadas: contasPagarCriadas,
        despesas_dinheiro_criadas: despesasDinheiroCriadas,
      });
    } catch (erro) {
      console.error("Erro ao finalizar fechamento de caixa:", erro.message);

      res.status(500).json({
        erro: "Não foi possível finalizar o fechamento de caixa.",
        detalhes: erro.message,
      });
    }
  }
);

// Pedido do usuário (16/08/2026): quando um lançamento saiu errado no
// PDV da Saipos (ex: venda categorizada na forma de pagamento errada) e
// o fechamento já foi finalizado, hoje não tinha como o operador voltar
// lá pra corrigir — a lista "Fechamento em aberto" só mostra o que
// entrou DEPOIS da última finalização, e a consulta do último caixa
// fechado é propositalmente só-leitura (ver "👁️ Consulta — só pra ver,
// nada aqui pode ser editado ou excluído" no frontend). Essa rota reabre
// o último fechamento finalizado — apaga só o REGISTRO de finalização
// (não mexe nas fotos/lançamentos em si), fazendo os registros daquela
// janela voltarem a aparecer em "Fechamento em aberto", editáveis/
// excluíveis de novo, prontos pro operador corrigir e finalizar de novo.
// Só admin: pedido explícito do usuário ("somente no meu usuário").
app.delete(
  "/fechamento-caixa-finalizacoes/:id",
  verificarAdmin,
  async function (req, res) {
    try {
      const id = Number(req.params.id);

      if (!Number.isFinite(id)) {
        return res.status(400).json({ erro: "ID inválido." });
      }

      const { data: apagado, error } = await supabase
        .from("fechamento_caixa_finalizacoes")
        .delete()
        .eq("id", id)
        .select("id, criado_em")
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!apagado) {
        return res.status(404).json({
          erro: "Finalização não encontrada (já pode ter sido reaberta antes).",
        });
      }

      registrarAuditoria(
        req,
        "reabriu fechamento de caixa (finalização apagada)",
        "fechamento_caixa_finalizacoes",
        id,
        `Finalização de ${apagado.criado_em} reaberta pra correção`
      );

      res.json({ ok: true, id });
    } catch (erro) {
      console.error("Erro ao reabrir fechamento de caixa:", erro.message);

      res.status(500).json({
        erro: "Não foi possível reabrir esse fechamento.",
        detalhes: erro.message,
      });
    }
  }
);

const SAIPOS_DATA_API_BASE = "https://data.saipos.io/v1";

// A API de Dados da Saipos às vezes responde 502/503/504 (fila cheia,
// costuma acontecer em horário de pico como jantar) ou demora demais pra
// responder. Em vez de desistir na primeira falha (o que deixava a tela
// "Vendas (Saipos)" travada em "Selecione a loja e a data" sem avisar o
// motivo), tenta de novo algumas vezes antes de reportar erro pro usuário.
async function buscarPaginaSaiposComRetry(url, token, tentativas = 3) {
  let ultimoErro;

  for (let tentativa = 1; tentativa <= tentativas; tentativa += 1) {
    try {
      const resposta = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20000),
      });

      if (!resposta.ok) {
        const corpoErro = await resposta.text();
        const erro = new Error(
          `Saipos respondeu ${resposta.status}: ${corpoErro || resposta.statusText}`
        );
        erro.status = resposta.status;
        throw erro;
      }

      return await resposta.json();
    } catch (erro) {
      ultimoErro = erro;

      const transitorio =
        erro.status >= 500 ||
        erro.name === "TimeoutError" ||
        erro.name === "AbortError";

      if (!transitorio || tentativa >= tentativas) {
        throw erro;
      }

      console.error(
        `Saipos falhou (tentativa ${tentativa}/${tentativas}), tentando de novo: ${erro.message}`
      );

      await new Promise((resolve) => setTimeout(resolve, 1000 * tentativa));
    }
  }

  throw ultimoErro;
}

async function consultarSaipos(caminho, parametros) {
  const token = process.env.SAIPOS_TOKEN;

  if (!token) {
    throw new Error(
      "SAIPOS_TOKEN não configurado no .env. Peça o token ao suporte da Saipos (API de Dados)."
    );
  }

  const registros = [];
  const limite = 300;
  let posicao = 0;

  while (true) {
    const url = new URL(`${SAIPOS_DATA_API_BASE}${caminho}`);

    Object.entries(parametros).forEach(([chave, valor]) => {
      url.searchParams.set(chave, valor);
    });

    url.searchParams.set("p_limit", limite);
    url.searchParams.set("p_offset", posicao);

    const pagina = await buscarPaginaSaiposComRetry(url, token);

    registros.push(...pagina);

    if (pagina.length < limite) {
      break;
    }

    posicao += limite;
  }

  return registros;
}

// A API da Saipos, de vez em quando, devolve uma resposta 200 (sem erro
// nenhum pro retry normal pegar) mas com MENOS vendas do que realmente
// existem naquele período — confirmado várias vezes comparando a mesma
// consulta feita duas vezes em seguida. Pra dado FINANCEIRO isso é grave
// (uma venda perdida na importação automática é dinheiro que nunca entra
// no sistema, sem ninguém notar) — nesse caso vale a pena buscar de novo e
// ficar com a versão mais completa. Mas a tela "Vendas (Saipos)" só mostra
// informação (atualiza sozinha a cada 1 min, autocorrige na próxima
// consulta) — ali vale mais a velocidade do que essa garantia extra, por
// isso `garantirCompletude` fica desligado por padrão e só a importação
// financeira liga explicitamente.
async function buscarVendasSaipos(
  idLojaSaipos,
  dataInicio,
  dataFim,
  garantirCompletude = false
) {
  if (!garantirCompletude) {
    const vendas = await consultarSaipos("/search_sales", {
      p_date_column_filter: "shift_date",
      p_filter_date_start: dataInicio,
      p_filter_date_end: dataFim,
    });

    return vendas.filter(
      (venda) => Number(venda.id_store) === Number(idLojaSaipos)
    );
  }

  const tentativas = [];
  const numeroTentativas = 3;

  for (let i = 0; i < numeroTentativas; i++) {
    const vendas = await consultarSaipos("/search_sales", {
      p_date_column_filter: "shift_date",
      p_filter_date_start: dataInicio,
      p_filter_date_end: dataFim,
    });

    const vendasDaLoja = vendas.filter(
      (venda) => Number(venda.id_store) === Number(idLojaSaipos)
    );

    tentativas.push(vendasDaLoja);

    if (
      i > 0 &&
      tentativas[i].length === tentativas[i - 1].length &&
      tentativas[i].length > 0
    ) {
      break;
    }

    if (i < numeroTentativas - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }

  const melhorResultado = tentativas.reduce((melhor, atual) =>
    atual.length > melhor.length ? atual : melhor
  );

  if (tentativas.some((t) => t.length !== melhorResultado.length)) {
    console.error(
      `buscarVendasSaipos: respostas inconsistentes da Saipos pra loja ${idLojaSaipos} (${dataInicio} a ${dataFim}) — tentativas retornaram ${tentativas
        .map((t) => t.length)
        .join(", ")} vendas. Usando a mais completa (${melhorResultado.length}).`
    );
  }

  return melhorResultado;
}

async function buscarLancamentosFinanceirosSaipos(
  idLojaSaipos,
  dataInicio,
  dataFim
) {
  const lancamentos = await consultarSaipos("/search_financial_transactions", {
    p_date_column_filter: "date",
    p_filter_date_start: dataInicio,
    p_filter_date_end: dataFim,
  });

  return lancamentos.filter(
    (lancamento) => Number(lancamento.id_store) === Number(idLojaSaipos)
  );
}

function montarResumoSaipos(vendas, lancamentos) {
  const vendasValidas = vendas.filter((venda) => venda.canceled !== "Y");
  const vendasCanceladas = vendas.filter((venda) => venda.canceled === "Y");

  const totaisPorFormaPagamento = {};
  const totaisPorCanal = {};
  const quantidadePorCanal = {};

  vendasValidas.forEach((venda) => {
    (venda.payments || []).forEach((pagamento) => {
      const forma = pagamento.desc_store_payment_type || "Não informado";

      totaisPorFormaPagamento[forma] =
        (totaisPorFormaPagamento[forma] || 0) +
        Number(pagamento.payment_amount || 0);
    });

    // A Saipos traz o parceiro/canal (iFood, Brendi, etc.) em
    // partner_sale.desc_partner_sale. Venda de balcão/direto não tem
    // partner_sale nenhum. Isso é diferente da forma de pagamento: uma
    // venda "Pago Online" pode ter vindo do iFood OU da Brendi, então só a
    // forma de pagamento não diz de onde o pedido veio.
    const canal = venda.partner_sale?.desc_partner_sale || "Balcão/Direto";
    const valorOficialVenda = Number(
      venda.total_amount ?? venda.totals?.total_amount ?? 0
    );
    const valorPorPagamentosVenda = (venda.payments || []).reduce(
      (soma, pagamento) => soma + Number(pagamento.payment_amount || 0),
      0
    );
    const valorVenda =
      valorOficialVenda > 0 ? valorOficialVenda : valorPorPagamentosVenda;

    totaisPorCanal[canal] = (totaisPorCanal[canal] || 0) + valorVenda;
    quantidadePorCanal[canal] = (quantidadePorCanal[canal] || 0) + 1;
  });

  // A documentação da Saipos descreve o valor total dentro de
  // venda.totals.total_amount, mas testando com dados reais dessa conta o
  // campo vem direto na raiz (venda.total_amount), sem o objeto "totals".
  // Tenta os dois formatos, dando prioridade pro que realmente existe.
  const totalVendasOficial = vendasValidas.reduce(
    (soma, venda) =>
      soma + Number(venda.total_amount ?? venda.totals?.total_amount ?? 0),
    0
  );

  const totalVendasPorPagamentos = Object.values(
    totaisPorFormaPagamento
  ).reduce((soma, valor) => soma + valor, 0);

  if (totalVendasOficial === 0 && totalVendasPorPagamentos > 0) {
    console.error(
      "montarResumoSaipos: venda.totals.total_amount veio zerado em todas as vendas, mas há valor nas formas de pagamento. Usando a soma das formas de pagamento como total_vendas. Verificar formato real do campo totals.total_amount na resposta da Saipos."
    );
  }

  const totalVendas =
    totalVendasOficial > 0 ? totalVendasOficial : totalVendasPorPagamentos;

  const totalLancamentosFinanceiros = lancamentos.reduce(
    (soma, lancamento) => soma + Number(lancamento.amount || 0),
    0
  );

  return {
    total_vendas: totalVendas,
    quantidade_vendas: vendasValidas.length,
    quantidade_canceladas: vendasCanceladas.length,
    totais_por_forma_pagamento: totaisPorFormaPagamento,
    totais_por_canal: totaisPorCanal,
    quantidade_por_canal: quantidadePorCanal,
    total_lancamentos_financeiros: totalLancamentosFinanceiros,
  };
}

// Formas de pagamento que a Saipos usa em vendas de balcão (sem
// partner_sale) e o nome correspondente cadastrado em "formas_pagamento".
// Pix não entra aqui — é tratado separado (ver ehPagamentoPix), porque cai
// na hora independente de ser balcão, iFood ou Brendi. O que não está aqui
// (Dinheiro, Cortesia, Vale) não tem taxa/prazo de cartão pra calcular,
// então fica de fora da importação automática por enquanto. "A prazo
// (funcionários)" vira Contas a Receber automaticamente, igual qualquer
// outra venda — cai no próximo dia útil do mês seguinte (ver forma
// "Funcionário", pagamento_mensal_dia_util).
const MAPA_PAGAMENTO_BALCAO_SAIPOS = {
  Crédito: "Cartão de Crédito",
  Débito: "Cartão de Débito",
  "A prazo (funcionários)": "Funcionário",
};

// Confirmado com o usuário (10/08/2026): Pix cai direto na hora, separado do
// repasse da plataforma, seja a venda de balcão, iFood, Brendi ou qualquer
// outro canal — só as outras formas (cartão via app, etc.) seguem o prazo/
// dia fixo do canal ou da forma de pagamento.
function ehPagamentoPix(nomeFormaPagamentoSaipos) {
  return (nomeFormaPagamentoSaipos || "").toLowerCase().includes("pix");
}

// Mesma conta que o frontend faz em salvarLancamento() (App.jsx) ao escolher
// uma forma de pagamento — replicada aqui pra poder rodar sozinho no
// backend, sem depender de alguém abrir a tela.
// Confirmado com o print real do portal do iFood (10/08/2026): o repasse
// NÃO é "a próxima quarta depois da venda" — é por SEMANA fechada (segunda
// a domingo) e paga sempre na quarta da semana SEGUINTE. Ex.: vendas de
// 03 a 09/08 (seg a dom) caem em 12/08; vendas de hoje (segunda 10/08) só
// entram na semana 10-16/08, paga em 19/08 — não em 12/08. A conta antiga
// ("próxima ocorrência daquele dia da semana") dava resultado errado pra
// vendas de segunda/terça, porque a quarta mais próxima ainda cai DENTRO
// da semana de apuração que ainda está em andamento.
function proximaDataSemanalAposFechamento(dataBase, diaSemanaAlvo) {
  const diaSemanaVenda = dataBase.getDay(); // 0=domingo...6=sábado
  const diffParaSegunda = diaSemanaVenda === 0 ? -6 : 1 - diaSemanaVenda;

  const segundaDaSemana = new Date(dataBase);
  segundaDaSemana.setDate(segundaDaSemana.getDate() + diffParaSegunda);

  const deslocamentoDoAlvo =
    Number(diaSemanaAlvo) === 0 ? 6 : Number(diaSemanaAlvo) - 1;

  segundaDaSemana.setDate(segundaDaSemana.getDate() + 7 + deslocamentoDoAlvo);

  return segundaDaSemana;
}

// Pra "Venda a Prazo Funcionário": tudo que for consumido dentro do mês é
// descontado no pagamento seguinte, que é o próximo dia útil do mês
// seguinte (ex.: venda em agosto → cai no 1º dia útil de setembro). Só
// pula fim de semana (sábado/domingo) — não considera feriado.
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

function calcularRecebimento(valorBruto, formaPagamento, dataBaseStr) {
  const taxa = Number(formaPagamento?.taxa_percentual || 0);
  const prazo = Number(formaPagamento?.prazo_dias || 0);
  const diaSemanaAlvo = formaPagamento?.dia_semana_pagamento;
  const pagamentoMensalDiaUtil = Boolean(
    formaPagamento?.pagamento_mensal_dia_util
  );

  const valorLiquidoEsperado = valorBruto - (valorBruto * taxa) / 100;
  let dataBase = new Date(`${dataBaseStr}T12:00:00`);

  if (pagamentoMensalDiaUtil) {
    dataBase = proximoDiaUtilDoMesSeguinte(dataBase);
  } else if (diaSemanaAlvo != null) {
    dataBase = proximaDataSemanalAposFechamento(dataBase, diaSemanaAlvo);
  } else {
    dataBase.setDate(dataBase.getDate() + prazo);
  }

  return {
    valorLiquidoEsperado,
    dataPrevistaRecebimento: dataBase.toISOString().slice(0, 10),
  };
}

// Agrupa as vendas do dia por canal (iFood, Brendi, ... — vem de
// partner_sale.desc_partner_sale) ou, pra venda de balcão/direto (sem
// partner_sale), por forma de pagamento individual. Cada grupo que tiver
// uma forma de pagamento cadastrada com esse nome vira 1 lançamento de
// receita (criado ou atualizado, nunca duplicado — usa uma marca no campo
// observacao pra reconhecer se aquele grupo/dia já foi importado antes).
async function importarVendasSaiposComoLancamentos(loja, dataStr) {
  const vendas = await buscarVendasSaipos(
    loja.saipos_id_store,
    `${dataStr} 00:00:00`,
    `${dataStr} 23:59:59`,
    true // financeiro — garante completude, mesmo sendo mais lento
  );
  const vendasValidas = vendas.filter((venda) => venda.canceled !== "Y");

  const { data: formasPagamento, error: erroFormas } = await supabase
    .from("formas_pagamento")
    .select("*");

  if (erroFormas) {
    throw erroFormas;
  }

  const grupos = {};
  const pulados = {};

  function registrarPulado(motivo, quantidade = 1) {
    pulados[motivo] = (pulados[motivo] || 0) + quantidade;
  }

  // Agrupa por PAGAMENTO (não pela venda inteira) — uma mesma venda pode ter
  // parte em Pix e parte em outra forma, e cada parte segue uma regra
  // diferente de quando o dinheiro cai:
  //   1. Pix (de qualquer canal: balcão, iFood, Brendi, ...) → cai na hora,
  //      sempre vai pra forma de pagamento "PIX" cadastrada.
  //   2. "Voucher Parceiro Desconto" (dentro de venda com canal) → NÃO é
  //      dinheiro de verdade, é o desconto que o parceiro (iFood/Brendi)
  //      cobre — não conta como receita nenhuma, só descartado.
  //   3. "Pago Online" (dentro de venda com canal) → é o único pedaço que
  //      passa pelo repasse semanal de verdade do canal (iFood/Brendi),
  //      com a taxa e o prazo cadastrados pra esse canal.
  //   4. Outras formas dentro de venda com canal (Débito/Crédito/Dinheiro)
  //      → foi cobrado NA ENTREGA pelo motoboy, o dinheiro já está em mãos
  //      na hora — NÃO espera o repasse do canal, segue a mesma regra de
  //      uma venda de balcão normal (taxa/prazo da própria forma).
  //   5. Venda de balcão (sem canal) → segue o prazo cadastrado pra aquela
  //      forma de pagamento específica (Crédito/Débito).
  // Confirmado com o usuário comparando com o extrato real do iFood
  // (10/08/2026): sem essa separação, o valor pendente ficava inflado com
  // dinheiro que já estava em mãos (cobrado na entrega) e com voucher que
  // nunca foi dinheiro de verdade.
  vendasValidas.forEach((venda) => {
    const canal = venda.partner_sale?.desc_partner_sale || null;

    (venda.payments || []).forEach((pagamento) => {
      const nomeSaipos = pagamento.desc_store_payment_type || "Não informado";
      const valorPagamento = Number(pagamento.payment_amount || 0);
      const nomeSaiposMinusculo = nomeSaipos.toLowerCase();

      let chave;
      let rotulo;
      let canalSlug;
      let nomeParaCadastro;

      // BUG REAL corrigido (13/08/2026): a Saipos tem uma forma chamada
      // "Pago Online via Pix" (pedido de app pago com Pix) — como o nome
      // contém "pix", ehPagamentoPix() pegava ela como Pix direto (cai na
      // hora), quando na verdade o dinheiro passa pelo repasse normal do
      // canal (semanal quarta pro iFood, D+1 pra Brendi), igual qualquer
      // outro "Pago Online". Por isso o teste de "pago online" tem que
      // vir ANTES do teste genérico de Pix.
      if (canal && nomeSaiposMinusculo.includes("voucher")) {
        registrarPulado(
          `"${nomeSaipos}" (venda ${canal}) é desconto, não é dinheiro recebido — não é importado`
        );
        return;
      } else if (canal && nomeSaiposMinusculo.includes("pago online")) {
        chave = `canal:${canal}`;
        rotulo = canal;
        canalSlug = canal.toLowerCase().replace(/[^a-z0-9]+/g, "_");
        nomeParaCadastro = canal;
      } else if (ehPagamentoPix(nomeSaipos)) {
        // Pix de verdade (balcão, QrCode, conta bancária) — cai na hora,
        // não passa pelo repasse de canal nenhum.
        chave = "pix_direto";
        rotulo = "PIX";
        canalSlug = "pix_direto";
        nomeParaCadastro = "PIX";
      } else {
        // Ou é venda de balcão (sem canal), ou é uma forma cobrada na
        // entrega dentro de uma venda de canal (Débito/Crédito/Dinheiro) —
        // nos dois casos, cai pela regra da própria forma de pagamento, não
        // pelo prazo do canal.
        const nomeCadastro = MAPA_PAGAMENTO_BALCAO_SAIPOS[nomeSaipos];

        if (!nomeCadastro) {
          registrarPulado(
            `Forma "${nomeSaipos}"${canal ? ` (${canal}, cobrado na entrega)` : " (venda de balcão)"} sem taxa/prazo pra calcular — não é importada`
          );
          return;
        }

        // Pedido do usuário (17/08/2026): "A prazo (funcionários)" vinha
        // tudo somado num lançamento só por dia ("Vendas A prazo
        // (funcionários) (balcão)"), sem dizer QUAL funcionário — a
        // Saipos manda o nome de quem comprou em venda.customer.name
        // (confirmado testando com dado real, 17/08/2026: "fabio
        // fucionario q"). Agora separa um lançamento por funcionário por
        // dia, em vez de juntar todo mundo — o nome vem no
        // fornecedor/descrição, não precisa mais adivinhar quem foi.
        const ehVendaPrazoFuncionario = nomeCadastro === "Funcionário";
        const nomeFuncionario = ehVendaPrazoFuncionario
          ? (venda.customer?.name || "").trim() || "Não identificado"
          : null;
        const nomeFuncionarioSlug = nomeFuncionario
          ? nomeFuncionario.toLowerCase().replace(/[^a-z0-9]+/g, "_")
          : "";

        const sufixo = ehVendaPrazoFuncionario
          ? `_funcionario_${nomeFuncionarioSlug}${canal ? `_${canal}` : ""}`
          : canal
          ? `_cobrado_entrega_${canal}`
          : "_balcao";
        chave = `${nomeSaipos}${sufixo}`;
        rotulo = ehVendaPrazoFuncionario
          ? `A prazo — ${nomeFuncionario}${canal ? ` (cobrado na entrega — ${canal})` : ""}`
          : canal
          ? `${nomeSaipos} (cobrado na entrega — ${canal})`
          : `${nomeSaipos} (balcão)`;
        canalSlug = ehVendaPrazoFuncionario
          ? `funcionario_${nomeFuncionarioSlug}${canal ? `_entrega_${canal.toLowerCase().replace(/[^a-z0-9]+/g, "_")}` : ""}`
          : `${nomeSaipos.toLowerCase().replace(/[^a-z0-9]+/g, "_")}${
              canal ? `_entrega_${canal.toLowerCase().replace(/[^a-z0-9]+/g, "_")}` : "_balcao"
            }`;
        nomeParaCadastro = nomeCadastro;
      }

      const forma = (formasPagamento || []).find(
        (item) => item.nome.toLowerCase() === nomeParaCadastro.toLowerCase()
      );

      if (!grupos[chave]) {
        grupos[chave] = {
          forma,
          valorBruto: 0,
          quantidade: 0,
          rotulo,
          canalSlug,
        };
      }

      grupos[chave].valorBruto += valorPagamento;
      grupos[chave].quantidade += 1;

      if (!forma) {
        registrarPulado(
          `"${nomeParaCadastro}" ainda não tem forma de pagamento cadastrada com esse nome`
        );
      }
    });
  });

  const resultado = { criados: [], atualizados: [], pulados };
  let indiceParaId = 0;

  for (const grupo of Object.values(grupos)) {
    if (!grupo.forma || grupo.valorBruto <= 0) {
      continue;
    }

    const chaveUnica = `SAIPOS:${loja.saipos_id_store}:${dataStr}:${grupo.canalSlug}`;

    const { valorLiquidoEsperado, dataPrevistaRecebimento } =
      calcularRecebimento(grupo.valorBruto, grupo.forma, dataStr);

    const dadosLancamento = {
      tipo: "receita",
      descricao: `Vendas ${grupo.rotulo}`,
      valor: grupo.valorBruto,
      data: dataStr,
      loja_id: loja.id,
      fornecedor: grupo.rotulo,
      forma_pagamento_id: grupo.forma.id,
      valor_bruto: grupo.valorBruto,
      valor_liquido_esperado: valorLiquidoEsperado,
      data_prevista_recebimento: dataPrevistaRecebimento,
      observacao: `[${chaveUnica}] Importado automaticamente da Saipos — ${grupo.quantidade} venda(s) em ${dataStr}.`,
      status: "aprovado",
    };

    // "Venda a Prazo Funcionário": se foi tirada a foto do fechamento de
    // caixa desse dia/loja (Fechamento de Caixa → "Venda a Prazo
    // Funcionário"), anexa ela automaticamente nesse lançamento — é a
    // forma "correta" confirmada pelo usuário. Sem foto, importa só o
    // valor mesmo assim.
    if (grupo.forma.nome === "Funcionário") {
      const inicioDia = `${dataStr}T00:00:00-03:00`;
      const fimDia = `${dataStr}T23:59:59-03:00`;

      const { data: fechamentoComFoto } = await supabase
        .from("fechamentos_caixa")
        .select("foto")
        .eq("tipo", "venda_prazo")
        .eq("loja_id", loja.id)
        .gte("criado_em", inicioDia)
        .lte("criado_em", fimDia)
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fechamentoComFoto?.foto) {
        dadosLancamento.foto = fechamentoComFoto.foto;
      }
    }

    const { data: existentes, error: erroBusca } = await supabase
      .from("lancamentos")
      .select("id")
      .ilike("observacao", `%${chaveUnica}%`)
      .limit(1);

    if (erroBusca) {
      throw erroBusca;
    }

    if (existentes && existentes[0]) {
      const { error: erroUpdate } = await supabase
        .from("lancamentos")
        .update(dadosLancamento)
        .eq("id", existentes[0].id);

      if (erroUpdate) {
        throw erroUpdate;
      }

      resultado.atualizados.push({
        canal: grupo.rotulo,
        valor: grupo.valorBruto,
        quantidade: grupo.quantidade,
      });
    } else {
      indiceParaId += 1;

      const { error: erroInsert } = await supabase.from("lancamentos").insert([
        { id: Date.now() + indiceParaId, ...dadosLancamento },
      ]);

      if (erroInsert) {
        throw erroInsert;
      }

      resultado.criados.push({
        canal: grupo.rotulo,
        valor: grupo.valorBruto,
        quantidade: grupo.quantidade,
      });
    }
  }

  return resultado;
}

app.post(
  "/fechamento-saipos/:lojaId/importar-receitas",
  verificarAdmin,
  async function (req, res) {
    try {
      const lojaId = Number(req.params.lojaId);
      const data = req.body?.data;

      if (!Number.isFinite(lojaId)) {
        return res.status(400).json({ erro: "ID da loja inválido." });
      }

      if (!data) {
        return res.status(400).json({
          erro: "Informe a data (formato AAAA-MM-DD).",
        });
      }

      const { data: loja, error: erroLoja } = await supabase
        .from("lojas")
        .select("id, nome, saipos_id_store")
        .eq("id", lojaId)
        .single();

      if (erroLoja) {
        throw erroLoja;
      }

      if (!loja?.saipos_id_store) {
        return res.status(400).json({
          erro: `A loja "${loja?.nome || lojaId}" ainda não tem o ID da Saipos cadastrado.`,
        });
      }

      const resultado = await importarVendasSaiposComoLancamentos(loja, data);

      registrarAuditoria(
        req,
        "importou",
        "lancamentos",
        `${loja.id}:${data}`,
        `Importação automática da Saipos (${loja.nome}, ${data}): ${resultado.criados.length} criado(s), ${resultado.atualizados.length} atualizado(s), ${Object.keys(resultado.pulados).length} tipo(s) pulado(s).`
      );

      res.json(resultado);
    } catch (erro) {
      console.error("Erro ao importar vendas da Saipos como receita:", erro.message);

      res.status(500).json({
        erro: "Não foi possível importar as vendas como receita.",
        detalhes: erro.message,
      });
    }
  }
);

app.get(
  "/fechamento-saipos/:lojaId",
  verificarPermissao(PERM_VENDAS_SAIPOS),
  async function (req, res) {
    try {
      const lojaId = Number(req.params.lojaId);
      const data = req.query.data;

      if (!Number.isFinite(lojaId)) {
        return res.status(400).json({ erro: "ID da loja inválido." });
      }

      if (!data) {
        return res.status(400).json({
          erro: "Informe a data (formato AAAA-MM-DD).",
        });
      }

      const { data: loja, error: erroLoja } = await supabase
        .from("lojas")
        .select("id, nome, saipos_id_store")
        .eq("id", lojaId)
        .single();

      if (erroLoja) {
        throw erroLoja;
      }

      if (!loja?.saipos_id_store) {
        return res.status(400).json({
          erro: `A loja "${loja?.nome || lojaId}" ainda não tem o ID da Saipos cadastrado. Configure em Lojas.`,
        });
      }

      const dataInicio = `${data} 00:00:00`;
      const dataFim = `${data} 23:59:59`;

      const [vendas, lancamentos] = await Promise.all([
        buscarVendasSaipos(loja.saipos_id_store, dataInicio, dataFim),
        buscarLancamentosFinanceirosSaipos(
          loja.saipos_id_store,
          dataInicio,
          dataFim
        ),
      ]);

      const resumo = montarResumoSaipos(vendas, lancamentos);

      await supabase.from("fechamento_saipos").upsert(
        [
          {
            loja_id: lojaId,
            data,
            ...resumo,
            atualizado_em: new Date().toISOString(),
          },
        ],
        { onConflict: "loja_id,data" }
      );

      // Pedido do usuário (21/08/2026): visibilidade sobre cancelamento de
      // venda — um dos golpes clássicos de caixa (registra, cancela, fica
      // com o dinheiro). Só CONTAR já existia (quantidade_canceladas);
      // agora manda o detalhe de cada cancelamento também, e um aviso
      // quando o padrão do dia parece fora do normal. Não entra no
      // upsert acima de propósito — é só pra exibir na tela, não precisa
      // virar coluna nova na tabela fechamento_saipos.
      const vendasCanceladas = vendas.filter((venda) => venda.canceled === "Y");
      const valorTotalCancelado = vendasCanceladas.reduce(
        (soma, venda) =>
          soma + Number(venda.total_amount ?? venda.totals?.total_amount ?? 0),
        0
      );
      const LIMITE_QUANTIDADE_CANCELAMENTOS_SUSPEITO = 3;
      const LIMITE_VALOR_CANCELADO_SUSPEITO = 150;

      res.json({
        ...resumo,
        vendas_canceladas_detalhe: vendasCanceladas.map((venda) => ({
          id_sale: venda.id_sale,
          valor: Number(venda.total_amount ?? venda.totals?.total_amount ?? 0),
          criado_em: venda.created_at,
          operador: venda.cashier?.id_user || null,
          canal: venda.partner_sale?.desc_partner_sale || "Balcão/Direto",
        })),
        alerta_cancelamento:
          vendasCanceladas.length >= LIMITE_QUANTIDADE_CANCELAMENTOS_SUSPEITO ||
          valorTotalCancelado >= LIMITE_VALOR_CANCELADO_SUSPEITO,
      });
    } catch (erro) {
      console.error("Erro ao buscar fechamento na Saipos:", erro.message);

      res.status(500).json({
        erro: "Não foi possível buscar os dados na Saipos.",
        detalhes: erro.message,
      });
    }
  }
);

// Pedido do usuário (21/08/2026): notificação em tempo real (via
// polling do frontend) de venda cancelada — cruza TODAS as lojas com
// saipos_id_store cadastrado, olhando só o dia de hoje. É leve o
// bastante pra chamar a cada minuto ou dois sem sobrecarregar a Saipos.
app.get(
  "/vendas-canceladas-hoje",
  verificarAdmin,
  async function (req, res) {
    try {
      const { data: lojas, error: erroLojas } = await supabase
        .from("lojas")
        .select("id, nome, saipos_id_store")
        .not("saipos_id_store", "is", null);

      if (erroLojas) {
        throw erroLojas;
      }

      const hoje = dataBrasilia();
      const dataInicio = `${hoje} 00:00:00`;
      const dataFim = `${hoje} 23:59:59`;

      const resultadosPorLoja = await Promise.all(
        lojas.map(async (loja) => {
          try {
            const vendas = await buscarVendasSaipos(
              loja.saipos_id_store,
              dataInicio,
              dataFim
            );

            return vendas
              .filter((venda) => venda.canceled === "Y")
              .map((venda) => ({
                id_sale: venda.id_sale,
                loja_id: loja.id,
                loja_nome: loja.nome,
                valor: Number(
                  venda.total_amount ?? venda.totals?.total_amount ?? 0
                ),
                criado_em: venda.created_at,
                operador: venda.cashier?.id_user || null,
                canal: venda.partner_sale?.desc_partner_sale || "Balcão/Direto",
              }));
          } catch (erroLoja) {
            console.error(
              `Erro ao buscar vendas canceladas da loja ${loja.nome}:`,
              erroLoja.message
            );
            return [];
          }
        })
      );

      res.json(resultadosPorLoja.flat());
    } catch (erro) {
      console.error("Erro ao buscar vendas canceladas de hoje:", erro.message);
      res.status(500).json({
        erro: "Não foi possível buscar as vendas canceladas de hoje.",
        detalhes: erro.message,
      });
    }
  }
);

const PAGSEGURO_API_BASE = "https://ws.pagseguro.uol.com.br/v3";

// Mapa conhecido dos códigos da PagSeguro (API clássica). Pode precisar de
// ajuste quando testarmos com dados reais — a PagSeguro não documenta esses
// números publicamente, isso é baseado no comportamento histórico da API.
const statusPagSeguroRecebido = new Set([3, 4]); // 3=Paga, 4=Disponível
const statusPagSeguroDescricao = {
  1: "Aguardando pagamento",
  2: "Em análise",
  3: "Paga",
  4: "Disponível",
  5: "Em disputa",
  6: "Devolvida",
  7: "Cancelada",
};
const formaPagamentoPagSeguroDescricao = {
  1: "Cartão de crédito",
  2: "Boleto",
  3: "Débito online",
  4: "Saldo PagSeguro",
  5: "Oi Paggo",
  7: "Depósito em conta",
  // 8 e 11 não são documentados oficialmente pela PagSeguro. Identificados
  // pelo padrão da taxa cobrada (débito ~1%, PIX ~0,9%) e confirmado
  // informalmente com o usuário — se notar valor errado, reveja aqui.
  8: "Cartão de débito",
  11: "PIX",
};

const TRES_HORAS_MS = 3 * 60 * 60 * 1000;

// A PagSeguro está no horário de Brasília (UTC-3, sem horário de verão desde
// 2019), e o servidor onde o backend roda (Render) usa UTC. Por isso não dá
// pra simplesmente usar "hoje 23:59" — se ainda não chegou lá no horário de
// Brasília, a PagSeguro rejeita como "data no futuro".
function agoraBrasilia() {
  return new Date(Date.now() - TRES_HORAS_MS);
}

// Trava de mês fechado: automática, sem precisar "fechar o mês" na mão.
// Qualquer lançamento com data de um mês anterior ao mês atual (horário de
// Brasília) fica bloqueado pra editar/excluir. Quando o mês virar, o mês
// que era "atual" passa a ficar travado sozinho, sem nenhuma ação manual.
function mesBloqueado(dataLancamento) {
  if (!dataLancamento) return false;

  const mesAtual = agoraBrasilia().toISOString().slice(0, 7);

  return String(dataLancamento).slice(0, 7) < mesAtual;
}

// Único jeito de "destravar" um lançamento de mês encerrado: o administrador
// confirma digitando a própria senha de login. Verifica de verdade contra o
// Supabase Auth (não confia só no que o frontend manda) — chama o mesmo
// endpoint de login que o app usa, só pra checar se a senha bate, sem guardar
// nem usar a sessão gerada.
async function senhaAdminConfirmada(email, senha) {
  if (!email || !senha) return false;

  try {
    const resposta = await fetch(
      `${supabaseUrl}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ email, password: senha }),
      }
    );

    return resposta.ok;
  } catch (erro) {
    console.error("Erro ao confirmar senha do admin:", erro.message);
    return false;
  }
}

function diaSeguinteStr(dataStr) {
  const data = new Date(`${dataStr}T00:00:00`);
  data.setDate(data.getDate() + 1);
  return data.toISOString().slice(0, 10);
}

// BUG REAL corrigido (17/08/2026): a busca da PagSeguro ("Real em conta"
// na Conciliação) ia só até 23:59:59 do próprio dia — mas um fechamento
// de caixa aberto de tarde e fechado depois da meia-noite (ex.: aberto
// 17:14 de um dia, fechado 00:34 do dia seguinte) tem vendas de cartão
// caindo na PagSeguro já DEPOIS da meia-noite, com timestamp do dia
// seguinte. Essas vendas ficavam de fora da busca — "Real em conta"
// aparecia bem menor que o Esperado, parecendo que faltou dinheiro de
// verdade quando na real só faltou olhar a madrugada. Mesma regra de
// corte (5h da manhã) já usada pra agrupar fechamento por turno
// (hojeDoRegistro/dataBrasilia no resto do sistema) — a janela de busca
// agora vai de 05:00 do dia escolhido até 04:59:59 do dia seguinte, pra
// cobrir o turno inteiro sem faltar nem duplicar (o dia seguinte busca a
// partir de 05:00 dele, não de 00:00, então não há sobreposição).
// Bug real corrigido (21/08/2026): a checagem "dataFim >= hojeBrasilia"
// só olhava se a data ESCOLHIDA já tinha virado hoje — mas o FIM de
// verdade da janela do turno é o dia SEGUINTE às 4h59 (turno vira à
// noite, corte às 5h da manhã). Entre meia-noite e 5h da manhã, "hoje"
// (hojeBrasilia) já virou o dia seguinte — a checagem dava "false"
// (dataFim já é "ontem" comparado a hoje) e mandava o fim natural da
// janela (dia seguinte às 4h59), que nesse intervalo específico AINDA
// NÃO TINHA CHEGADO de verdade — a PagSeguro rejeitava com "finalDate
// must be lower than allowed limit" (erro 13009), travando a
// conciliação de qualquer fechamento fechado de madrugada. Agora compara
// o FIM DE VERDADE da janela (não a data em si) contra o agora real, e
// limita em "agora" sempre que o fim ainda não tiver chegado — não
// importa qual dos dois cálculos gerou esse fim.
function calcularPeriodoPagSeguro(dataInicio, dataFim) {
  const agoraComMargem = new Date(agoraBrasilia().getTime() - 60 * 1000);
  const fimNaturalDaJanela = `${diaSeguinteStr(dataFim)}T04:59:59`;

  const dataFimCompleta =
    new Date(fimNaturalDaJanela) > agoraComMargem
      ? agoraComMargem.toISOString().slice(0, 19)
      : fimNaturalDaJanela;

  return {
    dataInicioCompleta: `${dataInicio}T05:00:00`,
    dataFimCompleta,
  };
}

async function buscarTransacoesPagSeguro(dataInicioPedida, dataFimPedida) {
  const email = process.env.PAGSEGURO_EMAIL;
  const token = process.env.PAGSEGURO_TOKEN;

  if (!email || !token) {
    throw new Error(
      "PAGSEGURO_EMAIL/PAGSEGURO_TOKEN não configurados no .env."
    );
  }

  const { dataInicioCompleta: dataInicio, dataFimCompleta: dataFim } =
    calcularPeriodoPagSeguro(dataInicioPedida, dataFimPedida);

  const parser = new XMLParser();
  const transacoes = [];
  let pagina = 1;

  while (true) {
    const url = new URL(`${PAGSEGURO_API_BASE}/transactions`);

    url.searchParams.set("email", email);
    url.searchParams.set("token", token);
    url.searchParams.set("initialDate", dataInicio);
    url.searchParams.set("finalDate", dataFim);
    url.searchParams.set("page", pagina);
    url.searchParams.set("maxPageResults", 100);

    const resposta = await fetch(url);
    const corpo = await resposta.text();

    if (!resposta.ok) {
      throw new Error(`PagSeguro respondeu ${resposta.status}: ${corpo}`);
    }

    const json = parser.parse(corpo);
    const resultado = json?.transactionSearchResult;
    const totalPaginas = Number(resultado?.totalPages || 1);
    const listaTransacoes = resultado?.transactions?.transaction;

    if (Array.isArray(listaTransacoes)) {
      transacoes.push(...listaTransacoes);
    } else if (listaTransacoes) {
      transacoes.push(listaTransacoes);
    }

    if (pagina >= totalPaginas) {
      break;
    }

    pagina += 1;
  }

  // Como isso é buscado em tempo real (vendas novas entram enquanto pagina),
  // a mesma transação pode aparecer em duas páginas diferentes. Remove
  // duplicadas pelo código único da venda antes de devolver.
  const vistas = new Set();
  const semDuplicadas = [];

  transacoes.forEach((transacao) => {
    if (!vistas.has(transacao.code)) {
      vistas.add(transacao.code);
      semDuplicadas.push(transacao);
    }
  });

  return semDuplicadas;
}

function montarResumoPagSeguro(transacoes) {
  const totaisPorFormaPagamento = {};
  const totaisBrutosPorFormaPagamento = {};
  let totalRecebido = 0;
  let totalBruto = 0;
  let quantidadeRecebida = 0;
  let quantidadePendenteOuCancelada = 0;

  transacoes.forEach((transacao) => {
    const status = Number(transacao.status);
    const valorLiquido = Number(transacao.netAmount || 0);
    const valorBruto = Number(transacao.grossAmount || 0);
    const tipoPagamento = Number(transacao.paymentMethod?.type);
    const forma =
      formaPagamentoPagSeguroDescricao[tipoPagamento] ||
      `Tipo ${tipoPagamento || "desconhecido"}`;

    if (statusPagSeguroRecebido.has(status)) {
      totalRecebido += valorLiquido;
      totalBruto += valorBruto;
      quantidadeRecebida += 1;
      totaisPorFormaPagamento[forma] =
        (totaisPorFormaPagamento[forma] || 0) + valorLiquido;
      totaisBrutosPorFormaPagamento[forma] =
        (totaisBrutosPorFormaPagamento[forma] || 0) + valorBruto;
    } else {
      quantidadePendenteOuCancelada += 1;
    }
  });

  return {
    total_recebido: totalRecebido,
    total_bruto: totalBruto,
    quantidade_recebida: quantidadeRecebida,
    quantidade_pendente_ou_cancelada: quantidadePendenteOuCancelada,
    // Líquido: o que realmente caiu na conta (depois da taxa da PagSeguro).
    totais_por_forma_pagamento: totaisPorFormaPagamento,
    // Bruto: o valor da venda antes da taxa — é isso que bate com o
    // "Esperado" do comprovante de fechamento (a Saipos não desconta taxa
    // de maquininha, ela só sabe quanto foi vendido).
    totais_brutos_por_forma_pagamento: totaisBrutosPorFormaPagamento,
  };
}

app.get(
  "/pagseguro/vendas",
  verificarPermissao(PERM_CONCILIACAO),
  async function (req, res) {
    try {
      const dataInicio = req.query.dataInicio || req.query.data;
      const dataFim = req.query.dataFim || req.query.data;

      if (!dataInicio || !dataFim) {
        return res.status(400).json({
          erro: "Informe a data inicial e final (formato AAAA-MM-DD).",
        });
      }

      if (dataInicio > dataFim) {
        return res.status(400).json({
          erro: "A data inicial não pode ser depois da data final.",
        });
      }

      const UM_DIA_MS = 24 * 60 * 60 * 1000;
      const diferencaDias =
        (new Date(dataFim) - new Date(dataInicio)) / UM_DIA_MS;

      if (diferencaDias > 31) {
        return res.status(400).json({
          erro: "O período não pode ser maior que 31 dias.",
        });
      }

      const transacoes = await buscarTransacoesPagSeguro(dataInicio, dataFim);

      const resumo = montarResumoPagSeguro(transacoes);

      const ultimasVendas = transacoes
        .slice()
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .map((transacao) => ({
          codigo: transacao.code,
          data: transacao.date,
          status: Number(transacao.status),
          status_descricao:
            statusPagSeguroDescricao[Number(transacao.status)] ||
            "Desconhecido",
          forma_pagamento:
            formaPagamentoPagSeguroDescricao[
              Number(transacao.paymentMethod?.type)
            ] || `Tipo ${transacao.paymentMethod?.type || "desconhecido"}`,
          valor_bruto: Number(transacao.grossAmount || 0),
          valor_liquido: Number(transacao.netAmount || 0),
        }));

      res.json({ ...resumo, ultimas_vendas: ultimasVendas });
    } catch (erro) {
      console.error("Erro ao buscar vendas na PagSeguro:", erro.message);

      res.status(500).json({
        erro: "Não foi possível buscar as vendas na PagSeguro.",
        detalhes: erro.message,
      });
    }
  }
);

app.get(
  "/conciliacao-pagamentos/:lojaId",
  verificarPermissao(PERM_CONCILIACAO),
  async function (req, res) {
    try {
      const lojaId = Number(req.params.lojaId);
      const data = req.query.data;

      if (!Number.isFinite(lojaId)) {
        return res.status(400).json({ erro: "ID da loja inválido." });
      }

      if (!data) {
        return res.status(400).json({
          erro: "Informe a data (formato AAAA-MM-DD).",
        });
      }

      const { data: loja, error: erroLoja } = await supabase
        .from("lojas")
        .select("id, nome, saipos_id_store")
        .eq("id", lojaId)
        .single();

      if (erroLoja) {
        throw erroLoja;
      }

      if (!loja?.saipos_id_store) {
        return res.status(400).json({
          erro: `A loja "${loja?.nome || lojaId}" ainda não tem o ID da Saipos cadastrado. Configure em Lojas.`,
        });
      }

      const [vendasSaipos, transacoesPagSeguro] = await Promise.all([
        buscarVendasSaipos(
          loja.saipos_id_store,
          `${data} 00:00:00`,
          `${data} 23:59:59`
        ),
        buscarTransacoesPagSeguro(data, data),
      ]);

      const resumoSaipos = montarResumoSaipos(vendasSaipos, []);
      const resumoPagSeguro = montarResumoPagSeguro(transacoesPagSeguro);

      const diferenca =
        resumoSaipos.total_vendas - resumoPagSeguro.total_recebido;

      res.json({
        saipos: resumoSaipos,
        pagseguro: resumoPagSeguro,
        diferenca,
      });
    } catch (erro) {
      console.error("Erro ao conciliar Saipos x PagSeguro:", erro.message);

      res.status(500).json({
        erro: "Não foi possível conciliar os pagamentos.",
        detalhes: erro.message,
      });
    }
  }
);

// Pedido do usuário (19/08/2026): comprovante do banco às vezes vem em
// PDF (ex: Sicredi), não em foto — o robô do WhatsApp ignorava esses de
// propósito, então essas despesas nunca entravam sozinhas. Agora aceita
// os dois formatos na mesma função: "data:image/..." (como sempre) ou
// "data:application/pdf;base64,..." — a Claude lê PDF nativamente, sem
// precisar converter pra imagem antes.
async function lerImagemComIA(
  fotoDataUrl,
  promptTexto,
  maxTokens = 8192,
  modelo = "claude-sonnet-5"
) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY não configurada no .env.");
  }

  const correspondenciaImagem = fotoDataUrl.match(
    /^data:(image\/\w+);base64,(.+)$/
  );
  const correspondenciaPdf = fotoDataUrl.match(
    /^data:application\/pdf;base64,(.+)$/
  );

  if (!correspondenciaImagem && !correspondenciaPdf) {
    throw new Error("Formato de imagem/PDF inválido.");
  }

  const blocoMidia = correspondenciaPdf
    ? {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: correspondenciaPdf[1],
        },
      }
    : {
        type: "image",
        source: {
          type: "base64",
          media_type: correspondenciaImagem[1],
          data: correspondenciaImagem[2],
        },
      };

  const anthropic = new Anthropic({ apiKey });

  const resposta = await anthropic.messages.create({
    model: modelo,
    max_tokens: maxTokens,
    messages: [
      {
        role: "user",
        content: [blocoMidia, { type: "text", text: promptTexto }],
      },
    ],
  });

  const texto = resposta.content
    .filter((bloco) => bloco.type === "text")
    .map((bloco) => bloco.text)
    .join("")
    .trim();

  console.log(
    "Anthropic — stop_reason:",
    resposta.stop_reason,
    "| blocos:",
    resposta.content.map((bloco) => bloco.type).join(","),
    "| usage:",
    JSON.stringify(resposta.usage),
    "| tamanho do texto:",
    texto.length
  );

  if (!texto) {
    throw new Error(
      `A IA respondeu sem texto (stop_reason: ${resposta.stop_reason}, blocos: ${resposta.content.map((bloco) => bloco.type).join(",") || "nenhum"}).`
    );
  }

  return texto;
}

// Mesma ideia do lerImagemComIA, só que sem foto — usado pra interpretar
// TEXTO (ex: legenda de uma foto no WhatsApp), aceitando erro de
// digitação/plural/singular em vez de exigir a palavra exata.
async function perguntarTextoComIA(
  promptTexto,
  maxTokens = 256,
  modelo = "claude-haiku-4-5-20251001"
) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY não configurada no .env.");
  }

  const anthropic = new Anthropic({ apiKey });

  const resposta = await anthropic.messages.create({
    model: modelo,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: promptTexto }],
  });

  const texto = resposta.content
    .filter((bloco) => bloco.type === "text")
    .map((bloco) => bloco.text)
    .join("")
    .trim();

  if (!texto) {
    throw new Error(
      `A IA respondeu sem texto (stop_reason: ${resposta.stop_reason}).`
    );
  }

  return texto;
}

app.post(
  "/lancamentos/ler-nota",
  verificarPermissao(PERM_DESPESAS),
  async function (req, res) {
    try {
      const { foto } = req.body;

      if (!foto) {
        return res.status(400).json({
          erro: "Envie a foto da nota fiscal.",
        });
      }

      // Não pede a data da nota pra IA de propósito: a data do lançamento
      // é sempre a data em que o lançamento é feito no sistema (hoje, ou a
      // que o usuário escolher no formulário), nunca a data impressa na
      // nota/comprovante. Extrair e devolver essa data já causou bug (o
      // formulário sobrescrevia a data de lançamento com a da nota).
      const textoResposta = await lerImagemComIA(
        foto,
        'Essa é a foto de uma nota fiscal ou comprovante de despesa de uma hamburgueria. Extraia: o VALOR TOTAL da nota (o valor final pago, normalmente perto de "TOTAL"), e o nome do FORNECEDOR/loja/estabelecimento (se estiver visível). Dê sua melhor estimativa mesmo sem 100% de certeza. Responda SOMENTE em JSON válido, sem texto antes ou depois, no formato exato: {"valor": 123.45, "fornecedor": "Nome ou null"}. Se não conseguir ler o valor de forma alguma, use {"valor": null, "fornecedor": null}.',
        8192
      );

      let dadosLidos;

      try {
        const jsonEncontrado = textoResposta.match(/\{[\s\S]*\}/);
        dadosLidos = JSON.parse(jsonEncontrado ? jsonEncontrado[0] : textoResposta);
      } catch {
        return res.json({
          valor: null,
          fornecedor: null,
          erro_leitura:
            "Não foi possível ler os dados dessa nota. Preencha manualmente.",
        });
      }

      res.json({
        valor: dadosLidos.valor != null ? Number(dadosLidos.valor) : null,
        fornecedor: dadosLidos.fornecedor || null,
      });
    } catch (erro) {
      console.error("Erro ao ler nota fiscal:", erro.message);

      res.status(500).json({
        erro: "Não foi possível ler a nota fiscal.",
        detalhes: erro.message,
      });
    }
  }
);

app.post(
  "/fechamentos-caixa/ler-foto",
  verificarPermissao(PERM_FECHAMENTO_CAIXA),
  async function (req, res) {
    try {
      const { foto } = req.body;

      if (!foto) {
        return res.status(400).json({
          erro: "Envie a foto do comprovante.",
        });
      }

      // Comprovante de diária pode ter parte paga em dinheiro e parte em
      // Pix — pede o TOTAL somado, não só um dos valores. Usuário sempre
      // pode corrigir antes de confirmar, então não precisa de 100% de
      // certeza aqui.
      const textoResposta = await lerImagemComIA(
        foto,
        'Essa é a foto de um comprovante de fechamento de caixa de uma hamburgueria — pode ser um comprovante de pagamento de diária (de um entregador/boy ou de um funcionário de cozinha) ou um comprovante de venda a prazo pra funcionário. Pode ter o valor dividido em mais de uma forma (parte em dinheiro, parte em Pix, etc) — extraia o VALOR TOTAL, somando tudo se houver mais de um valor. Dê sua melhor estimativa mesmo sem 100% de certeza. Responda SOMENTE em JSON válido, sem texto antes ou depois, no formato exato: {"valor": 123.45}. Se não conseguir ler nenhum valor, use {"valor": null}.',
        8192
      );

      let dadosLidos;

      try {
        const jsonEncontrado = textoResposta.match(/\{[\s\S]*\}/);
        dadosLidos = JSON.parse(jsonEncontrado ? jsonEncontrado[0] : textoResposta);
      } catch {
        return res.json({
          valor: null,
          erro_leitura:
            "Não foi possível ler o valor dessa foto. Preencha manualmente.",
        });
      }

      res.json({
        valor: dadosLidos.valor != null ? Number(dadosLidos.valor) : null,
      });
    } catch (erro) {
      console.error("Erro ao ler foto de fechamento de caixa:", erro.message);

      res.status(500).json({
        erro: "Não foi possível ler a foto.",
        detalhes: erro.message,
      });
    }
  }
);

app.post(
  "/contas-pagar/ler-foto",
  verificarPermissao(PERM_CONTAS_PAGAR),
  async function (req, res) {
    try {
      const { foto } = req.body;

      if (!foto) {
        return res.status(400).json({
          erro: "Envie a foto do boleto/nota.",
        });
      }

      // Mesma cautela da leitura de despesas: não pede a data pra IA — se
      // for boleto, a data de vencimento impressa nele é a que o usuário
      // já digitou/confirma no formulário, evita risco de a IA ler errado
      // e sobrescrever sem o usuário perceber.
      const textoResposta = await lerImagemComIA(
        foto,
        'Essa é a foto de um boleto, nota fiscal, comprovante ou anotação manuscrita de uma conta a pagar de uma hamburgueria (pode ser, por exemplo, um bilhete anotando o valor de uma diária de um funcionário e a chave Pix dele para pagamento). Extraia: o VALOR TOTAL a pagar (normalmente perto de "TOTAL" ou "VALOR DO DOCUMENTO", ou o valor da diária anotada), o nome do FORNECEDOR/emissor/beneficiário (se estiver visível), e a CHAVE PIX ou código Pix copia-e-cola para pagamento (pode ser um CPF, telefone, e-mail, chave aleatória ou o código "copia e cola" longo começando com algo como "00020126") — se houver mais de uma chave/anotação de Pix visível, pegue a mais completa/clara. Dê sua melhor estimativa mesmo sem 100% de certeza. Responda SOMENTE em JSON válido, sem texto antes ou depois, no formato exato: {"valor": 123.45, "fornecedor": "Nome ou null", "pix": "chave ou código ou null"}. Se não conseguir ler algum desses dados, use null nesse campo.',
        8192
      );

      let dadosLidos;

      try {
        const jsonEncontrado = textoResposta.match(/\{[\s\S]*\}/);
        dadosLidos = JSON.parse(jsonEncontrado ? jsonEncontrado[0] : textoResposta);
      } catch {
        return res.json({
          valor: null,
          fornecedor: null,
          pix: null,
          erro_leitura:
            "Não foi possível ler os dados dessa foto. Preencha manualmente.",
        });
      }

      res.json({
        valor: dadosLidos.valor != null ? Number(dadosLidos.valor) : null,
        fornecedor: dadosLidos.fornecedor || null,
        pix: dadosLidos.pix || null,
      });
    } catch (erro) {
      console.error("Erro ao ler foto da conta a pagar:", erro.message);

      res.status(500).json({
        erro: "Não foi possível ler a foto.",
        detalhes: erro.message,
      });
    }
  }
);

app.post(
  "/pagseguro/conferir-fechamento",
  verificarPermissao(PERM_CONCILIACAO),
  async function (req, res) {
    try {
      const { foto } = req.body;

      if (!foto) {
        return res.status(400).json({
          erro: "Envie a foto do comprovante de fechamento.",
        });
      }

      const textoResposta = await lerImagemComIA(
        foto,
        'Essa é a foto de um comprovante de fechamento de caixa de uma hamburgueria. A seção "CONFERÊNCIA" tem 4 colunas: Forma de Pagamento / Esperado / Em caixa / Diferença — lista TODAS as formas de pagamento, uma por linha — releia a imagem com atenção e liste TODAS as linhas dessa seção, mesmo as que tiverem letra pequena, valor baixo (ex: R$0,01 a R$50,00), estiverem borradas ou a foto estiver de cabeça para baixo. É comum ter 6 a 10 linhas diferentes (Dinheiro, Crédito, Débito, Funcionários/A prazo, Pago Online, Pix, Vale, Voucher, Cortesia, variantes TEF) — NÃO PARE de listar após achar só 4 ou 5, continue procurando o resto da tabela até o fim. Pra CADA linha, leia os DOIS números: a coluna "Esperado" (quanto o sistema esperava) E a coluna "Em caixa" (quanto realmente tinha/bateu) — são números DIFERENTES, não confunda um com o outro, releia com cuidado qual coluna é qual. IMPORTANTE — normalize os nomes exatamente assim, agrupando/somando quando houver mais de uma linha do mesmo grupo (soma tanto o Esperado quanto o Em caixa de cada linha do grupo): linhas "Crédito", "Cartão de Crédito", "TEF Crédito", "TEF-Crédito" → some tudo numa categoria "Cartão de crédito". Linhas "Débito", "Cartão de Débito", "TEF Débito", "TEF-Débito" → some tudo numa categoria "Cartão de débito". QUALQUER linha com "Pix" no nome (Pix, Pix cnpj, Pix na máquina, Pix na maquininha, TEF-PIX, TEF - PIX, Pix na Entrega, Pix Conta Bancária, etc) → some tudo numa categoria "PIX". Linhas "Funcionário", "Funcionários", "A prazo", "A prazo (funcionários)" → some tudo numa categoria "A prazo". QUALQUER linha com "Pago Online" no nome (Pago Online, Pago Online Aiqfome, Pago Online iFood, Pago Online via..., etc) → SOME tudo (Esperado com Esperado, Em caixa com Em caixa) numa ÚNICA categoria "Pago Online" no JSON final — é MUITO comum ter 2 ou mais linhas de "Pago Online" na mesma foto (uma por plataforma: iFood, Aiqfome, Brendi, etc), e TODAS elas têm que virar UMA SÓ linha somada, nunca vira 2 linhas "Pago Online" nem escolhe só uma delas e ignora a outra. Exemplo: se a foto tem "Pago Online 1.144,12 / 1.144,10" numa linha e "Pago Online via... 1.514,88 / 1.514,80" em outra linha, o resultado tem que ser UMA categoria "Pago Online" com esperado 2.659,00 (1.144,12+1.514,88) e em_caixa 2.658,90 (1.144,10+1.514,80) — nunca devolva só uma das duas nem devolva "Pago Online" duas vezes. Linhas "Voucher" ou "Voucher Parceiro" → some numa categoria "Voucher Parceiro". "Dinheiro", "Vale" e "Cortesia" mantenha os nomes como estão, sem combinar com nada. Não pule nenhuma forma de pagamento que aparecer no comprovante — se aparecer uma forma diferente das listadas aqui, inclua com o nome mais parecido possível dessa lista. Além disso, extraia da seção "CAIXA:" (não da seção CONFERÊNCIA) o valor de "Abertura (+)", e da seção "FATURAMENTO:" o valor de "Vendas/Dinheiro" (é normalmente a primeira linha logo depois de "TOTAL FATURADO:"). Extraia TAMBÉM a DATA DE ABERTURA do caixa — geralmente aparece perto do topo do comprovante numa linha "Abertura: DD/MM/AAAA HH:MM:SS" (é uma DATA/HORÁRIO, bem diferente do valor em R$ "Abertura (+)" da seção CAIXA — não confunda os dois "Abertura" que existem no mesmo comprovante, um é quando o caixa abriu, o outro é quanto dinheiro tinha na abertura). Responda essa data no campo "data_abertura" no formato "AAAA-MM-DD". Essa data de abertura é a data OFICIAL do turno inteiro, mesmo o fechamento tendo acontecido já na madrugada do dia seguinte. Extraia TAMBÉM a linha "TOTAL" que fica no final da própria tabela CONFERÊNCIA (os dois números dela, Esperado e Em caixa) — ela é a soma de tudo que está impresso ali, serve de conferência independente. Responda com os campos "total_esperado_impresso" e "total_em_caixa_impresso" com esses dois números exatamente como estão impressos nessa linha TOTAL (não calcule você mesma, copie os números impressos). ATENÇÃO — isso é um confronto financeiro real, um valor errado é PIOR do que não ter valor nenhum: se você identificar o NOME de uma categoria mas não conseguir ler com confiança real um dos dois números (ou os dois) dessa linha (foto borrada, cortada, ilegível), ainda assim inclua essa categoria na lista, mas use null no número que não tiver certeza — NUNCA invente ou arrisque um número que você não tem certeza de ter lido corretamente. Só coloque um número quando realmente conseguir ler os dígitos na imagem. IMPORTANTE — essa foto pode ser de OUTRA página do comprovante (ex: canais de venda, entregadores, ticket médio, retiradas de caixa) que NÃO tem a tabela "CONFERÊNCIA" nenhuma: nesse caso, NÃO invente formas de pagamento nem números — responda com "categorias": [] (lista vazia). Só liste categorias se a tabela CONFERÊNCIA realmente estiver visível nessa foto. Responda SOMENTE em JSON válido, sem texto antes ou depois, no formato: {"categorias": [{"nome": "Dinheiro", "esperado": 515.54, "em_caixa": 517.60}, {"nome": "Vale", "esperado": 11.28, "em_caixa": null}, ...], "abertura_caixa": 387.50, "vendas_dinheiro": 370.04, "total_esperado_impresso": 6396.44, "total_em_caixa_impresso": 6448.24, "data_abertura": "2026-08-15"}. Se não achar abertura_caixa, vendas_dinheiro, os totais impressos ou a data de abertura, use null nesses campos.',
        2048,
        // Voltado pro Sonnet (14/08/2026): Haiku era mais rápido (~1-2s
        // contra ~10-12s), mas achamos um caso real onde ele leu cada
        // número individual certo e ainda assim errou a SOMA de uma
        // categoria (Pix) — erro de "conta", não de leitura visual.
        // Sistema financeiro pede exatidão antes de velocidade aqui.
        "claude-sonnet-5"
      );

      console.log(
        "Resposta bruta da IA (conferir-fechamento), tamanho:",
        textoResposta.length,
        "conteúdo:",
        JSON.stringify(textoResposta)
      );

      let dadosLidos;

      try {
        const jsonEncontrado = textoResposta.match(/\{[\s\S]*\}/);
        dadosLidos = JSON.parse(
          jsonEncontrado ? jsonEncontrado[0] : textoResposta
        );
      } catch {
        return res.json({
          valores: null,
          erro_leitura:
            "Não foi possível ler os valores dessa foto. Tente uma foto mais nítida ou de outro ângulo.",
          debug_resposta_ia:
            textoResposta === "" ? "(resposta vazia)" : textoResposta,
        });
      }

      const categorias = Array.isArray(dadosLidos.categorias)
        ? dadosLidos.categorias
        : [];

      // "valores" = coluna "Em caixa" da CONFERÊNCIA (o que realmente
      // tinha) — alimenta o "Informado" da tela de conciliação.
      // "esperado" = coluna "Esperado" da mesma tabela — é o próprio
      // Saipos já dizendo o que esperava pra cada forma (inclusive
      // Dinheiro, que nenhuma API externa informa) — alimenta o "Sistema".
      const valores = {};
      const esperado = {};

      categorias.forEach((categoria) => {
        if (categoria?.nome == null) return;

        // Categoria identificada mas sem número confiável (IA mandou null
        // de propósito) — mantém a categoria com valor null, em vez de
        // descartar, pra tela mostrar "não consegui ler" e deixar o campo
        // em branco pro operador preencher, em vez de simplesmente não
        // aparecer a linha. Aceita tanto o formato novo (esperado/em_caixa)
        // quanto o antigo (valor), pra não quebrar se a IA responder no
        // formato velho por engano.
        const emCaixa = categoria.em_caixa ?? categoria.valor;
        const esperadoCategoria =
          categoria.esperado != null ? Number(categoria.esperado) : null;
        const emCaixaNumero = emCaixa != null ? Number(emCaixa) : null;

        // Proteção extra: o prompt já pede pra somar toda linha "Pago
        // Online" (pode ter várias, uma por plataforma) numa categoria só
        // — mas se a IA mesmo assim mandar o mesmo nome 2 vezes, SOMA em
        // vez de a segunda simplesmente descartar a primeira.
        if (categoria.nome in valores || categoria.nome in esperado) {
          valores[categoria.nome] =
            emCaixaNumero != null
              ? (valores[categoria.nome] || 0) + emCaixaNumero
              : valores[categoria.nome];
          esperado[categoria.nome] =
            esperadoCategoria != null
              ? (esperado[categoria.nome] || 0) + esperadoCategoria
              : esperado[categoria.nome];
          return;
        }

        valores[categoria.nome] = emCaixaNumero;
        esperado[categoria.nome] = esperadoCategoria;
      });

      if (Object.keys(valores).length === 0) {
        return res.json({
          valores: null,
          erro_leitura:
            "Não foi possível identificar nenhum valor nessa foto. Tente uma foto mais nítida ou de outro ângulo.",
          debug_resposta_ia: textoResposta,
        });
      }

      // Trava de segurança (14/08/2026): a IA pode ler cada número certo
      // individualmente e ainda assim errar a SOMA de uma categoria (caso
      // real encontrado: linhas de Pix lidas certas, mas o total do "PIX"
      // saiu errado). Confere a soma de tudo que ela devolveu contra a
      // própria linha "TOTAL" impressa no comprovante — se não bater,
      // avisa o operador em vez de deixar passar um valor errado calado.
      const TOLERANCIA_CENTAVOS = 0.05;

      function conferirContraTotalImpresso(valoresPorForma, totalImpresso) {
        if (totalImpresso == null) return null;

        const somaCalculada = Object.values(valoresPorForma).reduce(
          (soma, valor) => (valor != null ? soma + valor : soma),
          0
        );

        const diferenca = Number(
          (somaCalculada - Number(totalImpresso)).toFixed(2)
        );

        if (Math.abs(diferenca) <= TOLERANCIA_CENTAVOS) return null;

        return {
          soma_calculada: Number(somaCalculada.toFixed(2)),
          total_impresso: Number(totalImpresso),
          diferenca,
        };
      }

      const totalEsperadoImpresso =
        dadosLidos.total_esperado_impresso != null
          ? Number(dadosLidos.total_esperado_impresso)
          : null;
      const totalEmCaixaImpresso =
        dadosLidos.total_em_caixa_impresso != null
          ? Number(dadosLidos.total_em_caixa_impresso)
          : null;

      const avisoEsperado = conferirContraTotalImpresso(
        esperado,
        totalEsperadoImpresso
      );
      const avisoEmCaixa = conferirContraTotalImpresso(
        valores,
        totalEmCaixaImpresso
      );

      // Só aceita a data de abertura se vier no formato certo — um valor
      // qualquer aqui (data errada) atrapalharia MUITO mais do que ajudar,
      // já que ela passa a decidir onde o fechamento é agrupado e onde o
      // sistema busca Saipos/PagSeguro.
      const dataAberturaLida =
        typeof dadosLidos.data_abertura === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(dadosLidos.data_abertura)
          ? dadosLidos.data_abertura
          : null;

      res.json({
        valores,
        esperado,
        abertura_caixa:
          dadosLidos.abertura_caixa != null
            ? Number(dadosLidos.abertura_caixa)
            : null,
        vendas_dinheiro:
          dadosLidos.vendas_dinheiro != null
            ? Number(dadosLidos.vendas_dinheiro)
            : null,
        data_abertura: dataAberturaLida,
        aviso_soma_nao_bate:
          avisoEsperado || avisoEmCaixa
            ? { esperado: avisoEsperado, em_caixa: avisoEmCaixa }
            : null,
      });
    } catch (erro) {
      console.error("Erro ao conferir fechamento por foto:", erro.message);

      res.status(500).json({
        erro: "Não foi possível ler a foto do fechamento.",
        detalhes: erro.message,
      });
    }
  }
);

// Guarda quanto de dinheiro NOVO um fechamento de caixa trouxe pro Saldo —
// confirmado com o usuário: não é o "Em caixa" (contado) inteiro, é só o
// que passou da Abertura (Em caixa − Abertura). A Abertura já é dinheiro
// de fechamentos anteriores (já contado antes), então repetir o valor
// inteiro contaria a mesma grana duas vezes. Cada confirmação insere uma
// linha (histórico); o Dashboard SOMA todas pra saber o total acumulado.
app.post(
  "/caixa-dinheiro-informado",
  verificarPermissao(PERM_CONCILIACAO),
  async function (req, res) {
    try {
      const emCaixa = Number(req.body?.em_caixa);
      const abertura = Number(req.body?.abertura ?? 0);
      const lojaId = req.body?.loja_id ? Number(req.body.loja_id) : null;
      // Pedido do usuário (19/08/2026): agora essa confirmação é chamada
      // sozinha toda vez que a Conciliação lê a foto do fechamento de
      // Dinheiro — se a MESMA foto for lida de novo (correção do
      // operador), tem que ATUALIZAR o registro existente desse
      // fechamento, não criar um segundo e somar a mesma grana duas
      // vezes. fechamento_id é opcional pra não quebrar quem ainda chama
      // isso manualmente sem vincular a um fechamento.
      const fechamentoId = req.body?.fechamento_id
        ? Number(req.body.fechamento_id)
        : null;

      if (!Number.isFinite(emCaixa) || emCaixa < 0) {
        return res.status(400).json({
          erro: "Informe o valor de \"Em caixa\" (contado no fechamento).",
        });
      }

      if (!Number.isFinite(abertura) || abertura < 0) {
        return res.status(400).json({
          erro: "Informe o valor de \"Abertura\" desse fechamento.",
        });
      }

      const valor = emCaixa - abertura;

      if (fechamentoId) {
        await supabase
          .from("caixa_dinheiro_informado")
          .delete()
          .eq("fechamento_id", fechamentoId);
      }

      const { data, error } = await supabase
        .from("caixa_dinheiro_informado")
        .insert([
          {
            loja_id: lojaId,
            valor,
            abertura,
            em_caixa: emCaixa,
            fechamento_id: fechamentoId,
          },
        ])
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      registrarAuditoria(
        req,
        "informou",
        "caixa_dinheiro_informado",
        data.id,
        `Dinheiro novo no caixa: R$ ${valor.toFixed(2)} (em caixa ${emCaixa.toFixed(2)} − abertura ${abertura.toFixed(2)})`
      );

      res.status(201).json(data);
    } catch (erro) {
      console.error("Erro ao salvar dinheiro informado:", erro.message);

      res.status(500).json({
        erro: "Não foi possível salvar o valor informado.",
        detalhes: erro.message,
      });
    }
  }
);

app.get(
  "/caixa-dinheiro-informado",
  // Precisa estar acessível a quem vê o card de Saldo, não só a
  // Conciliação — senão o Dashboard de quem não tem permissão de
  // conciliação não consegue montar o "em dinheiro" do card.
  verificarPermissao(["saldo", "conciliacao"]),
  async function (req, res) {
    try {
      const { data, error } = await supabase
        .from("caixa_dinheiro_informado")
        .select("*")
        .order("criado_em", { ascending: false });

      if (error) {
        throw error;
      }

      const lista = data || [];
      const soma = lista.reduce((total, item) => total + Number(item.valor || 0), 0);

      res.json({ registros: lista, soma });
    } catch (erro) {
      console.error("Erro ao buscar dinheiro informado:", erro.message);

      res.status(500).json({
        erro: "Não foi possível buscar os valores informados.",
        detalhes: erro.message,
      });
    }
  }
);

// Arquivo simples de notas fiscais/comprovantes de pagamento — só anexar
// e importar (foto ou arquivo), sem OCR nem vínculo automático com
// despesa. Tabela e permissão próprias, independentes de Fechamento de
// Caixa e Despesas.
const colunasNotaFiscalListagem = "id, loja_id, observacao, criado_em";

app.get(
  "/notas-fiscais",
  verificarPermissao(PERM_NOTAS_FISCAIS),
  async function (req, res) {
    try {
      const { data, error } = await supabase
        .from("notas_fiscais")
        .select(colunasNotaFiscalListagem)
        .order("criado_em", { ascending: false });

      if (error) {
        throw error;
      }

      res.json(data || []);
    } catch (erro) {
      console.error("Erro ao buscar notas fiscais:", erro.message);

      res.status(500).json({
        erro: "Não foi possível buscar as notas fiscais.",
        detalhes: erro.message,
      });
    }
  }
);

app.get(
  "/notas-fiscais/:id/foto",
  verificarPermissao(PERM_NOTAS_FISCAIS),
  async function (req, res) {
    try {
      const { data, error } = await supabase
        .from("notas_fiscais")
        .select("foto")
        .eq("id", req.params.id)
        .single();

      if (error) {
        throw error;
      }

      res.json({ foto: data?.foto || "" });
    } catch (erro) {
      console.error("Erro ao buscar foto da nota fiscal:", erro.message);

      res.status(500).json({
        erro: "Não foi possível buscar a foto.",
        detalhes: erro.message,
      });
    }
  }
);

app.post(
  "/notas-fiscais",
  verificarPermissao(PERM_NOTAS_FISCAIS),
  async function (req, res) {
    try {
      const foto = req.body?.foto || "";
      const lojaId = req.body?.loja_id ? Number(req.body.loja_id) : null;
      const observacao = (req.body?.observacao || "").trim();

      if (!foto) {
        return res.status(400).json({
          erro: "Envie a foto/arquivo da nota fiscal.",
        });
      }

      const { data, error } = await supabase
        .from("notas_fiscais")
        .insert([{ loja_id: lojaId, foto, observacao }])
        .select(colunasNotaFiscalListagem)
        .single();

      if (error) {
        throw error;
      }

      registrarAuditoria(req, "criou", "notas_fiscais", data.id, observacao || null);

      res.status(201).json(data);
    } catch (erro) {
      console.error("Erro ao salvar nota fiscal:", erro.message);

      res.status(500).json({
        erro: "Não foi possível salvar a nota fiscal.",
        detalhes: erro.message,
      });
    }
  }
);

app.delete(
  "/notas-fiscais/:id",
  verificarPermissao(PERM_NOTAS_FISCAIS),
  async function (req, res) {
    try {
      const { error } = await supabase
        .from("notas_fiscais")
        .delete()
        .eq("id", req.params.id);

      if (error) {
        throw error;
      }

      registrarAuditoria(req, "excluiu", "notas_fiscais", req.params.id, null);

      res.status(204).send();
    } catch (erro) {
      console.error("Erro ao excluir nota fiscal:", erro.message);

      res.status(500).json({
        erro: "Não foi possível excluir a nota fiscal.",
        detalhes: erro.message,
      });
    }
  }
);

// ===== Retiradas de Sócios (20/08/2026) =====
// Pedido do usuário: retirada de dinheiro pros sócios precisa dar baixa
// no Saldo e aparecer nos Relatórios, mas NUNCA em Contas Pagas nem
// Despesas comuns (telas que a equipe toda acessa) — por isso é uma
// tabela própria (retiradas_socios), inteira restrita a admin, do
// cadastro até a leitura.
function prepararRetiradaSocio(dados = {}) {
  return {
    socio: (dados.socio || "").trim(),
    valor: Number(dados.valor || 0),
    data: dados.data || null,
    loja_id: dados.loja_id ? Number(dados.loja_id) : null,
    observacao: (dados.observacao || "").trim(),
  };
}

// Pedido do usuário: a retirada tem que dar baixa no Saldo pra QUALQUER
// usuário que vê o card Saldo (não só admin) — senão o número fica
// diferente dependendo de quem está olhando. Mas os DETALHES (nome do
// sócio, observação) continuam só-admin. Essa rota devolve só o mínimo
// pra recalcular o Saldo certo (id, valor, data, loja_id), sem vazar
// quem sacou quanto pra quem não é admin.
app.get(
  "/retiradas-socios/resumo",
  verificarPermissao(["saldo", "financeiro"]),
  async function (req, res) {
    try {
      const { data, error } = await supabase
        .from("retiradas_socios")
        .select("id, valor, data, loja_id");

      if (error) throw error;

      res.json(data || []);
    } catch (erro) {
      console.error("Erro ao buscar resumo de retiradas de sócios:", erro.message);

      res.status(500).json({
        erro: "Não foi possível buscar o resumo de retiradas de sócios.",
        detalhes: erro.message,
      });
    }
  }
);

app.get("/retiradas-socios", verificarAdmin, async function (req, res) {
  try {
    const { data, error } = await supabase
      .from("retiradas_socios")
      .select("*")
      .order("data", { ascending: false })
      .order("id", { ascending: false });

    if (error) throw error;

    res.json(data || []);
  } catch (erro) {
    console.error("Erro ao buscar retiradas de sócios:", erro.message);

    res.status(500).json({
      erro: "Não foi possível buscar as retiradas de sócios.",
      detalhes: erro.message,
    });
  }
});

app.post("/retiradas-socios", verificarAdmin, async function (req, res) {
  try {
    const dados = prepararRetiradaSocio(req.body);

    if (!dados.socio || !dados.valor || !dados.data) {
      return res.status(400).json({
        erro: "Informe o sócio, o valor e a data da retirada.",
      });
    }

    const { usuario, perfil } = await obterPerfilOpcional(req);

    const { data, error } = await supabase
      .from("retiradas_socios")
      .insert([
        {
          id: Date.now(),
          ...dados,
          criado_por: perfil?.nome || usuario?.email || "",
        },
      ])
      .select("*")
      .single();

    if (error) throw error;

    registrarAuditoria(
      req,
      "criou",
      "retiradas_socios",
      data.id,
      `${data.socio} — ${data.valor} em ${data.data}`
    );

    res.status(201).json(data);
  } catch (erro) {
    console.error("Erro ao criar retirada de sócio:", erro.message);

    res.status(500).json({
      erro: "Não foi possível salvar a retirada de sócio.",
      detalhes: erro.message,
    });
  }
});

app.delete("/retiradas-socios/:id", verificarAdmin, async function (req, res) {
  try {
    const { error } = await supabase
      .from("retiradas_socios")
      .delete()
      .eq("id", req.params.id);

    if (error) throw error;

    registrarAuditoria(req, "excluiu", "retiradas_socios", req.params.id, null);

    res.status(204).send();
  } catch (erro) {
    console.error("Erro ao excluir retirada de sócio:", erro.message);

    res.status(500).json({
      erro: "Não foi possível excluir a retirada de sócio.",
      detalhes: erro.message,
    });
  }
});

// Pedido do usuário (21/08/2026): Empréstimo entre lojas — ex: loja A
// paga uma conta da loja B porque B estava sem saldo. A loja credora
// desconta do Saldo dela; a devedora aumenta o Saldo (recebeu ajuda) e
// fica com dívida em aberto, abatida conforme paga de volta.
// Resumo (sem detalhe sensível nenhum aqui, é operacional entre lojas,
// não é sigiloso como Retiradas de Sócios) — pra QUALQUER usuário
// recalcular o Saldo certo da loja dele.
app.get(
  "/emprestimos-entre-lojas/resumo",
  verificarPermissao(["saldo", "financeiro"]),
  async function (req, res) {
    try {
      const { data, error } = await supabase
        .from("emprestimos_entre_lojas")
        .select("id, loja_credora_id, loja_devedora_id, valor, valor_pago, data, status");

      if (error) throw error;

      res.json(data || []);
    } catch (erro) {
      console.error("Erro ao buscar resumo de empréstimos entre lojas:", erro.message);
      res.status(500).json({
        erro: "Não foi possível buscar o resumo de empréstimos entre lojas.",
        detalhes: erro.message,
      });
    }
  }
);

app.get(
  "/emprestimos-entre-lojas",
  verificarAdmin,
  async function (req, res) {
    try {
      const { data, error } = await supabase
        .from("emprestimos_entre_lojas")
        .select("*, pagamentos:emprestimos_entre_lojas_pagamentos(*)")
        .order("data", { ascending: false });

      if (error) throw error;

      res.json(data || []);
    } catch (erro) {
      console.error("Erro ao buscar empréstimos entre lojas:", erro.message);
      res.status(500).json({
        erro: "Não foi possível buscar os empréstimos entre lojas.",
        detalhes: erro.message,
      });
    }
  }
);

app.post(
  "/emprestimos-entre-lojas",
  verificarAdmin,
  async function (req, res) {
    try {
      const lojaCredoraId = Number(req.body.loja_credora_id);
      const lojaDevedoraId = Number(req.body.loja_devedora_id);
      const valor = Number(req.body.valor);
      const data = req.body.data;

      if (!Number.isFinite(lojaCredoraId) || !Number.isFinite(lojaDevedoraId)) {
        return res.status(400).json({ erro: "Escolha as duas lojas." });
      }

      if (lojaCredoraId === lojaDevedoraId) {
        return res.status(400).json({
          erro: "A loja que emprestou e a que pegou emprestado não podem ser a mesma.",
        });
      }

      if (!valor || valor <= 0) {
        return res.status(400).json({ erro: "Informe um valor válido." });
      }

      if (!data) {
        return res.status(400).json({ erro: "Informe a data." });
      }

      const { usuario, perfil } = await obterPerfilOpcional(req);

      const { data: criado, error } = await supabase
        .from("emprestimos_entre_lojas")
        .insert({
          loja_credora_id: lojaCredoraId,
          loja_devedora_id: lojaDevedoraId,
          valor,
          data,
          descricao: (req.body.descricao || "").trim(),
          criado_por: perfil?.nome || usuario?.email || "",
        })
        .select("*")
        .single();

      if (error) throw error;

      registrarAuditoria(
        req,
        "criou",
        "emprestimos_entre_lojas",
        criado.id,
        `Empréstimo de ${valor} entre lojas ${lojaCredoraId} → ${lojaDevedoraId}`
      );

      res.status(201).json({ ...criado, pagamentos: [] });
    } catch (erro) {
      console.error("Erro ao criar empréstimo entre lojas:", erro.message);
      res.status(500).json({
        erro: "Não foi possível salvar o empréstimo.",
        detalhes: erro.message,
      });
    }
  }
);

app.post(
  "/emprestimos-entre-lojas/:id/pagamento",
  verificarAdmin,
  async function (req, res) {
    try {
      const id = Number(req.params.id);
      const valorPagamento = Number(req.body.valor);
      const dataPagamento = req.body.data;

      if (!Number.isFinite(id)) {
        return res.status(400).json({ erro: "ID inválido." });
      }

      if (!valorPagamento || valorPagamento <= 0) {
        return res.status(400).json({ erro: "Informe um valor válido." });
      }

      if (!dataPagamento) {
        return res.status(400).json({ erro: "Informe a data do pagamento." });
      }

      const { data: emprestimo, error: erroBusca } = await supabase
        .from("emprestimos_entre_lojas")
        .select("*")
        .eq("id", id)
        .single();

      if (erroBusca) throw erroBusca;

      const novoValorPago = Number(
        (Number(emprestimo.valor_pago || 0) + valorPagamento).toFixed(2)
      );

      if (novoValorPago > Number(emprestimo.valor) + 0.01) {
        return res.status(400).json({
          erro: `Esse pagamento deixaria o total pago (${novoValorPago}) maior que a dívida (${emprestimo.valor}).`,
        });
      }

      const { usuario, perfil } = await obterPerfilOpcional(req);

      await supabase.from("emprestimos_entre_lojas_pagamentos").insert({
        emprestimo_id: id,
        valor: valorPagamento,
        data: dataPagamento,
        criado_por: perfil?.nome || usuario?.email || "",
      });

      const { data: atualizado, error: erroUpdate } = await supabase
        .from("emprestimos_entre_lojas")
        .update({
          valor_pago: novoValorPago,
          status: novoValorPago >= Number(emprestimo.valor) - 0.01 ? "quitado" : "aberto",
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", id)
        .select("*, pagamentos:emprestimos_entre_lojas_pagamentos(*)")
        .single();

      if (erroUpdate) throw erroUpdate;

      registrarAuditoria(
        req,
        "registrou pagamento",
        "emprestimos_entre_lojas",
        id,
        `Pagamento de ${valorPagamento} — total pago agora: ${novoValorPago}`
      );

      res.json(atualizado);
    } catch (erro) {
      console.error("Erro ao registrar pagamento de empréstimo:", erro.message);
      res.status(500).json({
        erro: "Não foi possível registrar o pagamento.",
        detalhes: erro.message,
      });
    }
  }
);

app.delete(
  "/emprestimos-entre-lojas/:id",
  verificarAdmin,
  async function (req, res) {
    try {
      const { error } = await supabase
        .from("emprestimos_entre_lojas")
        .delete()
        .eq("id", req.params.id);

      if (error) throw error;

      registrarAuditoria(
        req,
        "excluiu",
        "emprestimos_entre_lojas",
        req.params.id,
        null
      );

      res.status(204).send();
    } catch (erro) {
      console.error("Erro ao excluir empréstimo entre lojas:", erro.message);
      res.status(500).json({
        erro: "Não foi possível excluir o empréstimo.",
        detalhes: erro.message,
      });
    }
  }
);

app.get("/usuarios", verificarAdmin, async function (req, res) {
  try {
    const { data, error } = await supabase
      .from("perfis")
      .select("*")
      .order("nome", { ascending: true });

    if (error) {
      throw error;
    }

    const { data: dadosAuth, error: erroAuth } =
      await supabase.auth.admin.listUsers();

    if (erroAuth) {
      throw erroAuth;
    }

    const usuariosComEmail = (data || []).map((perfil) => {
      const usuarioAuth = dadosAuth.users.find(
        (usuario) => usuario.id === perfil.user_id
      );

      return {
        ...perfil,
        email: usuarioAuth?.email || "",
      };
    });

    res.json(usuariosComEmail);
  } catch (erro) {
    console.error("Erro ao buscar usuários:", erro.message);

    res.status(500).json({
      erro: "Não foi possível buscar os usuários.",
      detalhes: erro.message,
    });
  }
});

const PERMISSOES_VALIDAS = [
  "financeiro",
  "saldo",
  "receitas",
  "despesas",
  "categorias",
  "fluxo_caixa",
  "relatorios",
  "proximos_recebimentos",
  "contas_pagar",
  "contas_receber",
  "estoque",
  "fechamento_caixa",
  "notas_fiscais",
  "vendas_saipos",
  "conciliacao",
  "aprovar_despesas",
  "clientes",
];

function prepararPermissoes(permissoes) {
  if (!Array.isArray(permissoes)) return [];

  return permissoes.filter((item) => PERMISSOES_VALIDAS.includes(item));
}

app.post("/usuarios", verificarAdmin, async function (req, res) {
  try {
    const { nome, email, senha, perfil, loja_id, permissoes } = req.body;

    if (!nome || !email || !senha) {
      return res.status(400).json({
        erro: "Informe nome, e-mail e senha.",
      });
    }

    const { data: novoUsuario, error: erroCriacao } =
      await supabase.auth.admin.createUser({
        email: email.trim().toLowerCase(),
        password: senha,
        email_confirm: true,
      });

    if (erroCriacao) {
      throw erroCriacao;
    }

    const { data: novoPerfil, error: erroPerfil } = await supabase
      .from("perfis")
      .insert([
        {
          user_id: novoUsuario.user.id,
          nome,
          perfil: perfil === "administrador" ? "administrador" : "gerente",
          loja_id: loja_id || null,
          permissoes: prepararPermissoes(permissoes),
        },
      ])
      .select("*")
      .single();

    if (erroPerfil) {
      throw erroPerfil;
    }

    registrarAuditoria(
      req,
      "criou",
      "usuarios",
      novoPerfil.user_id,
      `${nome} (${email})`
    );

    res.status(201).json({
      ...novoPerfil,
      email: novoUsuario.user.email,
    });
  } catch (erro) {
    console.error("Erro ao criar usuário:", erro.message);

    res.status(500).json({
      erro: "Não foi possível criar o usuário.",
      detalhes: erro.message,
    });
  }
});

app.put("/usuarios/:id", verificarAdmin, async function (req, res) {
  try {
    const { nome, perfil, loja_id, permissoes } = req.body;

    const { data, error } = await supabase
      .from("perfis")
      .update({
        nome,
        perfil: perfil === "administrador" ? "administrador" : "gerente",
        loja_id: loja_id || null,
        permissoes: prepararPermissoes(permissoes),
      })
      .eq("user_id", req.params.id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    registrarAuditoria(req, "editou", "usuarios", req.params.id, nome);

    res.json(data);
  } catch (erro) {
    console.error("Erro ao atualizar usuário:", erro.message);

    res.status(500).json({
      erro: "Não foi possível atualizar o usuário.",
      detalhes: erro.message,
    });
  }
});

app.delete("/usuarios/:id", verificarAdmin, async function (req, res) {
  try {
    if (req.params.id === req.usuarioLogado.id) {
      return res.status(400).json({
        erro: "Você não pode remover o próprio acesso.",
      });
    }

    const { error: erroPerfil } = await supabase
      .from("perfis")
      .delete()
      .eq("user_id", req.params.id);

    if (erroPerfil) {
      throw erroPerfil;
    }

    const { error: erroAuth } = await supabase.auth.admin.deleteUser(
      req.params.id
    );

    if (erroAuth) {
      throw erroAuth;
    }

    registrarAuditoria(req, "excluiu", "usuarios", req.params.id, null);

    res.status(204).send();
  } catch (erro) {
    console.error("Erro ao remover acesso do usuário:", erro.message);

    res.status(500).json({
      erro: "Não foi possível remover o acesso do usuário.",
      detalhes: erro.message,
    });
  }
});

app.put(
  "/configuracoes/aprovacao-despesas",
  verificarAdmin,
  async function (req, res) {
    try {
      const ativa = Boolean(req.body?.ativa);

      const { data, error } = await supabase
        .from("configuracoes")
        .update({ aprovacao_despesas_ativa: ativa })
        .eq("id", 1)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      res.json(data);
    } catch (erro) {
      console.error(
        "Erro ao atualizar configuração de aprovação:",
        erro.message
      );

      res.status(500).json({
        erro: "Não foi possível atualizar a configuração.",
        detalhes: erro.message,
      });
    }
  }
);

app.get("/insumos", verificarPermissao("estoque"), async function (req, res) {
  try {
    const { data, error } = await supabase
      .from("insumos")
      .select("*")
      .order("nome", { ascending: true });

    if (error) {
      throw error;
    }

    res.json(data || []);
  } catch (erro) {
    console.error("Erro ao buscar insumos:", erro.message);

    res.status(500).json({
      erro: "Não foi possível buscar os insumos.",
      detalhes: erro.message,
    });
  }
});

app.post("/insumos", verificarPermissao("estoque"), async function (req, res) {
  try {
    const dadosInsumo = prepararInsumo(req.body);

    if (!dadosInsumo.nome) {
      return res.status(400).json({
        erro: "Informe o nome do insumo.",
      });
    }

    if (!dadosInsumo.loja_id) {
      return res.status(400).json({
        erro: "Selecione a loja do insumo.",
      });
    }

    const { data, error } = await supabase
      .from("insumos")
      .insert([
        {
          ...dadosInsumo,
          estoque_atual: req.body.estoque_atual
            ? Number(req.body.estoque_atual)
            : 0,
        },
      ])
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    res.status(201).json(data);
  } catch (erro) {
    console.error("Erro ao criar insumo:", erro.message);

    res.status(500).json({
      erro: "Não foi possível criar o insumo.",
      detalhes: erro.message,
    });
  }
});

app.put("/insumos/:id", verificarPermissao("estoque"), async function (req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({
        erro: "ID do insumo inválido.",
      });
    }

    const dadosInsumo = prepararInsumo(req.body);

    if (!dadosInsumo.nome) {
      return res.status(400).json({
        erro: "Informe o nome do insumo.",
      });
    }

    const { data, error } = await supabase
      .from("insumos")
      .update(dadosInsumo)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    res.json(data);
  } catch (erro) {
    console.error("Erro ao atualizar insumo:", erro.message);

    res.status(500).json({
      erro: "Não foi possível atualizar o insumo.",
      detalhes: erro.message,
    });
  }
});

app.delete("/insumos/:id", verificarPermissao("estoque"), async function (req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({
        erro: "ID do insumo inválido.",
      });
    }

    const { error } = await supabase
      .from("insumos")
      .delete()
      .eq("id", id);

    if (error) {
      throw error;
    }

    res.status(204).send();
  } catch (erro) {
    console.error("Erro ao excluir insumo:", erro.message);

    res.status(500).json({
      erro: "Não foi possível excluir o insumo.",
      detalhes: erro.message,
    });
  }
});

app.post("/insumos/:id/movimentacao", verificarPermissao("estoque"), async function (req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({
        erro: "ID do insumo inválido.",
      });
    }

    const tipo = req.body?.tipo;
    const quantidade = Number(req.body?.quantidade);
    const motivo = (req.body?.motivo || "").trim();

    if (!["entrada", "saida", "ajuste"].includes(tipo)) {
      return res.status(400).json({
        erro: "Tipo de movimentação inválido.",
      });
    }

    if (!quantidade || quantidade <= 0) {
      return res.status(400).json({
        erro: "Informe uma quantidade válida.",
      });
    }

    const { data: insumo, error: erroInsumo } = await supabase
      .from("insumos")
      .select("estoque_atual")
      .eq("id", id)
      .single();

    if (erroInsumo) {
      throw erroInsumo;
    }

    const estoqueAtual = Number(insumo?.estoque_atual || 0);

    const novoEstoque =
      tipo === "saida"
        ? estoqueAtual - quantidade
        : tipo === "ajuste"
        ? quantidade
        : estoqueAtual + quantidade;

    const { data: insumoAtualizado, error: erroAtualizacao } =
      await supabase
        .from("insumos")
        .update({ estoque_atual: novoEstoque })
        .eq("id", id)
        .select("*")
        .single();

    if (erroAtualizacao) {
      throw erroAtualizacao;
    }

    const { error: erroMovimentacao } = await supabase
      .from("movimentacoes_estoque")
      .insert([
        {
          insumo_id: id,
          tipo,
          quantidade,
          motivo,
        },
      ]);

    if (erroMovimentacao) {
      throw erroMovimentacao;
    }

    res.status(201).json(insumoAtualizado);
  } catch (erro) {
    console.error(
      "Erro ao registrar movimentação de estoque:",
      erro.message
    );

    res.status(500).json({
      erro: "Não foi possível registrar a movimentação.",
      detalhes: erro.message,
    });
  }
});

app.get(
  "/insumos/:id/movimentacoes",
  verificarPermissao("estoque"),
  async function (req, res) {
    try {
      const id = Number(req.params.id);

      if (!Number.isFinite(id)) {
        return res.status(400).json({
          erro: "ID do insumo inválido.",
        });
      }

      const { data, error } = await supabase
        .from("movimentacoes_estoque")
        .select("*")
        .eq("insumo_id", id)
        .order("criado_em", { ascending: false })
        .limit(30);

      if (error) {
        throw error;
      }

      res.json(data || []);
    } catch (erro) {
      console.error(
        "Erro ao buscar movimentações:",
        erro.message
      );

      res.status(500).json({
        erro: "Não foi possível buscar as movimentações.",
        detalhes: erro.message,
      });
    }
  }
);

app.use(function (erro, req, res, next) {
  if (
    erro &&
    erro.type === "entity.too.large"
  ) {
    return res.status(413).json({
      erro: "A foto enviada é muito grande.",
    });
  }

  console.error("Erro interno:", erro);

  res.status(500).json({
    erro: "Erro interno do servidor.",
  });
});

// Importação automática diária das vendas da Saipos como receita — pra
// todas as lojas com saipos_id_store cadastrado, importa sempre o dia
// ANTERIOR (ontem), já fechado, evitando pegar um dia ainda em andamento.
// Confirmado com o usuário (10/08/2026) que quer isso automático, sem
// precisar clicar no botão manual todo dia.
function dataBrasilia(diasAtras = 0) {
  const agora = new Date();
  agora.setDate(agora.getDate() - diasAtras);

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

// Igual dataBrasilia(), mas convertendo um horário específico (não "agora")
// pro fuso de Brasília — usado pra saber em qual dia (local) uma foto de
// fechamento foi tirada, mesmo se o servidor estiver em UTC.
function dataBrasiliaDe(dataIso) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(dataIso));
}

function horaBrasilia() {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  return {
    hora: Number(partes.find((parte) => parte.type === "hour").value),
    minuto: Number(partes.find((parte) => parte.type === "minute").value),
  };
}

let ultimaDataImportadaAutomaticamente = null;

// Bug encontrado e corrigido (19/08/2026): antes, "já importei hoje" era
// marcado ANTES de confirmar que a importação deu certo — se desse
// qualquer erro (rede instável, Supabase fora do ar, servidor reiniciando
// bem na hora), o dia inteiro ficava marcado como "feito" mesmo sem ter
// sido, e a rotina nunca mais tentava de novo até o dia seguinte (as
// vendas em dinheiro/PIX/débito daquele dia só entrariam manualmente).
// Agora só marca como concluído no fim, DEPOIS de terminar sem erro — se
// falhar, tenta de novo no próximo minuto, e continua tentando o dia
// inteiro (não só na janela 05:00–05:04) até conseguir.
async function rodarImportacaoAutomaticaDiariaSaipos() {
  const dataAlvo = dataBrasilia(1);

  if (ultimaDataImportadaAutomaticamente === dataAlvo) {
    return;
  }

  try {
    const { data: lojasComSaipos, error } = await supabase
      .from("lojas")
      .select("id, nome, saipos_id_store")
      .not("saipos_id_store", "is", null);

    if (error) {
      throw error;
    }

    for (const loja of lojasComSaipos || []) {
      try {
        const resultado = await importarVendasSaiposComoLancamentos(
          loja,
          dataAlvo
        );

        const resumoTexto = `Importação automática diária da Saipos (${loja.nome}, ${dataAlvo}): ${resultado.criados.length} criado(s), ${resultado.atualizados.length} atualizado(s), ${Object.keys(resultado.pulados).length} tipo(s) pulado(s).`;

        console.log(resumoTexto);

        await supabase.from("log_auditoria").insert([
          {
            usuario_id: null,
            usuario_nome: "Automação (Saipos)",
            acao: "importou",
            tabela_afetada: "lancamentos",
            registro_id: `${loja.id}:${dataAlvo}`,
            detalhes: resumoTexto,
          },
        ]);
      } catch (erroLoja) {
        console.error(
          `Erro na importação automática da Saipos pra loja "${loja.nome}":`,
          erroLoja.message
        );
        await registrarFalhaAutomacao(
          `Importação Saipos — ${loja.nome}`,
          `Data ${dataAlvo}: ${erroLoja.message}`
        );
      }
    }

    // Só marca como "feito" depois de terminar sem erro no laço acima —
    // se uma loja específica falhou, ela já foi logada e vai ficar sem
    // esse dia importado (precisa do botão manual), mas isso não trava a
    // tentativa de amanhã.
    ultimaDataImportadaAutomaticamente = dataAlvo;
  } catch (erro) {
    console.error(
      "Erro na importação automática diária da Saipos — vai tentar de novo no próximo minuto:",
      erro.message
    );
    await registrarFalhaAutomacao("Importação Saipos", erro.message);
  }
}

// Confere a cada minuto se a importação do dia anterior ainda não rodou —
// antes só tentava na janela 05:00–05:04; se o servidor tivesse acabado
// de reiniciar (deploy, ou "acordando" de um período parado) bem nesses 5
// minutos, perdia a janela inteira e só tentava de novo no dia seguinte.
// Agora tenta o dia inteiro até conseguir (ainda roda só 1x de verdade,
// controlado por "ultimaDataImportadaAutomaticamente").
setInterval(function () {
  rodarImportacaoAutomaticaDiariaSaipos();
}, 60 * 1000);

let ultimoDiaGeradoDespesasRecorrentes = null;

// Quantos dias ANTES do vencimento a Conta a Pagar já deve aparecer —
// pedido do usuário (17/08/2026): dá tempo de se organizar pro pagamento,
// sem sumir de vista, mas também sem lotar a lista com contas que só
// vencem daqui a semanas.
const DIAS_ANTECEDENCIA_RECORRENTE = 5;

// Gera a Conta a Pagar do mês de "hojeStr" pra UMA despesa recorrente, se
// ainda não existir e se já estiver dentro da antecedência (ou já
// atrasada) — usado tanto pela rotina diária quanto na hora de cadastrar
// uma recorrência nova (pra não esperar até o próximo dia 05h se o
// vencimento desse mês já passou ou está pertinho). Idempotente: marca no
// observacao qual recorrência e qual mês geraram essa conta, pra nunca
// duplicar.
async function gerarContaPagarDeRecorrenteSeNecessario(recorrente, hojeStr) {
  const [ano, mes] = hojeStr.split("-").map(Number);
  const anoMes = `${ano}-${String(mes).padStart(2, "0")}`;
  const ultimoDiaDoMes = new Date(ano, mes, 0).getDate();

  // Pedido do usuário (19/08/2026): se a recorrente tem um "mes_inicio"
  // definido (ex: cadastrada depois do dia de vencimento já ter passado
  // esse mês, mas com intenção de só valer a partir do mês seguinte),
  // nem tenta gerar nada pra mês anterior a esse.
  if (recorrente.mes_inicio && anoMes < recorrente.mes_inicio) {
    return null;
  }

  const marcador = `[RECORRENTE:${recorrente.id}:${anoMes}]`;

  const { data: existentes, error: erroBusca } = await supabase
    .from("contas_pagar")
    .select("id")
    .ilike("observacao", `%${marcador}%`)
    .limit(1);

  if (erroBusca) {
    throw erroBusca;
  }

  if (existentes && existentes.length > 0) {
    return null;
  }

  const dia = Math.min(
    Number(recorrente.dia_vencimento || 1),
    ultimoDiaDoMes
  );
  const dataVencimento = `${ano}-${String(mes).padStart(2, "0")}-${String(
    dia
  ).padStart(2, "0")}`;

  // Só gera se já estiver dentro da antecedência (ou já atrasada) — se o
  // vencimento ainda está longe, nem cria ainda, a rotina diária tenta de
  // novo amanhã.
  const dataLimiteGeracao = new Date(`${dataVencimento}T00:00:00`);
  dataLimiteGeracao.setDate(
    dataLimiteGeracao.getDate() - DIAS_ANTECEDENCIA_RECORRENTE
  );
  const dataLimiteStr = dataLimiteGeracao.toISOString().slice(0, 10);

  if (hojeStr < dataLimiteStr) {
    return null;
  }

  const dadosConta = {
    descricao: recorrente.descricao,
    fornecedor: recorrente.fornecedor || "",
    valor: Number(recorrente.valor || 0),
    data_vencimento: dataVencimento,
    observacao: `${marcador} Gerado automaticamente (despesa recorrente).${
      recorrente.observacao ? " " + recorrente.observacao : ""
    }`,
    foto: "",
    loja_id: recorrente.loja_id,
    // Bug real corrigido (19/08/2026): a checagem acima ("já existe?")
    // roda em código, com uma brecha de tempo entre o SELECT e o INSERT
    // — a criação imediata (ao cadastrar) e o relógio de fundo já
    // dispararam quase juntos pra uma recorrente nova e criaram duas
    // contas iguais pro mesmo mês. Esses dois campos, com uma trava
    // única no próprio banco, fecham essa brecha: se der corrida, o
    // SEGUNDO insert falha (código 23505) em vez de duplicar.
    recorrente_id: recorrente.id,
    recorrente_ano_mes: anoMes,
  };

  const { data: contaCriada, error: erroConta } = await supabase
    .from("contas_pagar")
    .insert([dadosConta])
    .select("id")
    .single();

  if (erroConta) {
    // 23505 = unique_violation — outra execução (rodando quase junto)
    // já criou essa mesma conta um instante antes; não é erro de
    // verdade, é a trava funcionando como esperado.
    if (erroConta.code === "23505") {
      return null;
    }
    throw erroConta;
  }

  await supabase.from("log_auditoria").insert([
    {
      usuario_id: null,
      usuario_nome: "Automação (Despesas Recorrentes)",
      acao: "criou",
      tabela_afetada: "contas_pagar",
      registro_id: String(contaCriada.id),
      detalhes: `Gerado automaticamente a partir da despesa recorrente #${recorrente.id} (${recorrente.descricao}), vencimento ${dataVencimento}.`,
    },
  ]);

  return contaCriada;
}

// Pedido do usuário (16/08/2026, apelidado "despesa recorrente"): todo
// dia confere se a Conta a Pagar desse mês já existe pra cada despesa
// recorrente ativa, dentro da antecedência configurada; se não existir
// ainda, cria sozinha. Roda de novo todo dia (não só uma vez por mês) pra
// pegar despesas recorrentes cadastradas a qualquer momento.
async function rodarGeracaoDespesasRecorrentes() {
  const hojeStr = dataBrasilia(0);

  if (ultimoDiaGeradoDespesasRecorrentes === hojeStr) {
    return;
  }

  try {
    const { data: recorrentes, error } = await supabase
      .from("despesas_recorrentes")
      .select("*")
      .eq("ativo", true);

    if (error) {
      throw error;
    }

    for (const recorrente of recorrentes || []) {
      try {
        await gerarContaPagarDeRecorrenteSeNecessario(recorrente, hojeStr);
      } catch (erroRecorrente) {
        console.error(
          `Erro ao gerar conta a pagar da recorrência #${recorrente.id}:`,
          erroRecorrente.message
        );
        await registrarFalhaAutomacao(
          `Despesa recorrente #${recorrente.id} (${recorrente.descricao || ""})`,
          erroRecorrente.message
        );
      }
    }

    // Só marca como "feito" no fim, depois de terminar sem erro na busca
    // das recorrências — mesma correção aplicada na importação Saipos e
    // no backup diário (19/08/2026). Uma recorrência específica que falhe
    // já foi logada acima e continua tentando de novo a cada checagem
    // (a função interna já é segura contra duplicar, verifica no banco
    // antes de criar).
    ultimoDiaGeradoDespesasRecorrentes = hojeStr;
  } catch (erro) {
    console.error(
      "Erro na geração automática de despesas recorrentes — vai tentar de novo no próximo minuto:",
      erro.message
    );
    await registrarFalhaAutomacao("Despesas Recorrentes", erro.message);
  }
}

// ===== Integração WhatsApp (17/08/2026) =====
// O "robô" que fica de olho no grupo de WhatsApp roda separado (num
// computador local, não é um usuário logado de verdade) — por isso não
// usa o mesmo login/permissão de todo mundo, usa um token secreto fixo
// (WHATSAPP_BOT_TOKEN no .env) só pra essa rota.
function verificarTokenWhatsapp(req, res, next) {
  const token = req.headers["x-whatsapp-token"];

  if (!process.env.WHATSAPP_BOT_TOKEN) {
    return res.status(500).json({
      erro: "WHATSAPP_BOT_TOKEN não configurado no servidor.",
    });
  }

  if (!token || token !== process.env.WHATSAPP_BOT_TOKEN) {
    return res.status(401).json({ erro: "Token inválido." });
  }

  next();
}

// Pedido do usuário (20/08/2026): antes só dava pra descobrir que o robô
// do WhatsApp tinha caído cavando o log dele manualmente (achamos um
// crash real assim hoje) — agora ele manda um "sinal de vida" pro
// servidor de tempos em tempos enquanto está ligado e conectado. Se esse
// sinal parar de chegar, o Dashboard mostra um aviso sozinho, sem
// precisar ninguém notar que fotos pararam de entrar.
let ultimoHeartbeatWhatsapp = null;

// Bug real corrigido (21/08/2026): esse "último sinal" só vive na memória
// do processo — todo deploy/restart do backend no Render zera ele, e o
// robô só manda um novo sinal a cada 5 min. Sem essa folga, o Dashboard
// mostrava "desligado" por até 5 minutos depois de QUALQUER deploy, mesmo
// com o robô conectado normalmente a vida toda. Guarda quando o servidor
// ligou e não acende o alerta antes de dar tempo de um heartbeat chegar.
const inicioDoServidor = Date.now();

app.post(
  "/integracoes/whatsapp/heartbeat",
  verificarTokenWhatsapp,
  function (req, res) {
    ultimoHeartbeatWhatsapp = new Date().toISOString();
    res.json({ ok: true });
  }
);

// Minutos sem sinal de vida pra considerar o robô "desligado" — folga
// suficiente pra não alarmar à toa numa reconexão rápida normal.
const MINUTOS_WHATSAPP_DESLIGADO = 10;

app.get("/integracoes/whatsapp/status", verificarPermissao(PERM_LANCAMENTOS), function (req, res) {
  const minutosDesdeUltimoSinal = ultimoHeartbeatWhatsapp
    ? (Date.now() - new Date(ultimoHeartbeatWhatsapp).getTime()) / 60000
    : null;
  const minutosDesdeQueOServidorLigou = (Date.now() - inicioDoServidor) / 60000;
  const aindaEmFolgaDeReinicio =
    minutosDesdeQueOServidorLigou < MINUTOS_WHATSAPP_DESLIGADO;

  res.json({
    ultimo_heartbeat: ultimoHeartbeatWhatsapp,
    ligado:
      aindaEmFolgaDeReinicio ||
      (ultimoHeartbeatWhatsapp != null &&
        minutosDesdeUltimoSinal <= MINUTOS_WHATSAPP_DESLIGADO),
    minutos_desde_ultimo_sinal: minutosDesdeUltimoSinal,
  });
});

// Legenda → categoria de despesa (pedido do usuário, 17/08/2026): cada
// uma dessas palavras na legenda da foto vira uma despesa de verdade,
// lida por IA (valor + fornecedor), igual o botão "Ler nota
// automaticamente" já faz manualmente em Despesas.
const CATEGORIAS_DESPESA_WHATSAPP = {
  vale: "Vale",
  reforma: "Reforma",
  compras: "Compras",
  materia_prima: "Matéria-Prima",
};

// Pedido do usuário (19/08/2026): duas fotos de notas DIFERENTES (ex:
// duas notas da mesma empresa, mesmo valor, mandadas em minutos
// próximos) não podem virar duas despesas idênticas no sistema sem
// nenhuma informação que prove que são coisas diferentes — vira
// duplicata bloqueada A NÃO SER que a legenda escrita no grupo (ex:
// "embalagem") ou algum identificador lido na própria foto (nº da nota,
// do pedido, autorização, etc.) mostre que não é a mesma nota de novo.
async function encontrarDespesaDuplicadaWhatsapp({
  lojaId,
  fornecedor,
  valor,
  legenda,
  identificador,
}) {
  if (!fornecedor || !valor) return null;

  const desde = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("lancamentos")
    .select("id, fornecedor, valor, descricao, observacao, created_at")
    .eq("tipo", "despesa")
    .eq("loja_id", lojaId)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("Erro ao checar duplicata do WhatsApp:", error.message);
    return null;
  }

  const fornecedorLimpo = fornecedor.trim().toLowerCase();
  const legendaLimpa = (legenda || "").trim().toLowerCase();
  const identificadorLimpo = (identificador || "").trim().toLowerCase();

  return (
    (data || []).find((item) => {
      const mesmoFornecedor =
        (item.fornecedor || "").trim().toLowerCase() === fornecedorLimpo;
      const mesmoValor =
        Math.abs(Number(item.valor || 0) - Number(valor)) < 0.01;

      if (!mesmoFornecedor || !mesmoValor) return false;

      // Se essa nota nova trouxe uma legenda ou identificador que o
      // lançamento existente ainda NÃO tem registrado, não é duplicata —
      // é outra nota real, só que parecida.
      const textoExistente = `${item.descricao || ""} ${item.observacao || ""}`.toLowerCase();

      if (legendaLimpa && !textoExistente.includes(legendaLimpa)) return false;
      if (identificadorLimpo && !textoExistente.includes(identificadorLimpo))
        return false;

      return true;
    }) || null
  );
}

app.post(
  "/integracoes/whatsapp/foto",
  verificarTokenWhatsapp,
  async function (req, res) {
    try {
      const { foto, legenda, loja_id, remetente } = req.body;

      if (!foto) {
        return res.status(400).json({ erro: "Envie a foto." });
      }

      const lojaId = loja_id ? Number(loja_id) : null;
      const hoje = new Date().toLocaleDateString("en-CA", {
        timeZone: "America/Sao_Paulo",
      });
      const origemTexto = remetente
        ? ` Recebido via WhatsApp de ${remetente}.`
        : " Recebido via WhatsApp.";

      // Pedido do usuário (17/08/2026): legenda com erro de digitação (ex:
      // "Materia Pima" em vez de "Matéria Prima") não pode cair na fila só
      // porque não bateu a palavra exata — a IA interpreta o SENTIDO da
      // legenda em vez do JS procurar a palavra certinha no texto. Mais
      // caro que um regex, mas é uma chamada rápida/barata (Haiku, texto
      // curto) e só roda se tiver alguma legenda escrita.
      let categoriaClassificada = null;

      if (legenda && legenda.trim()) {
        try {
          const respostaClassificacao = await perguntarTextoComIA(
            `A legenda de uma foto enviada num grupo de WhatsApp de uma hamburgueria foi: "${legenda}". Essa legenda pode ter erro de digitação, plural/singular trocado ou abreviação — interprete o SENTIDO, não exija a palavra exata. Classifique em UMA destas categorias:\n- "boy": diária/pagamento de entregador ou motoboy\n- "cozinha": diária/pagamento de funcionário de cozinha\n- "vale": vale ou adiantamento pra funcionário\n- "reforma": despesa de reforma ou manutenção\n- "compras": despesa de compras gerais\n- "materia_prima": despesa de matéria-prima ou insumos (ex: carne, pão, embalagem)\n- "pago": despesa/nota, qualquer que seja, que não se encaixa em nenhuma categoria específica acima\n- "nenhuma": não deu pra identificar nada disso\nSe a legenda tiver uma categoria específica (vale/reforma/compras/materia_prima/boy/cozinha), escolha ela; senão escolha "pago". Responda SOMENTE em JSON válido, sem texto antes ou depois, no formato exato: {"categoria": "boy"}.`,
            128
          );
          const jsonEncontrado = respostaClassificacao.match(/\{[\s\S]*\}/);
          const dadosClassificacao = JSON.parse(
            jsonEncontrado ? jsonEncontrado[0] : respostaClassificacao
          );
          const categoriasValidas = [
            "boy",
            "cozinha",
            "vale",
            "reforma",
            "compras",
            "materia_prima",
            "pago",
            "nenhuma",
          ];
          if (categoriasValidas.includes(dadosClassificacao.categoria)) {
            categoriaClassificada = dadosClassificacao.categoria;
          }
        } catch (erroClassificacao) {
          console.error(
            "Erro ao classificar legenda do WhatsApp:",
            erroClassificacao.message
          );
        }
      }

      // Pedido do usuário (19/08/2026): "toda e qualquer foto e
      // comprovante vai para o Contas Pagas" — não existe mais a
      // classificação "boleto" (a pagar, sem pagar ainda). Não precisa
      // escrever "pago" na legenda; se a IA não identificar nada
      // específico ("nenhuma") ou a classificação falhar, vira despesa já
      // paga genérica por padrão mesmo assim.
      if (!categoriaClassificada || categoriaClassificada === "nenhuma") {
        categoriaClassificada = "pago";
      }

      // Diária Boy/Cozinha
      const ehBoy = categoriaClassificada === "boy";
      const ehCozinha = categoriaClassificada === "cozinha";

      if (ehBoy || ehCozinha) {
        const tipo = ehBoy ? "boy" : "cozinha";

        let valorLido = null;
        try {
          const textoResposta = await lerImagemComIA(
            foto,
            'Essa é a foto de um comprovante de pagamento de diária (de um entregador/boy ou de um funcionário de cozinha) de uma hamburgueria. Pode ter o pagamento dividido em mais de uma forma (parte em dinheiro, parte em Pix, etc) — extraia o VALOR TOTAL PAGO, somando tudo se houver mais de um valor. Dê sua melhor estimativa mesmo sem 100% de certeza. Responda SOMENTE em JSON válido, sem texto antes ou depois, no formato exato: {"valor": 123.45}. Se não conseguir ler nenhum valor, use {"valor": null}.',
            8192
          );
          const jsonEncontrado = textoResposta.match(/\{[\s\S]*\}/);
          const dadosLidos = JSON.parse(
            jsonEncontrado ? jsonEncontrado[0] : textoResposta
          );
          valorLido = dadosLidos.valor != null ? Number(dadosLidos.valor) : null;
        } catch (erroLeitura) {
          console.error(
            "Erro ao ler valor da diária (WhatsApp):",
            erroLeitura.message
          );
        }

        const dadosPreparados = prepararFechamentoCaixa({
          loja_id: lojaId,
          tipo,
          foto,
          valor: valorLido,
          observacao: `Valor lido automaticamente — confira antes de fechar o caixa.${origemTexto}`,
        });

        const { data, error } = await supabase
          .from("fechamentos_caixa")
          .insert([dadosPreparados])
          .select("id")
          .single();

        if (error) throw error;

        registrarAuditoria(
          req,
          "criou (via WhatsApp)",
          "fechamentos_caixa",
          data.id,
          `${tipo}, legenda recebida: "${legenda || ""}"`
        );

        return res
          .status(201)
          .json({ ok: true, destino: "fechamento_caixa", tipo, id: data.id });
      }

      // Pedido do usuário (19/08/2026): não existe mais o caminho de
      // "Conta a Pagar" (ainda não paga) vindo do WhatsApp — toda foto ou
      // comprovante enviado no grupo é tratado como já pago, sem precisar
      // escrever "pago" na legenda. A legenda ainda define a categoria
      // (vale/reforma/compras/matéria-prima) ou vira a descrição da
      // despesa (ex: "contabilidade", "gás") quando não bate com nenhuma
      // categoria específica.
      const ehPago = categoriaClassificada === "pago";

      // Despesas (vale/reforma/compras/matéria-prima)
      const categoria = CATEGORIAS_DESPESA_WHATSAPP[categoriaClassificada];

      if (categoria) {

        let valorLido = null;
        let fornecedorLido = "";
        let identificadorLido = "";
        try {
          const textoResposta = await lerImagemComIA(
            foto,
            'Essa é a foto de uma nota fiscal ou comprovante de despesa de uma hamburgueria. Extraia: o VALOR TOTAL da nota (o valor final pago, normalmente perto de "TOTAL"), o nome do FORNECEDOR/loja/estabelecimento (se estiver visível), e um IDENTIFICADOR que prove que essa nota é diferente de outra parecida (nº da nota fiscal, nº do pedido, código de autorização, ou qualquer código/número visível na foto — o que estiver mais visível). Dê sua melhor estimativa mesmo sem 100% de certeza. Responda SOMENTE em JSON válido, sem texto antes ou depois, no formato exato: {"valor": 123.45, "fornecedor": "Nome ou null", "identificador": "código ou null"}. Se não conseguir ler algum desses dados, use null nesse campo.',
            8192
          );
          const jsonEncontrado = textoResposta.match(/\{[\s\S]*\}/);
          const dadosLidos = JSON.parse(
            jsonEncontrado ? jsonEncontrado[0] : textoResposta
          );
          valorLido = dadosLidos.valor != null ? Number(dadosLidos.valor) : null;
          fornecedorLido = dadosLidos.fornecedor || "";
          identificadorLido = dadosLidos.identificador || "";
        } catch (erroLeitura) {
          console.error(
            "Erro ao ler valor da despesa (WhatsApp):",
            erroLeitura.message
          );
        }

        // Pedido do usuário (19/08/2026): legenda escrita no grupo (ex:
        // "embalagem") vira parte da descrição, pra diferenciar na tela
        // duas despesas do mesmo fornecedor/valor/horário.
        const legendaLimpa = (legenda || "").trim();
        const detalheDistintivo = legendaLimpa || identificadorLido || "";
        const descricaoFinal = detalheDistintivo
          ? `${categoria} — ${detalheDistintivo}`
          : categoria;

        const duplicata = await encontrarDespesaDuplicadaWhatsapp({
          lojaId,
          fornecedor: fornecedorLido,
          valor: valorLido || 0,
          legenda: legendaLimpa,
          identificador: identificadorLido,
        });

        if (duplicata) {
          console.log(
            `⚠️ Foto do WhatsApp ignorada por parecer duplicata do lançamento #${duplicata.id} (mesmo fornecedor, valor e sem legenda/identificador que diferencie).`
          );

          return res.status(200).json({
            ok: true,
            destino: "duplicata_ignorada",
            id: duplicata.id,
          });
        }

        const dadosPreparados = prepararLancamento({
          tipo: "despesa",
          descricao: descricaoFinal,
          categoria,
          fornecedor: fornecedorLido,
          valor: valorLido || 0,
          data: hoje,
          foto,
          loja_id: lojaId,
          observacao: `Valor lido automaticamente — confira antes de aprovar.${identificadorLido ? ` Identificador lido na nota: ${identificadorLido}.` : ""}${origemTexto}`,
        });

        const novoLancamento = {
          id: Date.now(),
          ...dadosPreparados,
          status: "aprovado",
        };

        const { data, error } = await supabase
          .from("lancamentos")
          .insert([novoLancamento])
          .select("id")
          .single();

        if (error) throw error;

        registrarAuditoria(
          req,
          "criou (via WhatsApp)",
          "lancamentos",
          data.id,
          `${categoria}: R$ ${(valorLido || 0).toFixed(2)} — legenda recebida: "${legenda || ""}"`
        );

        return res
          .status(201)
          .json({ ok: true, destino: "lancamento", categoria, id: data.id });
      }

      // Despesa já paga GENÉRICA — pedido do usuário (17/08/2026): "pago"
      // em QUALQUER nota (mesmo sem palavra de categoria específica, ou
      // combinado com "boleto pago") desconta do saldo na hora. Lê valor
      // e fornecedor da foto, categoria fica "Despesas Diversas" (editável
      // depois, igual qualquer lançamento).
      if (ehPago) {
        let valorLido = null;
        let fornecedorLido = "";
        let identificadorLido = "";
        try {
          const textoResposta = await lerImagemComIA(
            foto,
            'Essa é a foto de uma nota fiscal ou comprovante de despesa JÁ PAGA de uma hamburgueria (pode ser inclusive um comprovante direto de banco/Pix). Extraia: o VALOR TOTAL da nota (o valor final pago, normalmente perto de "TOTAL"), o nome do FORNECEDOR/loja/estabelecimento/destinatário (se estiver visível), e um IDENTIFICADOR que prove que esse comprovante é diferente de outro parecido (nº da nota fiscal, nº do pedido, código de autorização, ID da transação Pix, ou qualquer código/número visível na foto — o que estiver mais visível). Dê sua melhor estimativa mesmo sem 100% de certeza. Responda SOMENTE em JSON válido, sem texto antes ou depois, no formato exato: {"valor": 123.45, "fornecedor": "Nome ou null", "identificador": "código ou null"}. Se não conseguir ler algum desses dados, use null nesse campo.',
            8192
          );
          const jsonEncontrado = textoResposta.match(/\{[\s\S]*\}/);
          const dadosLidos = JSON.parse(
            jsonEncontrado ? jsonEncontrado[0] : textoResposta
          );
          valorLido = dadosLidos.valor != null ? Number(dadosLidos.valor) : null;
          fornecedorLido = dadosLidos.fornecedor || "";
          identificadorLido = dadosLidos.identificador || "";
        } catch (erroLeitura) {
          console.error(
            "Erro ao ler despesa paga genérica (WhatsApp):",
            erroLeitura.message
          );
        }

        // Pedido do usuário (19/08/2026): quando é um comprovante direto
        // do banco (Pix, transferência) e a pessoa escreveu algo embaixo
        // na legenda do grupo (ex: "embalagens"), essa escrita vira a
        // descrição — aparece do lado do horário na tela, mostrando pra
        // que foi aquele pagamento mesmo quando o comprovante em si não
        // deixa claro.
        const legendaLimpa = (legenda || "").trim();
        const detalheDistintivo = legendaLimpa || identificadorLido || "";
        const descricaoFinal = detalheDistintivo
          ? `${fornecedorLido || "Despesa recebida via WhatsApp"} — ${detalheDistintivo}`
          : fornecedorLido || "Despesa recebida via WhatsApp";

        const duplicata = await encontrarDespesaDuplicadaWhatsapp({
          lojaId,
          fornecedor: fornecedorLido,
          valor: valorLido || 0,
          legenda: legendaLimpa,
          identificador: identificadorLido,
        });

        if (duplicata) {
          console.log(
            `⚠️ Foto do WhatsApp ignorada por parecer duplicata do lançamento #${duplicata.id} (mesmo fornecedor, valor e sem legenda/identificador que diferencie).`
          );

          return res.status(200).json({
            ok: true,
            destino: "duplicata_ignorada",
            id: duplicata.id,
          });
        }

        const dadosPreparados = prepararLancamento({
          tipo: "despesa",
          descricao: descricaoFinal,
          categoria: "Despesas Diversas",
          fornecedor: fornecedorLido,
          valor: valorLido || 0,
          data: hoje,
          foto,
          loja_id: lojaId,
          observacao: `Valor lido automaticamente — confira antes de aprovar.${identificadorLido ? ` Identificador lido na nota: ${identificadorLido}.` : ""}${origemTexto}`,
        });

        const novoLancamento = {
          id: Date.now(),
          ...dadosPreparados,
          status: "aprovado",
        };

        const { data, error } = await supabase
          .from("lancamentos")
          .insert([novoLancamento])
          .select("id")
          .single();

        if (error) throw error;

        registrarAuditoria(
          req,
          "criou (via WhatsApp)",
          "lancamentos",
          data.id,
          `Despesas Diversas: R$ ${(valorLido || 0).toFixed(2)} — legenda recebida: "${legenda || ""}"`
        );

        return res.status(201).json({
          ok: true,
          destino: "lancamento",
          categoria: "Despesas Diversas",
          id: data.id,
        });
      }

      // Legenda não reconhecida (ou sem legenda) — cai na fila pra
      // classificar na mão, em vez de se perder ou de arriscar cair no
      // lugar errado.
      const { data, error } = await supabase
        .from("whatsapp_fila")
        .insert([
          {
            loja_id: lojaId,
            foto,
            legenda_recebida: legenda || "",
            remetente: remetente || "",
          },
        ])
        .select("id")
        .single();

      if (error) throw error;

      res.status(201).json({ ok: true, destino: "fila", id: data.id });
    } catch (erro) {
      console.error("Erro ao processar foto do WhatsApp:", erro.message);

      res.status(500).json({
        erro: "Não foi possível processar a foto.",
        detalhes: erro.message,
      });
    }
  }
);

app.get("/whatsapp-fila", verificarAdmin, async function (req, res) {
  try {
    const { data, error } = await supabase
      .from("whatsapp_fila")
      .select("*")
      .order("criado_em", { ascending: false });

    if (error) throw error;

    res.json(data || []);
  } catch (erro) {
    console.error("Erro ao buscar fila do WhatsApp:", erro.message);

    res.status(500).json({
      erro: "Não foi possível buscar a fila do WhatsApp.",
      detalhes: erro.message,
    });
  }
});

app.delete("/whatsapp-fila/:id", verificarAdmin, async function (req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ erro: "ID inválido." });
    }

    const { error } = await supabase
      .from("whatsapp_fila")
      .delete()
      .eq("id", id);

    if (error) throw error;

    res.json({ ok: true });
  } catch (erro) {
    console.error("Erro ao remover item da fila do WhatsApp:", erro.message);

    res.status(500).json({
      erro: "Não foi possível remover esse item da fila.",
      detalhes: erro.message,
    });
  }
});

// Confere a cada minuto se as contas a pagar de hoje ainda não foram
// geradas a partir das despesas recorrentes ativas — antes só tentava
// entre 06:00–06:04; agora tenta o dia inteiro até conseguir (mesmo
// padrão da importação Saipos e do backup diário).
setInterval(function () {
  rodarGeracaoDespesasRecorrentes();
}, 60 * 1000);

// Blindagem (19/08/2026): uma promise rejeitada sem ".catch" ou um erro
// fora de qualquer try/catch, em qualquer parte do código, hoje faria o
// processo do Node cair inteiro (todo mundo perde acesso ao sistema até
// o Render reiniciar sozinho) SEM deixar nenhum rastro do motivo. Isso
// vira um log claro em vez de um crash mudo — não deixa o servidor no ar
// com estado quebrado (por segurança ainda derruba o processo pra ele
// reiniciar limpo), mas pelo menos fica registrado o que aconteceu.
process.on("unhandledRejection", function (motivo) {
  console.error(
    "⚠️ Promise rejeitada sem tratamento (unhandledRejection):",
    motivo
  );
});

process.on("uncaughtException", function (erro) {
  console.error("⚠️ Erro não tratado (uncaughtException):", erro);
});

app.listen(
  PORT,
  "0.0.0.0",
  function () {
    console.log(
      "Servidor rodando em http://localhost:" +
        PORT
    );

    console.log(
      "Banco de dados: Supabase"
    );
  }
);