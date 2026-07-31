# MODULO-TIMESHEET-SPEC — Módulo 61: Apontamento de horas (Timesheet)

**Domain 📋 PMO & Projetos · capacidade _Timesheet_ · `module_id = timesheet` · schema `timesheet`**
Onda Treze (Fase 2 — o Domain PMO & Projetos, o MAIOR do mapa). Migration
`0076_timesheet.sql`, pacote `@alsham/timesheet`, teste
`66_timesheet_isolation.sql`.

---

## 0. AS DECISÕES DE CANON

- ⭐⭐ **A FÍSICA DO LANÇAMENTO IMUTÁVEL, reusada "desde o início"** (o `pcost`,
  o `recv`, o `occ`, o `cash`): cada apontamento é FATO CONSUMADO — nasce pronto
  e nunca muda. **Não tem coluna de status, não tem ciclo de vida, não tem
  transição, não tem `updated_at`.** Corrigir é lançar OUTRO apontamento (o ato
  inverso, com descrição), nunca reescrever. A imutabilidade é provada em DUAS
  camadas:
  - **Camada 1 — o cliente não tem porta:** só há `grant select, insert` a
    `authenticated`; nenhum grant nem policy de UPDATE/DELETE. O cliente bate em
    `insufficient_privilege`.
  - **Camada 2 — nem o dono do banco:** um gatilho `before update or delete`
    RAISE com errcode `42501` e a mensagem `%fato consumado%` — mesmo com `reset
    role` (o dono do banco), a reescrita é recusada. É a diferença entre "sem
    porta" e "fato consumado", provada no mesmo cenário do teste SQL.
- ⭐ **O CONTRASTE ASSINADO — timesheet (REALIZADO) × alloc (PLANEJADO).** O
  vizinho mais próximo é o `alloc` (Módulo 56), do mesmo Domain. Copiar sem
  pensar e divergir sem escrever são o mesmo erro (CLAUDE.md). A pergunta foi
  feita, e a resposta escrita: **não são a mesma física.** O `alloc` é o
  PLANEJADO — o PERCENTUAL de capacidade que se PRETENDE dedicar, uma previsão
  MUTÁVEL (`active ↔ archived`, com `updated_at`). O `timesheet` é o REALIZADO —
  a HORA que efetivamente FOI trabalhada, IMUTÁVEL. Um é a promessa; o outro é o
  que aconteceu. Por isso o `alloc` mede em percentual e é mutável, e o
  `timesheet` mede em HORAS e é imutável. O `immutability.test.ts` lê as duas
  migrations e assina o contraste (percentual+mutável × horas+imutável).
- ⭐ **HORAS > 0 — a régua do MÉTODO** (o CHECK confere `hours > 0`,
  estritamente): não se aponta zero (linha muda) nem trabalho negativo (não é
  trabalho). A correção de um lançamento a mais é OUTRO lançamento (o ato
  inverso), nunca um número negativo aqui. Horas fracionárias positivas são
  válidas (não se exige inteiro).
- 🔴 **VÍNCULOS POR ID SOLTO — nunca FK cruzada.** O projeto vem do `proj` por
  ID SOLTO (`project_id` + `project_name` carimbado pela tela); quem trabalhou é
  TEXTO LIVRE (`collaborator_name`, pode ser terceiro/freelancer) com um id solto
  OPCIONAL ao colaborador cadastrado (`collaborator_id` — a lição do link
  opcional ao colaborador do `alloc`). NENHUM schema alheio é lido: a migration
  não referencia `proj` nem o módulo de Colaboradores.
- ⭐ **O carimbo é do servidor** — `created_by` é sempre `auth.uid()`; o autor
  mentido no INSERT é descartado pelo gatilho.

## 1. AS PEÇAS

- `timesheet.entries` — o livro imutável: `project_id` (id solto, obrigatório) +
  `project_name` (carimbado), `collaborator_name` (texto livre, obrigatório) +
  `collaborator_id` (id solto, OPCIONAL), `worked_on` (o dia), `hours`
  (`numeric(6,2)`, CHECK `> 0`), `description` (opcional), `created_at` +
  `created_by` (servidor). SEM status, SEM `updated_at`.
- Gatilhos: nascimento com autor do servidor; imutabilidade (`before update or
  delete` → RAISE 42501 `fato consumado`); emissão de fato.

## 2. OS FATOS

`timesheet.entry.registered` (o único — livro append-only). Payload
autossuficiente (o projeto/colaborador pelo nome carimbado; id solto). `consumes`
VAZIO (Lei 7 — sem redeploy do `apps/api`).

## 3. AS TELAS

`/apontamentos` — placeholder por ora (o módulo vive no banco e no motor
`@alsham/timesheet`; a tela rica, com a leitura do livro e o resumo por
colaborador, é frente de UI própria).

## 4. AS PERMISSÕES

- `timesheet.entry.manage` — registrar um apontamento de horas.

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- **Aprovação / fechamento de folha de apontamento** (workflow de aprovação de
  um período de apontamentos) — capacidade futura; o apontamento aqui é fato
  consumado, sem estado de aprovação.
- **Cálculo de custo / rate da hora** (quanto custa a hora trabalhada) — é
  DINHEIRO: o `cash`/`pcost` genérico por id solto, não este módulo.
- **Capacidade / calendário do recurso** (quantas horas cabem no dia/semana) —
  o lado do PLANO é o `alloc` (percentual); a agenda é outra frente.
- **Percentual de alocação** — é o `alloc` (o PLANEJADO). Aqui é HORA (o
  REALIZADO).
- **Tela rica** — próxima frente de UI.

## 6. ESTADO DA CONSTRUÇÃO

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `timesheet` (`0076_timesheet.sql`) | ✅ CONSTRUÍDO (arquivo; apply do dono) |
| Pacote `@alsham/timesheet` | ✅ CONSTRUÍDO |
| Seed (cartão pmo) | ✅ CONSTRUÍDO |
| Teste SQL `66_timesheet_isolation.sql` + CI | ✅ CONSTRUÍDO |
| Portal `/apontamentos` | ✅ CONSTRUÍDO (placeholder) |
| Aprovação / custo / capacidade | ⛔ **NÃO CONSTRUÍDO** (§5) |

## 7. APPLY (dono)

`docs/runbook/APLICAR.md §26`. Expor o schema `timesheet` na Data API.
`consumes` vazio → sem redeploy do `apps/api`.
