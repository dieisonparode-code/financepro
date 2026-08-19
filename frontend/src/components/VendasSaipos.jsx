import { useEffect, useRef, useState } from "react";
import {
  buscarFechamentoSaipos,
  buscarVendasPagSeguro,
  importarReceitasSaipos,
} from "../services/api";

// Usa o fuso horário do próprio dispositivo (não força São Paulo) — é o que
// bate com a expectativa de quem está usando a tela, seja qual for a loja.
function hoje() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

const INTERVALO_ATUALIZACAO_MS = 60 * 1000;

// Status 3 (Paga) e 4 (Disponível) são as únicas que a PagSeguro já
// confirmou como recebidas de verdade — mesma regra usada na Conciliação.
function estaPendenteOuCancelada(venda) {
  return venda.status !== 3 && venda.status !== 4;
}

// Bug real corrigido (19/08/2026): o valor do banco às vezes vem SEM
// indicar o fuso (sem "Z" no final) — é UTC de verdade, mas sem o "Z" o
// navegador tenta adivinhar o fuso sozinho e erra o horário. Força UTC no
// valor bruto antes de converter pro fuso de Brasília.
function formatarHora(dataIso) {
  if (!dataIso) return "";
  const jaTemFuso = /[Zz]|[+-]\d{2}:\d{2}$/.test(dataIso);
  return new Date(jaTemFuso ? dataIso : `${dataIso}Z`).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
}

// Pedido do usuário (12/08/2026): 3 colunas separadas por forma de
// pagamento, nessa ordem — cada coluna já ordenada do horário mais
// antigo pro mais novo (a lista inteira já vem ordenada assim antes de
// agrupar).
const ORDEM_FORMAS_PAGAMENTO = ["Cartão de débito", "Cartão de crédito", "PIX"];

function agruparPorFormaPagamento(vendas) {
  const grupos = new Map();

  vendas.forEach((venda) => {
    const forma = venda.forma_pagamento || "Outro";

    if (!grupos.has(forma)) {
      grupos.set(forma, []);
    }

    grupos.get(forma).push(venda);
  });

  const formasOrdenadas = [
    ...ORDEM_FORMAS_PAGAMENTO.filter((forma) => grupos.has(forma)),
    ...[...grupos.keys()].filter(
      (forma) => !ORDEM_FORMAS_PAGAMENTO.includes(forma)
    ),
  ];

  return formasOrdenadas.map((forma) => ({
    forma,
    vendas: grupos.get(forma),
  }));
}

function VendasSaipos({ lojas = [], ehAdministrador = false }) {
  const lojasComSaipos = lojas.filter((loja) => loja.saipos_id_store);

  const [lojaId, setLojaId] = useState(
    lojasComSaipos[0] ? String(lojasComSaipos[0].id) : ""
  );
  const [data, setData] = useState(hoje());
  const [resumo, setResumo] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [atualizadoEm, setAtualizadoEm] = useState(null);
  // Pedido do usuário (19/08/2026): a importação automática das 5h pode
  // falhar (rede, servidor reiniciando na hora) e antes não tinha nenhum
  // jeito de forçar de novo sem mexer direto no banco — esse botão chama
  // a mesma importação que roda sozinha todo dia, só que na hora, pra
  // qualquer data.
  const [importando, setImportando] = useState(false);
  const [resultadoImportacao, setResultadoImportacao] = useState("");
  // Pedido do usuário (12/08/2026): vendas caindo na PagSeguro em tempo
  // real, direto nessa tela — em ordem cronológica única (não separada
  // por forma de pagamento como na Conciliação).
  const [vendasPagSeguro, setVendasPagSeguro] = useState([]);
  const [erroPagSeguro, setErroPagSeguro] = useState("");

  // Acompanha qual era "hoje" da última vez que checamos — serve pra saber
  // se a pessoa está vendo o dia atual (e por isso a data deve virar sozinha
  // à meia-noite) ou se escolheu um dia antigo de propósito (e nesse caso não
  // deve mexer na data escolhida por ela).
  const diaSeguidoRef = useRef(hoje());

  async function buscar() {
    if (!lojaId) return;

    setCarregando(true);
    setErro("");

    try {
      const resultado = await buscarFechamentoSaipos(lojaId, data);
      setResumo(resultado);
      setAtualizadoEm(new Date());
    } catch (erroBusca) {
      setErro(
        erroBusca.message || "Não foi possível buscar as vendas na Saipos."
      );
    } finally {
      setCarregando(false);
    }

    // Independente da Saipos — se uma falhar não trava a outra.
    setErroPagSeguro("");

    try {
      const resultadoPagSeguro = await buscarVendasPagSeguro(data, data);
      const ordenadas = (resultadoPagSeguro?.ultimas_vendas || [])
        .slice()
        .sort((a, b) => new Date(a.data) - new Date(b.data));
      setVendasPagSeguro(ordenadas);
    } catch (erroBusca) {
      setErroPagSeguro(
        erroBusca.message || "Não foi possível buscar as vendas na PagSeguro."
      );
    }
  }

  async function importarAgora() {
    if (!lojaId) return;

    setImportando(true);
    setResultadoImportacao("");

    try {
      const resultado = await importarReceitasSaipos(lojaId, data);
      setResultadoImportacao(
        `✅ ${resultado.criados?.length || 0} venda(s) importada(s), ${resultado.atualizados?.length || 0} atualizada(s).`
      );
      buscar();
    } catch (erroImportacao) {
      setResultadoImportacao(
        `❌ ${erroImportacao.message || "Não foi possível importar."}`
      );
    } finally {
      setImportando(false);
    }
  }

  useEffect(() => {
    if (!lojaId) return;

    buscar();

    const intervalo = setInterval(() => {
      const hojeAgora = hoje();

      if (hojeAgora !== diaSeguidoRef.current) {
        const estavaSeguindoHoje = data === diaSeguidoRef.current;
        diaSeguidoRef.current = hojeAgora;

        if (estavaSeguindoHoje) {
          setData(hojeAgora);
          return; // o efeito reinicia sozinho por causa da dependência [data]
        }
      }

      buscar();
    }, INTERVALO_ATUALIZACAO_MS);

    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojaId, data]);

  const formasPagamento = Object.entries(
    resumo?.totais_por_forma_pagamento || {}
  );

  const canais = Object.entries(resumo?.totais_por_canal || {});
  const quantidadePorCanal = resumo?.quantidade_por_canal || {};

  return (
    <section className="categorias-layout">
      <article className="panel categoria-form-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Integração Saipos</span>
            <h2>Vendas em tempo real</h2>
          </div>
        </div>

        {lojasComSaipos.length === 0 ? (
          <div className="empty-state">
            Nenhuma loja tem o ID da Saipos cadastrado ainda. Configure em
            Lojas → Editar.
          </div>
        ) : (
          <>
            <label>
              Loja
              <select
                value={lojaId}
                onChange={(evento) => setLojaId(evento.target.value)}
              >
                {lojasComSaipos.map((loja) => (
                  <option key={loja.id} value={loja.id}>
                    {loja.nome}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Data
              <input
                type="date"
                value={data}
                onChange={(evento) => setData(evento.target.value)}
              />
            </label>

            <button
              type="button"
              className="primary-button"
              onClick={buscar}
              disabled={carregando}
            >
              {carregando ? "Buscando..." : "🔄 Atualizar agora"}
            </button>

            <small className="foto-ajuda">
              Atualiza sozinho a cada 1 minuto. {atualizadoEm && (
                <>Última atualização: {atualizadoEm.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })}.</>
              )}
            </small>

            <small className="foto-ajuda">
              As vendas entram como receita automaticamente todo dia às
              05h — não precisa clicar em nada.
            </small>

            {ehAdministrador && (
              <>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={importarAgora}
                  disabled={importando}
                  style={{ marginTop: 8 }}
                >
                  {importando
                    ? "Importando..."
                    : "⬇️ Importar vendas dessa data agora (admin)"}
                </button>

                <small className="foto-ajuda">
                  Use se a importação automática das 5h falhar ou atrasar —
                  importa as vendas da data escolhida acima como receita,
                  igual a rotina automática faz sozinha todo dia.
                  {resultadoImportacao && <> {resultadoImportacao}</>}
                </small>
              </>
            )}
          </>
        )}
      </article>

      <article className="panel categoria-lista-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Resumo do dia</span>
            <h2>Direto da Saipos</h2>
          </div>
        </div>

        {erro ? (
          <div className="empty-state">{erro}</div>
        ) : !resumo ? (
          <div className="empty-state">
            {carregando ? "Buscando..." : "Selecione a loja e a data."}
          </div>
        ) : (
          <div className="categorias-lista">
            <div className="categoria-item">
              <div className="categoria-identificacao">
                <div className="categoria-icone">💰</div>
                <div>
                  <strong>Total vendido</strong>
                  <div>{formatarMoeda(resumo.total_vendas)}</div>
                </div>
              </div>
            </div>

            <div className="categoria-item">
              <div className="categoria-identificacao">
                <div className="categoria-icone">🧾</div>
                <div>
                  <strong>Vendas</strong>
                  <div>
                    {resumo.quantidade_vendas} válidas
                    {resumo.quantidade_canceladas > 0 &&
                      ` · ${resumo.quantidade_canceladas} canceladas`}
                  </div>
                </div>
              </div>
            </div>

            {canais.length > 0 && (
              <div className="categoria-item categoria-item-titulo">
                <strong>Por canal de venda</strong>
              </div>
            )}

            {canais.map(([canal, valor]) => (
              <div className="categoria-item" key={canal}>
                <div className="categoria-identificacao">
                  <div className="categoria-icone">📦</div>
                  <div>
                    <strong>{canal}</strong>
                    <div>
                      {formatarMoeda(valor)}
                      {quantidadePorCanal[canal] != null &&
                        ` · ${quantidadePorCanal[canal]} venda${
                          quantidadePorCanal[canal] === 1 ? "" : "s"
                        }`}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {formasPagamento.length > 0 && (
              <div className="categoria-item categoria-item-titulo">
                <strong>Por forma de pagamento</strong>
              </div>
            )}

            {formasPagamento.map(([forma, valor]) => (
              <div className="categoria-item" key={forma}>
                <div className="categoria-identificacao">
                  <div className="categoria-icone">💳</div>
                  <div>
                    <strong>{forma}</strong>
                    <div>{formatarMoeda(valor)}</div>
                  </div>
                </div>
              </div>
            ))}

            <div className="categoria-item">
              <div className="categoria-identificacao">
                <div className="categoria-icone">📑</div>
                <div>
                  <strong>Lançamentos financeiros (saldo)</strong>
                  <div>
                    {formatarMoeda(resumo.total_lancamentos_financeiros)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </article>

      <article className="panel categoria-lista-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">PagSeguro em tempo real</span>
            <h2>Crédito, Débito e PIX — do horário mais antigo pro mais novo</h2>
          </div>
        </div>

        {erroPagSeguro ? (
          <div className="empty-state">{erroPagSeguro}</div>
        ) : vendasPagSeguro.length === 0 ? (
          <div className="empty-state">
            {carregando ? "Buscando..." : "Nenhuma venda encontrada nesse dia."}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              // Fixo em 3 colunas (não auto-fit) — pedido do usuário: Débito,
              // Crédito e PIX sempre lado a lado na mesma linha, nunca uma
              // quebrando pra linha de baixo.
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "1rem",
            }}
          >
            {agruparPorFormaPagamento(vendasPagSeguro).map((grupo) => {
              // Mesma correção da Conciliação: o contador não pode misturar
              // pendente/cancelada com o que realmente efetivou (o valor em
              // R$ já estava certo, só a contagem exibida estava errada).
              const efetivadas = grupo.vendas.filter(
                (venda) => !estaPendenteOuCancelada(venda)
              ).length;
              const naoEfetivadas = grupo.vendas.length - efetivadas;

              return (
              <div key={grupo.forma}>
                <div style={{ marginBottom: "10px" }}>
                  <strong style={{ color: "#16ca50" }}>{grupo.forma}</strong>{" "}
                  <span>
                    ({efetivadas}
                    {naoEfetivadas > 0 && ` · ${naoEfetivadas} pend./canc.`})
                  </span>
                </div>

                <div className="categorias-lista">
                  {grupo.vendas.map((venda) => {
                    const pendenteOuCancelada = estaPendenteOuCancelada(venda);

                    return (
                      <div className="categoria-item" key={venda.codigo}>
                        <div className="categoria-identificacao">
                          <div className="categoria-icone">
                            {pendenteOuCancelada ? "⚠️" : "💰"}
                          </div>

                          <div>
                            <strong
                              style={
                                pendenteOuCancelada
                                  ? { color: "#ff4655" }
                                  : undefined
                              }
                            >
                              {formatarMoeda(venda.valor_bruto)}
                            </strong>{" "}
                            <small style={{ color: "#9fb0c4", fontSize: "11px" }}>
                              (taxa{" "}
                              {formatarMoeda(
                                venda.valor_bruto - venda.valor_liquido
                              )}
                              ) #{venda.codigo?.slice(-8)}
                            </small>
                            <div
                              style={
                                pendenteOuCancelada
                                  ? { color: "#ff4655" }
                                  : undefined
                              }
                            >
                              {formatarHora(venda.data)}
                              {pendenteOuCancelada &&
                                ` · ${venda.status_descricao}`}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </article>
    </section>
  );
}

export default VendasSaipos;
