# MODULO-PFOLIO-SPEC — Módulo 62: Portfólio de projetos

**Domain 📋 PMO & Projetos · capacidade _Portfólio_ · `module_id = pfolio` · schema `pfolio`**
Onda Treze (Fase 2 — FECHA o Domain PMO & Projetos, o MAIOR do mapa). ⭐⭐ **A
ÚLTIMA peça:** com ela o PMO chega às **10/10 capacidades**. Migration
`0077_pfolio.sql`, pacote `@alsham/pfolio`, teste `67_pfolio_isolation.sql`.

---

## 0. AS DECISÕES DE CANON

- ⭐⭐ **A ÚLTIMA PEÇA — fecha o PMO em 10/10.** O Domain PMO & Projetos abriu na
  Onda Doze com 5 capacidades (Projetos · Cronogramas · Kanban · Recursos ·
  Custos) e completou-se na Onda Treze (Scrum · Gantt · Riscos · Timesheet ·
  **Portfólio**). Este é o décimo e último cartão do domínio.
- ⭐ **O que este módulo É:** um portfólio REÚNE projetos para leitura executiva
  — a diretoria lê vários projetos juntos, sob um recorte. Duas peças:
  `pfolio.portfolios` (o agrupamento) e `pfolio.members` (o vínculo N:N
  portfólio↔projeto).
- ⭐ **`active ↔ archived` nos dois sentidos — o reaproveitamento do `vendor`/`dc`
  assinado, e o DIVERGE dos fins TERMINAIS do `proj`.** Copiar sem pensar e
  divergir sem escrever são o mesmo erro (CLAUDE.md); a pergunta foi refeita: o
  portfólio é um TRABALHO que encerra (física do `proj`, onde
  `completed`/`cancelled` NÃO reabrem) ou uma LEITURA que se organiza (física do
  `vendor`/`dc`, o registro que arquiva e volta)? É leitura: o portfólio que a
  empresa arquiva ao fim de um ciclo executivo e reabre no seguinte é o MESMO
  portfólio — obrigá-lo a renascer partiria a lista de projetos em dois. Então
  `archived → active` EXISTE. Não há carimbo de arquivamento: `active`/`archived`
  é metadado REVERSÍVEL, não um fim. O contraste `pfolio × proj` é assinado no
  `lifecycle.test.ts` (lê as duas migrations).
- ⭐ **Membros N:N — a FK do membro ao portfólio é INTRA-SCHEMA (ALLOWED).** O
  membro é peça do PRÓPRIO módulo: seu vínculo ao portfólio é uma FK COMPOSTA
  `(portfolio_id, tenant_id) → pfolio.portfolios(id, tenant_id)`, dentro do mesmo
  schema — permitido e correto (a Lei do Lego proíbe ler schema ALHEIO, não o
  próprio). Já o vínculo ao PROJETO é ID SOLTO (`project_id` + `project_name`
  carimbado pela tela) — cross-module, sem FK.
- ⭐⭐ **Um projeto pode viver em VÁRIOS portfólios.** A unicidade é por
  `(tenant, portfólio, projeto)`, JAMAIS global em `project_id`. É o ponto do
  módulo: o mesmo projeto aparece em recortes executivos distintos. Membership é
  MUTÁVEL (projetos entram e saem) — por isso, e só em `members`, há policy e
  grant de DELETE, com o fato `pfolio.member.removed`.
- ⭐ **Nome e descrição são TEXTO LIVRE** (anti-viés). `consumes` VAZIO.

## 1. AS PEÇAS

- `pfolio.portfolios` — o agrupamento: `name` (texto livre, obrigatório),
  `description` (opcional), `status` (`active`/`archived`), autor do servidor.
- `pfolio.members` — o vínculo N:N: `portfolio_id` (FK composta intra-schema),
  `project_id` (id solto, obrigatório) + `project_name` (carimbado pela tela);
  único por `(tenant, portfólio, projeto)`.
- `pfolio.allowed_transition()` — espelho de `ALLOWED_TRANSITIONS` em `@alsham/pfolio`.
- Gatilhos: nascimento sempre `active` + autor do servidor (nas duas tabelas);
  transição do portfólio gated por `pfolio.portfolio.manage`; emissão de fato.

## 2. OS FATOS

`pfolio.portfolio.registered` · `pfolio.portfolio.archived` ·
`pfolio.portfolio.restored` · `pfolio.member.added` · `pfolio.member.removed`.
Payload autossuficiente. `consumes` VAZIO (Lei 7 — sem redeploy do `apps/api`).

## 3. AS TELAS

`/portfolio` — placeholder por ora (o módulo vive no banco e no motor; a tela
rica, com a leitura dos projetos de cada portfólio, é frente de UI própria).

## 4. AS PERMISSÕES

- `pfolio.portfolio.manage` — uma só permissão cobre os portfólios e a gestão
  dos projetos que cada um reúne.

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- **Rollup/agregação automática de métricas dos projetos no portfólio** — é
  frente de BI de LEITURA (soma de custos, progresso médio, saúde consolidada).
  Não há coluna de rollup ARMAZENADA: número sem fonte é proibido (Lei 7), e o
  agregado se calcula na leitura, sobre os dados vivos dos projetos, nunca se
  congela numa coluna do portfólio.
- **Orçamento de portfólio** — é o `bud` genérico, por id solto (futuro).
- **Tela rica** — próxima frente de UI.

## 6. ESTADO DA CONSTRUÇÃO

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `pfolio` (`0077_pfolio.sql`) | ✅ CONSTRUÍDO (arquivo; apply do dono) |
| Pacote `@alsham/pfolio` | ✅ CONSTRUÍDO |
| Seed (cartão pmo) | ✅ CONSTRUÍDO (cartão adicionado pelo dono) |
| Teste SQL `67_pfolio_isolation.sql` + CI | ✅ CONSTRUÍDO |
| Portal `/portfolio` | ✅ CONSTRUÍDO (placeholder) |
| Rollup / orçamento de portfólio | ⛔ **NÃO CONSTRUÍDO** (§5) |

## 7. APPLY (dono)

`docs/runbook/APLICAR.md §26`. Expor o schema `pfolio` na Data API. `consumes`
vazio → sem redeploy do `apps/api`.
