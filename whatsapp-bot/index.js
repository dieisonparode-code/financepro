// Robô do WhatsApp — fica de olho num grupo específico. Quando alguém
// manda uma FOTO (ou um PDF — ex: comprovante do banco que vem em PDF
// como no Sicredi) com legenda (ex: "boy", "cozinha", "vale", "reforma",
// "compras", "materia prima"), ele manda pro FinancePro classificar
// sozinho. Legenda não reconhecida (ou sem legenda) cai numa fila pra
// classificar na mão dentro do sistema.
//
// Não é a API oficial do WhatsApp — usa a mesma ideia do WhatsApp Web
// (por isso dá pra ler mensagem de GRUPO, o que a API oficial paga não
// permite). Roda local, no seu computador — não precisa ficar ligado
// 24h, só processa o que chegou quando você abrir de novo.
//
// Como usar:
//   1. npm install
//   2. Copia .env.example pra .env e preenche BACKEND_URL, WHATSAPP_BOT_TOKEN e LOJA_ID
//   3. npm start — escaneia o QR code que aparece no terminal com o
//      WhatsApp do CHIP SECUNDÁRIO (não o pessoal!)
//   4. Na primeira vez, ele lista todos os grupos que esse número
//      participa, com o ID de cada um — copia o ID do grupo certo e cola
//      no .env em GRUPO_ID, depois roda "npm start" de novo.

require("dotenv").config();

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
} = require("@whiskeysockets/baileys");
const qrcodeTerminal = require("qrcode-terminal");
const axios = require("axios");

const BACKEND_URL = process.env.BACKEND_URL;
const WHATSAPP_BOT_TOKEN = process.env.WHATSAPP_BOT_TOKEN;
const LOJA_ID = process.env.LOJA_ID || "";
// BUG REAL corrigido (18/08/2026): comparar sem .trim() fazia o grupo
// certo ser rejeitado como "diferente" quando sobrava espaço/quebra de
// linha invisível colado no .env (bem comum copiando e colando um ID) —
// os dois pareciam idênticos no terminal mas nunca batiam de verdade.
const GRUPO_ID = (process.env.GRUPO_ID || "").trim();

if (!BACKEND_URL || !WHATSAPP_BOT_TOKEN) {
  console.error(
    "Erro: preencha BACKEND_URL e WHATSAPP_BOT_TOKEN no arquivo .env antes de rodar."
  );
  process.exit(1);
}

let intervaloHeartbeat = null;

async function mandarHeartbeat() {
  try {
    await axios.post(
      `${BACKEND_URL}/integracoes/whatsapp/heartbeat`,
      {},
      { headers: { "x-whatsapp-token": WHATSAPP_BOT_TOKEN }, timeout: 15000 }
    );
  } catch (erro) {
    console.error("Não consegui mandar o sinal de vida:", erro.message);
  }
}

// Bug real corrigido (21/08/2026): a conexão travou "por dentro" sem
// nunca disparar "connection: close" — o socket ficava tecnicamente
// aberto (o sinal de vida continuava chegando certinho no FinancePro,
// ícone da bandeja normal), mas parou de receber mensagens novas do
// grupo. Como o único jeito de reconectar era reagir a "close", e esse
// evento nunca chegou, o robô ficou "zumbi" até alguém reiniciar na mão.
// Correção: reconecta sozinho de tempos em tempos, MESMO sem nenhum
// sinal de erro — fecha e abre a conexão de novo periodicamente, o que
// não perde a sessão (o login fica salvo em ./auth) e evita esse tipo de
// trava silenciosa se acumular por horas.
const HORAS_ENTRE_RECONEXAO_PREVENTIVA = 3;
let intervaloReconexaoPreventiva = null;

async function iniciar() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth");

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (atualizacao) => {
    const { connection, lastDisconnect, qr } = atualizacao;

    if (qr) {
      console.log(
        "\n📱 Escaneia esse QR code com o WhatsApp do CHIP SECUNDÁRIO (Configurações → Aparelhos conectados → Conectar aparelho):\n"
      );
      qrcodeTerminal.generate(qr, { small: true });
    }

    if (connection === "close") {
      // Para de mandar sinal de vida enquanto estiver desconectado — o
      // sinal só deve dizer "tudo bem" quando REALMENTE está conectado,
      // senão o Dashboard não percebe a queda.
      if (intervaloHeartbeat) {
        clearInterval(intervaloHeartbeat);
        intervaloHeartbeat = null;
      }

      if (intervaloReconexaoPreventiva) {
        clearInterval(intervaloReconexaoPreventiva);
        intervaloReconexaoPreventiva = null;
      }

      const deveReconectar =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;

      console.log(
        "Conexão caiu.",
        deveReconectar ? "Reconectando..." : "Sessão encerrada (deslogado)."
      );

      if (deveReconectar) {
        iniciar();
      }
    }

    if (connection === "open") {
      console.log("✅ Conectado ao WhatsApp!");

      if (!GRUPO_ID) {
        console.log(
          "\n⚠️  GRUPO_ID não configurado no .env — listando todos os grupos desse número pra você achar o ID certo:\n"
        );

        try {
          const grupos = await sock.groupFetchAllParticipating();
          Object.values(grupos).forEach((grupo) => {
            console.log(`  ${grupo.subject}  →  ${grupo.id}`);
          });
          console.log(
            "\nCopia o ID do grupo certo (termina em @g.us) e cola no .env em GRUPO_ID, depois roda de novo.\n"
          );
        } catch (erro) {
          console.error("Não consegui listar os grupos:", erro.message);
        }
      } else {
        console.log(`👂 Escutando o grupo "${GRUPO_ID}" (${GRUPO_ID.length} caracteres)...`);
      }

      // Pedido do usuário (20/08/2026): manda um "sinal de vida" pro
      // FinancePro a cada 5 minutos enquanto estiver realmente conectado
      // — se parar de chegar, o Dashboard avisa sozinho que o robô caiu,
      // em vez de alguém só notar quando uma foto não entra.
      if (!intervaloHeartbeat) {
        mandarHeartbeat();
        intervaloHeartbeat = setInterval(mandarHeartbeat, 5 * 60 * 1000);
      }

      // Reconexão preventiva — ver comentário lá em cima de
      // HORAS_ENTRE_RECONEXAO_PREVENTIVA. Faz um "close" manual, que já
      // aciona sozinho o "iniciar()" de novo lá em cima (mesmo caminho de
      // quando a conexão cai de verdade).
      if (!intervaloReconexaoPreventiva) {
        intervaloReconexaoPreventiva = setInterval(() => {
          console.log(
            "🔄 Reconexão preventiva (evita ficar preso numa conexão travada por horas)..."
          );
          sock.end(new Error("reconexão preventiva agendada"));
        }, HORAS_ENTRE_RECONEXAO_PREVENTIVA * 60 * 60 * 1000);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const mensagem of messages) {
      try {
        await processarMensagem(sock, mensagem);
      } catch (erro) {
        console.error("Erro processando uma mensagem:", erro.message);
      }
    }
  });
}

async function processarMensagem(sock, mensagem) {
  if (!mensagem.message || mensagem.key.fromMe) return;

  const remoteJid = (mensagem.key.remoteJid || "").trim();
  if (!remoteJid.endsWith("@g.us")) return; // só grupos

  const imageMessage =
    mensagem.message.imageMessage ||
    mensagem.message.viewOnceMessageV2?.message?.imageMessage;

  // Pedido do usuário (19/08/2026): comprovante de banco às vezes vem em
  // PDF, não em foto (ex: Sicredi) — antes o robô ignorava de propósito e
  // essas despesas nunca entravam sozinhas no sistema. Detecta o PDF do
  // mesmo jeito que já detecta a foto (inclusive a variante mais nova do
  // WhatsApp, "documentWithCaptionMessage", que embrulha o documento
  // quando ele tem legenda).
  const documentMessage =
    mensagem.message.documentMessage ||
    mensagem.message.documentWithCaptionMessage?.message?.documentMessage;
  const ehPdf = documentMessage?.mimetype === "application/pdf";
  // Bug real corrigido (21/08/2026): "nota"/comprovante mandado como
  // ARQUIVO em vez de foto (WhatsApp faz isso sozinho às vezes, ou a
  // pessoa escolhe "Documento" ao anexar) chegava como documentMessage
  // com mimetype "image/jpeg"/"image/png" — o robô só tratava
  // documentMessage como PDF, então essa imagem-como-arquivo era
  // silenciosamente ignorada (nem foto nem PDF pros critérios antigos).
  const ehImagemComoDocumento =
    documentMessage != null &&
    !ehPdf &&
    (documentMessage.mimetype || "").startsWith("image/");

  // Em vez de exigir a string inteira idêntica (frágil — LID vs PN,
  // sufixo diferente etc. já causaram falso "diferente" nesse teste),
  // compara só a parte numérica antes do "@" — muito mais robusto.
  const idNumericoConfigurado = GRUPO_ID.split("@")[0];
  const idNumericoRecebido = remoteJid.split("@")[0];
  const bateGrupo = idNumericoRecebido === idNumericoConfigurado;

  // Log de depuração: mostra QUALQUER mensagem de grupo que chegar (foto
  // ou não, do grupo configurado ou não).
  console.log(
    `👀 Mensagem vista — grupo=${JSON.stringify(remoteJid)} | configurado=${JSON.stringify(GRUPO_ID)} | id numérico bate? ${bateGrupo ? "SIM" : "NÃO"} (recebido="${idNumericoRecebido}" vs configurado="${idNumericoConfigurado}") — tem foto? ${imageMessage ? "sim" : "não"} — tem PDF? ${ehPdf ? "sim" : "não"} — tem imagem-como-arquivo? ${ehImagemComoDocumento ? "sim" : "não"}`
  );

  if (GRUPO_ID && !bateGrupo) return; // só o grupo configurado

  // Log extra SÓ quando não reconheceu nada — mostra os tipos de conteúdo
  // que a mensagem realmente tem, pra dar pra descobrir na hora (sem
  // precisar eu adivinhar) se aparecer um formato novo que o robô ainda
  // não sabe ler.
  if (!imageMessage && !ehPdf && !ehImagemComoDocumento) {
    console.log(
      `   (mensagem não reconhecida como foto/PDF — tipos presentes: ${Object.keys(mensagem.message).join(", ")})`
    );
    return; // só processa foto, PDF ou imagem mandada como arquivo
  }

  const legenda =
    imageMessage?.caption || documentMessage?.caption || "";
  const remetente =
    mensagem.pushName || mensagem.key.participant || "desconhecido";

  console.log(
    `${ehPdf ? "📄 PDF" : ehImagemComoDocumento ? "📎 Imagem (mandada como arquivo)" : "📸 Foto"} recebido de ${remetente} — legenda: "${legenda || "(sem legenda)"}"`
  );

  const buffer = await downloadMediaMessage(mensagem, "buffer", {});
  const fotoBase64 = ehPdf
    ? `data:application/pdf;base64,${buffer.toString("base64")}`
    : ehImagemComoDocumento
    ? `data:${documentMessage.mimetype};base64,${buffer.toString("base64")}`
    : `data:image/jpeg;base64,${buffer.toString("base64")}`;

  try {
    const resposta = await axios.post(
      `${BACKEND_URL}/integracoes/whatsapp/foto`,
      {
        foto: fotoBase64,
        legenda,
        loja_id: LOJA_ID || null,
        remetente,
      },
      {
        headers: { "x-whatsapp-token": WHATSAPP_BOT_TOKEN },
        timeout: 60000,
      }
    );

    const destinoTexto = {
      fechamento_caixa: "✅ Virou uma Diária no Fechamento de Caixa.",
      lancamento: "✅ Virou uma Despesa.",
      fila: "📋 Não reconheci a legenda — caiu na Fila pra classificar na mão.",
    };

    console.log(destinoTexto[resposta.data.destino] || "✅ Processado.");
  } catch (erro) {
    console.error(
      `❌ Não consegui mandar o ${ehPdf ? "PDF" : "foto"} pro FinancePro:`,
      erro.response?.data?.erro || erro.message
    );
  }
}

// Blindagem (20/08/2026, achado analisando um crash real no log): a
// biblioteca do WhatsApp às vezes rejeita uma promise durante a
// reconexão (ex: erro de rede "WebSocket fechado, código 1006") SEM que
// ninguém dê ".catch()" nela — e a partir do Node 24, isso derruba o
// processo inteiro em vez de só logar um aviso (como acontecia em
// versões antigas do Node). O robô morria de vez, silenciosamente, e só
// o ícone da bandeja continuava ali (o ícone é só um "casco" que não
// garante nada por dentro) — nenhuma foto/PDF era processada até alguém
// perceber e reiniciar na mão. Agora só loga o erro e deixa o próprio
// mecanismo de reconexão (dentro de "iniciar()") continuar tentando,
// sem matar o processo.
process.on("unhandledRejection", (motivo) => {
  console.error(
    "⚠️ Erro de rede não tratado (não vai derrubar o robô):",
    motivo
  );
});

iniciar();
