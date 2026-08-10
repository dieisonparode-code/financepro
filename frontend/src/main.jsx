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

navigator.serviceWorker?.addEventListener("controllerchange", () => {
  if (jaRecarregouPorAtualizacao) return;
  jaRecarregouPorAtualizacao = true;
  window.location.reload();
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);