# MODULO-PCOST-SPEC — Módulo 57: Custos do Projeto (Project Costs)

**Domain 📋 PMO & Projetos · capacidade _Custos_ · `module_id = pcost` · schema `pcost`**
Onda Doze (Fase 2 — o Domain PMO & Projetos, o MAIOR do mapa). Migration
`0072_pcost.sql`, pacote `@alsham/pcost`, teste `62_pcost_isolation.sql`.

---

## 0. AS DECISÕES DE CANON

- ⭐⭐ **O custo é LANÇAMENTO IMUTÁVEL — a física do `cash`/`recv`/`occ`.** Cada
  custo é fato consumado: o dinheiro foi gasto no projeto, alguém registrou
  quanto e em quê, e o registro nasce pronto — para sempre. **NÃO TEM coluna de
  status, NÃO TEM ciclo de vida, NÃO TEM `allowed_transition`, NÃO TEM
  `updated_at`.** Não existe "custo aberto". O cliente não tem porta de UPDATE
  nem DELETE (nem policy, nem grant), e um gatilho `before update or delete`
  recusa a reescrita até para o dono do banco. **Corrigir é lançar OUTRO custo
  (o ato inverso, com nota).** O contraste das DUAS camadas — cliente barrado
  por falta de grant (`insufficient_privilege`), dono barrado pelo gatilho — é
  provado no `62_pcost_isolation.sql`.
- ⭐⭐ **SEM TRAVE DE SALDO — o DIVERGE consciente do `fund`, assinado.** A
  pergunta foi feita contra o precedente mais próximo: o `fund` (Módulo 40)
  CONFERE o saldo antes de aceitar o gasto e RECUSA o que o levaria abaixo de
  zero ("o fundo não pode ficar negativo"). O `pcost` faz o OPOSTO, de caso
  pensado: **não há saldo, não há trave.** Este módulo é APENAS o LIVRO do que
  foi gasto — um livro que recusa lançar o custo porque "estourou a trave"
  obriga o operador a MENTIR sobre o que a empresa efetivamente gastou. O `fund`
  guarda dinheiro COLETIVO de terceiros com propósito amarrado (por isso trava);
  o `pcost` só narra o custo do próprio projeto (por isso não trava). O
  contraste é assinado no `lifecycle.test.ts` (lê `0055_fund.sql` e
  `0072_pcost.sql`) e no `62_pcost_isolation.sql` (o valor enorme entra).
- ⭐ **A TRAVE, quando existir, é do `bud` genérico (Orçamentos, Módulo 29) por
  ID SOLTO** — capacidade futura, não reconstruída aqui. O `pcost` não conhece o
  `bud`, não lê o schema dele, não importa nada.
- ⭐ **SINAL LIVRE.** `amount_cents > 0` é gasto (o custo, o caso normal); `< 0`
  é crédito/estorno/devolução (a correção pelo ato inverso — o livro não se
  rasura). O único CHECK é `<> 0` (zero é linha muda). Não há piso nem teto.
- ⭐ **O projeto é ID SOLTO — sem FK cruzada para o `proj`.** Pela Lei do Lego, o
  `pcost` **NÃO LÊ o `proj`** (não importa, não lê o schema, sem FK). O
  `project_id` é uuid solto obrigatório e o `project_name` é carimbado pela
  TELA. Não há `proj.` em lugar nenhum da migration.
- ⭐ **Valor + moeda JUNTOS.** `amount_cents` e `currency` andam sempre juntos
  (a lição do `cash`/`fund`).
- ⭐ **Categoria é TEXTO LIVRE e OPCIONAL** — custo sem categoria é permitido e
  honesto (a lição do `cash`: obrigar categoria inventa classificação errada).
- ⭐ **Os carimbos são do SERVIDOR.** `recorded_at`/`recorded_by` são sempre
  `now()`/`auth.uid()` no INSERT — o que o cliente mandar de quem/quando é
  descartado (a lição do `recv`/`vis`).
- ⛔ **FORA:** orçamento/teto consolidado do projeto (é o `bud` genérico, por id
  solto — capacidade futura); plano de contas fixo (é do contador — o `cash` já
  declarou); rateio entre centros (é o `cc`); apropriação por hora/timesheet (é
  a capacidade *Timesheet* própria do Domain, Taxonomia §5). `consumes` VAZIO.

## 1. AS PEÇAS

- `pcost.entries` — o livro: `project_id` (uuid solto, obrigatório),
  `project_name` (texto, carimbado pela tela), `amount_cents` (bigint, `<> 0`,
  sinal livre, sem piso/teto), `currency` (texto, obrigatório), `category`
  (texto, opcional), `incurred_on` (data, opcional — a competência), `note`
  (texto, opcional), `recorded_at`/`recorded_by` (carimbo do servidor),
  `created_at`. **Sem status. Sem updated_at. Sem saldo.**
- Gatilhos: carimbo do servidor no nascimento (`before insert`); imutabilidade
  (`before update or delete` → RAISE `42501`); emissão do fato por INSERT.
- `@alsham/pcost`: `validateNewEntry` (projeto obrigatório; valor inteiro `<> 0`
  sem piso/teto; moeda obrigatória; categoria e competência opcionais),
  `orderEntries` (do mais recente ao mais antigo), `summarizeEntries` (total por
  moeda — soma pura, NUNCA um saldo com trave). **Sem
  `canTransition`/`ALLOWED_TRANSITIONS` — a ausência é a lei.**

## 2. OS FATOS

`pcost.entry.recorded` (após INSERT). Payload autossuficiente (`projectId`,
`projectName`, `amountCents`, `currency`, `category`, `incurredOn`). `consumes`
VAZIO (Lei 7 — sem redeploy do `apps/api`).

## 3. AS TELAS

`/custos-projeto` — placeholder por ora (o módulo vive no banco e no motor; a
tela rica é frente de UI própria, como as ondas anteriores).

## 4. AS PERMISSÕES

- `pcost.entry.record` — registrar um custo de projeto (o único ato do módulo).
  `can_access` usa esta permissão.

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- Orçamento/teto do projeto e o alerta de estouro — é o `bud` genérico
  (Módulo 29), por id solto. Capacidade futura; nada de reconstruir aqui.
- Rateio de custo entre centros — é o `cc` (Módulo 28).
- Apropriação de custo por hora / timesheet — é a capacidade *Timesheet* própria
  do Domain PMO (Taxonomia §5).
- Plano de contas fixo — é do contador; o `cash` já declarou a fronteira.
- Storage de nota fiscal/comprovante — capacidade do Core, não construída
  (`note` é texto).
- Tela rica — próxima frente de UI.

## 6. ESTADO DA CONSTRUÇÃO

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `pcost` (`0072_pcost.sql`) | ✅ CONSTRUÍDO (arquivo; apply do dono) |
| Pacote `@alsham/pcost` | ✅ CONSTRUÍDO |
| Seed (cartão pmo) | ✅ CONSTRUÍDO |
| Teste SQL `62_pcost_isolation.sql` + CI | ✅ CONSTRUÍDO |
| Portal `/custos-projeto` | ✅ CONSTRUÍDO (placeholder) |
| Orçamento/teto / rateio / timesheet / Storage | ⛔ **NÃO CONSTRUÍDO** (§5) |

## 7. APPLY (dono)

`docs/runbook/APLICAR.md`. Expor o schema `pcost` na Data API. `consumes`
vazio → sem redeploy do `apps/api`.
