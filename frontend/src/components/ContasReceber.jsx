import { useMemo, useState } from "react";
import CampoValor, { paraNumero } from "./CampoValor";

// BUG REAL corrigido (26/08/2026): usava o relógio/fuso do próprio
// aparelho — se estivesse errado, salvava com a data errada sem
// ninguém perceber. Agora usa sempre o fuso fixo da loja.
function hojeLocal() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatarData(data) {
  if (!data) return "Sem data";
  return new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR");
}

const DIAS_SEMANA = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function ContasReceber({
  lancamentos = [],
  formasPagamento = [],
  carregandoFormas = false,
  adicionarFormaPagamento,
  editarFormaPagamento,
  removerFormaPagamento,
  buscarFoto,
  registrarVale,
  ehAdministrador = false,
  funcionarios = [],
  criarFuncionario,
  fundosRetiradas = [],
  lojaId = null,
}) {
  const [nome, setNome] = useState("");
  const [operadora, setOperadora] = useState("");
  const [prazoDias, setPrazoDias] = useState("0");
  const [taxaPercentual, setTaxaPercentual] = useState("0");
  const [diaSemanaPagamento, setDiaSemanaPagamento] = useState("");
  const [editandoId, setEditandoId] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [mostrarCalculadora, setMostrarCalculadora] = useState(false);
  const [calcBruto, setCalcBruto] = useState("");
  const [calcRecebido, setCalcRecebido] = useState("");
  const [fotoVisualizada, setFotoVisualizada] = useState(null);
  const [carregandoFotoId, setCarregandoFotoId] = useState(null);
  // Pedido do usuário (23/08/2026): busca por funcionário/fornecedor pra
  // achar só a previsão de uma pessoa específica, sem precisar rolar a
  // lista inteira por data.
  const [buscaReceber, setBuscaReceber] = useState("");

  // Pedido do usuário (26/08/2026): "Contas Recebidas" — painel separado
  // pra vale/consumo já descontados na folha, fechado por padrão.
  const [mostrarRecebidas, setMostrarRecebidas] = useState(false);

  // Pedido do usuário (25/08/2026): registrar um "Vale" (dinheiro que a
  // empresa vai receber de volta do funcionário) direto por aqui, sem
  // precisar passar pelo Fechamento de Caixa.
  //
  // Pedido do usuário (25/08/2026, atualizado): a previsão segue o ciclo
  // de pagamento — não importa em que dia do mês foi tirado (dia 2 ou
  // dia 28), sempre desconta no pagamento do dia 5 do mês SEGUINTE.
  // Continua editável, pra corrigir se algum caso for diferente.
  function diaCincoDoProximoMes() {
    const hoje = new Date();
    const proximoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 5);
    return proximoMes.toISOString().slice(0, 10);
  }

  const [valeNome, setValeNome] = useState("");
  const [valeValor, setValeValor] = useState("");
  const [valeData, setValeData] = useState(diaCincoDoProximoMes);
  const [salvandoVale, setSalvandoVale] = useState(false);
  // Pedido do usuário (26/08/2026): "3 checkbox pequenos e bem
  // separados, para clicar de onde foi pago o vale... de cada um
  // precisa ter o rastro e descontar de cada parte marcada" — mesma
  // ideia já usada no Vale do Fechamento de Caixa, agora também aqui
  // (que é onde o usuário realmente registra vale no dia a dia).
  const [valeOrigemPagamento, setValeOrigemPagamento] = useState("pix");

  // Pedido do usuário (26/08/2026): "essa parte tem que ser uma só,
  // somativa — ao selecionar cofre acima essa não precisa selecionar,
  // ali circulado é só histórico de entrada e saída" — o Cofre é UM
  // saldo só pro usuário, não uma lista de retiradas pra escolher.
  // Some tudo que está aberto pra essa loja e mostra só o total; o
  // registro específico que vai levar o desconto é escolhido sozinho
  // (o que sobra menos, pra não deixar troco espalhado em vários).
  const fundosCofreLoja = useMemo(() => {
    return fundosRetiradas.filter(
      (fundo) =>
        fundo.status === "aberto" &&
        fundo.conta_para_cofre !== false &&
        String(fundo.loja_id) === String(lojaId)
    );
  }, [fundosRetiradas, lojaId]);

  const disponivelDoFundo = (fundo) =>
    Number(fundo.valor || 0) - Number(fundo.valor_usado || 0);

  const totalCofreDisponivel = fundosCofreLoja.reduce(
    (soma, fundo) => soma + disponivelDoFundo(fundo),
    0
  );

  function escolherFundoCofreAutomatico(valorNecessario) {
    const suficientes = fundosCofreLoja
      .filter((fundo) => disponivelDoFundo(fundo) >= valorNecessario - 0.01)
      .sort((a, b) => disponivelDoFundo(a) - disponivelDoFundo(b));

    if (suficientes.length > 0) return suficientes[0];

    const maiores = [...fundosCofreLoja].sort(
      (a, b) => disponivelDoFundo(b) - disponivelDoFundo(a)
    );

    return maiores[0] || null;
  }

  // Pedido do usuário (25/08/2026): "registrar vale também tem que puxar
  // nome lá do cadastro como feito na situação de pagamento de salário"
  // — mesma lista de funcionários, mesmo fluxo de "+ Novo funcionário...".
  async function adicionarFuncionarioNoValeHandler() {
    const nome = window.prompt("Nome do novo funcionário:");
    if (!nome || !nome.trim()) return;

    try {
      const salvo = await criarFuncionario(nome);
      setValeNome(salvo.nome);
    } catch (erro) {
      alert(erro.message || "Não foi possível cadastrar o funcionário.");
    }
  }

  async function salvarVale(evento) {
    evento.preventDefault();

    if (!valeNome.trim()) {
      alert("Informe o nome do funcionário.");
      return;
    }

    const valorNumerico = paraNumero(valeValor);

    if (!valorNumerico || valorNumerico <= 0) {
      alert("Informe um valor válido.");
      return;
    }

    if (!valeData) {
      alert("Escolha a data prevista de devolução.");
      return;
    }

    // Pedido do usuário (26/08/2026): "essa parte tem que ser uma só,
    // somativa" — não pergunta qual retirada específica, escolhe
    // sozinho de qual registro sai (o Cofre é UM saldo só na visão do
    // usuário). Se não tiver nada aberto, cai pro Saldo geral igual já
    // acontece em Despesas (não bloqueia o vale por causa disso).
    const fundoEscolhido =
      valeOrigemPagamento === "cofre"
        ? escolherFundoCofreAutomatico(valorNumerico)
        : null;

    setSalvandoVale(true);

    try {
      await registrarVale({
        nomeFuncionario: valeNome.trim(),
        valor: valorNumerico,
        dataPrevista: valeData,
        origemPagamento: valeOrigemPagamento,
        fundoRetiradaId: fundoEscolhido?.id || null,
      });

      setValeNome("");
      setValeValor("");
      setValeOrigemPagamento("pix");
    } catch (erro) {
      alert(erro.message || "Não foi possível registrar o vale.");
    } finally {
      setSalvandoVale(false);
    }
  }

  async function verFoto(item) {
    if (!buscarFoto) return;

    setCarregandoFotoId(item.id);

    try {
      const resultado = await buscarFoto(item.id);
      setFotoVisualizada(resultado?.foto || "");
    } catch (erro) {
      alert(erro.message || "Não foi possível carregar a foto.");
    } finally {
      setCarregandoFotoId(null);
    }
  }

  function limparFormulario() {
    setNome("");
    setOperadora("");
    setPrazoDias("0");
    setTaxaPercentual("0");
    setDiaSemanaPagamento("");
    setEditandoId(null);
  }

  async function salvar(evento) {
    evento.preventDefault();

    if (!nome.trim()) {
      alert("Informe o nome da forma de pagamento.");
      return;
    }

    setSalvando(true);

    try {
      const dados = {
        nome: nome.trim(),
        operadora,
        prazo_dias: prazoDias,
        taxa_percentual: taxaPercentual,
        dia_semana_pagamento: diaSemanaPagamento,
      };

      if (editandoId) {
        await editarFormaPagamento(editandoId, dados);
      } else {
        await adicionarFormaPagamento(dados);
      }

      limparFormulario();
    } catch (erro) {
      alert(erro.message || "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  // Bug real corrigido (21/08/2026): "35.000" (sem vírgula) virava 35 —
  // usa o paraNumero() do CampoValor, que sempre tira o ponto de milhar
  // primeiro, tenha vírgula ou não.
  function paraNumeroBr(texto) {
    return paraNumero(texto);
  }

  const taxaCalculada = useMemo(() => {
    const bruto = paraNumeroBr(calcBruto);
    const recebido = paraNumeroBr(calcRecebido);

    if (!bruto || bruto <= 0 || !recebido || recebido < 0) {
      return null;
    }

    return ((1 - recebido / bruto) * 100).toFixed(4);
  }, [calcBruto, calcRecebido]);

  function usarTaxaCalculada() {
    if (taxaCalculada == null) return;
    setTaxaPercentual(taxaCalculada);
    setMostrarCalculadora(false);
    setCalcBruto("");
    setCalcRecebido("");
  }

  function iniciarEdicao(forma) {
    setEditandoId(forma.id);
    setNome(forma.nome);
    setOperadora(forma.operadora || "");
    setPrazoDias(String(forma.prazo_dias ?? 0));
    setTaxaPercentual(String(forma.taxa_percentual ?? 0));
    setDiaSemanaPagamento(
      forma.dia_semana_pagamento != null
        ? String(forma.dia_semana_pagamento)
        : ""
    );
  }

  async function confirmarExclusao(forma) {
    const confirmar = window.confirm(
      `Excluir a forma de pagamento "${forma.nome}"?`
    );

    if (!confirmar) return;

    try {
      await removerFormaPagamento(forma.id);

      if (editandoId === forma.id) {
        limparFormulario();
      }
    } catch (erro) {
      alert(erro.message || "Não foi possível excluir.");
    }
  }

  // Só mostra o que AINDA não caiu (data prevista no futuro) — sem isso,
  // um teste antigo (PIX/Débito de dias passados) continuava aparecendo
  // aqui pra sempre, mesmo já tendo caído de verdade há dias.
  const hoje = hojeLocal();

  const previstos = lancamentos.filter(
    (item) =>
      item.tipo === "receita" &&
      item.data_prevista_recebimento &&
      item.data_prevista_recebimento > hoje &&
      item.status_conciliacao !== "conciliado"
  );

  function nomeFormaPagamento(id) {
    return formasPagamento.find((item) => item.id === id)?.nome || "—";
  }

  // Pedido do usuário (25/08/2026): "separa iFood na coluna a esquerda
  // abaixo de Brendi" — não era o cadastro de forma de pagamento, era a
  // LISTA DE VENDAS do iFood mesmo, que saiu de "Contas a Receber"
  // (direita) e passou a viver junto da lista de Formas de Pagamento
  // (esquerda), num bloco só dela.
  function ehFormaIFood(item) {
    return (
      nomeFormaPagamento(item.forma_pagamento_id).trim().toLowerCase() ===
      "ifood"
    );
  }

  const previstosIFood = previstos.filter(ehFormaIFood);
  const previstosOutros = previstos.filter((item) => !ehFormaIFood(item));

  function agruparPorData(lista) {
    return lista.reduce((acumulado, item) => {
      const chave = item.data_prevista_recebimento;

      if (!acumulado[chave]) {
        acumulado[chave] = [];
      }

      acumulado[chave].push(item);

      return acumulado;
    }, {});
  }

  const blocosPorDataIFood = agruparPorData(previstosIFood);
  const datasOrdenadasIFood = Object.keys(blocosPorDataIFood).sort();

  // Pedido do usuário (25/08/2026): "pesquisa única onde abaixo aparecerá
  // consumo e pode ser em amarelo mesmo vales" — a mesma busca/lista que
  // já mostrava os consumos (Vendas A prazo) agora também traz os vales
  // pendentes (despesa categoria "Vale", ainda não quitados), marcados
  // pra aparecer em amarelo e diferenciar visualmente do consumo.
  const valesPendentesParaLista = lancamentos
    .filter(
      (item) =>
        item.tipo === "despesa" &&
        item.categoria === "Vale" &&
        !item.quitado_em
    )
    .map((item) => ({
      ...item,
      _ehVale: true,
      // Vale não tem "data prevista de recebimento" (não gera receita
      // automática) — usa a própria data do lançamento só pra entrar no
      // mesmo agrupamento por data da lista.
      data_prevista_recebimento: item.data,
    }));

  const itensListaUnificada = [...previstosOutros, ...valesPendentesParaLista];

  // Pedido do usuário (25/08/2026): "pra ter coerência tem que aparecer
  // um total de tudo" — em vez do valor quebrado por funcionário (que
  // saiu dos badges), um total único. IMPORTANTE: só soma o que é de
  // FUNCIONÁRIO (vale + venda "A prazo") — "Contas a Receber" também
  // lista PIX/Cartão/Brendi etc., que não tem nada a ver com esse total
  // (bug encontrado pelo usuário: total vinha maior que a soma real dos
  // funcionários porque estava contando tudo).
  const totalGeralPendente =
    previstosOutros
      .filter((item) => (item.fornecedor || "").toLowerCase().includes("a prazo"))
      .reduce((soma, item) => soma + Number(item.valor_liquido_esperado ?? item.valor), 0) +
    valesPendentesParaLista.reduce((soma, item) => soma + Number(item.valor), 0);

  // Pedido do usuário (26/08/2026): "tem que ir para Contas Recebidas" —
  // vale/consumo já descontados na folha (quitado_em preenchido) saem da
  // lista de pendentes e aparecem aqui, separados.
  const itensRecebidos = lancamentos
    .filter((item) => item.quitado_em)
    .filter(
      (item) =>
        (item.tipo === "despesa" && item.categoria === "Vale") ||
        (item.tipo === "receita" &&
          (item.fornecedor || "").toLowerCase().includes("a prazo"))
    )
    .map((item) => ({ ...item, _ehVale: item.tipo === "despesa" }))
    .sort((a, b) => new Date(b.quitado_em) - new Date(a.quitado_em));

  const buscaReceberLimpa = buscaReceber.trim().toLowerCase();

  const previstosFiltrados = buscaReceberLimpa
    ? itensListaUnificada.filter((item) =>
        `${item.descricao || ""} ${item.fornecedor || ""} ${
          item._ehVale ? "vale" : nomeFormaPagamento(item.forma_pagamento_id)
        }`
          .toLowerCase()
          .includes(buscaReceberLimpa)
      )
    : itensListaUnificada;

  const blocosPorData = agruparPorData(previstosFiltrados);

  const datasOrdenadas = Object.keys(blocosPorData).sort();

  // Pedido do usuário (25/08/2026): "separa iFood na coluna a esquerda
  // abaixo de Brendi" — a lista normal vem em ordem alfabética (do
  // backend), o que jogava iFood longe de Brendi. Aqui só fixa essas
  // duas primeiro, na ordem pedida, e deixa o resto em ordem alfabética
  // normal depois.
  const ORDEM_FIXA_FORMAS = ["brendi", "ifood"];

  const formasPagamentoOrdenadas = useMemo(() => {
    return [...formasPagamento].sort((a, b) => {
      const posA = ORDEM_FIXA_FORMAS.indexOf(a.nome.trim().toLowerCase());
      const posB = ORDEM_FIXA_FORMAS.indexOf(b.nome.trim().toLowerCase());

      if (posA !== -1 || posB !== -1) {
        if (posA === -1) return 1;
        if (posB === -1) return -1;
        return posA - posB;
      }

      return a.nome.localeCompare(b.nome);
    });
  }, [formasPagamento]);

  return (
    <section className="categorias-layout">
      <article className="panel categoria-form-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">
              {editandoId ? "Editar" : "Nova"}
            </span>

            <h2>Forma de Pagamento</h2>
          </div>
        </div>

        <form onSubmit={salvar}>
          <label>
            Nome
            <input
              type="text"
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
              placeholder="Ex.: PIX, Débito, Crédito à vista"
            />
          </label>

          <label>
            Operadora (opcional)
            <input
              type="text"
              value={operadora}
              onChange={(evento) => setOperadora(evento.target.value)}
              placeholder="Ex.: Stone, Cielo"
            />
          </label>

          <div className="form-row">
            <label>
              Prazo (dias até cair)
              <input
                type="number"
                min="0"
                value={prazoDias}
                onChange={(evento) => setPrazoDias(evento.target.value)}
                disabled={diaSemanaPagamento !== ""}
              />
            </label>

            <label>
              Taxa (%)
              <input
                type="number"
                step="0.01"
                min="0"
                value={taxaPercentual}
                onChange={(evento) =>
                  setTaxaPercentual(evento.target.value)
                }
              />
            </label>
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={() => setMostrarCalculadora((anterior) => !anterior)}
            style={{ marginBottom: 12 }}
          >
            🧮 {mostrarCalculadora ? "Fechar calculadora" : "Não sei a taxa exata — calcular"}
          </button>

          {mostrarCalculadora && (
            <div className="panel" style={{ marginBottom: 16, padding: 14 }}>
              <p style={{ marginTop: 0, fontSize: 13, opacity: 0.8 }}>
                Digite o valor bruto (o que a Saipos/sistema mostrou como
                vendido) e o valor real que caiu na conta (o que o extrato ou
                o portal da plataforma mostrou) — calculo a taxa exata pra
                você.
              </p>

              <div className="form-row">
                <label>
                  Valor bruto (vendido)
                  <CampoValor
                    placeholder="Ex.: 8335,72"
                    value={calcBruto}
                    onChange={setCalcBruto}
                  />
                </label>

                <label>
                  Valor real recebido
                  <CampoValor
                    placeholder="Ex.: 7268,94"
                    value={calcRecebido}
                    onChange={setCalcRecebido}
                  />
                </label>
              </div>

              {taxaCalculada != null ? (
                <>
                  <p style={{ fontSize: 15 }}>
                    Taxa calculada: <strong>{taxaCalculada}%</strong>
                  </p>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={usarTaxaCalculada}
                  >
                    Usar essa taxa
                  </button>
                </>
              ) : (
                <p style={{ fontSize: 13, opacity: 0.7 }}>
                  Preencha os dois valores pra calcular.
                </p>
              )}
            </div>
          )}

          <label>
            Paga sempre num dia fixo da semana? (opcional)
            <select
              value={diaSemanaPagamento}
              onChange={(evento) =>
                setDiaSemanaPagamento(evento.target.value)
              }
            >
              <option value="">Não — usa o prazo em dias acima</option>
              <option value="0">Sim, todo domingo</option>
              <option value="1">Sim, toda segunda-feira</option>
              <option value="2">Sim, toda terça-feira</option>
              <option value="3">Sim, toda quarta-feira</option>
              <option value="4">Sim, toda quinta-feira</option>
              <option value="5">Sim, toda sexta-feira</option>
              <option value="6">Sim, todo sábado</option>
            </select>
          </label>

          <div className="modal-actions">
            {editandoId && (
              <button
                type="button"
                className="secondary-button"
                onClick={limparFormulario}
                disabled={salvando}
              >
                Cancelar
              </button>
            )}

            <button
              type="submit"
              className="primary-button"
              disabled={salvando}
            >
              {salvando ? "Salvando..." : editandoId ? "Salvar" : "Adicionar"}
            </button>
          </div>
        </form>

        <hr />

        {carregandoFormas ? (
          <div className="empty-state">Carregando...</div>
        ) : formasPagamento.length === 0 ? (
          <div className="empty-state">
            Nenhuma forma de pagamento cadastrada.
          </div>
        ) : (
          <div className="categorias-lista">
            {formasPagamentoOrdenadas.map((forma) => (
              <div className="categoria-item" key={forma.id}>
                <div className="categoria-identificacao">
                  <div className="categoria-icone">💳</div>

                  <div>
                    <strong>{forma.nome}</strong>
                    <div>
                      {forma.dia_semana_pagamento != null
                        ? `Toda ${DIAS_SEMANA[forma.dia_semana_pagamento]}`
                        : `D+${forma.prazo_dias}`}{" "}
                      — {forma.taxa_percentual}% de taxa
                    </div>
                  </div>
                </div>

                <div className="transaction-actions">
                  <button
                    type="button"
                    className="edit-button"
                    onClick={() => iniciarEdicao(forma)}
                  >
                    Editar
                  </button>

                  <button
                    type="button"
                    className="delete-button"
                    onClick={() => confirmarExclusao(forma)}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pedido do usuário (25/08/2026): a lista de vendas do iFood sai
            de "Contas a Receber" (direita) e passa a viver aqui, logo
            abaixo das Formas de Pagamento — não mostra mais na direita. */}
        {datasOrdenadasIFood.length > 0 && (
          <>
            <hr />
            <span className="eyebrow">🛵 Vendas iFood</span>

            {datasOrdenadasIFood.map((data) => {
              const itens = blocosPorDataIFood[data];
              const total = itens.reduce(
                (soma, item) =>
                  soma + Number(item.valor_liquido_esperado ?? item.valor),
                0
              );

              return (
                <div
                  className="panel"
                  key={data}
                  style={{ marginTop: 10, marginBottom: 14 }}
                >
                  <div className="panel-header">
                    <div>
                      <span className="eyebrow">{formatarData(data)}</span>
                      <h2>{formatarMoeda(total)}</h2>
                    </div>
                  </div>

                  <div className="categorias-lista">
                    {itens.map((item) => (
                      <div className="categoria-item" key={item.id}>
                        <div className="categoria-identificacao">
                          <div className="categoria-icone">🛵</div>

                          <div>
                            <strong>{item.descricao}</strong>
                            <div>
                              iFood —{" "}
                              {formatarMoeda(
                                item.valor_liquido_esperado ?? item.valor
                              )}
                            </div>
                          </div>
                        </div>

                        {item.tem_foto && (
                          <div className="transaction-actions">
                            <button
                              type="button"
                              className="edit-button"
                              disabled={carregandoFotoId === item.id}
                              onClick={() => verFoto(item)}
                            >
                              {carregandoFotoId === item.id
                                ? "Carregando..."
                                : "Ver foto"}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </article>

      <article className="panel categoria-lista-panel">
        {/* Pedido do usuário (25/08/2026): "registrar vale fique no topo
            à direita, só subir acima de contas a receber" — o formulário
            de Vale vira o primeiro bloco da coluna, acima até do
            cabeçalho "Contas a Receber". */}
        {ehAdministrador && registrarVale && (
          <form
            onSubmit={salvarVale}
            className="panel"
            style={{ marginBottom: 14, padding: 14 }}
          >
            <span className="eyebrow">🪙 Registrar Vale</span>
            <p style={{ marginTop: 4, fontSize: 13, opacity: 0.8 }}>
              Vale/adiantamento pra funcionário — desconta do Saldo na
              hora (despesa categoria "Vale"). A "volta" não é automática:
              é descontada depois, direto na folha de pagamento líquida.
            </p>

            <div className="form-row">
              <label>
                Nome do funcionário
                <select
                  value={valeNome}
                  disabled={salvandoVale}
                  onChange={(evento) => {
                    if (evento.target.value === "__novo__") {
                      adicionarFuncionarioNoValeHandler();
                      return;
                    }
                    setValeNome(evento.target.value);
                  }}
                >
                  <option value="">Selecione...</option>
                  {funcionarios.map((funcionario) => (
                    <option key={funcionario.id} value={funcionario.nome}>
                      {funcionario.nome}
                    </option>
                  ))}
                  <option value="__novo__">+ Novo funcionário...</option>
                </select>
              </label>

              <label>
                Valor
                <CampoValor
                  placeholder="Ex.: 200,00"
                  value={valeValor}
                  onChange={setValeValor}
                  disabled={salvandoVale}
                />
              </label>
            </div>

            {/* Pedido do usuário (26/08/2026): de onde saiu o dinheiro
                do vale — mutuamente exclusivo, cada opção descontando
                de um lugar diferente (dinheiro do caixa / Saldo geral
                via Pix / Cofre), com rastro no Log de Auditoria. */}
            <div className="permissoes-grid" style={{ marginTop: "8px", marginBottom: "8px" }}>
              <label className="permissao-item" style={{ marginBottom: "6px" }}>
                <input
                  type="radio"
                  name="origem-pagamento-vale-receber"
                  checked={valeOrigemPagamento === "dinheiro_caixa"}
                  disabled={salvandoVale}
                  onChange={() => setValeOrigemPagamento("dinheiro_caixa")}
                />
                💵 Dinheiro do caixa
              </label>

              <label className="permissao-item" style={{ marginBottom: "6px" }}>
                <input
                  type="radio"
                  name="origem-pagamento-vale-receber"
                  checked={valeOrigemPagamento === "pix"}
                  disabled={salvandoVale}
                  onChange={() => setValeOrigemPagamento("pix")}
                />
                💳 Pix (conta)
              </label>

              <label className="permissao-item" style={{ marginBottom: "6px" }}>
                <input
                  type="radio"
                  name="origem-pagamento-vale-receber"
                  checked={valeOrigemPagamento === "cofre"}
                  disabled={salvandoVale}
                  onChange={() => setValeOrigemPagamento("cofre")}
                />
                🔒 Cofre
              </label>
            </div>

            {valeOrigemPagamento === "cofre" && (
              <small className="foto-ajuda">
                {totalCofreDisponivel > 0
                  ? `🔒 Cofre disponível: ${formatarMoeda(totalCofreDisponivel)} — desconta sozinho de lá.`
                  : "⚠️ Nenhum saldo no Cofre agora — vai descontar do Saldo geral."}
              </small>
            )}

            <label>
              Previsão de desconto (referência — dia 5 já sugerido, não
              gera lançamento sozinho)
              <input
                type="date"
                value={valeData}
                onChange={(evento) => setValeData(evento.target.value)}
                disabled={salvandoVale}
              />
            </label>

            <button
              type="submit"
              className="primary-button"
              disabled={salvandoVale}
              style={{ marginTop: 10 }}
            >
              {salvandoVale ? "Salvando..." : "Registrar Vale"}
            </button>
          </form>
        )}

        <div className="panel-header">
          <div>
            <span className="eyebrow">Previsão</span>
            <h2>Contas a Receber</h2>
          </div>

          <strong>{previstosFiltrados.length}</strong>
        </div>

        {/* Pedido do usuário (25/08/2026): "aqui deveria aparecer o
            total, em verde" — o total (só de funcionário: vale +
            venda a prazo) fica bem em cima do seletor, visível junto
            com ele. */}
        <strong style={{ display: "block", color: "#22c55e", marginBottom: 8 }}>
          Total pendente (funcionários): {formatarMoeda(totalGeralPendente)}
        </strong>

        {/* Pedido do usuário (25/08/2026): "essa pesquisa aqui de baixo
            tem que ser igual a última foto que tenha todos os
            funcionários e eu seleciono sem precisar escrever" — troca o
            campo de texto por um seletor com a mesma lista de
            funcionários (igual o do formulário de Vale acima), sem
            precisar digitar nada. */}
        <div style={{ margin: "0 0 12px" }}>
          <select
            value={buscaReceber}
            onChange={(evento) => setBuscaReceber(evento.target.value)}
          >
            <option value="">Todos os funcionários</option>
            {funcionarios.map((funcionario) => (
              <option key={funcionario.id} value={funcionario.nome}>
                {funcionario.nome}
              </option>
            ))}
          </select>
        </div>

        {/* Pedido do usuário (25/08/2026): "aqui tem que estar o total
            entre consumo e vale" — quando filtra por um funcionário
            específico, mostra o total combinado (vale + consumo) dele,
            em vez de só o total quebrado por data (que soma separado
            por dia e escondia a soma real dos dois juntos). */}
        {buscaReceberLimpa && previstosFiltrados.length > 0 && (
          <strong
            style={{ display: "block", color: "#22c55e", marginBottom: 10 }}
          >
            Total de {buscaReceber} (vale + consumo):{" "}
            {formatarMoeda(
              previstosFiltrados.reduce(
                (soma, item) =>
                  soma + Number(item.valor_liquido_esperado ?? item.valor),
                0
              )
            )}
          </strong>
        )}

        {itensListaUnificada.length === 0 ? (
          <div className="empty-state">
            Nenhuma previsão de recebimento nem vale pendente. Escolha uma
            forma de pagamento ao lançar uma receita, ou registre um vale,
            pra aparecer aqui.
          </div>
        ) : datasOrdenadas.length === 0 ? (
          <div className="empty-state">
            Nenhum resultado pra "{buscaReceber.trim()}".
          </div>
        ) : (
          datasOrdenadas.map((data) => {
            const itens = blocosPorData[data];

            return (
              <div className="panel" key={data} style={{ marginBottom: 14 }}>
                {/* Pedido do usuário (25/08/2026): "os R$500,00 ali
                    parece estar bugado, não tem necessidade" — esse
                    total quebrado por data só somava aquele dia (dava
                    a impressão de estar errado do lado do total
                    combinado em verde). O total de verdade já aparece
                    acima. */}
                <div className="panel-header">
                  <div>
                    <span className="eyebrow">{formatarData(data)}</span>
                  </div>
                </div>

                <div className="categorias-lista">
                  {itens.map((item) => (
                    <div
                      className="categoria-item"
                      key={item.id}
                      style={
                        item._ehVale
                          ? {
                              background: "rgba(234, 179, 8, 0.12)",
                              borderRadius: 8,
                              padding: "10px 8px",
                            }
                          : undefined
                      }
                    >
                      <div className="categoria-identificacao">
                        <div className="categoria-icone">
                          {item._ehVale ? "🪙" : "💰"}
                        </div>

                        <div>
                          <strong style={item._ehVale ? { color: "#eab308" } : undefined}>
                            {item.descricao || item.fornecedor}
                          </strong>
                          <div>
                            {item._ehVale
                              ? "Vale"
                              : nomeFormaPagamento(item.forma_pagamento_id)}{" "}
                            —{" "}
                            {formatarMoeda(
                              item.valor_liquido_esperado ?? item.valor
                            )}
                          </div>
                          {/* Pedido do usuário (26/08/2026): o cabeçalho
                              do grupo é a previsão de recebimento (não
                              necessariamente quando a compra aconteceu
                              de verdade) — mostra aqui a data real do
                              lançamento, item por item. */}
                          {item.data && (
                            <div style={{ fontSize: 12, opacity: 0.7 }}>
                              {formatarData(item.data)}
                            </div>
                          )}
                        </div>
                      </div>

                      {item.tem_foto && (
                        <div className="transaction-actions">
                          <button
                            type="button"
                            className="edit-button"
                            disabled={carregandoFotoId === item.id}
                            onClick={() => verFoto(item)}
                          >
                            {carregandoFotoId === item.id
                              ? "Carregando..."
                              : "Ver foto"}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}

        {/* Pedido do usuário (26/08/2026): vale/consumo já descontados na
            folha saem de "pendente" e ficam aqui — fechado por padrão. */}
        <button
          type="button"
          className="secondary-button"
          onClick={() => setMostrarRecebidas((anterior) => !anterior)}
          style={{ marginTop: 14 }}
        >
          {mostrarRecebidas ? "▲" : "▼"} 📥 Contas Recebidas (
          {
            itensRecebidos.filter(
              (item) =>
                !buscaReceberLimpa ||
                (item.fornecedor || "").toLowerCase().includes(buscaReceberLimpa)
            ).length
          }
          )
        </button>

        {mostrarRecebidas && (
          <div className="panel" style={{ marginTop: 10, padding: 14 }}>
            {itensRecebidos
              .filter(
                (item) =>
                  !buscaReceberLimpa ||
                  (item.fornecedor || "")
                    .toLowerCase()
                    .includes(buscaReceberLimpa)
              )
              .map((item) => (
                <div className="categoria-item" key={item.id}>
                  <div className="categoria-identificacao">
                    <div className="categoria-icone">
                      {item._ehVale ? "🪙" : "💰"}
                    </div>
                    <div>
                      <strong>{item.descricao || item.fornecedor}</strong>
                      <div>
                        {item._ehVale ? "Vale" : "Consumo"} —{" "}
                        {formatarMoeda(item.valor)}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        Recebido em{" "}
                        {new Date(item.quitado_em).toLocaleString("pt-BR", {
                          timeZone: "America/Sao_Paulo",
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

            {itensRecebidos.length === 0 && (
              <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
                Nenhum vale/consumo recebido ainda.
              </p>
            )}
          </div>
        )}
      </article>

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
                <span className="eyebrow">Contas a Receber</span>
                <h2>Foto anexada</h2>
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
              alt="Foto anexada"
              className="foto-modal-imagem"
            />
          </div>
        </div>
      )}
    </section>
  );
}

export default ContasReceber;
