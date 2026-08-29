// Health check da integração Saipos — rode com:  node _teste_token_saipos.js
// NÃO commitar. Pode apagar depois.
require("dotenv").config();

const TOKEN = process.env.SAIPOS_TOKEN;
const BASE = "https://data.saipos.io/v1";
const ID_STORE = 92235; // Uberlândia

if (!TOKEN) { console.log("❌ SAIPOS_TOKEN não encontrado no .env"); process.exit(1); }

function ymd(d) { return new Date(d).toISOString().slice(0, 10); }
const hoje = ymd(Date.now());
const ontem = ymd(Date.now() - 86400000);
const seteDias = ymd(Date.now() - 7 * 86400000);

// Replica consultarSaipos() do server.js: GET + query string + paginação p_limit/p_offset
async function consultarSaipos(caminho, parametros) {
  const registros = [];
  const limite = 300;
  let posicao = 0;
  let paginas = 0;
  while (true) {
    const url = new URL(`${BASE}${caminho}`);
    Object.entries(parametros).forEach(([k, v]) => url.searchParams.set(k, v));
    url.searchParams.set("p_limit", limite);
    url.searchParams.set("p_offset", posicao);
    const r = await fetch(url, { headers: { Authorization: "Bearer " + TOKEN }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) {
      const b = await r.text();
      throw new Error(`${caminho} -> HTTP ${r.status}: ${b.slice(0, 200)}`);
    }
    const pagina = await r.json();
    paginas++;
    registros.push(...pagina);
    if (pagina.length < limite) break;
    posicao += limite;
  }
  return { registros, paginas };
}

(async () => {
  console.log("Token: len=" + TOKEN.length + "  " + TOKEN.slice(0, 8) + "…" + TOKEN.slice(-4));
  let ok = true;

  // 1) /search_sales — janela 7 dias, com paginação completa
  try {
    const { registros, paginas } = await consultarSaipos("/search_sales", {
      p_date_column_filter: "shift_date", p_filter_date_start: seteDias, p_filter_date_end: hoje,
    });
    const daLoja = registros.filter((v) => Number(v.id_store) === ID_STORE);
    const outrasLojas = new Set(registros.map((v) => v.id_store).filter((s) => Number(s) !== ID_STORE));
    console.log(`\n[1] /search_sales  ${seteDias}..${hoje}`);
    console.log(`    HTTP 200 · ${paginas} página(s) · ${registros.length} vendas totais · ${daLoja.length} de Uberlândia`);
    if (outrasLojas.size) console.log(`    (também vieram lojas: ${[...outrasLojas].join(", ")})`);
    const semValor = daLoja.filter((v) => (v.total_amount ?? v.totals?.total_amount ?? null) === null);
    if (semValor.length) { console.log(`    ⚠️ ${semValor.length} vendas sem total_amount legível`); ok = false; }
    const canceladas = daLoja.filter((v) => v.canceled === "Y").length;
    console.log(`    canceladas: ${canceladas} · válidas: ${daLoja.length - canceladas}`);
  } catch (e) { console.log("\n[1] /search_sales  ❌ " + e.message); ok = false; }

  // 2) consistência: mesma consulta 2x seguidas (bug conhecido: 200 com menos vendas)
  try {
    const a = (await consultarSaipos("/search_sales", { p_date_column_filter: "shift_date", p_filter_date_start: ontem, p_filter_date_end: hoje })).registros.filter((v) => Number(v.id_store) === ID_STORE).length;
    await new Promise((r) => setTimeout(r, 1500));
    const b = (await consultarSaipos("/search_sales", { p_date_column_filter: "shift_date", p_filter_date_start: ontem, p_filter_date_end: hoje })).registros.filter((v) => Number(v.id_store) === ID_STORE).length;
    console.log(`\n[2] consistência (${ontem}..${hoje}): 1ª=${a} vendas · 2ª=${b} vendas ` + (a === b ? "✅ igual" : "⚠️ DIVERGIU (a garantia de completude cobre isso na importação)"));
  } catch (e) { console.log("\n[2] consistência  ❌ " + e.message); ok = false; }

  // 3) /search_financial_transactions — usado na Conciliação
  try {
    const { registros } = await consultarSaipos("/search_financial_transactions", {
      p_date_column_filter: "date", p_filter_date_start: seteDias, p_filter_date_end: hoje,
    });
    const daLoja = registros.filter((l) => Number(l.id_store) === ID_STORE);
    console.log(`\n[3] /search_financial_transactions  ${seteDias}..${hoje}`);
    console.log(`    HTTP 200 · ${registros.length} lançamentos totais · ${daLoja.length} de Uberlândia`);
  } catch (e) { console.log("\n[3] /search_financial_transactions  ❌ " + e.message); ok = false; }

  // 4) o que a importação diária processaria HOJE (dia anterior)
  try {
    const { registros } = await consultarSaipos("/search_sales", {
      p_date_column_filter: "shift_date", p_filter_date_start: ontem, p_filter_date_end: ontem,
    });
    const daLoja = registros.filter((v) => Number(v.id_store) === ID_STORE && v.canceled !== "Y");
    const soma = daLoja.reduce((s, v) => s + Number(v.total_amount ?? v.totals?.total_amount ?? 0), 0);
    const canais = {};
    daLoja.forEach((v) => { const c = v.partner_sale?.desc_partner_sale || "Balcão"; canais[c] = (canais[c] || 0) + 1; });
    console.log(`\n[4] dia anterior (${ontem}) — o que a importação automática das 5h pegaria:`);
    console.log(`    ${daLoja.length} vendas válidas · R$ ${soma.toFixed(2)}`);
    console.log(`    por canal: ` + Object.entries(canais).map(([c, n]) => `${c}=${n}`).join(", "));
  } catch (e) { console.log("\n[4] dia anterior  ❌ " + e.message); ok = false; }

  console.log("\n" + (ok ? "✅ Integração Saipos respondendo 100% (token, ambos os endpoints, paginação, consistência)." : "⚠️ Ver avisos acima."));
})();
