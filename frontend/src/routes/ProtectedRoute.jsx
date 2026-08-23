import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children }) {
  const { autenticado, carregando, perfilCarregando } = useAuth();

  // BUG REAL corrigido (23/08/2026): só esperava "carregando" (a sessão)
  // — o perfil (permissões) carrega numa busca separada, um pouco mais
  // lenta, e liberar a tela antes dele terminar mostrava a conta inteira
  // sem nenhuma permissão por um instante (ehAdministrador/temPermissao
  // dão false com perfil ainda null), até o perfil chegar e a tela
  // "voltar ao normal" sozinha. Agora espera os dois.
  if (carregando || (autenticado && perfilCarregando)) {
    return null;
  }

  if (!autenticado) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
