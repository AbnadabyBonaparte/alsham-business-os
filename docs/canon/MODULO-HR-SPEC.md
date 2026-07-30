# 👥 MÓDULO 33 — CADASTRO DE COLABORADORES

## ALSHAM Business OS™ · Especificação do módulo · Domain `hr`

> **Missão Oito (Onda 5 — o Bloco de Pessoas).** `module_id` = `hr`.
> Migration `0048_hr.sql` · pacote `@alsham/hr` · teste `38_hr_isolation.sql`.
> **ARQUIVO — apply é ato do dono (runbook §21).**

---

## 0. AS DECISÕES DE CANON

- ⚠️ **Dado de pessoa física.** O NOME é neutro (texto livre, como o
  visitante do `vis` e a contraparte do `crm`). ⛔ **Nenhum CPF, dado de
  saúde ou bancário** existe neste módulo — e não é esquecimento: é lei da
  onda. Folha e Benefícios, que exigem dado sensível para funcionar,
  ficam **DECLARADOS FORA** (§5).
- ⭐ **`terminated` é TERMINAL — o DIVERGE consciente do `crm`.** No `crm`
  `archived → active` existe (a contraparte que volta é a MESMA pessoa); no
  `pat` a baixa é terminal ("a baixa que volta é aquisição nova"). Aqui a
  física é a do `pat`: um ex-colaborador que retorna assina um **contrato
  novo** de trabalho — admissão nova, registro novo, com o vínculo SOLTO
  (`previous_employee_id`, id sem FK) ao anterior para quem quiser a
  história.
- ⭐ **Dois "parar", uma só definitiva.** `on_leave` (afastamento) é
  REVERSÍVEL (`on_leave ↔ active`); só `terminated` não volta. O contraste
  é assinado em teste (pacote e SQL).
- ⭐ **Desligar EXIGE razão e permissão própria.** `hr.employee.decide` +
  razão escrita + carimbo do servidor (a física do `deal.lost` /
  `ctr.terminated` — nunca em silêncio).
- ⭐ **Cargo e departamento são DADO DO TENANT** (texto livre), nunca enum
  — o organograma é de cada empresa (anti-viés).

---

## 1. AS PEÇAS

- **`hr.employees`** — o roster: `full_name`, `role_title`, `department`,
  `hired_on`, `status` (`active`/`on_leave`/`terminated`), o ato do
  desligamento (`termination_reason` + `terminated_at`/`by`) e o vínculo
  solto ao registro anterior. RLS `enable`+`force`; sem DELETE.

---

## 2. OS FATOS

`hr.employee.hired` · `hr.employee.updated` · `hr.employee.suspended`
(→ on_leave) · `hr.employee.reinstated` (→ active) ·
`hr.employee.terminated`. O envelope leva o NOME (neutro) e o cargo —
**nenhum dado sensível passeia no correio**.

---

## 3. AS TELAS

Território de outra frente (a pele). O motor (`@alsham/hr`) já entrega a
régua: `validateNewEmployee`, `canTransition`, `whyCannotTerminate`,
`orderRoster`, `summarizeRoster`.

---

## 4. AS PERMISSÕES

- `hr.employee.manage` — cadastrar, editar, afastar e reintegrar.
- `hr.employee.decide` — desligar (terminal).

Quem impede de verdade é a RLS; o menu é cortesia.

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- **Folha** e **Benefícios** — exigem dado bancário e de saúde; matéria de
  RH/jurídico de verdade, não se constrói por atalho.
- **Recrutamento · Seleção · Currículos** — o funil de contratação é ofício
  à parte.
- **Ponto · Férias · Plano de carreira · OKRs** — capacidades do Domain RH,
  não construídas nesta onda.
- **`consumes` VAZIO** — nenhum handler de RH existe nesta onda (Lei 7).
  Integrações (provisionamento de acesso por evento, folha por evento) são
  futuro DECLARADO, sem handler e sem promessa.

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

✅ **CONSTRUÍDO na Missão Oito** — **arquivo, ainda não aplicado**
(runbook §21). A migration `0048_hr.sql`, o pacote `@alsham/hr` (manifesto,
tipos, motor e testes) e o teste SQL `38_hr_isolation.sql` existem no
disco. `consumes` vazio. **Não aplicado em produção** — aplicar é ato do
dono.

---

## 7. APPLY (dono)

Ver `docs/runbook/APLICAR.md §21`. Expor o schema `hr` na Data API. Sem
consumidor → **sem redeploy do `apps/api`**.
