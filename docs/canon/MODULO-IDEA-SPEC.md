# MÓDULO 68 — Ideias & Pipeline de Inovação (`idea`)

> Domain 🔬 **Pesquisa & Desenvolvimento** (`rnd`) · Onda Dezesseis (Fase 2) · migration `0083_idea.sql` · pacote `@alsham/idea`
> **ABRE** o Domain Pesquisa & Desenvolvimento.

---

## 1. O QUE É

O **funil de inovação** da empresa: as **etapas** do pipeline (desenho do tenant,
texto livre e ordenadas) e as **ideias** que caminham por elas. Duas capacidades
da Taxonomia — *Ideias* e *Pipeline de inovação* — são a mesma coisa (uma ideia
que anda por um funil), e viram **um** módulo.

---

## 2. ⭐⭐ O DIVERGE ASSINADO — idea × kanban: a ideia existe ANTES do projeto

A física é a do `kanban` (Módulo 55): etapas do tenant + itens que andam por
UPDATE simples, sem porteiro (a Lei das Etapas — **não há `create type`**). Mas o
contraste é o **oposto** do que separou o `kanban` do `ops`:

| | `kanban` (Módulo 55) | `idea` (Módulo 68) |
|---|---|---|
| `project_id` | **OBRIGATÓRIO** — a coluna e o cartão pertencem a um projeto que já existe | **PROIBIDO** — a ideia nasce antes de qualquer projeto |
| escopo | o quadro de UM projeto | o funil GLOBAL ao tenant |
| elo com projeto | é o pré-requisito | é o **destino** (`promoted_project_id`), nunca o pré-requisito |

Amarrar a ideia a um projeto obrigatório mataria o que ela é: a matéria-prima da
inovação, uma faísca que ainda não é obra. O contraste é assinado no
`lifecycle.test.ts` (o kanban tem `project_id ... not null`; o idea **não tem
`project_id` em lugar nenhum**) e há guarda de CI (`project_id` count = 0 no
schema `idea`).

---

## 3. O MODELO E O CICLO

- **`idea.stages`** — nome (texto livre), `position` (ordenada, `deferrable`).
  Tem DELETE (desenhar o funil é tentativa e erro); a etapa **ocupada** não se
  apaga (FK `restrict`).
- **`idea.ideas`** — título/descrição (texto livre), `current_stage_id` (**FK
  INTRA-schema** à etapa), `status`, `promoted_project_id` (id solto, opcional).
  **Não tem DELETE** — a ideia anda, promove ou arquiva; não some.

⭐ **O ciclo** (o `kanban` não tem status; este tem):
- `active` → a ideia viva, caminhando pelas etapas. Mover só vale aqui.
- `active → promoted` — **TERMINAL**: virou projeto. Exige `promoted_project_id`
  (o carimbo do destino). Uma nova exploração é ideia nova.
- `active ↔ archived` — **REVERSÍVEL**: a gaveta que volta é a MESMA ideia (a
  física do `mall`/`crm`, o DIVERGE do `proj` terminal). Restaurar limpa o
  carimbo (a física do `care.reopen`).

O `ALLOWED_TRANSITIONS` do pacote espelha `idea.allowed_transition()` da migration
(teste lê os dois e compara).

---

## 4. O QUE FICA FORA (declarado)

- **Projetos de pesquisa** — é o **`proj`** (Módulo 53): um projeto de pesquisa é
  um projeto. Zero módulo novo.
- **Portfólio tecnológico** — é o **`pfolio`** (Módulo 62): um portfólio
  tecnológico é um portfólio de projetos de P&D. Zero módulo novo.
- Score/votação, autor/assignee, ROI, gate de aprovação por etapa — config do
  tenant, não schema de todos.
- `consumes` **VAZIO** — sem redeploy do `apps/api`.

---

## 5. ESTADO

✅ **CONSTRUÍDO na Onda Dezesseis (Fase 2 — ABRE o Domain Pesquisa &
Desenvolvimento).** **Arquivo, ainda não aplicado** — aplicar é ato do dono
(runbook §29).

- `supabase/migrations/0083_idea.sql` — schemas `idea.stages`/`idea.ideas`, RLS,
  FK intra-schema, ciclo (`allowed_transition` + guardas), sem `project_id`.
- `packages/idea` — manifesto, tipos, motor (`ALLOWED_TRANSITIONS`, funil) e três
  suítes de teste (manifesto × seed; validação; ciclo + o contraste idea×kanban).
- `supabase/tests/73_idea_isolation.sql` — isolamento, a ideia sem projeto, o
  movimento livre, promoted terminal, archived reversível, a FK que barra apagar
  etapa ocupada, cross-tenant, `anon` fora, os fatos no correio.
- Seed: cartão 68 (`domain_key='rnd'`). Catálogo **67 → 68**.
- Portal: página placeholder `/ideias` + item de menu.

⭐ **Ao aplicar (runbook §29):** expor o schema `idea` na Data API; **sem
redeploy** (`consumes` vazio).
