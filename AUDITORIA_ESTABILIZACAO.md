# Auditoria de Estabilização — FinancePro

Data: 2026-09-01
Escopo: varredura por padrões de risco em toda a árvore (`backend/server.js`,
`frontend/src/**`) + leitura profunda dos caminhos de escrita financeira,
tratamento de datas, parsing de moeda e os fluxos de geração automática.

**Nada foi alterado.** Este documento é só o levantamento, por prioridade.

---

## CRÍTICO (mexe com dinheiro / duplicação / perda de dado)

### C1 — `id: Date.now()` como chave primária de lançamentos
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

### C3 — Lançamento manual sem idempotência + trava de duplo-envio fraca
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

### A1 — `prepararLancamento` no backend não valida nada
**Onde:** `backend/server.js` 536
**O quê:** `valor: Number(dados.valor || 0)` → se vier `"abc"`, resultado é `NaN`
e segue pro insert. `tipo` aceita qualquer string. `data` sem validação de
formato. `descricao` pode ser vazia. O backend confia 100% no cliente.
**Correção proposta:** validar no servidor: `tipo ∈ {receita, despesa}`,
`valor` finito e `> 0`, `data` no formato `YYYY-MM-DD`, `descricao` não vazia —
retornar 400 com mensagem clara. (Regra 8 do comando mestre.)

### A2 — PUT /lancamentos/:id sobrescreve a linha inteira
**Onde:** `backend/server.js` ~1608 (`.update(lancamentoAtualizado).eq("id", id)`)
**O quê:** precisa confirmar se `lancamentoAtualizado` preserva campos que o
cliente não mandou (foto, `status`, `criado_por`, `chave_importacao`,
`valor_pago_cofre`). Se não preservar, editar um campo apaga os outros —
casa com o histórico de "foto sumindo".
**Status:** sinalizado, ainda não verifiquei linha a linha o corpo do handler.

### A3 — Uso pesado de `.single()` (87×) vs `.maybeSingle()` (6×)
**Onde:** `backend/server.js` (vários)
**O quê:** `.single()` estoura erro (`PGRST116`) quando a consulta traz 0 linhas.
Em lookups que legitimamente podem não achar nada, isso vira 500 / caminho de
exceção em vez de "não encontrado" tratado.
**Correção proposta:** pente fino nos 87 usos, trocar para `.maybeSingle()` +
checagem explícita de nulo onde 0 linhas é um resultado válido.

---

## MÉDIO

### M1 — Parser de moeda divergente em ConciliacaoDespesas
**Onde:** `frontend/src/components/ConciliacaoDespesas.jsx` 37 (`normalizarValor`)
**O quê:** usa a heurística antiga "tem vírgula?" — `"1.234"` (extrato de banco,
milhar sem centavos) vira `1.234`. O resto do app já migrou pro `paraNumero`
(`CampoValor.jsx`), que sempre tira os pontos primeiro. A importação/conciliação
de extrato bancário fica exposta.
**Correção proposta:** usar `paraNumero` (ou alinhar a regra) — a mesma função
para todo o sistema (regra 9).

### M2 — `paraNumero` engole entrada inválida virando 0
**Onde:** `frontend/src/components/CampoValor.jsx` 43
**O quê:** `Number.isNaN(numero) ? 0` — um valor digitado errado salva como
R$ 0,00 sem aviso.
**Correção proposta:** distinguir "vazio" (0 ok) de "inválido" (bloquear submit
com mensagem).

### M3 — Parsing de moeda repetido inline no App.jsx
**Onde:** `frontend/src/App.jsx` 3474 (`String(...).replace(/\./g,"").replace(",",".")`)
**O quê:** reimplementa `paraNumero` em vez de chamar. Risco de as duas regras
divergirem no futuro.
**Correção proposta:** chamar `paraNumero`.

### M4 — ~25 de 149 blocos `catch` no backend sem status de erro
**Onde:** `backend/server.js` (vários)
**O quê:** 124 `res.status(500)` para 149 `catch`. Confirmar que nenhum dos ~25
restantes está num caminho de escrita financeira devolvendo 200 "falso sucesso".

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
