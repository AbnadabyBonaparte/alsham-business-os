# MODULO-SCRUM-SPEC — Módulo 58: Scrum / Sprints

**Domain 📋 PMO & Projetos · capacidade _Scrum_ · `module_id = scrum` · schema `scrum`**
Onda Treze parte 2/2 (Fase 2 — FECHA o Domain PMO & Projetos, o MAIOR do mapa:
com esta onda o PMO tem as 10 capacidades). Migration `0073_scrum.sql`, pacote
`@alsham/scrum`, teste `63_scrum_isolation.sql`.

---

## 0. AS DECISÕES DE CANON

- ⭐ **A RESSALVA DE HONESTIDADE — o que este módulo NÃO reconstrói.** "Scrum",
  como conceito de mercado, é em boa parte um MÉTODO sobre dados que já existem.
  Os ITENS DE TRABALHO de um sprint são os CARTÕES do `kanban` (Módulo 55) —
  este módulo **NÃO tem tabela de itens**, e isso é decisão, não esquecimento.
  Vincular cartões a sprints seria acoplar dois módulos; a composição "os
  cartões deste sprint" mora na TELA (se e quando construída), nunca no schema.
  O recorte GENUÍNO de dado novo é a **MOLDURA TEMPORAL**: o time-box (o sprint
  em si — nome, objetivo, janela) e a regra de cadência.
- ⭐⭐ **A REGRA "UM SPRINT ATIVO POR PROJETO" mora numa CONSTRAINT** — um índice
  único PARCIAL sobre `(tenant, projeto)` onde `status='active'`, não em código
  de aplicação (a lição do `spc`/`shift`: a física do domínio vive no banco).
  Ativar um segundo sprint do mesmo projeto bate no índice; um sprint de OUTRO
  projeto pode estar ativo ao mesmo tempo.
- ⭐ **`closed` é TERMINAL** (a física do `bud`/`proj` re-perguntada): o sprint
  encerrado não reabre; o próximo é registro novo. O contraste `scrum × proj`
  (nenhum dos dois fins reabre) é assinado no `lifecycle.test.ts`.
- ⭐ **O conteúdo CONGELA depois de encerrar** (nome/objetivo/janela) — a lição
  do congelamento por gatilho: fechado é história.
- ⭐ **Nome e objetivo são TEXTO LIVRE** (anti-viés). Vínculo ao projeto por ID
  SOLTO + nome carimbado (o `proj` não é lido).
- ⛔ **FORA:** itens de trabalho / backlog do sprint (são os cartões do `kanban`
  por composição de tela); velocity/burndown (métrica de leitura — frente de BI
  futura, sobre os cartões, nunca dado novo aqui); cerimônias (daily/retro) como
  entidade.

## 1. AS PEÇAS

- `scrum.sprints` — a moldura: `project_id` (id solto, obrigatório) +
  `project_name` (nome carimbado), `name` (texto livre, obrigatório), `goal`
  (opcional), `starts_on`/`ends_on` (opcionais, janela coerente), `status`
  (`planned`/`active`/`closed`), carimbos de ativação e fechamento (servidor).
- `scrum.allowed_transition()` — espelho de `ALLOWED_TRANSITIONS` em `@alsham/scrum`.
- Índice único PARCIAL `scrum_sprints_one_active` — a regra "um ativo por projeto".
- Gatilhos: nascimento sempre `planned` + autor do servidor; transição gated por
  `scrum.sprint.manage`, carimbos de ativação/fechamento pelo servidor;
  nome/objetivo/janela congelam depois do encerramento; emissão de fato.

## 2. OS FATOS

`scrum.sprint.registered` · `scrum.sprint.activated` · `scrum.sprint.closed`.
Payload autossuficiente. `consumes` VAZIO (Lei 7 — sem redeploy do `apps/api`).

## 3. AS TELAS

`/sprints` — placeholder por ora (o módulo vive no banco e no motor; a tela rica,
com a leitura dos cartões do kanban por composição, é frente de UI própria).

## 4. AS PERMISSÕES

- `scrum.sprint.manage` — criar/editar, ativar e encerrar.

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- Itens de trabalho / backlog do sprint — são os cartões do `kanban`, cruzados
  por composição de tela; não há tabela de itens aqui.
- Velocity / burndown — métrica de leitura (frente de BI futura sobre os cartões).
- Cerimônias (daily/planning/review/retro) como entidade — próxima frente.
- Tela rica — próxima frente de UI.

## 6. ESTADO DA CONSTRUÇÃO

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `scrum` (`0073_scrum.sql`) | ✅ CONSTRUÍDO (arquivo; apply do dono) |
| Pacote `@alsham/scrum` | ✅ CONSTRUÍDO |
| Seed (cartão pmo) | ✅ CONSTRUÍDO |
| Teste SQL `63_scrum_isolation.sql` + CI | ✅ CONSTRUÍDO |
| Portal `/sprints` | ✅ CONSTRUÍDO (placeholder) |
| Itens / velocity / cerimônias | ⛔ **NÃO CONSTRUÍDO** (§5) |

## 7. APPLY (dono)

`docs/runbook/APLICAR.md §26`. Expor o schema `scrum` na Data API. `consumes`
vazio → sem redeploy do `apps/api`.
