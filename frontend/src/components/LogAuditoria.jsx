import { useEffect, useState } from "react";
import { buscarLogAuditoria } from "../services/api";

const rotulosAcao = {
  criou: "🟢 Criou",
  editou: "🟡 Editou",
  excluiu: "🔴 Excluiu",
  aprovou: "✅ Aprovou",
  rejeitou: "❌ Rejeitou",
  pagou: "💸 Marcou como pago",
};

const rotulosTabela = {
  lancamentos: "Lançamento",
  contas_pagar: "Conta a Pagar",
  lojas: "Loja",
  usuarios: "Usuário",
  fundo_retiradas_caixa: "Fundo de Retirada (Cofre)",
  retiradas_socios: "Retirada de Sócio",
};

// Bug real corrigido (19/08/2026): o valor do banco às vezes vem SEM
// indicar o fuso (sem "Z" no final) — é UTC de verdade, mas sem o "Z" o
// navegador tenta adivinhar o fuso sozinho e erra o horário. Força UTC no
// valor bruto antes de converter pro fuso de Brasília.
function formatarDataHora(dataIso) {
  if (!dataIso) return "";
  const jaTemFuso = /[Zz]|[+-]\d{2}:\d{2}$/.test(dataIso);
  return new Date(jaTemFuso ? dataIso : `${dataIso}Z`).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
}

function LogAuditoria() {
  const [registros, setRegistros] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  // Pedido do usuário (23/08/2026): a lista só tinha os últimos 500 eventos
  // soltos, sem jeito de achar um específico (ex: rastrear por que o Cofre
  // mudou de valor) — busca por usuário, ação, tabela ou o texto do
  // "detalhes" (onde fica a descrição/valor de cada evento).
  const [busca, setBusca] = useState("");

  useEffect(() => {
    async function carregar() {
      try {
        setCarregando(true);
        const dados = await buscarLogAuditoria();
        setRegistros(Array.isArray(dados) ? dados : []);
      } catch (erroCarregar) {
        setErro(erroCarregar.message || "Não foi possível carregar o log.");
      } finally {
        setCarregando(false);
      }
    }

    carregar();
  }, []);

  const buscaLimpa = busca.trim().toLowerCase();

  const registrosFiltrados = buscaLimpa
    ? registros.filter((registro) =>
        [
          registro.usuario_nome,
          rotulosAcao[registro.acao] || registro.acao,
          rotulosTabela[registro.tabela_afetada] || registro.tabela_afetada,
          registro.detalhes,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(buscaLimpa)
      )
    : registros;

  return (
    <section className="categorias-layout">
      <article className="panel categoria-lista-panel" style={{ gridColumn: "1 / -1" }}>
        <div className="panel-header">
          <div>
            <span className="eyebrow">Auditoria</span>
            <h2>Log de Auditoria</h2>
          </div>

          <strong>{registrosFiltrados.length}</strong>
        </div>

        <small className="foto-ajuda">
          Registra automaticamente quem criou, editou, excluiu, aprovou,
          rejeitou ou pagou cada lançamento, conta a pagar, loja ou usuário.
          Mostra os últimos 500 eventos.
        </small>

        <div style={{ margin: "10px 0" }}>
          <input
            type="text"
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="🔍 Buscar por usuário, ação, tabela ou descrição (ex: cofre, fundo de retirada)"
          />
        </div>

        {carregando ? (
          <div className="empty-state">Carregando...</div>
        ) : erro ? (
          <div className="empty-state">{erro}</div>
        ) : registros.length === 0 ? (
          <div className="empty-state">Nenhum evento registrado ainda.</div>
        ) : registrosFiltrados.length === 0 ? (
          <div className="empty-state">Nenhum resultado pra "{busca.trim()}".</div>
        ) : (
          <div className="categorias-lista">
            {registrosFiltrados.map((registro) => (
              <div className="categoria-item" key={registro.id}>
                <div className="categoria-identificacao">
                  <div className="categoria-icone">📝</div>

                  <div>
                    <strong>
                      {registro.usuario_nome || "Desconhecido"} —{" "}
                      {rotulosAcao[registro.acao] || registro.acao}{" "}
                      {rotulosTabela[registro.tabela_afetada] ||
                        registro.tabela_afetada}
                    </strong>

                    <div>{formatarDataHora(registro.criado_em)}</div>

                    {registro.detalhes && <div>{registro.detalhes}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

export default LogAuditoria;
