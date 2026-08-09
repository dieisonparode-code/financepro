require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const { XMLParser } = require("fast-xml-parser");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
const PORT = process.env.PORT || 3001;

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

function verificarPermissao(chave) {
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

      const temAcesso =
        !erroPerfil &&
        perfil &&
        (perfil.perfil === "administrador" ||
          (perfil.permissoes || []).includes(chave));

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
    observacao: dados.observacao || "",
    foto: dados.foto || "",
    foto_mercadoria: dados.foto_mercadoria || "",
    latitude: dados.latitude ?? null,
    longitude: dados.longitude ?? null,
    precisao_metros: dados.precisao_metros ?? null,
    capturado_em: dados.capturado_em || null,
    loja_id: dados.loja_id || null,
    forma_pagamento_id: dados.forma_pagamento_id || null,
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
    foto: dados.foto || "",
    observacao: (dados.observacao || "").trim(),
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
  };
}

app.get("/", function (req, res) {
  res.send("FinancePro API funcionando!");
});

const colunasListagem =
  "id, created_at, tipo, descricao, valor, data, grupo, categoria, subcategoria, fornecedor, observacao, tem_foto, tem_foto_mercadoria, latitude, longitude, precisao_metros, capturado_em, loja_id, status, forma_pagamento_id, valor_bruto, valor_liquido_esperado, data_prevista_recebimento, status_conciliacao";

app.get("/lancamentos", verificarPermissao("financeiro"), async function (req, res) {
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

app.get("/lancamentos/:id/foto", verificarPermissao("financeiro"), async function (req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({
        erro: "ID do lançamento inválido.",
      });
    }

    const { data, error } = await supabase
      .from("lancamentos")
      .select("foto")
      .eq("id", id)
      .single();

    if (error) {
      throw error;
    }

    res.json({ foto: data?.foto || "" });
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

app.get("/lancamentos/:id/foto-mercadoria", verificarPermissao("financeiro"), async function (req, res) {
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

app.post("/lancamentos", verificarPermissao("financeiro"), async function (req, res) {
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

app.put("/lancamentos/:id", verificarPermissao("financeiro"), async function (req, res) {
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
      "editou",
      "lancamentos",
      data.id,
      `${data.tipo}: ${data.descricao} (${data.valor})`
    );

    res.json(data);
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
  verificarPermissao("financeiro"),
  async function (req, res) {
    try {
      const id = Number(req.params.id);

      if (!Number.isFinite(id)) {
        return res.status(400).json({
          erro: "ID do lançamento inválido.",
        });
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

app.get("/categorias", verificarPermissao("financeiro"), async function (req, res) {
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

app.post("/categorias", verificarPermissao("financeiro"), async function (req, res) {
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

app.put("/categorias/:id", verificarPermissao("financeiro"), async function (req, res) {
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

app.delete("/categorias/:id", verificarPermissao("financeiro"), async function (req, res) {
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

app.get("/formas-pagamento", verificarPermissao("financeiro"), async function (req, res) {
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

app.post("/formas-pagamento", verificarPermissao("financeiro"), async function (req, res) {
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

    res.status(201).json(data);
  } catch (erro) {
    console.error("Erro ao criar forma de pagamento:", erro.message);

    res.status(500).json({
      erro: "Não foi possível criar a forma de pagamento.",
      detalhes: erro.message,
    });
  }
});

app.put("/formas-pagamento/:id", verificarPermissao("financeiro"), async function (req, res) {
  try {
    const dados = prepararFormaPagamento(req.body);

    if (!dados.nome) {
      return res.status(400).json({
        erro: "Informe o nome da forma de pagamento.",
      });
    }

    const { data, error } = await supabase
      .from("formas_pagamento")
      .update(dados)
      .eq("id", req.params.id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    res.json(data);
  } catch (erro) {
    console.error("Erro ao atualizar forma de pagamento:", erro.message);

    res.status(500).json({
      erro: "Não foi possível atualizar a forma de pagamento.",
      detalhes: erro.message,
    });
  }
});

app.delete("/formas-pagamento/:id", verificarPermissao("financeiro"), async function (req, res) {
  try {
    const { error } = await supabase
      .from("formas_pagamento")
      .delete()
      .eq("id", req.params.id);

    if (error) {
      throw error;
    }

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
  };
}

app.get("/contas-pagar", verificarPermissao("financeiro"), async function (req, res) {
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

app.post("/contas-pagar", verificarPermissao("financeiro"), async function (req, res) {
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

app.put("/contas-pagar/:id", verificarPermissao("financeiro"), async function (req, res) {
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

app.put("/contas-pagar/:id/pagar", verificarPermissao("financeiro"), async function (req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({
        erro: "ID da conta inválido.",
      });
    }

    const { data, error } = await supabase
      .from("contas_pagar")
      .update({
        status: "pago",
        data_pagamento: new Date().toISOString().slice(0, 10),
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
      `${data.descricao} (${data.valor})`
    );

    res.json(data);
  } catch (erro) {
    console.error("Erro ao marcar conta como paga:", erro.message);

    res.status(500).json({
      erro: "Não foi possível marcar a conta como paga.",
      detalhes: erro.message,
    });
  }
});

app.delete("/contas-pagar/:id", verificarPermissao("financeiro"), async function (req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({
        erro: "ID da conta inválido.",
      });
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
  "id, loja_id, tipo, nome_pessoa, valor, tem_foto, observacao, criado_em";

app.get("/fechamentos-caixa", verificarPermissao("fechamento_caixa"), async function (req, res) {
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

app.get("/fechamentos-caixa/:id/foto", verificarPermissao("fechamento_caixa"), async function (req, res) {
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

app.post("/fechamentos-caixa", verificarPermissao("fechamento_caixa"), async function (req, res) {
  try {
    const dados = prepararFechamentoCaixa(req.body);

    if (
      !["caixa", "boy", "cozinha", "venda_prazo", "funcionario"].includes(
        dados.tipo
      )
    ) {
      return res.status(400).json({
        erro:
          "Tipo inválido. Use caixa, boy, cozinha, venda_prazo ou funcionario.",
      });
    }

    if (!dados.foto) {
      return res.status(400).json({
        erro: "A foto do comprovante é obrigatória.",
      });
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

app.delete("/fechamentos-caixa/:id", verificarPermissao("fechamento_caixa"), async function (req, res) {
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

async function buscarVendasSaipos(idLojaSaipos, dataInicio, dataFim) {
  const vendas = await consultarSaipos("/search_sales", {
    p_date_column_filter: "shift_date",
    p_filter_date_start: dataInicio,
    p_filter_date_end: dataFim,
  });

  return vendas.filter(
    (venda) => Number(venda.id_store) === Number(idLojaSaipos)
  );
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

  vendasValidas.forEach((venda) => {
    (venda.payments || []).forEach((pagamento) => {
      const forma = pagamento.desc_store_payment_type || "Não informado";

      totaisPorFormaPagamento[forma] =
        (totaisPorFormaPagamento[forma] || 0) +
        Number(pagamento.payment_amount || 0);
    });
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
    total_lancamentos_financeiros: totalLancamentosFinanceiros,
  };
}

app.get(
  "/fechamento-saipos/:lojaId",
  verificarPermissao("fechamento_caixa"),
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

      res.json(resumo);
    } catch (erro) {
      console.error("Erro ao buscar fechamento na Saipos:", erro.message);

      res.status(500).json({
        erro: "Não foi possível buscar os dados na Saipos.",
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

function calcularPeriodoPagSeguro(dataInicio, dataFim) {
  const hojeBrasilia = agoraBrasilia().toISOString().slice(0, 10);

  // ">=" e não só "===": o frontend agora usa o fuso do dispositivo de quem
  // está usando o sistema (pode ser diferente do de Brasília, como Mato
  // Grosso), então a data escolhida pode chegar aqui igual ou até "depois"
  // do que já é hoje em Brasília. Nesses casos, sempre limita em "agora".
  if (dataFim >= hojeBrasilia) {
    // 1 minuto de margem pra não bater exatamente em "agora" e ser rejeitado.
    const agoraComMargem = new Date(agoraBrasilia().getTime() - 60 * 1000);

    return {
      dataInicioCompleta: `${dataInicio}T00:00:00`,
      dataFimCompleta: agoraComMargem.toISOString().slice(0, 19),
    };
  }

  return {
    dataInicioCompleta: `${dataInicio}T00:00:00`,
    dataFimCompleta: `${dataFim}T23:59:59`,
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
  verificarPermissao("fechamento_caixa"),
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
  verificarPermissao("fechamento_caixa"),
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

async function lerImagemComIA(fotoDataUrl, promptTexto, maxTokens = 8192) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY não configurada no .env.");
  }

  // foto vem como data URL: "data:image/jpeg;base64,/9j/4AAQ..."
  const correspondencia = fotoDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);

  if (!correspondencia) {
    throw new Error("Formato de imagem inválido.");
  }

  const tipoImagem = correspondencia[1];
  const dadosBase64 = correspondencia[2];

  const anthropic = new Anthropic({ apiKey });

  const resposta = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: maxTokens,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: tipoImagem,
              data: dadosBase64,
            },
          },
          { type: "text", text: promptTexto },
        ],
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

app.post(
  "/lancamentos/ler-nota",
  verificarPermissao("financeiro"),
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
  "/pagseguro/conferir-fechamento",
  verificarPermissao("fechamento_caixa"),
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
        'Essa é a foto de um comprovante de fechamento de caixa de uma hamburgueria (geralmente tem uma seção "CONFERÊNCIA" com colunas Forma de Pagamento / Esperado / Em caixa / Diferença). Liste TODAS as formas de pagamento/categorias que aparecerem nessa seção (pode ter várias: Dinheiro, A prazo, Crédito, Débito, Pago Online, Vale, Voucher, Cortesia, Funcionário, PIX, TEF-Débito, TEF-PIX, etc — exatamente como estão escritas no comprovante). Pra cada uma, use o valor da coluna "Em caixa" (se não tiver essa coluna, use o valor que aparecer). Se encontrar "Crédito" (ou "Cartão de Crédito"), chame de "Cartão de crédito". Se encontrar "Débito" (ou "Cartão de Débito"), chame de "Cartão de débito". Se encontrar QUALQUER PIX (linhas como "Pix", "TEF-PIX", "Pix na Entrega"), SOME todos os valores de PIX numa única categoria chamada "PIX". As demais categorias (Dinheiro, A prazo, Pago Online, Vale, Voucher, Cortesia, Funcionário, etc), mantenha o nome exatamente como está escrito no comprovante, sem inventar nem combinar. Dê sua melhor estimativa mesmo sem 100% de certeza. Responda SOMENTE em JSON válido, sem texto antes ou depois, no formato: {"categorias": [{"nome": "Dinheiro", "valor": 337.40}, {"nome": "Cartão de crédito", "valor": 4299.00}, ...]}.',
        8192
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

      const valores = {};

      categorias.forEach((categoria) => {
        if (categoria?.nome != null && categoria?.valor != null) {
          valores[categoria.nome] = Number(categoria.valor);
        }
      });

      if (Object.keys(valores).length === 0) {
        return res.json({
          valores: null,
          erro_leitura:
            "Não foi possível identificar nenhum valor nessa foto. Tente uma foto mais nítida ou de outro ângulo.",
          debug_resposta_ia: textoResposta,
        });
      }

      res.json({ valores });
    } catch (erro) {
      console.error("Erro ao conferir fechamento por foto:", erro.message);

      res.status(500).json({
        erro: "Não foi possível ler a foto do fechamento.",
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
  "estoque",
  "fechamento_caixa",
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