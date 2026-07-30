# 👥 MÓDULO 36 — AVALIAÇÃO DE DESEMPENHO

## ALSHAM Business OS™ · Especificação do módulo · Domain `hr`

> **Missão Oito (Onda 5 — o Bloco de Pessoas).** `module_id` = `perf`.
> Migration `0051_perf.sql` · pacote `@alsham/performance` · teste
> `41_perf_isolation.sql`.
> **ARQUIVO — apply é ato do dono (runbook §21).**

---

## 0. AS DECISÕES DE CANON

- ⭐ **`perf` NÃO é `goal` — o contraste é a lei desta migration.** `goal`
  (Módulo 23) mede a PRÓPRIA ambição declarada: o alvo é do dono da meta, o
  check-in é reportado por quem persegue o próprio número, e o desfecho
  (achieved/missed) é decisão do mesmo lado da mesa. `perf` é outra física:
  é o **JULGAMENTO** de um **AVALIADOR** sobre o trabalho de um
  **AVALIADO** — dois papéis, NUNCA a mesma coisa. Por isso `perf.reviews`
  carrega `reviewee_id` (quem foi avaliado, ID SOLTO — vínculo com o `hr`,
  sem FK cruzada) **e** `reviewer_id` (quem avaliou, carimbado pelo
  SERVIDOR): a pessoa que escreve nunca é digitada, é `auth.uid()` do ato.
  Não existe "auto-avaliação estruturada" aqui — se um dia existir, é
  capacidade nova, com o mesmo cuidado que separou os dois módulos desta
  vez.
- ⭐ **A avaliação é FATO CONSUMADO.** A física do `crm` (interação) e do
  `vis` (visita): uma avaliação registrada é história, não rascunho. Sem
  policy de UPDATE/DELETE em `perf.reviews`, e por trás um gatilho
  `before update or delete` que recusa até para o dono do banco. Corrigir
  uma nota errada é registrar **outra** avaliação — nunca rasurar a
  anterior.
- ⭐ **O ciclo — UM par só, e `closed` é TERMINAL.** `open → closed`. O
  ciclo (trimestral, anual, o que o tenant chamar — TEXTO LIVRE) nasce
  aberto e só tem um caminho: fechar. Fechado CONGELA inteiro (nome
  incluso) e NÃO reabre — reabrir misturaria avaliações de duas épocas sob
  o mesmo rótulo, e um placar de RH que mistura épocas não serve para
  decisão nenhuma. O próximo ciclo é ciclo NOVO. Fechar exige
  `perf.cycle.manage` — quem registra avaliação (`perf.review.manage`) não
  fecha ciclo sozinho.
- ⭐ **Avaliação só nasce em ciclo ABERTO.** O gatilho de `perf.reviews`
  confere o status do ciclo antes de aceitar o INSERT; ciclo fechado não
  recebe avaliação nova.
- ⭐ **Nota é OPCIONAL, escala 0–100.** Quem não usa número numérico
  registra só o parecer (`summary`), que é **obrigatório** em toda
  avaliação — o julgamento sempre vem com o texto, com ou sem nota.

---

## 1. AS PEÇAS

- **`perf.cycles`** — o período de avaliação: `name` (texto livre),
  `status` (`open`/`closed`), o ato do fechamento (`closed_at`/`by`). RLS
  `enable`+`force`; sem DELETE.
- **`perf.reviews`** — o julgamento: `cycle_id` (FK composta ao ciclo do
  mesmo tenant), `reviewee_id` + `reviewee_name` (ID SOLTO ao `hr`, sem FK
  cruzada), `reviewer_id` (carimbado pelo servidor), `rating` (opcional,
  0–100) e `summary` (obrigatório). **Imutável** em duas camadas: sem
  grant de UPDATE/DELETE e um gatilho que recusa qualquer tentativa. RLS
  `enable`+`force`.

---

## 2. OS FATOS

`perf.cycle.opened` · `perf.cycle.closed` (terminal) ·
`perf.review.recorded`. O envelope da avaliação leva o avaliado (id solto
+ nome), o avaliador carimbado e a nota — **o parecer (`summary`) NUNCA
passeia no correio**: é texto potencialmente longo e sensível ao contexto
de RH, e nenhum consumidor precisa dele para agir.

---

## 3. AS TELAS

Território de outra frente (a pele). O motor (`@alsham/performance`) já
entrega a régua: `validateNewReview`, `canCloseCycle`, `isCycleTerminal`,
`whyCannotReview`, `orderReviews`, `summarize`.

---

## 4. AS PERMISSÕES

- `perf.cycle.manage` — abrir e fechar ciclos.
- `perf.review.manage` — registrar avaliações.

Quem impede de verdade é a RLS; o menu é cortesia.

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- **OKRs estruturados / cascata de metas de RH** — capacidade *OKRs* da
  Taxonomia (RH), ofício próprio; `goal` já cobre a leitura genérica de
  ambição (Módulo 23) e não se confunde com este módulo.
- **360°/calibração de comitê** — fluxo de aprovação em cadeia sobre a
  mesma avaliação; não construído nesta onda.
- **Vínculo automático com Folha/bônus** — dado sensível, fora por lei do
  `hr` (§0 do `MODULO-HR-SPEC.md`).
- **`consumes` VAZIO** — nenhum handler de RH existe nesta onda (Lei 7).
  Um consumo que pareceria óbvio (encerrar avaliações pendentes ao
  desligar um colaborador no `hr`) é futuro DECLARADO, sem handler e sem
  promessa: o `hr` emite `hr.employee.terminated`, mas nenhum módulo desta
  onda escuta.

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

✅ **CONSTRUÍDO na Missão Oito** — **arquivo, ainda não aplicado**
(runbook §21). A migration `0051_perf.sql`, o pacote `@alsham/performance`
(manifesto, tipos, motor e testes) e o teste SQL
`41_perf_isolation.sql` existem no disco. `consumes` vazio. **Não
aplicado em produção** — aplicar é ato do dono.

---

## 7. APPLY (dono)

Ver `docs/runbook/APLICAR.md §21`. Expor o schema `perf` na Data API. Sem
consumidor → **sem redeploy do `apps/api`**.
