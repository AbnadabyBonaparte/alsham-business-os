# MODULO-ALLOC-SPEC — Módulo 56: Recursos / Alocação

**Domain 📋 PMO & Projetos · capacidade _Recursos_ · `module_id = alloc` · schema `alloc`**
Onda Doze (Fase 2 — o Domain PMO & Projetos, o MAIOR do mapa: 10 capacidades).
Migration `0071_alloc.sql`, pacote `@alsham/alloc`, teste `61_alloc_isolation.sql`.

---

## 0. AS DECISÕES DE CANON

- ⭐ **PERCENTUAL, NÃO HORAS — a decisão de anti-viés deste módulo.** Uma alocação
  diz QUANTO de um recurso vai a um projeto. Em horas ou em percentual? Horas
  dependem do CALENDÁRIO e da DURAÇÃO do projeto (quantas horas por dia, quantos
  dias) — nada disso este módulo modela; modelar isso seria um TIMESHEET, que é
  OUTRA capacidade de PMO (§5), fora do escopo desta onda. Um PERCENTUAL da
  capacidade do recurso (`allocation_pct`, `0 < pct <= 100`) é AUTOSSUFICIENTE:
  não precisa de nada externo para significar. Puxar horas arrastaria para dentro
  um calendário que o módulo não possui — por isso a régua é percentual. A régua
  vive na CONSTRAINT (`check`) e no `validateNewAllocation`, e o teste SQL prova
  que `pct=150` é recusado.
- ⭐ **`active ↔ archived` EXISTE — o REUSO do `vendor`/`dc`, e o DIVERGE do `hr`
  assinado.** Copiar sem pensar e divergir sem escrever são o mesmo erro. A
  pergunta foi refeita: uma alocação que termina e depois VOLTA é uma linha NOVA
  (a física do `hr`, onde `terminated` é terminal) ou a MESMA linha que retorna
  (a física do `vendor`/`dc`)? É a mesma: a alocação de um recurso a um projeto
  que a empresa arquivou e depois retoma é o MESMO plano — obrigá-la a renascer
  partiria o histórico em dois. Então `archived → active` existe, como no `vendor`
  e no `dc`. O REUSO `alloc × vendor × dc` e o contraste `alloc × hr` são
  assinados no `lifecycle.test.ts`.
- ⭐ **O recurso é TEXTO LIVRE** (anti-viés). Pode ser um colaborador cadastrado,
  mas também um terceiro ou um freelancer sem cadastro. Por isso o vínculo com o
  módulo `hr` (`employee_id`) é POR ID SOLTO e OPCIONAL.
- 🔴 **Vínculos por ID SOLTO — nunca FK cruzada.** O projeto vem do módulo `proj`
  por id solto (`project_id` + `project_name` carimbado pela tela); o colaborador
  vem do módulo `hr` por id solto (`employee_id`, opcional). A migration não lê
  nenhum schema alheio.
- ⛔ **FORA:** cálculo de disponibilidade/conflito entre projetos (exigiria ler as
  OUTRAS alocações do mesmo recurso — capacidade futura); horas (é o Timesheet,
  outra capacidade de PMO); custo da alocação (é o `pcost`/genérico por id solto).

## 1. AS PEÇAS

- `alloc.allocations` — o plano: `project_id` (id solto, obrigatório) +
  `project_name` (carimbado pela tela), `resource_name` (texto livre,
  obrigatório), `employee_id` (id solto, opcional), `allocation_pct` (numeric,
  `0 < pct <= 100`), `starts_on`/`ends_on` (opcionais; se ambas, fim ≥ início),
  `status` (`active`/`archived`), carimbos.
- `alloc.allowed_transition()` — espelho de `ALLOWED_TRANSITIONS` em
  `@alsham/alloc`: `active ↔ archived`.
- Gatilhos: nascimento sempre ativo + autor carimbado pelo servidor; transição
  gated por `alloc.allocation.decide`; emissão de fato por INSERT/UPDATE.

## 2. OS FATOS

`alloc.allocation.registered` · `alloc.allocation.updated` ·
`alloc.allocation.archived` · `alloc.allocation.reopened`. Payload
autossuficiente. `consumes` VAZIO (Lei 7 — sem redeploy do `apps/api`).

## 3. AS TELAS

`/recursos` — placeholder por ora (o módulo vive no banco e no motor; a tela rica
é frente de UI própria, como as ondas anteriores).

## 4. AS PERMISSÕES

- `alloc.allocation.manage` — cadastrar e editar.
- `alloc.allocation.decide` — arquivar/reativar (a linha que sai e volta).

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- Cálculo de disponibilidade/conflito entre projetos — exigiria ler as outras
  alocações do mesmo recurso; capacidade futura.
- Horas / Timesheet — outra capacidade de PMO, com o calendário do projeto.
- Custo da alocação — é o `pcost`/genérico, por id solto.
- Tela rica — próxima frente de UI.

## 6. ESTADO DA CONSTRUÇÃO

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `alloc` (`0071_alloc.sql`) | ✅ CONSTRUÍDO (arquivo; apply do dono) |
| Pacote `@alsham/alloc` | ✅ CONSTRUÍDO |
| Seed (cartão pmo) | ✅ CONSTRUÍDO |
| Teste SQL `61_alloc_isolation.sql` + CI | ✅ CONSTRUÍDO |
| Portal `/recursos` | ✅ CONSTRUÍDO (placeholder) |
| Disponibilidade / horas / custo | ⛔ **NÃO CONSTRUÍDO** (§5) |

## 7. APPLY (dono)

`docs/runbook/APLICAR.md §25`. Expor o schema `alloc` na Data API. `consumes`
vazio → sem redeploy do `apps/api`.
