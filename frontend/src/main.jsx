import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext";

// Pedido do usuário (25/08/2026): NENHUM recarregamento automático, nunca.
// A causa real (achada só agora) não era mais nosso código — era o
// comportamento PADRÃO da própria biblioteca (virtual:pwa-register):
// sem passar onNeedRefresh, ela chama window.location.reload() sozinha
// assim que o Service Worker novo assume, o que tirava a pessoa de onde
// estava no meio do uso ("tela preta", "sai de onde tá"). Passando
// onNeedRefresh (mesmo vazio) desativa esse reload automático da
// biblioteca. A aba aberta segue com a versão que já carregou até a
// pessoa dar F5/fechar e abrir de novo (igual qualquer site normal). O
// script de autorrecuperação no index.html continua cobrindo o caso real
// de erro (cache apontando pra um build que não existe mais).
registerSW({
  immediate: true,
  onNeedRefresh() {},
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);