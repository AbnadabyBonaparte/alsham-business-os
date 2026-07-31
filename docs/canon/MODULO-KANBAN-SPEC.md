# MODULO-KANBAN-SPEC — Módulo 55: Kanban / Quadro de Tarefas do Projeto

**Domain 📋 PMO & Projetos · capacidade _Kanban_ · `module_id = kanban` · schema `kanban`**
Onda Doze (Fase 2 — o Domain PMO & Projetos, o MAIOR do mapa: 10 capacidades).
Migration `0070_kanban.sql`, pacote `@alsham/kanban`, teste `60_kanban_isolation.sql`.

---

## 0. AS DECISÕES DE CANON

- ⭐⭐ **A física é a do `ops` — mas isto NÃO é "instalar o `ops` de novo".**
  Este módulo reaproveita quase inteira a física da Esteira de Produção: etapas
  DESENHADAS PELO TENANT (texto livre, ordenadas por `position`) e itens que
  andam de uma etapa para outra por UPDATE simples. O que faz dele um módulo
  NOVO, e não o `ops` reinstalado, é o **ESCOPO** — a mesma lição que o
  `disp`/`recv` ensinaram (mesma física, territórios diferentes):
  - O `ops` é **genérico**: a ordem de serviço não pertence a nada — é o trabalho
    de qualquer natureza, solto, sem dono a montante; a esteira é global ao tenant.
  - O `kanban` é **específico**: o quadro é o das tarefas de UM PROJETO — tanto a
    coluna quanto o cartão carregam `project_id`, e o do cartão é OBRIGATÓRIO. Sem
    projeto, este módulo não tem sobre o que existir.
  A prova de que os dois não são a mesma coisa é a coluna que o `ops` não tem e
  não deve ter: um `project_id` no cartão. O contraste `kanban × ops` é assinado
  no `lifecycle.test.ts` (a OS do `ops` NÃO tem `project_id`; o cartão do
  `kanban` tem, obrigatório).
- ⭐ **A LEI DAS ETAPAS (a do `ops`):** a coluna é DADO DO TENANT, jamais enum do
  produto. Não existe `create type kanban.stage`. "A Fazer / Fazendo / Feito" é a
  coluna de UM time; quem trabalha por sprint desenha outra.
- ⛔ **SEM status de cartão e SEM máquina de transição.** O cartão VIVE numa
  coluna e ANDA livremente (a liberdade do `ops`); "concluído" é a última COLUNA,
  desenhada pelo tenant, não um estado do produto. Por isso não há
  `ALLOWED_TRANSITIONS` neste pacote — seria contra o desenho.
- 🔴 **O vínculo com o projeto é ID SOLTO — nunca FK cruzada.** A migration não
  conhece o schema do módulo Projetos; o `project_id` é um `uuid` solto mais o
  nome carimbado pela tela (a guarda SCHEMA_DE do CI reprovaria a leitura de
  schema alheio; a Lei do Lego proíbe módulo conhecer módulo).
- ⭐ **Anti-viés (texto livre):** nome da coluna e título/descrição do cartão são
  TEXTO LIVRE. ⛔ **FORA:** WIP-limit por coluna, `color`, `swimlane`, responsável,
  prazo, etiqueta — cada um é o processo/organograma de uma casa.

## 1. AS PEÇAS

- `kanban.stages` — as colunas do quadro: `project_id` (id solto, obrigatório) +
  `project_name` (carimbo da tela), `name` (texto livre), `position` (ordem do
  tenant, única por projeto, `deferrable` para reordenar). É a ÚNICA tabela com
  porta de DELETE (desenhar é tentativa e erro), mas a coluna ocupada não se apaga.
- `kanban.cards` — os cartões (tarefas): `project_id` (id solto, OBRIGATÓRIO),
  `stage_id` (FK ao mesmo schema, `on delete restrict`), `title` (texto livre),
  `description` (opcional). Andar é UPDATE simples do `stage_id`. SEM porta de
  DELETE — o cartão anda, não some (a física da OS do `ops`).
- Gatilhos: autor carimbado pelo servidor no nascimento; emissão dos fatos.

## 2. OS FATOS

`kanban.stage.registered` · `kanban.card.registered` · `kanban.card.moved`
(este carrega a coluna de-onde e para-onde, com os nomes). Payload
autossuficiente. `consumes` VAZIO (Lei 7 — sem redeploy do `apps/api`).

## 3. AS TELAS

`/kanban` — placeholder por ora (o módulo vive no banco e no motor; a tela rica
de arrastar-e-soltar é frente de UI própria).

## 4. AS PERMISSÕES

- `kanban.board.manage` — criar/editar colunas, criar/editar cartões e mover
  cartões entre colunas. Mover é parte do `manage` (a liberdade do `ops`).

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- WIP-limit, swimlane, cor, responsável, prazo, etiqueta — configuração do
  tenant/frente futura, não schema de todos.
- Sub-tarefas / checklist do cartão — próxima frente (o `chk` genérico por id solto).
- Tela rica (arrastar-e-soltar) — próxima frente de UI.

## 6. ESTADO DA CONSTRUÇÃO

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `kanban` (`0070_kanban.sql`) | ✅ CONSTRUÍDO (arquivo; apply do dono) |
| Pacote `@alsham/kanban` | ✅ CONSTRUÍDO |
| Seed (cartão pmo) | ✅ CONSTRUÍDO |
| Teste SQL `60_kanban_isolation.sql` + CI | ✅ CONSTRUÍDO |
| Portal `/kanban` | ✅ CONSTRUÍDO (placeholder) |
| WIP-limit / swimlane / cor / responsável | ⛔ **NÃO CONSTRUÍDO** (§5) |

## 7. APPLY (dono)

Expor o schema `kanban` na Data API. `consumes` vazio → sem redeploy do
`apps/api`.
