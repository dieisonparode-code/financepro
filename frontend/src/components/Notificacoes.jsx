// Pedido do usuário (21/08/2026): notificação em tempo real na tela,
// visível em qualquer página do sistema — venda cancelada (Saipos) e
// lançamento excluído. Fica fixo no canto da tela, empilha várias e
// some sozinho depois de um tempo (mas dá pra fechar na mão também).
function Notificacoes({ notificacoes = [], fechar }) {
  if (notificacoes.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        maxWidth: 360,
      }}
    >
      {notificacoes.map((notificacao) => (
        <div
          key={notificacao.id}
          style={{
            background: "#1b2333",
            border: `1px solid ${notificacao.cor || "#ff9800"}`,
            borderLeft: `4px solid ${notificacao.cor || "#ff9800"}`,
            borderRadius: 8,
            padding: "12px 14px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
            color: "#fff",
            fontSize: 14,
            animation: "notificacao-entrar 0.25s ease-out",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 8,
            }}
          >
            <strong>{notificacao.titulo}</strong>
            <button
              type="button"
              onClick={() => fechar(notificacao.id)}
              style={{
                background: "none",
                border: "none",
                color: "#9fb0c4",
                cursor: "pointer",
                fontSize: 14,
                lineHeight: 1,
                padding: 0,
              }}
            >
              ✖️
            </button>
          </div>
          <div style={{ marginTop: 4, color: "#c7d2e0" }}>
            {notificacao.mensagem}
          </div>
        </div>
      ))}

      <style>{`
        @keyframes notificacao-entrar {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

export default Notificacoes;
