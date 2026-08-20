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

  // Em vez de exigir a string inteira idêntica (frágil — LID vs PN,
  // sufixo diferente etc. já causaram falso "diferente" nesse teste),
  // compara só a parte numérica antes do "@" — muito mais robusto.
  const idNumericoConfigurado = GRUPO_ID.split("@")[0];
  const idNumericoRecebido = remoteJid.split("@")[0];
  const bateGrupo = idNumericoRecebido === idNumericoConfigurado;

  // Log de depuração: mostra QUALQUER mensagem de grupo que chegar (foto
  // ou não, do grupo configurado ou não).
  console.log(
    `👀 Mensagem vista — grupo=${JSON.stringify(remoteJid)} | configurado=${JSON.stringify(GRUPO_ID)} | id numérico bate? ${bateGrupo ? "SIM" : "NÃO"} (recebido="${idNumericoRecebido}" vs configurado="${idNumericoConfigurado}") — tem foto? ${imageMessage ? "sim" : "não"} — tem PDF? ${ehPdf ? "sim" : "não"}`
  );

  if (GRUPO_ID && !bateGrupo) return; // só o grupo configurado

  if (!imageMessage && !ehPdf) return; // só processa foto ou PDF

  const legenda = imageMessage?.caption || documentMessage?.caption || "";
  const remetente =
    mensagem.pushName || mensagem.key.participant || "desconhecido";

  console.log(
    `${ehPdf ? "📄 PDF" : "📸 Foto"} recebido de ${remetente} — legenda: "${legenda || "(sem legenda)"}"`
  );

  const buffer = await downloadMediaMessage(mensagem, "buffer", {});
  const fotoBase64 = ehPdf
    ? `data:application/pdf;base64,${buffer.toString("base64")}`
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

iniciar();
