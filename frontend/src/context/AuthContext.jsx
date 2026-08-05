import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../services/supabaseClient";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [sessao, setSessao] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session);
      setCarregando(false);
    });

    const { data: assinatura } = supabase.auth.onAuthStateChange(
      (_evento, novaSessao) => {
        setSessao(novaSessao);
      }
    );

    return () => {
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
        autenticado: Boolean(sessao),
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
