# 👥 MÓDULO 34 — ESCALAS

## ALSHAM Business OS™ · Especificação do módulo · Domain `hr`

> **Missão Oito (Onda 5 — o Bloco de Pessoas).** `module_id` = `shift`.
> Migration `0049_shift.sql` · pacote `@alsham/shift-scheduling` ·
> teste `39_shift_isolation.sql`.
> **ARQUIVO — apply é ato do dono (runbook §21).**

---

## 0. AS DECISÕES DE CANON

- ⭐ **A física do `spc` reaproveitada, com outro DONO.** O `spc` recusa
  dois usos do MESMO ESPAÇO ao MESMO tempo — EXCLUSION constraint (gist),
  período meio-aberto, PARCIAL (a cancelada libera sozinha). Aqui o dono do
  conflito é OUTRO: o mesmo COLABORADOR não roda dois turnos que se cruzam.
  MESMA física; DONO diferente (`employee_id`, não `space_id`) — o `if` da
  tela perde a corrida entre duas escalas simultâneas, a constraint não
  perde nunca.
- ⭐ **Vínculo com o `hr` — ID SOLTO, NUNCA FK (Lei do Lego §6).**
  `employee_id` é uuid solto (sem FK para `hr.employees`) e `employee_name`
  é carimbado PELA TELA no momento da escala — a mesma física do vínculo
  `deal↔crm` e `mnt↔pat`. Este módulo não lê o schema `hr`.
- ⭐ **O turno é DADO DO TENANT** (texto livre) — "Manhã", "12x36", "Plantão
  noturno" são vocabulário de cada empresa; enum de turno congelaria a
  nomenclatura de uma casa e envelheceria todas as outras (anti-viés).
- ⭐ **O PASSADO é permitido — o MANTIDO consciente do `spc`, o DIVERGE
  consciente do `cash`.** Registrar a escala que JÁ RODOU é fato consumado
  (a mesma física do `spc`, que por sua vez é a física do `inv`): o turno
  FOI cumprido, e uma agenda que recusa o passado mente sobre quem
  trabalhou quando. O `cash` recusa o FUTURO porque previsão é outro ofício
  (Orçamento); aqui esse ofício não existe — passado e futuro entram; só o
  CONFLITO nunca entra. Assinado em teste (pacote e SQL).
- ⭐ **Cancelar EXIGE razão e permissão própria.** `shift.schedule.decide` +
  razão escrita + carimbo do servidor — a física do `spc.reservation`
  cancelada. UM par só (`scheduled → cancelled`): diferente do `hr` (onde
  `on_leave ↔ active` existe), aqui não há "parar reversível" — a escala
  rodou, foi cancelada, ou nunca existiu.
- ⭐ **Remarcar (turno/período/colaborador) é permitido enquanto viva**, sob
  `shift.schedule.manage` — a escala ainda não rodou, e a mão de quem
  escala é a mesma que remarca.

---

## 1. AS PEÇAS

- **`shift.schedules`** — a escala: `employee_id` (id solto) +
  `employee_name` (carimbado pela tela), `shift_label` (texto livre),
  `starts_at`/`ends_at`, `status` (`scheduled`/`cancelled`), o ato do
  cancelamento (`cancel_reason` + `cancelled_at`/`by`). RLS `enable`+
  `force`; sem DELETE. **EXCLUSION constraint** (gist, parcial, sobre
  `employee_id` + período) recusa o conflito no banco.

---

## 2. OS FATOS

`shift.schedule.scheduled` · `shift.schedule.updated` (remarcação) ·
`shift.schedule.cancelled` (terminal, com razão). O envelope leva o
colaborador pelo ID SOLTO e pelo NOME carimbado — quem escuta não faz join
e não lê o schema `hr`.

---

## 3. AS TELAS

Território de outra frente (a pele). O motor (`@alsham/shift-scheduling`)
já entrega a régua: `validateNewSchedule`, `findConflict`, `overlaps`,
`whyCannotSchedule`, `whyCannotCancel`, `orderSchedules`,
`summarizeSchedules`.

---

## 4. AS PERMISSÕES

- `shift.schedule.manage` — escalar e remarcar (enquanto viva).
- `shift.schedule.decide` — cancelar (terminal).

Quem impede de verdade é a RLS e a exclusion constraint; o menu é
cortesia.

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- **Cálculo de horas extras / banco de horas** — matéria fiscal e
  trabalhista de verdade; não se constrói por atalho.
- **Ponto/batida** — capacidade *Ponto* do Domain RH, NÃO CONSTRUÍDA. A
  escala é o PLANO; o ponto seria o REALIZADO. **A integração
  escala→ponto (projetar o realizado a partir do planejado) é futuro
  DECLARADO**, sem handler e sem promessa — confundir os dois seria o
  erro do `bud` (realizado × orçado) re-perguntado ao contrário.
- **Aprovação de escala em duas mãos** — capacidade futura declarada.
- **Recorrência de escala** — o cron da agenda é futuro declarado (o
  padrão do `mnt`): gerar escala por relógio é promessa sem prova.
- **`consumes` VAZIO** — nenhum handler de Escalas existe nesta onda
  (Lei 7).

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

✅ **CONSTRUÍDO na Missão Oito** — **arquivo, ainda não aplicado**
(runbook §21). A migration `0049_shift.sql`, o pacote
`@alsham/shift-scheduling` (manifesto, tipos, motor e testes) e o teste
SQL `39_shift_isolation.sql` existem no disco. `consumes` vazio. **Não
aplicado em produção** — aplicar é ato do dono.

---

## 7. APPLY (dono)

Ver `docs/runbook/APLICAR.md §21`. Expor o schema `shift` na Data API.
Sem consumidor → **sem redeploy do `apps/api`**.
