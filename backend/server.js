require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

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
  };
}

function prepararLoja(dados = {}) {
  return {
    nome: (dados.nome || "").trim(),
    endereco: (dados.endereco || "").trim(),
    latitude: dados.latitude ?? null,
    longitude: dados.longitude ?? null,
    raio_metros: dados.raio_metros ? Number(dados.raio_metros) : 200,
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
  "id, created_at, tipo, descricao, valor, data, grupo, categoria, subcategoria, fornecedor, observacao, tem_foto, tem_foto_mercadoria, latitude, longitude, precisao_metros, capturado_em, loja_id, status";

app.get("/lancamentos", async function (req, res) {
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

app.get("/lancamentos/:id/foto", async function (req, res) {
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

app.get("/lancamentos/:id/foto-mercadoria", async function (req, res) {
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

app.post("/lancamentos", async function (req, res) {
  try {
    const { perfil } = await obterPerfilOpcional(req);
    const dadosPreparados = prepararLancamento(req.body);

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

app.put("/lancamentos/:id", async function (req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({
        erro: "ID do lançamento inválido.",
      });
    }

    const lancamentoAtualizado =
      prepararLancamento(req.body);

    const { data, error } = await supabase
      .from("lancamentos")
      .update(lancamentoAtualizado)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

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
  verificarAdmin,
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
  verificarAdmin,
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

app.get("/lojas", async function (req, res) {
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

app.post("/lojas", async function (req, res) {
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

    res.status(201).json(data);
  } catch (erro) {
    console.error("Erro ao criar loja:", erro.message);

    res.status(500).json({
      erro: "Não foi possível criar a loja.",
      detalhes: erro.message,
    });
  }
});

app.put("/lojas/:id", async function (req, res) {
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

    res.json(data);
  } catch (erro) {
    console.error("Erro ao atualizar loja:", erro.message);

    res.status(500).json({
      erro: "Não foi possível atualizar a loja.",
      detalhes: erro.message,
    });
  }
});

app.delete("/lojas/:id", async function (req, res) {
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

    res.status(204).send();
  } catch (erro) {
    console.error("Erro ao excluir loja:", erro.message);

    res.status(500).json({
      erro: "Não foi possível excluir a loja.",
      detalhes: erro.message,
    });
  }
});

app.get("/categorias", async function (req, res) {
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

app.post("/categorias", async function (req, res) {
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

app.put("/categorias/:id", async function (req, res) {
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

app.delete("/categorias/:id", async function (req, res) {
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

const colunasFechamentoListagem =
  "id, loja_id, tipo, nome_pessoa, valor, tem_foto, observacao, criado_em";

app.get("/fechamentos-caixa", async function (req, res) {
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

app.get("/fechamentos-caixa/:id/foto", async function (req, res) {
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

app.post("/fechamentos-caixa", async function (req, res) {
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

app.delete("/fechamentos-caixa/:id", async function (req, res) {
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

app.get("/insumos", async function (req, res) {
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

app.post("/insumos", async function (req, res) {
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

app.put("/insumos/:id", async function (req, res) {
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

app.delete("/insumos/:id", async function (req, res) {
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

app.post("/insumos/:id/movimentacao", async function (req, res) {
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