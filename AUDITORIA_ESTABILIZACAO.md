# Auditoria de Estabilização — FinancePro

Data: 2026-09-01
Escopo: varredura por padrões de risco em toda a árvore (`backend/server.js`,
`frontend/src/**`) + leitura profunda dos caminhos de escrita financeira,
tratamento de datas, parsing de moeda e os fluxos de geração automática.

**Nada foi alterado.** Este documento é só o levantamento, por prioridade.

---

## CRÍTICO (mexe com dinheiro / duplicação / perda de dado)

### C1 — `id: Date.now()` como chave primária de lançamentos — ✅ CORRIGIDO (commit 805c784)
Sequence do IDENTITY reposicionada (`setval` em 1788273231892) e removido o
`id: Date.now()` dos 7 inserts em `lancamentos`. Testado: lançamento manual
(despesa + receita) salva com id novo, aparece no topo do Feed. Restante do
teste de regressão o usuário vai observar no uso normal.
Pendente (mesmo padrão, outras tabelas): `retiradas_socios`,
`saldo_conferido`, `despesas_recorrentes` — falta conferir schema.

### C2 — Finalizar Fechamento de Caixa duplica despesas de diária — ✅ CORRIGIDO
Migração: `contas_pagar.chave_origem` + índice único parcial.
`lancamentos.chave_importacao` reaproveitado. Cada despesa/conta gerada na
finalização leva chave única por registro de origem
(`FECHDIN:<id>`, `FECHVALE:<id>`, `FECHCP:<id>`); no 23505 o código pula em
vez de recriar. Mudança de comportamento conhecida: se o admin apagar uma
conta/despesa auto-gerada, refinalizar NÃO a recria (proposital — evita
duplicar dinheiro).
Risco residual: uma diária já duplicada ANTES desta correção (chave null)
pode gerar 1 cópia a mais numa única refinalização; da 2ª em diante está
travado. Não foi feito backfill de chave no histórico (arriscado, mexe em
valores).

### C1-detalhe — `id: Date.now()` como chave primária de lançamentos
**Onde:** `backend/server.js` linhas 1450, 2995, 4570, 4805, 6707, 7566, 7672, 9695, 9833
**O quê:** o backend gera o `id` do lançamento com `Date.now()` (milissegundos).
Dois inserts no mesmo milissegundo (duplo clique que fura o guard do front,
retry de rede, dois dispositivos, loop rápido) geram o **mesmo id**.
- Com PK/unique no banco: o 2º insert falha com `23505` e o operador vê um erro
  genérico "não foi possível salvar" — num lançamento que era legítimo.
- Nos loops com `Date.now()` puro (linhas 4570, 4805): `Date.now()` fica
  constante dentro do loop → colisão **garantida** entre iterações, dependendo
  de como `diaria.id`/`vale.id` somam.
**Só 1 lugar (import Saipos, linha 5641) usa o padrão reforçado** `Date.now()*1000 + random`.
**Causa raiz:** id gerado na aplicação em vez de deixar o Postgres gerar.
**Correção proposta:** coluna `id` com `identity`/`default` no banco e parar de
mandar `id` no insert; onde não der, padronizar `Date.now()*1000 + random`.
Requer conferir o schema da tabela `lancamentos` antes.

### C2 — Finalizar Fechamento de Caixa duplica despesas de diária
**Onde:** `backend/server.js` ~4530–4820 (geração de despesas a partir de `fechamentos_caixa` tipo diária)
**O quê:** a proteção contra repetição é só uma **janela por `criado_em`**
(`> finalizacaoAnterior.criado_em` e `<= finalizacao_atual.criado_em`).
Não existe chave de idempotência por registro de origem. Re-finalizar o mesmo
fechamento, ou uma sobreposição de janela, ou `finalizacaoAnterior` calculada
errada → **despesas duplicadas**.
**Já aconteceu:** ~R$ 1.450,10 de diárias duplicadas em 17 e 21/08.
**Correção proposta:** chave única `chave_geracao` = `FECH:<finalizacao_id>:<diaria.id>`
(ou por `diaria.id`) + índice UNIQUE parcial + tratar `23505` como "já gerado,
pula". Mesmo padrão que travou o import Saipos (`chave_importacao`).

### C3 — Lançamento manual: trava fraca + sem idempotência — ✅ CORRIGIDO (commit aaff1c6)
`salvandoRef` (useRef) trava o handler de forma síncrona. Cada `abrirModal`
gera um `crypto.randomUUID()` que vai no POST como `client_request_id`; o
backend grava `chave_importacao = MANUAL:<uuid>` e, num reenvio (23505),
devolve a linha já gravada com 200 em vez de duplicar. Sem migração
(reusa `lancamentos.chave_importacao`). Build + lint + 19 testes ok.

### C3-detalhe — original
**Onde:** `frontend/src/App.jsx` 3469–3711 ; `backend/server.js` 1378 (POST /lancamentos)
**O quê:**
- `if (salvando) return` (App.jsx:3472) lê o state do React da renderização
  atual — dois cliques rápidos veem `salvando === false` os dois.
- `setSalvando(true)` só roda na linha 3662, ~190 linhas depois.
- Não há trava síncrona (`useRef`) no topo do handler.
- O backend não tem nenhuma checagem de repetição (sem chave de idempotência).
Resultado: duplo clique / retry / voltar-no-navegador e reenviar → lançamento
duplicado.
**Correção proposta:** `useRef` travando o handler de forma síncrona no início +
`disabled` no botão (já existe em 8087/8095, mas não basta sozinho) +
idempotência no backend (hash de `tipo+valor+data+descricao+loja_id` numa janela
curta, ou um `client_request_id` gerado no modal).

---

## ALTO

### A1 — `prepararLancamento` no backend não valida nada — ✅ CORRIGIDO (commit pendente)
Novo `validarLancamentoManual(dados)` chamado em `POST /lancamentos` e
`PUT /lancamentos/:id` (só os caminhos manuais — NÃO no WhatsApp, que cria
com valor 0 de propósito, nem na finalização/Saipos/conta a pagar).
Regras: `tipo` ∈ {receita, despesa}; `valor` número finito e > 0 e ≤ 1e9;
`data` no formato `AAAA-MM-DD` e data real. Falha → 400 com mensagem clara
(o front mostra no alert). Não exige descrição (o formulário também não).
Build + 19 testes ok.

### A1-detalhe — original
**Onde:** `backend/server.js` 536
**O quê:** `valor: Number(dados.valor || 0)` → se vier `"abc"`, resultado é `NaN`
e segue pro insert. `tipo` aceita qualquer string. `data` sem validação de
formato. `descricao` pode ser vazia. O backend confia 100% no cliente.
**Correção proposta:** validar no servidor: `tipo ∈ {receita, despesa}`,
`valor` finito e `> 0`, `data` no formato `YYYY-MM-DD`, `descricao` não vazia —
retornar 400 com mensagem clara. (Regra 8 do comando mestre.)

### A2 — PUT /lancamentos/:id apagava campos que a edição não carrega — ✅ CORRIGIDO (commit pendente)
Confirmado e PIOR que o anotado: editar um lançamento (mesmo só a
descrição) zerava `forma_pagamento_id` + `valor_bruto` +
`valor_liquido_esperado` + `data_prevista_recebimento` (→ receita a prazo
perdia o prazo e sumia de Contas a Receber — raiz do problema recorrente),
`fundo_retirada_id` + `valor_pago_cofre` (→ Saldo descontava de novo a
parte do Cofre), `detalhe_desconto` (salário), e `foto`/`fotos_extra`/
`foto_mercadoria` (se salvasse antes do carregamento assíncrono — raiz do
"foto sumindo").
Correção backend-only no `PUT /lancamentos/:id`: busca a linha existente
com esses campos e (a) nunca apaga foto/fotos_extra/foto_mercadoria que já
tenham conteúdo quando o incoming vem vazio; (b) sempre mantém
`fundo_retirada_id`/`valor_pago_cofre`/`detalhe_desconto` (sem UI de
edição); (c) mantém forma de pagamento + derivados quando
`req.body.forma_pagamento_id` vem vazio (= "não mexeu"). Trocar a forma de
propósito no select ainda funciona.
Escopo deixado de fora: se um dia houver UI pra editar Cofre/forma, o
recompute de `data_prevista_recebimento` precisa passar a usar a data do
lançamento, não `new Date()`.

### A2-detalhe — original
**Onde:** `backend/server.js` ~1608 (`.update(lancamentoAtualizado).eq("id", id)`)
**O quê:** precisa confirmar se `lancamentoAtualizado` preserva campos que o
cliente não mandou (foto, `status`, `criado_por`, `chave_importacao`,
`valor_pago_cofre`). Se não preservar, editar um campo apaga os outros —
casa com o histórico de "foto sumindo".
**Status:** sinalizado, ainda não verifiquei linha a linha o corpo do handler.

### A3 — Uso de `.single()` — ✅ REVISADO, quase nada a fazer (commit pendente)
Pente fino nos ~87 usos: a esmagadora maioria é `.insert()/.update() …
.select().single()` (a linha existe, seguro) ou lookup com o erro capturado
e guardado (`|| !data`, `data?.`) devolvendo resposta correta. Todos os
caminhos de auth (`verificarAdmin`, `verificarPermissao`,
`obterPerfilOpcional`) e `aprovacaoDespesasAtiva` já tratam 0 linhas.
Únicos 2 lookups "0 linhas é válido" sem captura: `formas_pagamento` no
update (`antes`) e no delete (`existente`) → trocados pra `.maybeSingle()`.
Mass-conversão dos outros 85 seria churn sem ganho (viola regra 16).

---

## MÉDIO

### M1 — Parser de moeda divergente em ConciliacaoDespesas — ✅ CORRIGIDO (commit pendente)
`normalizarValor` (parse do valor no CSV de extrato bancário) agora: com
vírgula → vírgula decimal, pontos milhar; sem vírgula mas no padrão
`\d{1,3}(\.\d{3})+` → tira os pontos (`"1.234"`→1234, `"1.234.567"`→
1234567); senão (`"1234.56"`) o ponto é decimal. Mesma lógica do
`parsearValorBrasileiro` do backend.

### M2 — `paraNumero` engole entrada inválida virando 0 — ✅ REVISADO, sem ação
`Number.isNaN → 0`. Todo ponto de entrada de valor já valida `> 0`: o
front (`if (!valorNumerico || <= 0)`) e agora o backend (A1,
`validarLancamentoManual`). `0` é mais seguro que `NaN` num cálculo
(regra 8). Mudar o contrato de `paraNumero` (usado em muitos lugares)
seria risco sem ganho.

### M3 — Parsing de moeda repetido inline no App.jsx — ✅ CORRIGIDO (commit pendente)
`salvarLancamento` usava `String(...).replace().replace()` inline pro
`valorNumerico` e `paraNumero(formulario.valor)` logo abaixo pro `bruto`
— duas regras pro mesmo campo. Agora `valorNumerico = paraNumero(...)`.

### M4 — ~25 de 149 blocos `catch` sem status — ✅ REVISADO, sem ação
Todos os ~25 são **funções auxiliares** (retornam default seguro: `[]`,
`null`, `true`) ou **try/catch internos** que logam e seguem de propósito
("não deixa falhar por causa disso"). Nenhum handler de rota engole erro
de escrita como sucesso. Os 124 `res.status(500)` cobrem os catches
externos dos handlers. O único que devolve 200 num erro (`~3975`, leitura
de foto de produtos) manda `erro_leitura` no corpo e é leitura, não
escrita.

---

## BAIXO

### B1 — `key={i}` em 2 listas do Conciliacao.jsx (2629, 2793)
Listas de render estático, risco baixo. Trocar por chave estável.

### B2 — Arquivos de backup / código morto no repositório
`backend/server-backup-claude.js`, `frontend/src/App-backup-claude.jsx`,
`frontend/src/App.jsx` tem 8.367 linhas (arquivo único gigante).
Não é bug, mas dificulta auditoria e o Vite varre `src/`.

### B3 — `.gitignore` não versionado

---

## Ainda NÃO auditado (próximas passadas)

- Paridade de números entre Dashboard, Relatórios, Fluxo de Caixa e Conciliação
  para o mesmo período (regra 22).
- Sequência cronológica da Conciliação diária ponta a ponta (regra 4) —
  `conferirAberturaVsFechamentoAnterior` foi ajustado antes, falta revalidar.
- Todo `useEffect` (dependências / loop / corrida).
- Os 87 `.single()` um a um.
- Os ~25 `catch` sem status.
- Corpo completo do PUT /lancamentos/:id (A2).

---

## Ordem de trabalho proposta

1. **C1** (id no banco) — precisa ver o schema primeiro; base pra tudo.
2. **C2** (chave de idempotência na finalização de fechamento) — bug já materializado.
3. **C3** (trava síncrona + idempotência no lançamento manual).
4. **A1** (validação no backend).
5. **A2** (PUT não sobrescrever).
6. **A3 / M1–M4**.
7. Passadas restantes da seção "não auditado".

Cada correção: análise de impacto → mudança mínima → teste → checagem de
regressão nas telas dependentes → só então seguir.
