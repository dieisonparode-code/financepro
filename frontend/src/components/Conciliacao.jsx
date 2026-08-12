import { useEffect, useMemo, useState } from "react";
import {
  buscarVendasPagSeguro,
  conferirFechamentoFoto,
  buscarFechamentosCaixa,
  buscarFotoFechamentoCaixa,
  buscarFechamentoSaipos,
  salvarValoresInformadosFechamento,
} from "../services/api";

// A pedido do usuário: iFood/Brendi ("Pago Online"), Voucher Parceiro, A
// prazo (funcionários), Vale e Cortesia já são contabilizados
// automaticamente pela própria Saipos — só Dinheiro não tem nenhum
// "Sistema" pra comparar (é físico, só o que o operador informou na
// foto). Mapeia o nome exato que a Saipos usa pro nome que essa tela já
// usa.
const MAPA_SAIPOS_PARA_CONFRONTO = {
  "Pago Online": "Pago Online",
  "A prazo (funcionários)": "A prazo",
  "Voucher Parceiro Desconto": "Voucher Parceiro",
  Vale: "Vale",
  Cortesia: "Cortesia",
};
import ConciliacaoDespesas from "./ConciliacaoDespesas";

// Converte o horário de um registro (o momento em que um fechamento foi
// salvo) pro dia do TURNO, não o dia do relógio — um caixa aberto às 20h
// de um dia e fechado só depois da meia-noite ainda pertence ao turno do
// dia anterior. Mesma regra de corte (5h da manhã) já usada na importação
// automática da Saipos, pra não pegar o dia errado ao buscar PagSeguro/
// Saipos pra conciliar.
function hojeDoRegistro(dataIso) {
  const data = new Date(dataIso);

  if (data.getHours() < 5) {
    data.setDate(data.getDate() - 1);
  }

  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

// Sempre mostra no horário de Uberlândia (onde a loja fica), não no fuso do
// dispositivo de quem está olhando — senão parece que a venda foi em outro
// horário do que realmente foi (ex: alguém acessando de Mato Grosso, que é
// 1 hora atrás de Uberlândia).
function formatarDataHora(dataIso) {
  if (!dataIso) return "";
  return new Date(dataIso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
}

// Status 3 (Paga) e 4 (Disponível) são as únicas que a PagSeguro já confirmou
// como recebidas de verdade — o resto (aguardando, em análise, disputa,
// devolvida, cancelada) é dinheiro que apareceu como venda mas ainda não
// entrou (ou nunca vai entrar) no bolso.
function estaPendenteOuCancelada(venda) {
  return venda.status !== 3 && venda.status !== 4;
}

const ORDEM_FORMAS_PAGAMENTO = ["Cartão de crédito", "Cartão de débito", "PIX"];

function agruparVendasPorFormaPagamento(vendas) {
  const grupos = new Map();

  vendas.forEach((venda) => {
    const forma = venda.forma_pagamento || "Outro";

    if (!grupos.has(forma)) {
      grupos.set(forma, []);
    }

    grupos.get(forma).push(venda);
  });

  const formasOrdenadas = [
    ...ORDEM_FORMAS_PAGAMENTO.filter((forma) => grupos.has(forma)),
    ...[...grupos.keys()].filter(
      (forma) => !ORDEM_FORMAS_PAGAMENTO.includes(forma)
    ),
  ];

  return formasOrdenadas.map((forma) => ({
    forma,
    vendas: grupos.get(forma),
  }));
}

// Sem seletor de loja aqui de propósito — a pedido do usuário, essa tela
// usa a loja em que a pessoa já está logada (ou a selecionada no topo,
// pra administrador), não precisa escolher de novo.
function Conciliacao({ lojaId }) {
  const [abaAtiva, setAbaAtiva] = useState("caixa");
  const [resumo, setResumo] = useState(null);
  const [resumoSaipos, setResumoSaipos] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [resultadoFoto, setResultadoFoto] = useState(null);
  // Pedido do usuário (12/08/2026): só as formas que TODO fechamento tem
  // (cartão, pix, dinheiro) ficam fixas aqui. As outras (A prazo, Pago
  // Online, Vale, Voucher Parceiro, Cortesia, ou qualquer forma nova) só
  // aparecem na tabela quando esse fechamento específico realmente teve
  // essa forma (na foto ou no sistema da Saipos) — se não teve, não
  // aparece a linha, em vez de mostrar "R$0,00"/"—" pra algo que nem
  // existiu naquele dia.
  const valoresInformadosBase = {
    "Cartão de crédito": "",
    "Cartão de débito": "",
    PIX: "",
    Dinheiro: "",
  };
  const [valoresInformados, setValoresInformados] = useState(
    valoresInformadosBase
  );
  const [fotoPreview, setFotoPreview] = useState(null);
  const [carregandoPreview, setCarregandoPreview] = useState(false);
  const [fechamentosDisponiveis, setFechamentosDisponiveis] = useState([]);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [grupoEscolhido, setGrupoEscolhido] = useState(null);

  // Pedido do usuário: mostra a lista de Fechamentos de Caixa dessa loja
  // pra ele escolher qual conciliar — não é mais só "o último" sozinho.
  useEffect(() => {
    if (!lojaId) {
      setFechamentosDisponiveis([]);
      return;
    }

    setCarregandoLista(true);

    buscarFechamentosCaixa()
      .then((dados) => {
        const daLoja = (Array.isArray(dados) ? dados : [])
          .filter(
            (item) =>
              item.tipo === "caixa" &&
              String(item.loja_id) === String(lojaId)
          )
          .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))
          .slice(0, 20);

        setFechamentosDisponiveis(daLoja);
      })
      .catch(() => setFechamentosDisponiveis([]))
      .finally(() => setCarregandoLista(false));
  }, [lojaId]);

  // Pedido do usuário: um fechamento pode ter 2 fotos (Foto 1 / Foto 2),
  // que salvam como 2 registros separados no banco mas são o MESMO
  // fechamento físico — antes apareciam como 2 botões distintos, confuso.
  // Agora agrupa pela data do turno (mesma regra de corte 5h usada pra
  // buscar PagSeguro/Saipos) e mostra um botão só por dia.
  const fechamentosAgrupados = useMemo(() => {
    const mapa = new Map();

    fechamentosDisponiveis.forEach((item) => {
      const chave = hojeDoRegistro(item.criado_em);
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave).push(item);
    });

    return Array.from(mapa.entries())
      .map(([dataChave, itens]) => ({
        dataChave,
        itens: itens.sort(
          (a, b) => new Date(a.criado_em) - new Date(b.criado_em)
        ),
      }))
      .sort((a, b) => (a.dataChave < b.dataChave ? 1 : -1));
  }, [fechamentosDisponiveis]);

  // Junta o que já foi lido/salvo em CADA registro do grupo (foto 1 e/ou
  // foto 2) num só objeto — se uma categoria só aparecer numa das fotos,
  // ainda assim entra na conciliação.
  function mesclarDosItens(grupo, campo) {
    if (!grupo) return null;
    const mesclado = {};
    let temAlgo = false;

    grupo.itens.forEach((item) => {
      if (item[campo]) {
        temAlgo = true;
        Object.assign(mesclado, item[campo]);
      }
    });

    return temAlgo ? mesclado : null;
  }

  // Pedido do usuário: essa tela não é mais "tempo real" — uma vez
  // conciliado o fechamento, não tem por que ficar rodando de novo. Depois
  // de escolher qual Fechamento de Caixa usar, um botão busca a PagSeguro
  // só daquele dia e já lê a(s) foto(s) sozinho.
  async function conciliarAgora() {
    if (!grupoEscolhido) return;

    setCarregando(true);
    setErro("");
    setResultadoFoto(null);
    setResumo(null);
    setResumoSaipos(null);
    // Não deixa categoria dinâmica (A prazo/Vale/Voucher/Cortesia/etc) de
    // um fechamento anterior vazar pra esse — cada fechamento começa do
    // zero, só as formas fixas (cartão/pix/dinheiro).
    setValoresInformados(valoresInformadosBase);

    const dataFechamento = grupoEscolhido.dataChave;

    // As buscas não dependem uma da outra (vendas na PagSeguro × vendas na
    // Saipos × leitura de cada foto por IA) — rodando em paralelo em vez
    // de uma esperar a outra, o tempo total fica perto da mais lenta, não
    // da soma.
    const buscaVendas = buscarVendasPagSeguro(dataFechamento, dataFechamento)
      .then((resultado) => setResumo(resultado))
      .catch((erroBusca) =>
        setErro(
          erroBusca.message ||
            "Não foi possível buscar as vendas na PagSeguro."
        )
      );

    // iFood/Brendi (Pago Online), Voucher Parceiro e A prazo (funcionários)
    // já são contabilizados pela própria Saipos — não falha a conciliação
    // se essa loja ainda não tiver o ID da Saipos cadastrado, só não
    // preenche essas linhas.
    const buscaSaipos = buscarFechamentoSaipos(lojaId, dataFechamento)
      .then((resultado) => setResumoSaipos(resultado))
      .catch(() => setResumoSaipos(null));

    // Pedido do usuário: uma vez lida a foto, o valor fica salvo nesse
    // registro — refazer a conciliação usa o valor salvo, sem chamar a IA
    // de novo (evita o valor mudar sozinho entre uma tentativa e outra).
    // Só o botão "Ler foto de novo" força uma releitura. Um fechamento pode
    // ter até 2 fotos (Foto 1 / Foto 2) — lê/reaproveita as duas e junta os
    // valores na mesma tabela.
    const buscasFoto = grupoEscolhido.itens.map((item) =>
      item.valores_informados
        ? Promise.resolve(
            usarValoresSalvos(item.valores_informados, { silencioso: true })
          )
        : buscarFotoFechamentoCaixa(item.id)
            .then((fotoResultado) =>
              conferirFotoDataUrl(fotoResultado?.foto, {
                salvarEm: item.id,
                silencioso: true,
              })
            )
            .catch((erroFoto) => ({
              erro_leitura:
                erroFoto.message ||
                "Não foi possível buscar uma das fotos desse fechamento.",
            }))
    );

    const [, , ...resultadosFoto] = await Promise.all([
      buscaVendas,
      buscaSaipos,
      ...buscasFoto,
    ]);

    setResultadoFoto(agregarResultadosFoto(resultadosFoto));
    setCarregando(false);
  }

  // Combina o resultado da leitura/reaproveitamento de cada foto do grupo
  // num só objeto pra mostrar uma mensagem só (em vez de uma por foto).
  function agregarResultadosFoto(resultados) {
    const validos = resultados.filter(Boolean);
    const algumSucesso = validos.some((r) => r.sucesso);
    const algumSalvo = validos.some((r) => r.salvo);
    const formasNaoLidas = Array.from(
      new Set(validos.flatMap((r) => r.formasNaoLidas || []))
    );
    const erro = validos.find((r) => r.erro_leitura);

    if (!algumSucesso && erro) {
      return { erro_leitura: erro.erro_leitura, debugRespostaIa: erro.debugRespostaIa };
    }

    return { sucesso: algumSucesso, salvo: algumSalvo, formasNaoLidas };
  }

  // Usa uma leitura já salva anteriormente, sem chamar a IA de novo.
  function usarValoresSalvos(valoresSalvos, { silencioso } = {}) {
    setValoresInformados((anterior) => {
      const novo = { ...anterior };

      Object.entries(valoresSalvos).forEach(([forma, valor]) => {
        if (valor != null) {
          novo[forma] = Number(valor).toFixed(2);
        }
      });

      return novo;
    });

    const resultado = { sucesso: true, salvo: true, formasNaoLidas: [] };
    if (!silencioso) setResultadoFoto(resultado);
    return resultado;
  }

  // Força reler TODAS as fotos do grupo (ignora o que já estava salvo) —
  // usado quando o operador clica "Ler foto de novo" de propósito.
  async function relerFotoAgora() {
    if (!grupoEscolhido) return;

    setEnviandoFoto(true);
    setResultadoFoto(null);

    const resultados = await Promise.all(
      grupoEscolhido.itens.map(async (item) => {
        try {
          const fotoResultado = await buscarFotoFechamentoCaixa(item.id);
          return await conferirFotoDataUrl(fotoResultado?.foto, {
            salvarEm: item.id,
            silencioso: true,
          });
        } catch (erroFoto) {
          return {
            erro_leitura:
              erroFoto.message ||
              "Não foi possível buscar uma das fotos desse fechamento.",
          };
        }
      })
    );

    setResultadoFoto(agregarResultadosFoto(resultados));
    setEnviandoFoto(false);
  }

  async function conferirFotoDataUrl(fotoDataUrl, { salvarEm, silencioso } = {}) {
    if (!fotoDataUrl) return null;

    if (!silencioso) {
      setEnviandoFoto(true);
      setResultadoFoto(null);
    }

    try {
      const resultado = await conferirFechamentoFoto(fotoDataUrl);

      if (resultado.erro_leitura || !resultado.valores) {
        const resultadoErro = {
          erro_leitura:
            resultado.erro_leitura ||
            "Não foi possível ler os valores dessa foto.",
          debugRespostaIa: resultado.debug_resposta_ia,
        };
        if (!silencioso) setResultadoFoto(resultadoErro);
        return resultadoErro;
      }

      // Preenche a tabela de confronto sozinha com o que a foto trouxe —
      // inclui TODAS as categorias que a foto tiver (Dinheiro, Vale, Voucher,
      // etc), não só as 3 fixas (Crédito/Débito/PIX).
      setValoresInformados((anterior) => {
        const novo = { ...anterior };

        Object.entries(resultado.valores).forEach(([forma, valor]) => {
          if (valor != null) {
            novo[forma] = valor.toFixed(2);
          }
        });

        return novo;
      });

      const formasNaoLidas = Object.entries(resultado.valores)
        .filter(([, valor]) => valor == null)
        .map(([forma]) => forma);

      const resultadoOk = { sucesso: true, formasNaoLidas };
      if (!silencioso) setResultadoFoto(resultadoOk);

      // A coluna "Esperado" do próprio comprovante (Saipos já faz essa
      // conta pra cada forma, inclusive Dinheiro) alimenta o "Sistema" da
      // conciliação — exceto Crédito/Débito/PIX, que continuam vindo da
      // PagSeguro (fonte mais confiável pra essas 3, é quem realmente
      // recebeu o dinheiro).
      const sistemaLidoDaFoto = {};
      if (resultado.esperado) {
        Object.entries(resultado.esperado).forEach(([forma, valor]) => {
          if (valor == null) return;
          if (
            forma === "Cartão de crédito" ||
            forma === "Cartão de débito" ||
            /pix/i.test(forma)
          ) {
            return;
          }
          sistemaLidoDaFoto[forma] = valor;
        });
      }

      // Salva a leitura no fechamento pra não precisar (nem poder) ler de
      // novo por engano nas próximas vezes — só sobrescreve se o operador
      // clicar em "Ler foto de novo" explicitamente.
      if (salvarEm) {
        try {
          const salvo = await salvarValoresInformadosFechamento(
            salvarEm,
            resultado.valores,
            Object.keys(sistemaLidoDaFoto).length > 0
              ? sistemaLidoDaFoto
              : undefined
          );

          setFechamentosDisponiveis((anteriores) =>
            anteriores.map((item) =>
              item.id === salvarEm
                ? {
                    ...item,
                    valores_informados: salvo.valores_informados,
                    sistema_manual: salvo.sistema_manual,
                  }
                : item
            )
          );

          setGrupoEscolhido((anterior) =>
            anterior
              ? {
                  ...anterior,
                  itens: anterior.itens.map((item) =>
                    item.id === salvarEm
                      ? {
                          ...item,
                          valores_informados: salvo.valores_informados,
                          sistema_manual: salvo.sistema_manual,
                        }
                      : item
                  ),
                }
              : anterior
          );
        } catch (erroSalvar) {
          console.error("Erro ao salvar leitura da foto:", erroSalvar);
        }
      }

      return resultadoOk;
    } catch (erroFoto) {
      const resultadoErro = {
        erro_leitura: erroFoto.message || "Não foi possível conferir a foto.",
      };
      if (!silencioso) setResultadoFoto(resultadoErro);
      return resultadoErro;
    } finally {
      if (!silencioso) setEnviandoFoto(false);
    }
  }

  async function verFotoSelecionada(id) {
    if (!id) return;

    setCarregandoPreview(true);

    try {
      const resultado = await buscarFotoFechamentoCaixa(id);
      setFotoPreview(resultado?.foto || null);
    } catch (erroFoto) {
      alert(erroFoto.message || "Não foi possível carregar a foto.");
    } finally {
      setCarregandoPreview(false);
    }
  }

  const formasPagamento = Object.entries(
    resumo?.totais_por_forma_pagamento || {}
  );

  // Confronto Sistema × Informado calculado aqui (não só dentro da tabela)
  // pra poder mostrar um aviso no topo da tela quando tiver diferença,
  // igual o aviso de CMV alto do Dashboard.
  const confrontoCalculado = useMemo(() => {
    const totaisBrutos = { ...(resumo?.totais_brutos_por_forma_pagamento || {}) };

    // iFood/Brendi (Pago Online), Voucher Parceiro, A prazo (funcionários),
    // Vale, Cortesia e QUALQUER outra forma nova que a Saipos vier a
    // reportar entram automático como "Sistema" — só Dinheiro fica sem
    // "Sistema" automático (é físico, só o que o operador informar mesmo).
    // Crédito/Débito/Pix de balcão a Saipos também reporta, mas quem manda
    // nesses é a PagSeguro (já preenchido acima), então são ignorados aqui
    // pra não somar em dobro.
    if (resumoSaipos?.totais_por_forma_pagamento) {
      Object.entries(resumoSaipos.totais_por_forma_pagamento).forEach(
        ([nomeSaipos, valor]) => {
          if (/pix/i.test(nomeSaipos)) return; // já vem da PagSeguro
          if (nomeSaipos === "Crédito" || nomeSaipos === "Débito") return; // já vem da PagSeguro
          const nomeConfronto = MAPA_SAIPOS_PARA_CONFRONTO[nomeSaipos] || nomeSaipos;
          if (nomeConfronto === "Dinheiro") return; // Dinheiro não tem Sistema automático
          totaisBrutos[nomeConfronto] = Number(valor || 0);
        }
      );
    }

    // Valor manual informado pelo usuário só pra esse fechamento
    // específico (ex.: Dinheiro, que normalmente não tem "Sistema"
    // automático) — sobrescreve o que vier de PagSeguro/Saipos. Recurso
    // raro, usado só em algum caso pontual — hoje nenhum fechamento usa.
    const sistemaManual = mesclarDosItens(grupoEscolhido, "sistema_manual");
    if (sistemaManual) {
      Object.assign(totaisBrutos, sistemaManual);
    }

    // A lista de linhas é a união do que o operador informou (foto/OCR) com
    // o que a Saipos/PagSeguro reportou como Sistema — assim, se aparecer
    // uma forma de pagamento nova só no Sistema (ainda sem foto lida ou não
    // reconhecida na foto), ela mesmo assim aparece na tabela já com o
    // valor esperado preenchido.
    const todasAsFormas = Array.from(
      new Set([...Object.keys(valoresInformados), ...Object.keys(totaisBrutos)])
    );

    const linhas = todasAsFormas.map((forma) => {
      const temSistema = forma in totaisBrutos;
      const valorSistema = totaisBrutos[forma] || 0;
      const valorInformadoTexto = valoresInformados[forma] ?? "";
      const temInformado = valorInformadoTexto !== "";
      const valorInformado = temInformado
        ? Number(valorInformadoTexto.replace(",", "."))
        : null;
      const diferenca =
        temInformado && temSistema
          ? Number((valorSistema - valorInformado).toFixed(2))
          : null;
      const bateu = diferenca != null && Math.abs(diferenca) < 0.01;

      return {
        forma,
        valorSistema,
        temSistema,
        temInformado,
        diferenca,
        bateu,
      };
    });

    const diferencaTotal = linhas
      .filter((linha) => linha.temInformado && linha.temSistema)
      .reduce((soma, linha) => soma + linha.diferenca, 0);
    const algumInformado = linhas.some(
      (linha) => linha.temInformado && linha.temSistema
    );

    return { linhas, diferencaTotal, algumInformado };
  }, [resumo, resumoSaipos, valoresInformados, grupoEscolhido]);

  const temDiferencaNoConfronto =
    confrontoCalculado.algumInformado &&
    Math.abs(confrontoCalculado.diferencaTotal) >= 0.01;

  return (
    <>
      <div className="conciliacao-abas">
        <button
          type="button"
          className={abaAtiva === "caixa" ? "aba-ativa" : ""}
          onClick={() => setAbaAtiva("caixa")}
        >
          Fechamento de Caixa
        </button>
        <button
          type="button"
          className={abaAtiva === "despesas" ? "aba-ativa" : ""}
          onClick={() => setAbaAtiva("despesas")}
        >
          Despesas (Extrato Bancário)
        </button>
      </div>

      {abaAtiva === "despesas" ? (
        <ConciliacaoDespesas />
      ) : (
    <section className="conciliacao-layout">
      {temDiferencaNoConfronto && (
        <div
          className="fp-alerta-cmv fp-alerta-cmv-critico"
          style={{ marginBottom: "16px" }}
        >
          <span className="fp-alerta-cmv-icone">🚨</span>

          <div>
            <strong>
              Diferença no confronto:{" "}
              {confrontoCalculado.diferencaTotal > 0
                ? `falta ${formatarMoeda(confrontoCalculado.diferencaTotal)}`
                : `sobra ${formatarMoeda(
                    Math.abs(confrontoCalculado.diferencaTotal)
                  )}`}
            </strong>
            <span>
              O que o sistema esperava não bateu com o que foi informado no
              fechamento. Confira a tabela de confronto abaixo antes de
              fechar o caixa.
            </span>
          </div>
        </div>
      )}

      <article className="panel">
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            marginBottom: "0.3rem",
          }}
        >
          <div>
            <span className="eyebrow">Conciliação de pagamentos</span>
            <h2 style={{ margin: 0 }}>PagSeguro em tempo real</h2>
          </div>

          {resumo && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: "1px",
                lineHeight: 1.4,
                fontSize: "14px",
              }}
            >
              <div>
                <span style={{ display: "inline-block", width: "20px" }}>
                  💰
                </span>{" "}
                Total recebido:{" "}
                <strong>{formatarMoeda(resumo.total_recebido)}</strong>
              </div>

              <div>
                <span style={{ display: "inline-block", width: "20px" }}>
                  🧾
                </span>{" "}
                Vendas: <strong>{resumo.quantidade_recebida} recebidas</strong>
                {resumo.quantidade_pendente_ou_cancelada > 0 &&
                  ` · ${resumo.quantidade_pendente_ou_cancelada} pend./canc.`}
              </div>

              {formasPagamento.map(([forma, valor]) => (
                <div key={forma}>
                  <span style={{ display: "inline-block", width: "20px" }}>
                    💳
                  </span>{" "}
                  <strong style={{ color: "#16ca50" }}>{forma}</strong>:{" "}
                  <strong>{formatarMoeda(valor)}</strong>
                </div>
              ))}
            </div>
          )}

          <div
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            {!lojaId ? (
              <small className="foto-ajuda">
                Selecione uma loja no seletor do topo da tela.
              </small>
            ) : (
              <>
                <strong style={{ fontSize: "13px" }}>
                  1. Escolha o fechamento
                </strong>

                {carregandoLista ? (
                  <small className="foto-ajuda">Carregando...</small>
                ) : fechamentosAgrupados.length === 0 ? (
                  <small className="foto-ajuda">
                    Nenhum Fechamento de Caixa encontrado ainda pra essa
                    loja.
                  </small>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "8px",
                    }}
                  >
                    {fechamentosAgrupados.map((grupo) => (
                      <button
                        key={grupo.dataChave}
                        type="button"
                        className={
                          grupoEscolhido?.dataChave === grupo.dataChave
                            ? "primary-button"
                            : "secondary-button"
                        }
                        onClick={() => setGrupoEscolhido(grupo)}
                      >
                        📅{" "}
                        {new Date(
                          `${grupo.dataChave}T00:00:00`
                        ).toLocaleDateString("pt-BR")}
                        {grupo.itens.length > 1
                          ? ` (${grupo.itens.length} fotos)`
                          : ""}
                      </button>
                    ))}
                  </div>
                )}

                {grupoEscolhido && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "1rem",
                      flexWrap: "wrap",
                      marginTop: "4px",
                    }}
                  >
                    <strong style={{ fontSize: "13px" }}>
                      2. Gerar a conciliação
                    </strong>

                    <button
                      type="button"
                      className="approve-button"
                      style={{ fontSize: "15px", padding: "10px 18px" }}
                      onClick={conciliarAgora}
                      disabled={carregando || enviandoFoto}
                    >
                      {carregando || enviandoFoto
                        ? "Conciliando..."
                        : "✅ Conciliar agora"}
                    </button>

                    {grupoEscolhido.itens.map((item, indice) => (
                      <button
                        key={item.id}
                        type="button"
                        className="secondary-button"
                        onClick={() => verFotoSelecionada(item.id)}
                        disabled={carregandoPreview}
                      >
                        {carregandoPreview
                          ? "Carregando..."
                          : grupoEscolhido.itens.length > 1
                            ? `👁️ Ver foto ${indice + 1}`
                            : "👁️ Ver foto"}
                      </button>
                    ))}

                    {grupoEscolhido.itens.some(
                      (item) => item.valores_informados
                    ) && (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={relerFotoAgora}
                        disabled={carregando || enviandoFoto}
                        title="A leitura já está salva — só use isso se quiser tentar ler a(s) foto(s) de novo."
                      >
                        {enviandoFoto ? "Lendo..." : "🔄 Ler foto de novo"}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {resultadoFoto && (
          <div
            className="empty-state"
            style={{
              color: resultadoFoto.erro_leitura ? undefined : "#16ca50",
              marginBottom: "10px",
            }}
          >
            {resultadoFoto.erro_leitura ? (
              <>
                {resultadoFoto.erro_leitura}
                {resultadoFoto.debugRespostaIa != null && (
                  <div
                    style={{
                      marginTop: "8px",
                      fontSize: "12px",
                      color: "#9fb0c4",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    (debug — o que a IA respondeu:){" "}
                    {resultadoFoto.debugRespostaIa}
                  </div>
                )}
              </>
            ) : (
              <>
                {resultadoFoto.salvo
                  ? "✅ Usando a leitura já salva desse fechamento (não chamou a IA de novo)."
                  : "✅ Valores lidos e preenchidos na tabela abaixo — leitura salva pra próxima vez."}
                {resultadoFoto.formasNaoLidas?.length > 0 &&
                  ` Não consegui ler: ${resultadoFoto.formasNaoLidas.join(", ")} — preencha essa(s) manualmente.`}
              </>
            )}
          </div>
        )}

        {erro && <div className="empty-state">{erro}</div>}

        {resumo && (
          <>
            <div
              className="panel-header"
              style={{
                margin: "10px 0 10px",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div>
                <span className="eyebrow">Confronto</span>
                <h2>Sistema × Informado, por forma de pagamento</h2>
              </div>
            </div>

            {(() => {
              const { linhas, diferencaTotal, algumInformado } =
                confrontoCalculado;

              return (
                <>
                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>Forma de pagamento</th>
                          <th>Sistema</th>
                          <th>Informado</th>
                          <th>Diferença</th>
                        </tr>
                      </thead>
                      <tbody>
                        {linhas.map(
                          ({
                            forma,
                            valorSistema,
                            temSistema,
                            temInformado,
                            diferenca,
                            bateu,
                          }) => (
                            <tr key={forma}>
                              <td style={{ color: "#16ca50", fontWeight: 700 }}>
                                {forma}
                              </td>
                              <td>
                                {temSistema ? formatarMoeda(valorSistema) : "—"}
                              </td>
                              <td>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="0,00"
                                  value={valoresInformados[forma] ?? ""}
                                  onChange={(evento) =>
                                    setValoresInformados((anterior) => ({
                                      ...anterior,
                                      [forma]: evento.target.value,
                                    }))
                                  }
                                  style={{ maxWidth: "120px" }}
                                />
                              </td>
                              <td
                                style={{
                                  color:
                                    !temInformado || !temSistema
                                      ? undefined
                                      : bateu
                                      ? "#16ca50"
                                      : diferenca > 0
                                      ? "#ff4655"
                                      : "#16ca50",
                                  fontWeight: 700,
                                }}
                              >
                                {!temSistema
                                  ? "(sem comparação ainda)"
                                  : !temInformado
                                  ? "—"
                                  : bateu
                                  ? "✅ Bateu"
                                  : diferenca > 0
                                  ? `Falta ${formatarMoeda(diferenca)}`
                                  : `Sobra ${formatarMoeda(Math.abs(diferenca))}`}
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>

                  {algumInformado && (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        marginTop: "16px",
                      }}
                    >
                    <div
                      style={{
                        padding: "14px 18px",
                        border: "2px solid",
                        borderColor:
                          Math.abs(diferencaTotal) < 0.01
                            ? "#16ca50"
                            : diferencaTotal > 0
                            ? "#ff4655"
                            : "#16ca50",
                        borderRadius: "10px",
                        fontWeight: 700,
                        fontSize: "16px",
                        textAlign: "center",
                        color:
                          Math.abs(diferencaTotal) < 0.01
                            ? "#16ca50"
                            : diferencaTotal > 0
                            ? "#ff4655"
                            : "#16ca50",
                      }}
                    >
                      {Math.abs(diferencaTotal) < 0.01
                        ? "✅ Diferença final total: bateu certinho"
                        : diferencaTotal > 0
                        ? `Diferença final total: falta ${formatarMoeda(diferencaTotal)}`
                        : `Diferença final total: sobra ${formatarMoeda(Math.abs(diferencaTotal))}`}
                    </div>
                    </div>
                  )}
                </>
              );
            })()}
          </>
        )}

        <div className="panel-header" style={{ margin: "10px 0 10px" }}>
          <div>
            <span className="eyebrow">Últimas vendas</span>
            <h2>Caindo na PagSeguro, por forma de pagamento</h2>
          </div>
        </div>

        {!resumo || resumo.ultimas_vendas?.length === 0 ? (
          <div className="empty-state">
            {carregando
              ? "Buscando..."
              : "Nenhuma venda encontrada nesse período."}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "1rem",
            }}
          >
            {agruparVendasPorFormaPagamento(resumo.ultimas_vendas).map(
              (grupo) => (
                <div key={grupo.forma}>
                  <div style={{ marginBottom: "10px" }}>
                    <strong style={{ color: "#16ca50" }}>
                      {grupo.forma}
                    </strong>{" "}
                    <span>({grupo.vendas.length})</span>
                  </div>

                  <div className="categorias-lista">
                    {grupo.vendas.map((venda) => {
                      const pendenteOuCancelada =
                        estaPendenteOuCancelada(venda);

                      return (
                        <div className="categoria-item" key={venda.codigo}>
                          <div className="categoria-identificacao">
                            <div className="categoria-icone">
                              {pendenteOuCancelada ? "⚠️" : "💰"}
                            </div>

                            <div>
                              <strong
                                style={
                                  pendenteOuCancelada
                                    ? { color: "#ff4655" }
                                    : undefined
                                }
                              >
                                {formatarMoeda(venda.valor_liquido)}
                              </strong>{" "}
                              <small
                                style={{ color: "#9fb0c4", fontSize: "11px" }}
                              >
                                #{venda.codigo?.slice(-8)}
                              </small>
                              <div
                                style={
                                  pendenteOuCancelada
                                    ? { color: "#ff4655" }
                                    : undefined
                                }
                              >
                                {formatarDataHora(venda.data)}
                                {pendenteOuCancelada &&
                                  ` · ${venda.status_descricao}`}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </article>

      {fotoPreview && (
        <div
          className="modal-overlay"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget) {
              setFotoPreview(null);
            }
          }}
        >
          <div className="modal modal-foto">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Fechamento de caixa</span>
                <h2>Foto enviada</h2>
              </div>

              <button
                type="button"
                className="close-button"
                onClick={() => setFotoPreview(null)}
              >
                ×
              </button>
            </div>

            <img
              src={fotoPreview}
              alt="Foto do fechamento de caixa"
              className="foto-modal-imagem"
            />
          </div>
        </div>
      )}
    </section>
      )}
    </>
  );
}

export default Conciliacao;
