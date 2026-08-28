import { useMemo, useState } from "react";

// Pedido do usuário (26/08/2026): "fica somente o extrato doque foi
// pago com dinheiro do cofre, fica tudo entre entradas e saidas mas
// so do cofre" — tela dedicada só com o movimento do Cofre: entradas
// (🔒 Retirada pro Cofre, dinheiro que entrou lá) e saídas (despesas
// pagas com dinheiro do Cofre, total ou parcial). Não busca nada novo
// no backend — reaproveita "fundosRetiradas" e "lancamentos", que a
// App.jsx já mantém sincronizados.
function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarData(data) {
  if (!data) return "Sem data";
  return new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR");
}

// Data + horário a partir do timestamp de criação (criado_em / created_at).
// Se não houver timestamp, cai pra só a data do movimento.
// Bug real já visto no sistema (19/08/2026): o timestamp do banco às vezes
// vem SEM o "Z" de fuso — é UTC de verdade, mas sem o "Z" o navegador
// adivinha o fuso e erra a hora. Força UTC antes de converter pra Brasília,
// mesma regra de LogAuditoria.jsx / CadastroFechamentoCaixa.jsx.
function formatarDataHora(criadoEm, dataFallback) {
  if (!criadoEm) return formatarData(dataFallback);
  const ts = paraTimestamp(criadoEm);
  if (ts == null) return formatarData(dataFallback);
  return new Date(ts).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Mesmo cuidado de fuso do formatarDataHora, mas devolve o timestamp em ms
// (pra comparar horários entre si). null se não der pra ler.
function paraTimestamp(valorIso) {
  if (!valorIso) return null;
  const jaTemFuso = /[Zz]|[+-]\d{2}:\d{2}$/.test(valorIso);
  const ms = new Date(jaTemFuso ? valorIso : `${valorIso}Z`).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function ExtratoCofre({
  fundosRetiradas = [],
  lancamentos = [],
  fechamentosCaixa = [],
  lojas = [],
  lojaPadrao = null,
}) {
  const [filtroLoja, setFiltroLoja] = useState(
    lojaPadrao ? String(lojaPadrao) : "todas"
  );

  const nomeLoja = (lojaId) =>
    lojas.find((loja) => String(loja.id) === String(lojaId))?.nome;

  // Só conta como Cofre de verdade quem veio pelo botão dedicado
  // "🔒 Retirada pro Cofre" (conta_para_cofre = true) — mesma regra já
  // usada no card do Dashboard, pra não misturar com retirada genérica.
  const entradas = useMemo(() => {
    return fundosRetiradas
      .filter(
        (fundo) =>
          fundo.conta_para_cofre !== false &&
          (filtroLoja === "todas" || String(fundo.loja_id || "") === filtroLoja)
      )
      .map((fundo) => ({
        id: `entrada-${fundo.id}`,
        tipo: "entrada",
        data: fundo.data,
        criado_em: fundo.criado_em || fundo.created_at,
        criado_por: fundo.criado_por || "",
        valor: Number(fundo.valor || 0),
        descricao: fundo.descricao || "Retirada pro Cofre",
        loja_id: fundo.loja_id,
      }));
  }, [fundosRetiradas, filtroLoja]);

  const saidas = useMemo(() => {
    return lancamentos
      .filter(
        (item) =>
          item.tipo === "despesa" &&
          item.fundo_retirada_id &&
          Number(item.valor_pago_cofre || 0) > 0 &&
          (filtroLoja === "todas" || String(item.loja_id || "") === filtroLoja)
      )
      .map((item) => ({
        id: `saida-${item.id}`,
        tipo: "saida",
        data: item.data,
        criado_em: item.criado_em || item.created_at,
        criado_por: item.criado_por || "",
        valor: Number(item.valor_pago_cofre || 0),
        descricao: item.fornecedor || item.descricao || "Despesa paga com o Cofre",
        parcial: Number(item.valor_pago_cofre || 0) < Number(item.valor || 0) - 0.01,
        valorTotalDespesa: Number(item.valor || 0),
        loja_id: item.loja_id,
      }));
  }, [lancamentos, filtroLoja]);

  const movimento = useMemo(() => {
    return [...entradas, ...saidas].sort(
      (a, b) =>
        (paraTimestamp(b.criado_em) ?? new Date(`${b.data}T12:00:00`).getTime()) -
        (paraTimestamp(a.criado_em) ?? new Date(`${a.data}T12:00:00`).getTime())
    );
  }, [entradas, saidas]);

  // "Referente a qual abertura de caixa" — os registros do Cofre não têm
  // link direto com um turno, mas os registros de Fechamento de Caixa da
  // Conciliação gravam a data oficial de abertura do turno
  // (data_abertura_turno). Como a Retirada pro Cofre é feita junto com o
  // fechamento, dá pra achar o turno pegando o Fechamento da MESMA loja com
  // horário de criação mais próximo do movimento (até ~36h). Sem match
  // confiável, mostra a data do próprio movimento.
  const turnosPorLoja = useMemo(() => {
    return fechamentosCaixa
      .filter((f) => f.data_abertura_turno)
      .map((f) => ({
        loja_id: f.loja_id,
        turno: f.data_abertura_turno,
        ts: paraTimestamp(f.criado_em || f.created_at),
      }))
      .filter((f) => f.ts != null);
  }, [fechamentosCaixa]);

  const aberturaCaixaDe = (item) => {
    const alvo = paraTimestamp(item.criado_em);
    if (alvo != null) {
      const LIMITE = 24 * 60 * 60 * 1000;
      let melhor = null;
      for (const t of turnosPorLoja) {
        if (String(t.loja_id) !== String(item.loja_id)) continue;
        const dist = Math.abs(t.ts - alvo);
        if (dist <= LIMITE && (!melhor || dist < melhor.dist)) {
          melhor = { turno: t.turno, dist };
        }
      }
      if (melhor) return { data: melhor.turno, exato: true };
    }
    return { data: item.data, exato: false };
  };

  const totalEntradas = entradas.reduce((soma, item) => soma + item.valor, 0);
  const totalSaidas = saidas.reduce((soma, item) => soma + item.valor, 0);
  const saldoCofre = totalEntradas - totalSaidas;

  return (
    <section className="categorias-layout">
      <article className="panel categoria-lista-panel" style={{ gridColumn: "1 / -1" }}>
        <div className="panel-header">
          <div>
            <span className="eyebrow">Cofre</span>
            <h2>🔒 Extrato do Cofre</h2>
          </div>

          <strong>{formatarMoeda(saldoCofre)}</strong>
        </div>

        <small className="foto-ajuda">
          Só o que entrou pelo botão "🔒 Retirada pro Cofre" (entrada) e o
          que foi pago com dinheiro do Cofre em despesas (saída) — nada de
          Saldo geral aparece aqui.
        </small>

        {lojas.length > 0 && (
          <div className="feed-filtros">
            <select
              value={filtroLoja}
              onChange={(evento) => setFiltroLoja(evento.target.value)}
            >
              <option value="todas">Todas as lojas</option>
              {lojas.map((loja) => (
                <option key={loja.id} value={String(loja.id)}>
                  {loja.nome}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="feed-resumo">
          <span>
            📥{" "}
            <strong className="tipo-receita">
              Entradas {formatarMoeda(totalEntradas)}
            </strong>{" "}
            · 📤{" "}
            <strong className="tipo-despesa">
              Saídas {formatarMoeda(totalSaidas)}
            </strong>
          </span>
        </div>

        {movimento.length === 0 ? (
          <div className="empty-state">
            Nenhuma entrada ou saída do Cofre ainda.
          </div>
        ) : (
          <div className="categorias-lista">
            {movimento.map((item) => {
              const abertura = aberturaCaixaDe(item);
              const corTipo = item.tipo === "entrada" ? "#16ca50" : "#ff4655";
              return (
              <div
                className="categoria-item"
                key={item.id}
                style={{
                  borderLeft: `4px solid ${corTipo}`,
                  background:
                    item.tipo === "entrada"
                      ? "rgba(22, 202, 80, .09)"
                      : "rgba(255, 70, 85, .09)",
                }}
              >
                <div className="categoria-identificacao">
                  <div className="categoria-icone">
                    {item.tipo === "entrada" ? "📥" : "📤"}
                  </div>
                  <div>
                    <strong
                      className={
                        item.tipo === "entrada" ? "tipo-receita" : "tipo-despesa"
                      }
                    >
                      {item.tipo === "entrada"
                        ? "+ (entrada no Cofre) "
                        : "− (saída do Cofre) "}
                      {formatarMoeda(item.valor)}
                    </strong>
                    <div>
                      {item.descricao} — {formatarDataHora(item.criado_em, item.data)}
                    </div>
                    <div>
                      <small style={{ color: "#9fb0c4" }}>
                        🗓️ Abertura de caixa: {formatarData(abertura.data)}
                        {!abertura.exato && " (dia do lançamento)"}
                      </small>
                    </div>
                    <div>
                      <small style={{ color: "#9fb0c4" }}>
                        {item.tipo === "entrada" ? "Entrada" : "Saída"} informada por{" "}
                        {item.criado_por || "não informado"}
                      </small>
                    </div>
                    {item.tipo === "saida" && item.parcial && (
                      <small style={{ color: "#9fb0c4" }}>
                        Pago parcial: {formatarMoeda(item.valor)} do Cofre +{" "}
                        {formatarMoeda(item.valorTotalDespesa - item.valor)}{" "}
                        do Saldo geral (conta de {formatarMoeda(item.valorTotalDespesa)})
                      </small>
                    )}
                    {item.loja_id && lojas.length > 0 && (
                      <div>
                        <small style={{ color: "#9fb0c4" }}>
                          {nomeLoja(item.loja_id)}
                        </small>
                      </div>
                    )}
                  </div>
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

export default ExtratoCofre;
