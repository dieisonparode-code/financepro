import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext";

// O skipWaiting/clientsClaim do Service Worker só controla PRÓXIMAS
// requisições — uma aba que já estava aberta continua rodando o JS antigo
// (já carregado na memória) mesmo depois do SW novo assumir. Isso foi a
// causa real de telas (permissões, dashboard) ficarem "presas" numa versão
// velha por horas, mesmo com o servidor já corrigido. Corrigido aqui: fica
// checando por atualização de tempo em tempo, e recarrega a página sozinho
// assim que uma versão nova assumir o controle — ninguém precisa mais
// limpar cache/desinstalar o app manualmente.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registro) {
    if (!registro) return;

    setInterval(() => {
      registro.update();
    }, 60 * 1000);
  },
});

let jaRecarregouPorAtualizacao = false;
let atualizacaoPendente = false;

// Pedido do usuário (25/08/2026): recarregar na hora que o SW novo assume
// jogava a pessoa fora do que estava fazendo (tela preta, formulário
// perdido) toda vez que a gente fazia deploy — e nesse projeto os deploys
// são o dia inteiro. Agora só recarrega quando a aba NÃO está em uso
// (usuário trocou de aba/minimizou/bloqueou a tela); enquanto a aba
// estiver visível, a atualização fica pendente e não interrompe nada.
function recarregarSeNecessario() {
  if (jaRecarregouPorAtualizacao || !atualizacaoPendente) return;
  if (document.hidden) {
    jaRecarregouPorAtualizacao = true;
    window.location.reload();
  }
}

navigator.serviceWorker?.addEventListener("controllerchange", () => {
  if (jaRecarregouPorAtualizacao) return;
  atualizacaoPendente = true;
  recarregarSeNecessario();
});

document.addEventListener("visibilitychange", recarregarSeNecessario);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);