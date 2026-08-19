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
};

// Bug real corrigido (19/08/2026): sem forçar o fuso de Brasília, mostrava
// o horário do fuso do dispositivo/servidor (ex: 3h adiantado se estiver
// em UTC) — mesma correção aplicada em Contas Pagas.
function formatarDataHora(dataIso) {
  if (!dataIso) return "";
  return new Date(dataIso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
}

function LogAuditoria() {
  const [registros, setRegistros] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

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

  return (
    <section className="categorias-layout">
      <article className="panel categoria-lista-panel" style={{ gridColumn: "1 / -1" }}>
        <div className="panel-header">
          <div>
            <span className="eyebrow">Auditoria</span>
            <h2>Log de Auditoria</h2>
          </div>

          <strong>{registros.length}</strong>
        </div>

        <small className="foto-ajuda">
          Registra automaticamente quem criou, editou, excluiu, aprovou,
          rejeitou ou pagou cada lançamento, conta a pagar, loja ou usuário.
          Mostra os últimos 500 eventos.
        </small>

        {carregando ? (
          <div className="empty-state">Carregando...</div>
        ) : erro ? (
          <div className="empty-state">{erro}</div>
        ) : registros.length === 0 ? (
          <div className="empty-state">Nenhum evento registrado ainda.</div>
        ) : (
          <div className="categorias-lista">
            {registros.map((registro) => (
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
