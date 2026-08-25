import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext";

// Pedido do usuário (25/08/2026): NENHUM recarregamento automático, nunca
// — nem quando a aba está em segundo plano. A versão anterior recarregava
// a página sozinha (direto ou ao trocar de aba/voltar), o que tirava a
// pessoa de onde estava no meio do uso ("tela preta", "sai de onde tá").
// Agora o Service Worker só atualiza em segundo plano, em silêncio; a
// aba aberta continua com a versão que já carregou até a pessoa dar
// F5/fechar e abrir de novo (comportamento normal de qualquer site). O
// script de autorrecuperação no index.html continua cobrindo o caso real
// de erro (cache apontando pra um build que não existe mais).
registerSW({ immediate: true });

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);