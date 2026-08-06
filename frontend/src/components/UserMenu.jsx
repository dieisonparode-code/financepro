import { useState, useRef, useEffect } from "react";
import { supabase } from "../services/supabaseClient";

function obterIniciais(email) {
  if (!email) return "?";

  const nomeLocal = email.split("@")[0];
  const partes = nomeLocal.split(/[._-]/).filter(Boolean);

  if (partes.length >= 2) {
    return (partes[0][0] + partes[1][0]).toUpperCase();
  }

  return nomeLocal.slice(0, 2).toUpperCase();
}

function UserMenu({ usuario, sair }) {
  const [aberto, setAberto] = useState(false);
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const referencia = useRef(null);

  useEffect(() => {
    function aoClicarFora(evento) {
      if (referencia.current && !referencia.current.contains(evento.target)) {
        setAberto(false);
      }
    }

    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  function abrirTrocaSenha() {
    setAberto(false);
    setNovaSenha("");
    setConfirmarSenha("");
    setTrocandoSenha(true);
  }

  async function salvarNovaSenha(evento) {
    evento.preventDefault();

    if (novaSenha.length < 6) {
      alert("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    if (novaSenha !== confirmarSenha) {
      alert("As senhas não são iguais.");
      return;
    }

    setSalvandoSenha(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: novaSenha,
      });

      if (error) {
        throw error;
      }

      alert("Senha alterada com sucesso!");
      setTrocandoSenha(false);
    } catch (erro) {
      alert(erro.message || "Não foi possível trocar a senha.");
    } finally {
      setSalvandoSenha(false);
    }
  }

  return (
    <div className="user-menu" ref={referencia}>
      <button
        type="button"
        className="user-menu-avatar"
        onClick={() => setAberto((valor) => !valor)}
        aria-label="Conta"
        aria-expanded={aberto}
      >
        {obterIniciais(usuario?.email)}
      </button>

      {aberto && (
        <div className="user-menu-dropdown">
          <span className="user-menu-email">{usuario?.email}</span>

          <button
            type="button"
            className="user-menu-sair"
            onClick={abrirTrocaSenha}
          >
            Trocar senha
          </button>

          <button
            type="button"
            className="user-menu-sair"
            onClick={sair}
          >
            Sair
          </button>
        </div>
      )}

      {trocandoSenha && (
        <div
          className="modal-overlay"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget) {
              setTrocandoSenha(false);
            }
          }}
        >
          <div className="modal">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Segurança</span>
                <h2>Trocar minha senha</h2>
              </div>

              <button
                type="button"
                className="close-button"
                onClick={() => setTrocandoSenha(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={salvarNovaSenha}>
              <label>
                Nova senha
                <input
                  type="password"
                  value={novaSenha}
                  onChange={(evento) => setNovaSenha(evento.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
                />
              </label>

              <label>
                Confirmar nova senha
                <input
                  type="password"
                  value={confirmarSenha}
                  onChange={(evento) =>
                    setConfirmarSenha(evento.target.value)
                  }
                  placeholder="Digite de novo"
                  autoComplete="new-password"
                />
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setTrocandoSenha(false)}
                  disabled={salvandoSenha}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={salvandoSenha}
                >
                  {salvandoSenha ? "Salvando..." : "Salvar nova senha"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserMenu;
