import { useEffect, useMemo, useState } from "react";

// Pedido do usuário (25/08/2026): "Feed do Dia" / "Lançamentos ao Vivo" —
// lista todos os lançamentos (despesas e receitas) em ordem cronológica,
// estilo chat/feed, atualizando sozinho em tempo real (reaproveita o
// state "lancamentos" de App.jsx, que já é sincronizado por realtime do
// Supabase — não precisa de um canal novo aqui).

function hojeLocal() {
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

function formatarHorario(dataIso) {
  if (!dataIso) return "";
  try {
    return new Date(dataIso).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

// Cache simples em memória (fora do componente, sobrevive entre
// re-renders e entre cards) — evita buscar a MESMA foto de novo se o
// card sair e voltar a aparecer (ex: trocou de filtro e voltou).
const cacheDeFotos = new Map();

function CardLancamento({ item, nomeLoja, buscarFoto, aoAmpliar }) {
  const [foto, setFoto] = useState(cacheDeFotos.get(item.id) || null);
  const [carregandoFoto, setCarregandoFoto] = useState(false);
  const [erroFoto, setErroFoto] = useState(false);

  useEffect(() => {
    if (!item.tem_foto || foto || erroFoto) return;

    let cancelado = false;
    setCarregandoFoto(true);

    buscarFoto(item.id)
      .then((resultado) => {
        if (cancelado) return;
        const fotoLida = resultado?.foto || null;
        if (fotoLida) {
          cacheDeFotos.set(item.id, fotoLida);
          setFoto(fotoLida);
        } else {
          setErroFoto(true);
        }
      })
      .catch(() => {
        if (!cancelado) setErroFoto(true);
      })
      .finally(() => {
        if (!cancelado) setCarregandoFoto(false);
      });

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.tem_foto]);

  const ehDespesa = item.tipo === "despesa";

  return (
    <div className="feed-card">
      <button
        type="button"
        className="feed-card-foto"
        onClick={() => foto && aoAmpliar(foto)}
        disabled={!foto}
        title={foto ? "Ver comprovante ampliado" : undefined}
      >
        {item.tem_foto ? (
          carregandoFoto ? (
            <span className="feed-foto-placeholder">⏳</span>
          ) : foto ? (
            <img src={foto} alt="Comprovante" />
          ) : (
            <span className="feed-foto-placeholder">📷</span>
          )
        ) : (
          <span className="feed-foto-placeholder feed-foto-vazia">
            {ehDespesa ? "💸" : "💰"}
          </span>
        )}
      </button>

      <div className="feed-card-info">
        <div className="feed-card-topo">
          <span className={`feed-valor feed-valor-${item.tipo}`}>
            {ehDespesa ? "− " : "+ "}
            {formatarMoeda(item.valor)}
          </span>
          <span className="feed-horario">
            {formatarHorario(item.created_at || item.data)}
          </span>
        </div>

        <strong className="feed-card-titulo">
          {item.fornecedor || item.descricao || "Sem descrição"}
        </strong>

        <span className="feed-categoria">
          {[item.categoria, item.subcategoria].filter(Boolean).join(" — ") ||
            "Sem categoria"}
        </span>

        <div className="feed-card-rodape">
          <span>🏬 {nomeLoja || "Sem loja"}</span>
          <span>👤 {item.criado_por || "—"}</span>
        </div>
      </div>
    </div>
  );
}

function FeedLancamentos({
  lancamentos = [],
  lojas = [],
  lojaPadrao = null,
  buscarFoto,
  notificacaoStatus,
  ativarNotificacao,
  desativarNotificacao,
}) {
  const [filtroLoja, setFiltroLoja] = useState(
    lojaPadrao ? String(lojaPadrao) : "todas"
  );
  const [filtroData, setFiltroData] = useState(hojeLocal());
  const [fotoAmpliada, setFotoAmpliada] = useState(null);

  const itensFiltrados = useMemo(() => {
    return lancamentos
      .filter(
        (item) =>
          filtroLoja === "todas" || String(item.loja_id) === filtroLoja
      )
      .filter((item) => !filtroData || item.data === filtroData)
      .slice()
      .sort(
        (a, b) =>
          new Date(b.created_at || b.data) - new Date(a.created_at || a.data)
      );
  }, [lancamentos, filtroLoja, filtroData]);

  const totalDespesas = itensFiltrados
    .filter((item) => item.tipo === "despesa")
    .reduce((soma, item) => soma + Number(item.valor || 0), 0);

  const totalReceitas = itensFiltrados
    .filter((item) => item.tipo === "receita")
    .reduce((soma, item) => soma + Number(item.valor || 0), 0);

  return (
    <section className="panel feed-panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">Tempo real</span>
          <h2>📢 Feed do Dia</h2>
        </div>

        {notificacaoStatus && (
          <button
            type="button"
            className={
              notificacaoStatus === "ativa"
                ? "secondary-button"
                : "primary-button"
            }
            onClick={
              notificacaoStatus === "ativa"
                ? desativarNotificacao
                : ativarNotificacao
            }
          >
            {notificacaoStatus === "ativa"
              ? "🔕 Desativar notificações"
              : notificacaoStatus === "indisponivel"
              ? "🔕 Notificações indisponíveis nesse navegador"
              : "🔔 Ativar notificações"}
          </button>
        )}
      </div>

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

        <input
          type="date"
          value={filtroData}
          onChange={(evento) => setFiltroData(evento.target.value)}
        />

        {filtroData && (
          <button
            type="button"
            className="secondary-button"
            onClick={() => setFiltroData("")}
          >
            Ver todas as datas
          </button>
        )}
      </div>

      <div className="feed-resumo">
        <span>
          {itensFiltrados.length} lançamento(s) — 💸{" "}
          {formatarMoeda(totalDespesas)} · 💰 {formatarMoeda(totalReceitas)}
        </span>
      </div>

      <div className="feed-lista">
        {itensFiltrados.length === 0 ? (
          <p className="feed-vazio">
            Nenhum lançamento encontrado com esse filtro.
          </p>
        ) : (
          itensFiltrados.map((item) => (
            <CardLancamento
              key={item.id}
              item={item}
              nomeLoja={
                lojas.find((loja) => String(loja.id) === String(item.loja_id))
                  ?.nome
              }
              buscarFoto={buscarFoto}
              aoAmpliar={setFotoAmpliada}
            />
          ))
        )}
      </div>

      {fotoAmpliada && (
        <div
          className="modal-overlay"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget) {
              setFotoAmpliada(null);
            }
          }}
        >
          <div className="modal modal-foto">
            <img
              src={fotoAmpliada}
              alt="Comprovante ampliado"
              className="foto-modal-imagem"
            />
            <button
              type="button"
              className="secondary-button"
              onClick={() => setFotoAmpliada(null)}
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default FeedLancamentos;
