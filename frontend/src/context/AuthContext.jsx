import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../services/supabaseClient";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [sessao, setSessao] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [carregando, setCarregando] = useState(true);
  // Se a conta tem verificação em duas etapas ativada, uma sessão que ainda
  // não completou o código (2º fator) não conta como autenticada de
  // verdade — sem isso, dava pra recarregar a página logo depois de digitar
  // a senha (antes de confirmar o código) e entrar sem o 2FA.
  const [precisaSegundaEtapa, setPrecisaSegundaEtapa] = useState(false);

  useEffect(() => {
    let ativo = true;

    // Só marca "carregando: false" depois de checar sessão E o nível de
    // autenticação (2FA) — assim não tem um instante em que uma sessão sem
    // o 2º fator concluído passa por autenticada antes da checagem terminar.
    async function aplicarSessao(novaSessao) {
      setSessao(novaSessao);

      if (!novaSessao) {
        if (ativo) setPrecisaSegundaEtapa(false);
        return;
      }

      const { data: nivel } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      if (ativo) {
        setPrecisaSegundaEtapa(
          nivel?.nextLevel === "aal2" && nivel?.currentLevel !== "aal2"
        );
      }
    }

    supabase.auth.getSession().then(async ({ data }) => {
      await aplicarSessao(data.session);
      if (ativo) setCarregando(false);
    });

    const { data: assinatura } = supabase.auth.onAuthStateChange(
      (_evento, novaSessao) => {
        aplicarSessao(novaSessao);
      }
    );

    return () => {
      ativo = false;
      assinatura.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!sessao?.user) {
      setPerfil(null);
      return;
    }

    let ativo = true;

    supabase
      .from("perfis")
      .select("*")
      .eq("user_id", sessao.user.id)
      .single()
      .then(({ data }) => {
        if (ativo) {
          setPerfil(data || null);
        }
      });

    return () => {
      ativo = false;
    };
  }, [sessao]);

  function login(novaSessao) {
    setSessao(novaSessao);
  }

  async function logout() {
    await supabase.auth.signOut();
    setSessao(null);
    setPerfil(null);
  }

  return (
    <AuthContext.Provider
      value={{
        usuario: sessao?.user || null,
        perfil,
        ehAdministrador: perfil?.perfil === "administrador",
        login,
        logout,
        autenticado: Boolean(sessao) && !precisaSegundaEtapa,
        carregando,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
