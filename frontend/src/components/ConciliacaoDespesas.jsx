import { useEffect, useMemo, useState } from "react";
import { buscarLancamentos, buscarLojas } from "../services/api";

function hoje() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function primeiroDiaDoMes() {
  const hojeStr = hoje();
  return `${hojeStr.slice(0, 7)}-01`;
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarData(valor) {
  if (!valor) return "—";
  const data = new Date(`${valor}T12:00:00`);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleDateString("pt-BR");
}

// Converte "1.234,56" ou "1234.56" ou "-45,90" num número JS de verdade.
// Bancos brasileiros costumam mandar valor com vírgula decimal e ponto de
// milhar — sem isso, "1.234,56" seria lido errado como 1.234.
function normalizarValor(texto) {
  if (texto == null) return NaN;
  const limpo = String(texto).trim().replace(/[R$\s]/g, "");
  if (limpo === "") return NaN;

  const temVirgula = limpo.includes(",");
  const semMilhar = temVirgula ? limpo.replace(/\./g, "").replace(",", ".") : limpo;

  return Number(semMilhar);
}

// Parser de CSV bem tolerante: detecta ; ou , como separador de coluna,
// tenta achar as colunas de data/descrição/valor pelo cabeçalho (aceita
// vários nomes comuns de extrato de banco) e, se não achar cabeçalho,
// assume a ordem "data, descrição, valor" nas 3 primeiras colunas.
function interpretarCsvExtrato(textoArquivo) {
  const linhas = textoArquivo
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter((linha) => linha.length > 0);

  if (linhas.length === 0) return [];

  const separador = linhas[0].includes(";") ? ";" : ",";
  const primeiraLinha = linhas[0].split(separador).map((c) => c.trim().toLowerCase());

  const nomesData = ["data", "date", "dt", "data lançamento", "data movimento"];
  const nomesDescricao = ["descrição", "descricao", "histórico", "historico", "lançamento", "lancamento", "memo", "description"];
  const nomesValor = ["valor", "amount", "valor (r$)", "valor(r$)", "vlr"];

  let indiceData = primeiraLinha.findIndex((c) => nomesData.includes(c));
  let indiceDescricao = primeiraLinha.findIndex((c) => nomesDescricao.includes(c));
  let indiceValor = primeiraLinha.findIndex((c) => nomesValor.includes(c));

  let comeco = 0;

  if (indiceData !== -1 || indiceDescricao !== -1 || indiceValor !== -1) {
    comeco = 1;
    if (indiceData === -1) indiceData = 0;
    if (indiceDescricao === -1) indiceDescricao = 1;
    if (indiceValor === -1) indiceValor = 2;
  } else {
    indiceData = 0;
    indiceDescricao = 1;
    indiceValor = 2;
  }

  const linhasDados = [];

  for (let i = comeco; i < linhas.length; i++) {
    const colunas = linhas[i].split(separador).map((c) => c.trim());
    if (colunas.length < 2) continue;

    const dataTexto = colunas[indiceData] || "";
    const descricao = colunas[indiceDescricao] || "";
    const valor = normalizarValor(colunas[indiceValor]);

    if (Number.isNaN(valor)) continue;

    // Aceita "10/08/2026" ou "2026-08-10" — normaliza pra AAAA-MM-DD.
    let dataIso = dataTexto;
    const bateBr = dataTexto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (bateBr) {
      dataIso = `${bateBr[3]}-${bateBr[2]}-${bateBr[1]}`;
    }

    linhasDados.push({ data: dataIso, descricao, valor });
  }

  return linhasDados;
}

function diferencaEmDias(dataA, dataB) {
  const a = new Date(`${dataA}T12:00:00`).getTime();
  const b = new Date(`${dataB}T12:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return Infinity;
  return Math.abs(a - b) / (1000 * 60 * 60 * 24);
}

function ConciliacaoDespesas() {
  const [lojas, setLojas] = useState([]);
  const [lojaId, setLojaId] = useState("todas");
  const [dataInicio, setDataInicio] = useState(primeiroDiaDoMes());
  const [dataFim, setDataFim] = useState(hoje());
  const [despesas, setDespesas] = useState([]);
  const [carregandoDespesas, setCarregandoDespesas] = useState(false);
  const [linhasExtrato, setLinhasExtrato] = useState([]);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    buscarLojas()
      .then((dados) => setLojas(Array.isArray(dados) ? dados : []))
      .catch(() => {});
  }, []);

  async function carregarDespesas() {
    setCarregandoDespesas(true);
    setErro("");

    try {
      const todos = await buscarLancamentos();

      const filtradas = (Array.isArray(todos) ? todos : []).filter((item) => {
        if (item.tipo !== "despesa") return false;
        if (item.data < dataInicio || item.data > dataFim) return false;
        if (lojaId !== "todas" && String(item.loja_id) !== String(lojaId)) {
          return false;
        }
        return true;
      });

      setDespesas(filtradas);
    } catch (erroCarregar) {
      setErro(erroCarregar.message || "Não foi possível buscar as despesas.");
    } finally {
      setCarregandoDespesas(false);
    }
  }

  function selecionarArquivo(evento) {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;

    setNomeArquivo(arquivo.name);
    setErro("");

    const leitor = new FileReader();
    leitor.onload = () => {
      try {
        const linhas = interpretarCsvExtrato(String(leitor.result));
        if (linhas.length === 0) {
          setErro(
            "Não consegui reconhecer nenhuma linha nesse arquivo. Confirme se é um CSV com colunas de data, descrição e valor."
          );
        }
        setLinhasExtrato(linhas);
      } catch {
        setErro("Não foi possível ler esse arquivo. Tente exportar de novo em CSV.");
      }
    };
    leitor.onerror = () => setErro("Não foi possível abrir o arquivo selecionado.");
    leitor.readAsText(arquivo, "utf-8");
  }

  // Só olha saídas (valor negativo) do extrato — é isso que compara com
  // despesa. Entradas do extrato (valor positivo) não fazem parte dessa
  // conciliação (isso já é coberto na aba de Fechamento de Caixa/vendas).
  const saidasExtrato = useMemo(
    () =>
      linhasExtrato
        .filter((linha) => linha.valor < 0)
        .map((linha) => ({ ...linha, valorAbsoluto: Math.abs(linha.valor) })),
    [linhasExtrato]
  );

  const resultadoConfronto = useMemo(() => {
    const extratoRestante = [...saidasExtrato];
    const despesasBatidas = [];
    const despesasSemExtrato = [];

    despesas.forEach((despesa) => {
      const valorDespesa = Number(despesa.valor || 0);

      const indiceEncontrado = extratoRestante.findIndex(
        (linha) =>
          Math.abs(linha.valorAbsoluto - valorDespesa) < 0.01 &&
          diferencaEmDias(linha.data, despesa.data) <= 5
      );

      if (indiceEncontrado === -1) {
        despesasSemExtrato.push(despesa);
      } else {
        despesasBatidas.push({
          despesa,
          extrato: extratoRestante[indiceEncontrado],
        });
        extratoRestante.splice(indiceEncontrado, 1);
      }
    });

    return {
      despesasBatidas,
      despesasSemExtrato,
      extratoSemDespesa: extratoRestante,
    };
  }, [despesas, saidasExtrato]);

  const totalDespesasLancadas = despesas.reduce(
    (soma, item) => soma + Number(item.valor || 0),
    0
  );
  const totalExtratoSaidas = saidasExtrato.reduce(
    (soma, item) => soma + item.valorAbsoluto,
    0
  );
  const diferencaTotal = totalDespesasLancadas - totalExtratoSaidas;

  return (
    <section className="conciliacao-layout">
      <article className="panel categoria-form-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Conciliação de despesas</span>
            <h2>Sistema × Extrato bancário</h2>
          </div>
        </div>

        <label>
          Loja
          <select value={lojaId} onChange={(evento) => setLojaId(evento.target.value)}>
            <option value="todas">Todas as lojas</option>
            {lojas.map((loja) => (
              <option key={loja.id} value={loja.id}>
                {loja.nome}
              </option>
            ))}
          </select>
        </label>

        <div className="form-row">
          <label>
            Data inicial
            <input
              type="date"
              value={dataInicio}
              onChange={(evento) => setDataInicio(evento.target.value)}
            />
          </label>

          <label>
            Data final
            <input
              type="date"
              value={dataFim}
              onChange={(evento) => setDataFim(evento.target.value)}
            />
          </label>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={carregarDespesas}
          disabled={carregandoDespesas}
        >
          {carregandoDespesas ? "Buscando..." : "🔄 Buscar despesas lançadas"}
        </button>

        <hr style={{ margin: "20px 0", opacity: 0.2 }} />

        <label>
          Extrato do banco (CSV)
          <input type="file" accept=".csv,text/csv" onChange={selecionarArquivo} />
        </label>

        <small className="foto-ajuda">
          Baixe o extrato do PagSeguro/Sicredi em CSV (sem precisar de nenhuma
          API/token) e escolha o arquivo aqui. O sistema lê data, descrição e
          valor automaticamente.
          {nomeArquivo && <> Arquivo carregado: <strong>{nomeArquivo}</strong> ({linhasExtrato.length} linha(s)).</>}
        </small>

        {erro && <div className="empty-state">{erro}</div>}
      </article>

      <article className="panel categoria-lista-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Resumo</span>
            <h2>Confronto</h2>
          </div>
        </div>

        {despesas.length === 0 && saidasExtrato.length === 0 ? (
          <div className="empty-state">
            Busque as despesas do período e/ou envie o extrato pra começar a
            conferir.
          </div>
        ) : (
          <div className="categorias-lista">
            <div className="categoria-item">
              <div className="categoria-identificacao">
                <div className="categoria-icone">📋</div>
                <div>
                  <strong>Despesas lançadas no sistema</strong>
                  <div>
                    {formatarMoeda(totalDespesasLancadas)} ({despesas.length} lançamento(s))
                  </div>
                </div>
              </div>
            </div>

            <div className="categoria-item">
              <div className="categoria-identificacao">
                <div className="categoria-icone">🏦</div>
                <div>
                  <strong>Saídas no extrato do banco</strong>
                  <div>
                    {formatarMoeda(totalExtratoSaidas)} ({saidasExtrato.length} linha(s))
                  </div>
                </div>
              </div>
            </div>

            {Math.abs(diferencaTotal) >= 0.01 && despesas.length > 0 && saidasExtrato.length > 0 && (
              <div
                className="fp-alerta-cmv fp-alerta-cmv-critico"
                style={{ marginTop: 8 }}
              >
                <span className="fp-alerta-cmv-icone">🚨</span>
                <div>
                  <strong>
                    Diferença de {formatarMoeda(Math.abs(diferencaTotal))}
                  </strong>
                  <span>
                    {diferencaTotal > 0
                      ? "Tem despesa lançada que não achei no extrato."
                      : "Tem saída no extrato sem despesa lançada correspondente."}
                  </span>
                </div>
              </div>
            )}

            {resultadoConfronto.despesasSemExtrato.length > 0 && (
              <>
                <div className="categoria-item categoria-item-titulo">
                  <strong>⚠️ Lançadas, mas não achei saída correspondente no extrato</strong>
                </div>
                {resultadoConfronto.despesasSemExtrato.map((item) => (
                  <div className="categoria-item" key={item.id}>
                    <div className="categoria-identificacao">
                      <div className="categoria-icone">❓</div>
                      <div>
                        <strong>{item.fornecedor || item.descricao || "Despesa"}</strong>
                        <div>
                          {formatarMoeda(item.valor)} — {formatarData(item.data)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {resultadoConfronto.extratoSemDespesa.length > 0 && (
              <>
                <div className="categoria-item categoria-item-titulo">
                  <strong>⚠️ Saíram do banco, mas não achei despesa lançada</strong>
                </div>
                {resultadoConfronto.extratoSemDespesa.map((item, indice) => (
                  <div className="categoria-item" key={`extrato-${indice}`}>
                    <div className="categoria-identificacao">
                      <div className="categoria-icone">❓</div>
                      <div>
                        <strong>{item.descricao || "Sem descrição"}</strong>
                        <div>
                          {formatarMoeda(item.valorAbsoluto)} — {formatarData(item.data)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {resultadoConfronto.despesasBatidas.length > 0 && (
              <>
                <div className="categoria-item categoria-item-titulo">
                  <strong>✅ Bateram certinho</strong>
                </div>
                {resultadoConfronto.despesasBatidas.map(({ despesa, extrato }) => (
                  <div className="categoria-item" key={despesa.id}>
                    <div className="categoria-identificacao">
                      <div className="categoria-icone">✅</div>
                      <div>
                        <strong>{despesa.fornecedor || despesa.descricao || "Despesa"}</strong>
                        <div>
                          {formatarMoeda(despesa.valor)} — lançada{" "}
                          {formatarData(despesa.data)}, extrato{" "}
                          {formatarData(extrato.data)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </article>
    </section>
  );
}

export default ConciliacaoDespesas;
