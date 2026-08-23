import { useState } from "react";
import CampoValor, { paraNumero } from "./CampoValor";

// Pedido do usuário (21/08/2026): Ficha Técnica — CMV real por prato,
// somando quantidade × custo unitário de cada insumo usado. Reaproveita
// os Insumos que já existem na tela "Estoque" (CadastroInsumos.jsx) —
// aqui só monta a receita (quais insumos e quanto usa de cada), não
// cadastra insumo novo nem mexe em estoque (isso continua só na tela
// Estoque).
// Mesma compressão já usada em Notas Fiscais/Contas a Pagar — sem forçar
// orientação (diferente do comprovante de fechamento, o cardápio pode
// legitimamente vir em pé ou deitado, foto ou print).
function comprimirImagem(arquivo, larguraMaxima = 1400, qualidade = 0.75) {
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

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

// Pedido do usuário (23/08/2026, ajustado depois): agrupar por categoria
// — a Saipos não manda isso em nenhum endpoint, então é campo nosso,
// manual. Lista fixa (o que o usuário pediu); "Outra" cobre o que não se
// encaixa nessas 6.
const CATEGORIAS_FICHA_TECNICA = [
  "Calotas",
  "Calotinhas",
  "Fritas",
  "Cachorro",
  "Porções",
  "Bebidas",
  "Outra",
];

// Sugestão automática pelo NOME do produto, só pra poupar clique no
// "Adicionar todos"/"Usar esse nome" — o usuário sempre pode trocar
// depois, isso nunca é definitivo.
function sugerirCategoria(nomeProduto) {
  const nome = (nomeProduto || "").toLowerCase();

  if (/calotinha/.test(nome)) return "Calotinhas";
  if (/calota/.test(nome)) return "Calotas";
  if (/batata|fritas?\b/.test(nome)) return "Fritas";
  if (/cachorro|hot[ -]?dog|cachorro[ -]?quente/.test(nome)) return "Cachorro";
  if (/por[çc][ãa]o|por[çc][õo]es/.test(nome)) return "Porções";
  if (
    /refrigerante|refri\b|suco|\bagua\b|\bágua\b|coca[ -]?cola|guaran[aá]|cerveja|bebida|energ[eé]tico|chá\b/.test(
      nome
    )
  )
    return "Bebidas";

  return "";
}

function FichaTecnica({
  insumos = [],
  fichas = [],
  carregandoFichas = false,
  lojas = [],
  lojaPadrao = null,
  adicionarFicha,
  editarFichaExistente,
  removerFicha,
  buscarProdutosVendidos,
  importarCardapioFoto,
}) {
  const [editandoFichaId, setEditandoFichaId] = useState(null);
  const [nomeProduto, setNomeProduto] = useState("");
  const [precoVenda, setPrecoVenda] = useState("");
  const [nomeItemSaipos, setNomeItemSaipos] = useState("");
  const [categoria, setCategoria] = useState("");
  const [itensFicha, setItensFicha] = useState([]);
  const [salvandoFicha, setSalvandoFicha] = useState(false);

  // Pedido do usuário (23/08/2026): "manda a foto do cardápio e você
  // adiciona tudo" — lê nome/preço/categoria de cada produto do cardápio
  // (foto ou PDF) e cria a Ficha Técnica de cada um automaticamente
  // (mesmo padrão do "Adicionar todos" dos produtos vendidos — só nome,
  // sem insumo ainda).
  const [lendoCardapio, setLendoCardapio] = useState(false);
  const [criandoDoCardapio, setCriandoDoCardapio] = useState(false);
  const [progressoCardapio, setProgressoCardapio] = useState(null);
  const [erroCardapio, setErroCardapio] = useState("");

  // Pedido do usuário (23/08/2026): "pega do cardápio lá e tira todos os
  // ingredientes de cada lanche" — além de nome/preço/categoria, agora
  // também lê a lista de ingredientes de cada produto (impressa no
  // cardápio, ex: "4 Hambúrgueres, 3 ovos..."), cria os Insumos que ainda
  // não existirem no Estoque (reaproveitando pelo nome — "Ovo" só é
  // criado uma vez, mesmo aparecendo em 30 produtos diferentes) e já
  // monta a receita (itens) de cada Ficha Técnica com eles.
  async function importarCardapio(arquivo) {
    if (!arquivo) return;

    setErroCardapio("");

    const ehPdf = arquivo.type === "application/pdf";

    // PDF não passa pela mesma compressão de imagem — um PDF de cardápio
    // inteiro pode vir gigante (dezenas de MB) e travar/estourar a
    // leitura. Pede pra mandar foto/print de uma página por vez nesse
    // caso (o botão pode ser clicado várias vezes, cada vez soma o que
    // ainda não tiver cadastrado).
    if (ehPdf && arquivo.size > 8 * 1024 * 1024) {
      setErroCardapio(
        `Esse PDF tem ${(arquivo.size / 1024 / 1024).toFixed(1)}MB — grande demais pra ler de uma vez. Tire um print (ou foto) de cada página do cardápio e importe uma de cada vez (clique o botão de novo pra cada página) — só cria o que ainda não estiver cadastrado.`
      );
      return;
    }

    setLendoCardapio(true);

    try {
      const fotoOuPdf = ehPdf
        ? await new Promise((resolve, reject) => {
            const leitor = new FileReader();
            leitor.onload = () => resolve(leitor.result);
            leitor.onerror = () =>
              reject(new Error("Não foi possível abrir o arquivo selecionado."));
            leitor.readAsDataURL(arquivo);
          })
        : await comprimirImagem(arquivo);

      const resultado = await importarCardapioFoto(fotoOuPdf);
      setLendoCardapio(false);

      if (resultado.erro_leitura || !resultado.produtos?.length) {
        setErroCardapio(
          resultado.erro_leitura ||
            "Não foi possível ler os produtos desse cardápio."
        );
        return;
      }

      const pendentes = resultado.produtos.filter(
        (produto) => !nomesJaCadastrados.has(produto.nome.trim().toLowerCase())
      );

      if (pendentes.length === 0) {
        alert(
          `Lidos ${resultado.produtos.length} produto(s) do cardápio, mas todos já têm Ficha Técnica cadastrada.`
        );
        return;
      }

      const totalIngredientes = new Set(
        pendentes.flatMap((produto) =>
          (produto.ingredientes || []).map((i) => i.nome.trim().toLowerCase())
        )
      ).size;

      const confirmar = window.confirm(
        `Lidos ${resultado.produtos.length} produto(s) do cardápio. Cadastrar os ${pendentes.length} que ainda não têm Ficha Técnica, já com a receita (até ${totalIngredientes} insumo(s) diferente(s), criando no Estoque quem ainda não existir)? Preço/categoria vêm junto quando lidos.`
      );

      if (!confirmar) return;

      setCriandoDoCardapio(true);
      setProgressoCardapio({ feito: 0, total: pendentes.length });

      // Cache local dos insumos (existentes + criados agora nesse
      // import) pra não criar o mesmo ingrediente duas vezes, nem entre
      // produtos diferentes desse mesmo cardápio.
      const insumosPorNome = new Map(
        insumos
          .filter(
            (insumo) =>
              !insumo.loja_id || String(insumo.loja_id) === String(lojaPadrao)
          )
          .map((insumo) => [insumo.nome.trim().toLowerCase(), insumo])
      );

      const falharam = [];

      for (let i = 0; i < pendentes.length; i += 1) {
        const produto = pendentes[i];

        try {
          const itens = [];

          for (const ingrediente of produto.ingredientes || []) {
            const chave = ingrediente.nome.trim().toLowerCase();
            let insumo = insumosPorNome.get(chave);

            if (!insumo) {
              insumo = await adicionarInsumo({
                nome: ingrediente.nome.trim(),
                unidade_medida: "un",
                estoque_atual: 0,
                estoque_minimo: 0,
                custo_unitario: 0,
                loja_id: lojaPadrao || null,
                todas_as_lojas: !lojaPadrao,
              });
              insumosPorNome.set(chave, insumo);
            }

            itens.push({
              insumo_id: insumo.id,
              quantidade: ingrediente.quantidade,
            });
          }

          await adicionarFicha({
            nome_produto: produto.nome,
            preco_venda: produto.preco,
            nome_item_saipos: "",
            categoria: produto.categoria || sugerirCategoria(produto.nome),
            loja_id: lojaPadrao || null,
            itens,
          });
        } catch (erro) {
          falharam.push(produto.nome);
        }

        setProgressoCardapio({ feito: i + 1, total: pendentes.length });
      }

      setCriandoDoCardapio(false);
      setProgressoCardapio(null);

      if (falharam.length > 0) {
        alert(
          `Cadastrado ${pendentes.length - falharam.length} de ${pendentes.length}. Falharam: ${falharam.join(", ")}`
        );
      } else {
        alert(
          `${pendentes.length} produto(s) do cardápio cadastrado(s), já com a receita! Confira em Estoque os insumos criados — o custo unitário de cada um começa em R$0,00, é só preencher o valor real de compra.`
        );
      }
    } catch (erro) {
      setLendoCardapio(false);
      setCriandoDoCardapio(false);
      setProgressoCardapio(null);
      setErroCardapio(erro.message || "Não foi possível ler o cardápio.");
    }
  }

  // Pedido do usuário (23/08/2026): puxar da Saipos os nomes dos produtos
  // que realmente venderam, pra não precisar digitar "Calota Filé" do
  // zero — só clica pra já vir preenchido no formulário acima.
  const [produtosVendidos, setProdutosVendidos] = useState(null);
  const [carregandoProdutosVendidos, setCarregandoProdutosVendidos] =
    useState(false);
  const [erroProdutosVendidos, setErroProdutosVendidos] = useState("");
  const [mostrarJaCadastrados, setMostrarJaCadastrados] = useState(false);

  async function carregarProdutosVendidos() {
    if (!lojaPadrao) {
      setErroProdutosVendidos(
        "Escolha uma loja específica no seletor do topo pra puxar os produtos vendidos dela."
      );
      return;
    }

    setCarregandoProdutosVendidos(true);
    setErroProdutosVendidos("");

    try {
      // 15 dias (não 30): a Saipos limita a consulta pesada de itens de
      // venda a no máximo 15 dias por vez — pedir mais do que isso
      // significa buscar várias janelas em sequência, o que já demorou
      // demais e estourou timeout num teste real. 15 dias cobre bem a
      // maioria dos produtos que vendem no dia a dia.
      const dados = await buscarProdutosVendidos(lojaPadrao, 15);
      setProdutosVendidos(Array.isArray(dados) ? dados : []);
    } catch (erro) {
      setErroProdutosVendidos(
        erro.message || "Não foi possível buscar os produtos vendidos na Saipos."
      );
    } finally {
      setCarregandoProdutosVendidos(false);
    }
  }

  // Nomes já cadastrados (por nome_item_saipos OU nome_produto, o que
  // tiver) — normalizado (minúsculo, sem espaço nas pontas) pra comparar
  // com o que vem da Saipos sem depender de acento/caixa bater exato.
  const nomesJaCadastrados = new Set(
    fichas.map((ficha) =>
      (ficha.nome_item_saipos || ficha.nome_produto || "").trim().toLowerCase()
    )
  );

  const produtosVendidosVisiveis = (produtosVendidos || []).filter(
    (produto) =>
      mostrarJaCadastrados ||
      !nomesJaCadastrados.has(produto.nome_item_saipos.trim().toLowerCase())
  );

  function usarNomeDoProdutoVendido(produto) {
    setEditandoFichaId(null);
    setNomeProduto(produto.nome_item_saipos);
    setNomeItemSaipos(produto.nome_item_saipos);
    // Pedido do usuário (23/08/2026): preço de venda já vem preenchido
    // com o valor da venda mais recente desse produto na Saipos — o
    // operador ainda pode corrigir antes de salvar se quiser.
    setPrecoVenda(
      produto.preco_venda != null
        ? Number(produto.preco_venda).toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        : ""
    );
    setCategoria(sugerirCategoria(produto.nome_item_saipos));
  }

  // Pedido do usuário (23/08/2026): em vez de clicar "+ Usar esse nome" e
  // salvar um por um, cadastra todos os produtos vendidos ainda sem Ficha
  // Técnica de uma vez só — cada um entra com o nome preenchido, sem
  // insumo nenhum ainda (itens: []) e sem custo (R$0,00), só pra existir
  // na lista de Fichas Cadastradas; o usuário completa a receita
  // (insumos/quantidades) depois, editando cada uma.
  const [criandoTodos, setCriandoTodos] = useState(false);
  const [progressoCriarTodos, setProgressoCriarTodos] = useState(null);

  async function adicionarTodosProdutosVendidos() {
    const pendentes = (produtosVendidos || []).filter(
      (produto) =>
        !nomesJaCadastrados.has(produto.nome_item_saipos.trim().toLowerCase())
    );

    if (pendentes.length === 0) {
      alert("Não tem produto novo pra cadastrar — todos já têm Ficha Técnica.");
      return;
    }

    const confirmar = window.confirm(
      `Cadastrar ${pendentes.length} produto(s) de uma vez? Cada um entra só com o nome (sem insumo/receita ainda) — você completa depois editando cada ficha.`
    );

    if (!confirmar) return;

    setCriandoTodos(true);
    setProgressoCriarTodos({ feito: 0, total: pendentes.length });

    const falharam = [];

    for (let i = 0; i < pendentes.length; i += 1) {
      const produto = pendentes[i];

      try {
        await adicionarFicha({
          nome_produto: produto.nome_item_saipos,
          preco_venda: produto.preco_venda != null ? Number(produto.preco_venda) : null,
          nome_item_saipos: produto.nome_item_saipos,
          categoria: sugerirCategoria(produto.nome_item_saipos),
          loja_id: lojaPadrao || null,
          itens: [],
        });
      } catch (erro) {
        falharam.push(produto.nome_item_saipos);
      }

      setProgressoCriarTodos({ feito: i + 1, total: pendentes.length });
    }

    setCriandoTodos(false);
    setProgressoCriarTodos(null);

    if (falharam.length > 0) {
      alert(
        `Cadastrado ${pendentes.length - falharam.length} de ${pendentes.length}. Falharam: ${falharam.join(", ")}`
      );
    } else {
      alert(`${pendentes.length} produto(s) cadastrado(s)! Agora é só completar a receita (insumos) de cada um.`);
    }
  }

  // Pedido do usuário (23/08/2026): quem já clicou "Adicionar todos" ANTES
  // do preço/categoria existirem ficou com um monte de ficha "R$ 0,00" e
  // sem categoria — em vez de editar uma por uma, casa pelo nome com o
  // que acabou de vir da Saipos e completa só o que estiver faltando
  // (preço e/ou categoria), sem tocar nos insumos que já tiverem sido
  // cadastrados manualmente em cada ficha.
  const [atualizandoExistentes, setAtualizandoExistentes] = useState(false);
  const [progressoAtualizarExistentes, setProgressoAtualizarExistentes] =
    useState(null);

  async function atualizarPrecoECategoriaDasExistentes() {
    const produtosPorNomeNormalizado = new Map(
      (produtosVendidos || []).map((produto) => [
        produto.nome_item_saipos.trim().toLowerCase(),
        produto,
      ])
    );

    const paraAtualizar = fichas
      .map((ficha) => {
        const chave = (ficha.nome_item_saipos || ficha.nome_produto || "")
          .trim()
          .toLowerCase();
        const produtoSaipos = produtosPorNomeNormalizado.get(chave);
        if (!produtoSaipos) return null;

        const precisaPreco =
          (ficha.preco_venda == null || Number(ficha.preco_venda) === 0) &&
          produtoSaipos.preco_venda != null;
        const precisaCategoria = !ficha.categoria;

        if (!precisaPreco && !precisaCategoria) return null;

        return { ficha, produtoSaipos, precisaPreco, precisaCategoria };
      })
      .filter(Boolean);

    if (paraAtualizar.length === 0) {
      alert(
        "Nenhuma ficha já cadastrada precisa de atualização (ou nenhuma bateu o nome com o que veio da Saipos)."
      );
      return;
    }

    const confirmar = window.confirm(
      `Completar preço e/ou categoria de ${paraAtualizar.length} ficha(s) já cadastrada(s)? Os insumos que cada uma já tiver continuam do mesmo jeito.`
    );

    if (!confirmar) return;

    setAtualizandoExistentes(true);
    setProgressoAtualizarExistentes({ feito: 0, total: paraAtualizar.length });

    const falharam = [];

    for (let i = 0; i < paraAtualizar.length; i += 1) {
      const { ficha, produtoSaipos, precisaPreco, precisaCategoria } =
        paraAtualizar[i];

      try {
        await editarFichaExistente(ficha.id, {
          nome_produto: ficha.nome_produto,
          preco_venda: precisaPreco
            ? Number(produtoSaipos.preco_venda)
            : ficha.preco_venda,
          nome_item_saipos: ficha.nome_item_saipos || "",
          categoria: precisaCategoria
            ? sugerirCategoria(ficha.nome_item_saipos || ficha.nome_produto)
            : ficha.categoria,
          loja_id: ficha.loja_id,
          itens: (ficha.itens || []).map((item) => ({
            insumo_id: item.insumo_id,
            quantidade: item.quantidade,
          })),
        });
      } catch (erro) {
        falharam.push(ficha.nome_produto);
      }

      setProgressoAtualizarExistentes({ feito: i + 1, total: paraAtualizar.length });
    }

    setAtualizandoExistentes(false);
    setProgressoAtualizarExistentes(null);

    if (falharam.length > 0) {
      alert(
        `Atualizado ${paraAtualizar.length - falharam.length} de ${paraAtualizar.length}. Falharam: ${falharam.join(", ")}`
      );
    } else {
      alert(`${paraAtualizar.length} ficha(s) atualizada(s) com preço/categoria!`);
    }
  }

  const insumosComCusto = insumos.filter(
    (insumo) => Number(insumo.custo_unitario) > 0
  );
  const algunsInsumosSemCusto =
    insumos.length > 0 && insumosComCusto.length < insumos.length;

  function limparFormularioFicha() {
    setEditandoFichaId(null);
    setNomeProduto("");
    setPrecoVenda("");
    setNomeItemSaipos("");
    setCategoria("");
    setItensFicha([]);
  }

  function adicionarLinhaItem() {
    setItensFicha((anterior) => [
      ...anterior,
      { insumo_id: "", quantidade: "" },
    ]);
  }

  function atualizarLinhaItem(indice, chave, valor) {
    setItensFicha((anterior) =>
      anterior.map((item, i) =>
        i === indice ? { ...item, [chave]: valor } : item
      )
    );
  }

  function removerLinhaItem(indice) {
    setItensFicha((anterior) => anterior.filter((_, i) => i !== indice));
  }

  const custoTotalFormulario = itensFicha.reduce((total, item) => {
    const insumo = insumos.find((i) => String(i.id) === String(item.insumo_id));
    if (!insumo) return total;
    return total + paraNumero(String(item.quantidade)) * Number(insumo.custo_unitario || 0);
  }, 0);

  async function salvarFicha(evento) {
    evento.preventDefault();

    if (!nomeProduto.trim()) {
      alert("Informe o nome do produto/prato.");
      return;
    }

    setSalvandoFicha(true);

    try {
      const dados = {
        nome_produto: nomeProduto.trim(),
        preco_venda: precoVenda === "" ? null : paraNumero(precoVenda),
        nome_item_saipos: nomeItemSaipos.trim(),
        categoria,
        loja_id: lojaPadrao || null,
        itens: itensFicha.map((item) => ({
          insumo_id: item.insumo_id,
          quantidade: paraNumero(String(item.quantidade)),
        })),
      };

      if (editandoFichaId) {
        await editarFichaExistente(editandoFichaId, dados);
      } else {
        await adicionarFicha(dados);
      }

      limparFormularioFicha();
    } catch (erro) {
      alert(erro.message || "Não foi possível salvar a ficha técnica.");
    } finally {
      setSalvandoFicha(false);
    }
  }

  function iniciarEdicaoFicha(ficha) {
    setEditandoFichaId(ficha.id);
    setNomeProduto(ficha.nome_produto);
    setPrecoVenda(
      ficha.preco_venda != null
        ? Number(ficha.preco_venda).toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        : ""
    );
    setNomeItemSaipos(ficha.nome_item_saipos || "");
    setCategoria(ficha.categoria || "");
    setItensFicha(
      (ficha.itens || []).map((item) => ({
        insumo_id: String(item.insumo_id),
        quantidade: Number(item.quantidade || 0).toLocaleString("pt-BR"),
      }))
    );
  }

  async function confirmarExclusaoFicha(ficha) {
    const confirmar = window.confirm(
      `Excluir a ficha técnica de "${ficha.nome_produto}"?`
    );

    if (!confirmar) return;

    try {
      await removerFicha(ficha.id);
    } catch (erro) {
      alert(erro.message || "Não foi possível excluir.");
    }
  }

  // Pedido do usuário (23/08/2026): mostrar a lista de Fichas Técnicas
  // Cadastradas separada por categoria — segue a ordem fixa de
  // CATEGORIAS_FICHA_TECNICA, e o que não tem categoria (ainda) vai pro
  // final, num grupo "Sem categoria".
  const gruposFichas = [...CATEGORIAS_FICHA_TECNICA, "Sem categoria"]
    .map((nomeGrupo) => ({
      nome: nomeGrupo,
      itens: fichas.filter((ficha) =>
        nomeGrupo === "Sem categoria"
          ? !ficha.categoria
          : ficha.categoria === nomeGrupo
      ),
    }))
    .filter((grupo) => grupo.itens.length > 0);

  return (
    <section className="categorias-layout">
      <article className="panel categoria-form-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Fichas Técnicas</span>
            <h2>{editandoFichaId ? "Editar ficha" : "Nova ficha técnica"}</h2>
          </div>
        </div>

        <small className="foto-ajuda">
          Monte o prato com os insumos que ele usa e a quantidade de cada
          um — o custo total sai sozinho. Os insumos (e o custo de cada
          um) são cadastrados na aba <strong>Estoque</strong>.
          {algunsInsumosSemCusto && (
            <>
              {" "}⚠️ Alguns insumos ainda não têm custo por unidade
              cadastrado em Estoque — o custo da ficha vai sair menor que
              o real até isso ser preenchido lá.
            </>
          )}
        </small>

        {importarCardapioFoto && (
          <div
            style={{
              margin: "12px 0",
              padding: "12px",
              border: "1px solid #2a2f3a",
              borderRadius: "8px",
            }}
          >
            <strong>📋 Importar cardápio (foto ou PDF)</strong>
            <div style={{ margin: "8px 0" }}>
              <label
                className="secondary-button"
                style={{
                  display: "inline-block",
                  cursor:
                    lendoCardapio || criandoDoCardapio ? "default" : "pointer",
                  opacity: lendoCardapio || criandoDoCardapio ? 0.6 : 1,
                }}
              >
                {lendoCardapio
                  ? "Lendo cardápio..."
                  : criandoDoCardapio
                  ? `Cadastrando... (${progressoCardapio?.feito ?? 0}/${progressoCardapio?.total ?? 0})`
                  : "📷 Escolher foto ou PDF do cardápio"}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  style={{ display: "none" }}
                  disabled={lendoCardapio || criandoDoCardapio}
                  onChange={(evento) => {
                    const arquivo = evento.target.files?.[0];
                    evento.target.value = "";
                    importarCardapio(arquivo);
                  }}
                />
              </label>
            </div>

            {erroCardapio && (
              <div className="empty-state">{erroCardapio}</div>
            )}

            <small className="foto-ajuda" style={{ display: "block" }}>
              A IA lê o cardápio (cartaz, impresso ou print — não PDF
              grande, veja abaixo), separa cada produto com
              nome/preço/categoria e a lista de ingredientes já monta a
              receita sozinha (cria no Estoque quem ainda não existir,
              reaproveitando ingrediente repetido entre produtos). Confirma
              antes de cadastrar tudo de uma vez.
            </small>
          </div>
        )}

        {buscarProdutosVendidos && (
          <div
            style={{
              margin: "12px 0",
              padding: "12px",
              border: "1px solid #2a2f3a",
              borderRadius: "8px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              <strong>📥 Produtos vendidos na Saipos (últimos 15 dias)</strong>
              <button
                type="button"
                className="secondary-button"
                disabled={carregandoProdutosVendidos}
                onClick={carregarProdutosVendidos}
              >
                {carregandoProdutosVendidos
                  ? "Buscando..."
                  : produtosVendidos == null
                  ? "Buscar na Saipos"
                  : "🔄 Atualizar"}
              </button>
            </div>

            {erroProdutosVendidos && (
              <div className="empty-state" style={{ marginTop: 8 }}>
                {erroProdutosVendidos}
              </div>
            )}

            {produtosVendidos != null && !erroProdutosVendidos && (
              <>
                {produtosVendidosVisiveis.some(
                  (produto) =>
                    !nomesJaCadastrados.has(
                      produto.nome_item_saipos.trim().toLowerCase()
                    )
                ) && (
                  <div style={{ margin: "10px 0" }}>
                    <button
                      type="button"
                      disabled={criandoTodos}
                      onClick={adicionarTodosProdutosVendidos}
                    >
                      {criandoTodos
                        ? `Cadastrando... (${progressoCriarTodos?.feito ?? 0}/${progressoCriarTodos?.total ?? 0})`
                        : "➕ Adicionar todos de uma vez"}
                    </button>
                    <small className="foto-ajuda" style={{ display: "block", marginTop: 4 }}>
                      Cria uma Ficha Técnica pra cada produto novo, só com o
                      nome (sem insumo ainda) — você completa a receita de
                      cada um depois.
                    </small>
                  </div>
                )}

                <div style={{ margin: "10px 0" }}>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={atualizandoExistentes}
                    onClick={atualizarPrecoECategoriaDasExistentes}
                  >
                    {atualizandoExistentes
                      ? `Atualizando... (${progressoAtualizarExistentes?.feito ?? 0}/${progressoAtualizarExistentes?.total ?? 0})`
                      : "🔄 Completar preço/categoria das já cadastradas"}
                  </button>
                  <small className="foto-ajuda" style={{ display: "block", marginTop: 4 }}>
                    Pra quem já cadastrou antes do preço/categoria virem
                    junto — casa pelo nome com o que veio da Saipos agora e
                    completa só o que estiver faltando, sem mexer nos
                    insumos já cadastrados.
                  </small>
                </div>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    margin: "10px 0",
                    fontWeight: 400,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={mostrarJaCadastrados}
                    onChange={(evento) =>
                      setMostrarJaCadastrados(evento.target.checked)
                    }
                  />
                  Mostrar os que já têm Ficha Técnica cadastrada
                </label>

                {produtosVendidosVisiveis.length === 0 ? (
                  <div className="empty-state">
                    {mostrarJaCadastrados
                      ? "Nenhum produto vendido nesse período."
                      : "Todos os produtos vendidos nesse período já têm Ficha Técnica. ✅"}
                  </div>
                ) : (
                  <div
                    style={{
                      maxHeight: "260px",
                      overflowY: "auto",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                    }}
                  >
                    {produtosVendidosVisiveis.map((produto) => {
                      const jaCadastrado = nomesJaCadastrados.has(
                        produto.nome_item_saipos.trim().toLowerCase()
                      );

                      return (
                        <div
                          key={produto.nome_item_saipos}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "6px 4px",
                            borderBottom: "1px solid #2a2f3a",
                            gap: 8,
                          }}
                        >
                          <span>
                            {jaCadastrado && "✅ "}
                            {produto.nome_item_saipos}
                            <span style={{ color: "#9aa0ac" }}>
                              {" "}
                              — {produto.quantidade_vendida}x vendido
                              {produto.preco_venda != null &&
                                ` · ${formatarMoeda(produto.preco_venda)}`}
                            </span>
                          </span>

                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => usarNomeDoProdutoVendido(produto)}
                          >
                            + Usar esse nome
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <form onSubmit={salvarFicha}>
          <label>
            Nome do produto
            <input
              type="text"
              value={nomeProduto}
              onChange={(evento) => setNomeProduto(evento.target.value)}
              placeholder="Ex.: X-Salada"
            />
          </label>

          <div className="form-row">
            <label>
              Preço de venda (opcional, pra calcular CMV do prato)
              <CampoValor value={precoVenda} onChange={setPrecoVenda} />
            </label>

            <label>
              Nome exato na Saipos (opcional, uso futuro)
              <input
                type="text"
                value={nomeItemSaipos}
                onChange={(evento) => setNomeItemSaipos(evento.target.value)}
                placeholder="Ex.: X-SALADA"
              />
            </label>

            <label>
              Categoria
              <select
                value={categoria}
                onChange={(evento) => setCategoria(evento.target.value)}
              >
                <option value="">Sem categoria</option>
                {CATEGORIAS_FICHA_TECNICA.map((opcao) => (
                  <option key={opcao} value={opcao}>
                    {opcao}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <span style={{ display: "block", marginBottom: 6 }}>
              Insumos usados
            </span>

            {itensFicha.map((item, indice) => (
              <div
                key={indice}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  marginBottom: 8,
                  flexWrap: "wrap",
                }}
              >
                <select
                  value={item.insumo_id}
                  onChange={(evento) =>
                    atualizarLinhaItem(indice, "insumo_id", evento.target.value)
                  }
                  style={{ maxWidth: 200 }}
                >
                  <option value="">Escolha o insumo...</option>
                  {insumos.map((insumo) => (
                    <option key={insumo.id} value={insumo.id}>
                      {insumo.nome} ({insumo.unidade_medida})
                    </option>
                  ))}
                </select>

                <CampoValor
                  value={item.quantidade}
                  onChange={(valor) =>
                    atualizarLinhaItem(indice, "quantidade", valor)
                  }
                  placeholder="Qtd"
                  style={{ maxWidth: 90 }}
                />

                <button
                  type="button"
                  className="delete-button"
                  onClick={() => removerLinhaItem(indice)}
                >
                  ✖️
                </button>
              </div>
            ))}

            <button
              type="button"
              className="secondary-button"
              onClick={adicionarLinhaItem}
              disabled={insumos.length === 0}
            >
              + Adicionar insumo
            </button>

            {insumos.length === 0 && (
              <small className="foto-ajuda" style={{ display: "block", marginTop: 6 }}>
                Nenhum insumo cadastrado ainda — cadastre primeiro na aba
                Estoque.
              </small>
            )}
          </div>

          <p style={{ marginTop: 12 }}>
            Custo total do prato:{" "}
            <strong>{formatarMoeda(custoTotalFormulario)}</strong>
            {precoVenda !== "" && paraNumero(precoVenda) > 0 && (
              <>
                {" — CMV: "}
                <strong>
                  {((custoTotalFormulario / paraNumero(precoVenda)) * 100).toFixed(1)}%
                </strong>
              </>
            )}
          </p>

          <div className="modal-actions">
            {editandoFichaId && (
              <button
                type="button"
                className="secondary-button"
                onClick={limparFormularioFicha}
                disabled={salvandoFicha}
              >
                Cancelar edição
              </button>
            )}

            <button
              type="submit"
              className="primary-button"
              disabled={salvandoFicha}
            >
              {salvandoFicha ? "Salvando..." : "Salvar ficha técnica"}
            </button>
          </div>
        </form>
      </article>

      <article className="panel categoria-lista-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Fichas Técnicas</span>
            <h2>Cadastradas</h2>
          </div>
          <strong>{fichas.length}</strong>
        </div>

        {carregandoFichas ? (
          <div className="empty-state">Carregando...</div>
        ) : fichas.length === 0 ? (
          <div className="empty-state">Nenhuma ficha técnica ainda.</div>
        ) : (
          gruposFichas.map((grupo) => (
            <div key={grupo.nome} style={{ marginBottom: 18 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  margin: "10px 0 6px",
                }}
              >
                <strong>{grupo.nome}</strong>
                <span style={{ color: "#9aa0ac" }}>{grupo.itens.length}</span>
              </div>

              <div className="categorias-lista">
                {grupo.itens.map((ficha) => {
                  const cmv =
                    ficha.preco_venda > 0
                      ? (ficha.custo_total / ficha.preco_venda) * 100
                      : null;

                  return (
                    <div className="categoria-item" key={ficha.id}>
                      <div className="categoria-identificacao">
                        <div className="categoria-icone">📋</div>
                        <div>
                          <strong>{ficha.nome_produto}</strong>
                          <div>
                            Custo: {formatarMoeda(ficha.custo_total)}
                            {ficha.preco_venda > 0 && (
                              <>
                                {" — Venda: "}
                                {formatarMoeda(ficha.preco_venda)}
                                {" — CMV: "}
                                <strong
                                  style={{
                                    color:
                                      cmv <= 35
                                        ? "#18c754"
                                        : cmv <= 40
                                        ? "#ff9800"
                                        : "#ff3545",
                                  }}
                                >
                                  {cmv.toFixed(1)}%
                                </strong>
                              </>
                            )}
                          </div>
                          <small style={{ color: "#9fb0c4" }}>
                            {(ficha.itens || [])
                              .map(
                                (item) =>
                                  `${Number(item.quantidade).toLocaleString("pt-BR")} ${item.insumos?.nome || "?"}`
                              )
                              .join(", ")}
                          </small>
                        </div>
                      </div>

                      <div className="transaction-actions">
                        <button
                          type="button"
                          className="edit-button"
                          onClick={() => iniciarEdicaoFicha(ficha)}
                        >
                          Editar
                        </button>

                        <button
                          type="button"
                          className="delete-button"
                          onClick={() => confirmarExclusaoFicha(ficha)}
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </article>
    </section>
  );
}

export default FichaTecnica;
