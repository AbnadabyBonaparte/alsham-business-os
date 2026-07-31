# MODULO-SCHED-SPEC — Módulo 54: Cronogramas

**Domain 📋 PMO & Projetos · capacidade _Cronogramas_ · `module_id = sched` · schema `sched`**
Onda Doze parte 2/2 (Fase 2 — o Domain PMO & Projetos, o MAIOR do mapa: 10
capacidades). Migration `0069_sched.sql`, pacote `@alsham/sched`, teste
`59_sched_isolation.sql`.

---

## 0. AS DECISÕES DE CANON

- ⭐⭐ **O DIVERGE ASSINADO sched × dem/bud: o marco concluído por engano
  REABRE.** O marco nasce `planned`, é `done` (concluído) ou `cancelled`
  (abandonado). E `done → planned` EXISTE de propósito: um marco marcado como
  concluído por engano NÃO deve virar um marco novo — desfazer o carimbo é
  correção de rota ROTINEIRA num projeto. É a mesma física do `ops` (a OS
  concluída volta a andar), re-perguntada para o marco.
  - **O contraste com o `dem`/`bud`:** naqueles, o fim é TERMINAL — o plano
    publicado do `dem` e o período fechado do `bud` NÃO reabrem, porque um
    período contábil fechado é um FATO. Um marco é diferente: reabrir um marco
    concluído por engano é correção de rota rotineira, não a reabertura de um
    período fechado. O contraste é assinado no cabeçalho da migration, aqui, e
    no `lifecycle.test.ts` (que lê `0069_sched.sql` e `0063_dem.sql`: o `sched`
    TEM `done→planned`; o `dem` NÃO tem transição alguma a partir de
    `published`).
- ⚠️ **A interação coerência × reabrir.** A constraint amarra `done ⇔ done_at is
  not null`. Concluir carimba `done_at` pelo servidor; reabrir (`done→planned`)
  TEM de LIMPAR `done_at`/`done_by`, senão a coerência falha. O gatilho de
  transição zera os carimbos ao reabrir (e ao cancelar).
- ⭐ **`cancelled` é TERMINAL.** O marco abandonado não volta nem conclui.
  Cancelar exige uma RAZÃO — abandonar precisa de porquê.
- ⭐ **O projeto entra por ID SOLTO.** O marco aponta o projeto do `proj` por
  `project_id` (sem FK) + `project_name` carimbado pela tela. A migration NÃO
  referencia o schema `proj` (módulo não conhece módulo — a Lei do Lego). O nome
  carimbado é o que faz o cronograma sobreviver ao redesenho do cadastro de
  projeto. O vínculo congela na criação (mudar de projeto seria outro marco).
- ⭐ **Título é TEXTO LIVRE e data prevista é OPCIONAL** (anti-viés). O que é um
  "marco" — uma entrega, uma etapa, um gate — é vocabulário de cada casa, e nem
  todo marco tem data cravada.
- ⚠️ **O fato da conclusão é `sched.milestone.completed`, não `.done`:** o outbox
  exige verbo no passado terminando em `ed`. O STATUS é `done`; o VERBO do
  evento é `completed`.
- ⛔ **FORA:** dependência entre marcos (Gantt/precedência é capacidade própria
  da onda); percentual de avanço automático; caminho crítico; vínculo FK ao
  projeto.

## 1. AS PEÇAS

- `sched.milestones` — o marco: `project_id` (id solto, obrigatório) +
  `project_name` (carimbado pela tela), `title` (texto livre, obrigatório),
  `due_on` (data prevista, opcional), `status`
  (`planned`/`done`/`cancelled`), razão do cancelamento (obrigatória ao
  cancelar), carimbos de conclusão `done_at`/`done_by` (servidor; nulos fora de
  `done`).
- `sched.allowed_transition()` — espelho de `ALLOWED_TRANSITIONS` em
  `@alsham/sched`.
- Gatilhos: nascimento sempre `planned` + autor do servidor; transição gated por
  `sched.milestone.manage`, carimbo de conclusão pelo servidor, ⭐ reabrir LIMPA
  o carimbo (coerência), cancelar exige razão; o vínculo com o projeto congela;
  emissão de fato.

## 2. OS FATOS

`sched.milestone.registered` · `sched.milestone.completed` (status `done`) ·
`sched.milestone.reopened` (`done→planned`) · `sched.milestone.cancelled`.
Payload autossuficiente (inclui `projectId`/`projectName`). `consumes` VAZIO
(Lei 7 — sem redeploy do `apps/api`).

## 3. AS TELAS

`/cronogramas` — placeholder por ora (o módulo vive no banco e no motor; a tela
rica, com o Gantt, é frente de UI própria).

## 4. AS PERMISSÕES

- `sched.milestone.manage` — criar/editar, concluir, reabrir e cancelar.

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- Dependência entre marcos (Gantt/precedência) — capacidade própria da onda.
- Percentual de avanço automático — precisaria de fonte de dado real (Lei 7).
- Caminho crítico — próxima frente.
- Tela rica (Gantt) — próxima frente de UI.

## 6. ESTADO DA CONSTRUÇÃO

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `sched` (`0069_sched.sql`) | ✅ CONSTRUÍDO (arquivo; apply do dono) |
| Pacote `@alsham/sched` | ✅ CONSTRUÍDO |
| Seed (cartão pmo) | ✅ CONSTRUÍDO |
| Teste SQL `59_sched_isolation.sql` + CI | ✅ CONSTRUÍDO |
| Portal `/cronogramas` | ✅ CONSTRUÍDO (placeholder) |
| Gantt / precedência / caminho crítico | ⛔ **NÃO CONSTRUÍDO** (§5) |

## 7. APPLY (dono)

`docs/runbook/APLICAR.md §25`. Expor o schema `sched` na Data API. `consumes`
vazio → sem redeploy do `apps/api`.
