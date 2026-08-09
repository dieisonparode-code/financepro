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

  // Verificação em duas etapas (2FA/TOTP via Supabase Auth).
  const [mostrarMfa, setMostrarMfa] = useState(false);
  const [carregandoFatores, setCarregandoFatores] = useState(false);
  const [fatoresMfa, setFatoresMfa] = useState([]);
  const [dadosEnroll, setDadosEnroll] = useState(null);
  const [codigoEnroll, setCodigoEnroll] = useState("");
  const [confirmandoEnroll, setConfirmandoEnroll] = useState(false);
  const [erroMfa, setErroMfa] = useState("");
  const [desativandoId, setDesativandoId] = useState(null);

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

  async function abrirMfa() {
    setAberto(false);
    setMostrarMfa(true);
    setErroMfa("");
    setDadosEnroll(null);
    setCodigoEnroll("");
    await carregarFatoresMfa();
  }

  async function carregarFatoresMfa() {
    setCarregandoFatores(true);

    try {
      const { data, error } = await supabase.auth.mfa.listFactors();

      if (error) throw error;

      setFatoresMfa(data?.totp || []);
    } catch (erro) {
      setErroMfa(
        erro.message || "Não foi possível carregar a verificação em duas etapas."
      );
    } finally {
      setCarregandoFatores(false);
    }
  }

  async function iniciarAtivacaoMfa() {
    setErroMfa("");

    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: "FinancePro",
      });

      if (error) throw error;

      setDadosEnroll(data);
    } catch (erro) {
      setErroMfa(
        erro.message || "Não foi possível iniciar a ativação."
      );
    }
  }

  function cancelarAtivacaoMfa() {
    setDadosEnroll(null);
    setCodigoEnroll("");
    setErroMfa("");
  }

  async function confirmarAtivacaoMfa(evento) {
    evento.preventDefault();
    setErroMfa("");
    setConfirmandoEnroll(true);

    try {
      const { data: desafio, error: erroDesafio } =
        await supabase.auth.mfa.challenge({ factorId: dadosEnroll.id });

      if (erroDesafio) throw erroDesafio;

      const { error: erroVerificar } = await supabase.auth.mfa.verify({
        factorId: dadosEnroll.id,
        challengeId: desafio.id,
        code: codigoEnroll.trim(),
      });

      if (erroVerificar) throw erroVerificar;

      setDadosEnroll(null);
      setCodigoEnroll("");
      await carregarFatoresMfa();
      alert("Verificação em duas etapas ativada com sucesso!");
    } catch {
      setErroMfa(
        "Código incorreto. Confira o app autenticador e tente de novo."
      );
    } finally {
      setConfirmandoEnroll(false);
    }
  }

  async function desativarMfa(factorId) {
    const confirmar = window.confirm(
      "Desativar a verificação em duas etapas? A conta vai voltar a depender só da senha."
    );

    if (!confirmar) return;

    setDesativandoId(factorId);

    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });

      if (error) throw error;

      await carregarFatoresMfa();
    } catch (erro) {
      alert(erro.message || "Não foi possível desativar.");
    } finally {
      setDesativandoId(null);
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

      {mostrarMfa && (
        <div
          className="modal-overlay"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget) {
              setMostrarMfa(false);
            }
          }}
        >
          <div className="modal">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Segurança</span>
                <h2>Verificação em duas etapas</h2>
              </div>

              <button
                type="button"
                className="close-button"
                onClick={() => setMostrarMfa(false)}
              >
                ×
              </button>
            </div>

            {carregandoFatores ? (
              <p>Carregando...</p>
            ) : dadosEnroll ? (
              <form onSubmit={confirmarAtivacaoMfa}>
                <p>
                  1. Abra um app autenticador (Google Authenticator, Authy,
                  Microsoft Authenticator...) no seu celular.
                </p>
                <p>2. Escaneie este código QR:</p>

                <div style={{ textAlign: "center", margin: "14px 0" }}>
                  <img
                    src={dadosEnroll.totp.qr_code}
                    alt="Código QR pra ativar a verificação em duas etapas"
                    style={{
                      width: "220px",
                      height: "220px",
                      background: "#fff",
                      borderRadius: "10px",
                      padding: "10px",
                    }}
                  />
                </div>

                <p className="foto-ajuda">
                  Não consegue escanear? Digite esse código manualmente no
                  app: <strong>{dadosEnroll.totp.secret}</strong>
                </p>

                <label>
                  3. Digite o código de 6 dígitos que apareceu no app
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={codigoEnroll}
                    onChange={(evento) =>
                      setCodigoEnroll(
                        evento.target.value.replace(/\D/g, "")
                      )
                    }
                    placeholder="000000"
                    autoFocus
                    required
                  />
                </label>

                {erroMfa && <p style={{ color: "#ff4655" }}>{erroMfa}</p>}

                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={cancelarAtivacaoMfa}
                    disabled={confirmandoEnroll}
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    className="primary-button"
                    disabled={confirmandoEnroll}
                  >
                    {confirmandoEnroll ? "Confirmando..." : "Ativar"}
                  </button>
                </div>
              </form>
            ) : fatoresMfa.length > 0 ? (
              <>
                <p>
                  ✅ Verificação em duas etapas <strong>ativada</strong> pra
                  essa conta. A cada login, além da senha, vai pedir o código
                  do app autenticador.
                </p>

                {erroMfa && <p style={{ color: "#ff4655" }}>{erroMfa}</p>}

                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => desativarMfa(fatoresMfa[0].id)}
                    disabled={desativandoId === fatoresMfa[0].id}
                  >
                    {desativandoId === fatoresMfa[0].id
                      ? "Desativando..."
                      : "Desativar"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>
                  Hoje a conta é protegida só pela senha. Ative a verificação
                  em duas etapas pra adicionar uma camada extra: além da
                  senha, vai pedir um código gerado num app autenticador no
                  celular a cada login.
                </p>

                <p className="foto-ajuda">
                  ⚠️ Guarde bem o app autenticador — se perder o acesso a ele
                  sem desativar antes, vai precisar de ajuda técnica pra
                  destravar a conta.
                </p>

                {erroMfa && <p style={{ color: "#ff4655" }}>{erroMfa}</p>}

                <div className="modal-actions">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={iniciarAtivacaoMfa}
                  >
                    Ativar verificação em duas etapas
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default UserMenu;
