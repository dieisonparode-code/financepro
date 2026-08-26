import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../services/supabaseClient";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [sessao, setSessao] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [carregando, setCarregando] = useState(true);
  // BUG REAL corrigido (23/08/2026): "carregando" só esperava a SESSÃO
  // carregar (rápido) — o PERFIL (perfis, com as permissões) vem de uma
  // busca separada, um pouco mais lenta. O ProtectedRoute só olhava pra
  // "carregando", então liberava a tela assim que a sessão confirmava,
  // mesmo com perfil ainda null — nesse instante ehAdministrador dava
  // false e toda permissão dava vazia, mostrando "sua conta não tem
  // permissão" por um instante até o perfil terminar de chegar e a tela
  // "voltar ao normal" sozinha. Esse estado novo deixa esperar os dois.
  const [perfilCarregando, setPerfilCarregando] = useState(true);
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
      // Sem sessão não tem perfil pra esperar — libera a tela na hora
      // (o ProtectedRoute já redireciona pro login sozinho).
      setPerfilCarregando(false);
      return;
    }

    let ativo = true;
    setPerfilCarregando(true);

    function buscarPerfil() {
      return supabase
        .from("perfis")
        .select("*")
        .eq("user_id", sessao.user.id)
        .single()
        .then(({ data }) => {
          if (ativo) {
            setPerfil(data || null);
            setPerfilCarregando(false);
          }
        });
    }

    buscarPerfil();

    // Se o administrador mudar as permissões dessa pessoa enquanto ela
    // está com o app aberto (num celular, por exemplo), o perfil atualiza
    // sozinho na hora — sem precisar deslogar nem recarregar a página.
    const canal = supabase
      .channel(`perfil-mudou-${sessao.user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "perfis",
          filter: `user_id=eq.${sessao.user.id}`,
        },
        () => {
          buscarPerfil();
        }
      )
      .subscribe();

    return () => {
      ativo = false;
      supabase.removeChannel(canal);
    };
    // BUG REAL corrigido (26/08/2026): "tela preta" toda vez que voltava
    // pra aba, mesmo sem sair do Chrome — a causa era aqui. O Supabase
    // revalida/atualiza a sessão sozinho quando a aba fica visível de
    // novo (comportamento próprio da biblioteca) — cada revalidação gera
    // um objeto "sessao" NOVO (mesmo usuário, token só atualizado). Como
    // o efeito dependia de "sessao" inteiro, toda revalidação disparava
    // de novo, marcando perfilCarregando=true — e o ProtectedRoute
    // desmonta o app inteiro (mostra tela em branco/preta) enquanto isso
    // carrega, mesmo sendo o MESMO usuário já logado. Agora só refaz a
    // busca do perfil quando o ID do usuário muda de verdade (login,
    // logout, troca de conta) — token sendo só atualizado não conta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.user?.id]);

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
        perfilCarregando,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
