const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const databaseFolder = path.join(__dirname, "..", "database");
const databaseFile = path.join(databaseFolder, "lancamentos.json");

function garantirBanco() {
  if (!fs.existsSync(databaseFolder)) {
    fs.mkdirSync(databaseFolder, { recursive: true });
  }

  if (!fs.existsSync(databaseFile)) {
    fs.writeFileSync(databaseFile, "[]", "utf8");
  }
}

function lerLancamentos() {
  garantirBanco();

  try {
    const conteudo = fs.readFileSync(databaseFile, "utf8");
    return JSON.parse(conteudo);
  } catch {
    return [];
  }
}

function salvarLancamentos(lancamentos) {
  garantirBanco();
  fs.writeFileSync(
    databaseFile,
    JSON.stringify(lancamentos, null, 2),
    "utf8"
  );
}

app.get("/", (req, res) => {
  res.send("FinancePro API funcionando!");
});

app.get("/lancamentos", (req, res) => {
  const lancamentos = lerLancamentos();
  res.json(lancamentos);
});

app.post("/lancamentos", (req, res) => {
  const {
  tipo,
  descricao,
  valor,
  grupo,
  categoria,
  subcategoria,
  fornecedor,
  observacao,
  data,
} = req.body;

  if (
    !["receita", "despesa"].includes(tipo) ||
    !descricao ||
    !categoria ||
    !data ||
    !Number(valor) ||
    Number(valor) <= 0
  ) {
    return res.status(400).json({
      erro: "Dados do lançamento inválidos.",
    });
  }

  const lancamentos = lerLancamentos();

  const novoLancamento = {
  id: Date.now(),
  tipo,
  descricao: String(descricao).trim(),
  valor: Number(valor),
  grupo,
  categoria,
  subcategoria: subcategoria || "",
  fornecedor: fornecedor || "",
  observacao: observacao || "",
  data,
};

  lancamentos.unshift(novoLancamento);
  salvarLancamentos(lancamentos);

  res.status(201).json(novoLancamento);
});

app.delete("/lancamentos/:id", (req, res) => {
  const id = Number(req.params.id);
  const lancamentos = lerLancamentos();

  const novosLancamentos = lancamentos.filter(
    (lancamento) => lancamento.id !== id
  );

  if (novosLancamentos.length === lancamentos.length) {
    return res.status(404).json({
      erro: "Lançamento não encontrado.",
    });
  }

  salvarLancamentos(novosLancamentos);

  res.json({
    mensagem: "Lançamento excluído com sucesso.",
  });
});
app.put("/lancamentos/:id", (req, res) => {
  const id = Number(req.params.id);

  const {
  tipo,
  descricao,
  valor,
  grupo,
  categoria,
  subcategoria,
  fornecedor,
  observacao,
  data,
} = req.body;

  if (
    !["receita", "despesa"].includes(tipo) ||
    !descricao ||
    !categoria ||
    !data ||
    !Number(valor) ||
    Number(valor) <= 0
  ) {
    return res.status(400).json({
      erro: "Dados do lançamento inválidos.",
    });
  }

  const lancamentos = lerLancamentos();

  const indice = lancamentos.findIndex(
    (lancamento) => lancamento.id === id
  );

  if (indice === -1) {
    return res.status(404).json({
      erro: "Lançamento não encontrado.",
    });
  }

  lancamentos[indice] = {
    id,
    tipo,
    descricao: String(descricao).trim(),
    valor: Number(valor),
    categoria,
    data,
  };

  salvarLancamentos(lancamentos);

  res.json(lancamentos[indice]);
});
app.listen(PORT, () => {
  garantirBanco();
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});