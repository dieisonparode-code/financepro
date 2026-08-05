import { useState, useRef, useEffect } from "react";

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
            onClick={sair}
          >
            Sair
          </button>
        </div>
      )}
    </div>
  );
}

export default UserMenu;
