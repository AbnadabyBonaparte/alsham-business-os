# MODULO-GANTT-SPEC — Módulo 59: Gantt / Dependências entre marcos

**Domain 📋 PMO & Projetos · capacidade _Gantt_ · `module_id = gantt` · schema `gantt`**
Onda Treze (Fase 2 — o Domain PMO & Projetos, o MAIOR do mapa: 10 capacidades).
Migration `0074_gantt.sql`, pacote `@alsham/gantt`, teste `64_gantt_isolation.sql`.

---

## 0. AS DECISÕES DE CANON

- ⭐ **A RESSALVA DE HONESTIDADE — o Gantt é em boa parte uma VISTA.** "Gantt",
  como conceito de mercado, é um método de DESENHO sobre marcos que já existem no
  `sched` (Módulo 54). Este módulo **NÃO desenha o gráfico, NÃO calcula datas e
  NÃO computa caminho crítico**. O dado GENUINAMENTE novo é a **ARESTA de
  precedência**: "o marco B não começa antes do marco A". É só a aresta que este
  módulo guarda.
- ⭐⭐ **REGISTRO MUTÁVEL, NÃO LIVRO IMUTÁVEL — o DIVERGE assinado.** Os livros
  deste império (`recv`, `pcost`, `disp`, `cash`, `inv`…) são IMUTÁVEIS: fato
  consumado não se apaga. A dependência é o OPOSTO CONSCIENTE — é **metadado do
  plano, não fato consumado**, e some quando o plano muda. Por isso este módulo
  **TEM policy e grant de DELETE** (ao contrário do `recv`/`pcost`) e emite
  `gantt.dependency.removed` quando a aresta cai. Apagar uma dependência não
  reescreve história: só diz que aquela precedência deixou de valer.
- ⭐ **O TIPO é um CHECK argumentado — não texto livre, não enum de tenant.** As
  QUATRO relações clássicas de precedência (`finish_to_start`, `start_to_start`,
  `finish_to_finish`, `start_to_finish`) são a **FÍSICA do domínio** — as quatro
  combinações reais entre início/fim de duas tarefas. NÃO é vocabulário de casa
  (como "canal" ou "segmento", que seriam texto livre); é fechado porque a
  matemática da precedência é fechada. `finish_to_start` é o default.
- ⭐ **A aresta laço é recusada** — `predecessor_id <> successor_id` (CHECK): um
  marco não depende de si mesmo. E **a aresta não se duplica** — unique
  `(tenant, predecessor, successor)`.
- 🔴 **Os marcos entram por ID SOLTO ao `sched`** (`predecessor_id`/
  `successor_id` + nomes carimbados pela tela). Sem FK cruzada; a migration NÃO
  referencia o schema `sched` (módulo não conhece módulo — a Lei do Lego). O
  projeto é vínculo solto OPCIONAL, espelhando o `sched`.
- ⭐ **`wouldCycle` é LÓGICA DE APRESENTAÇÃO, não verdade do banco.** A tela usa o
  helper (alimentado com as arestas de FORA) para não OFERECER uma aresta que
  fecharia um ciclo. O banco não conhece o grafo inteiro numa constraint; a
  não-circularidade é da tela que compõe.
- ⭐ **Os extremos da aresta CONGELAM na edição** — mudar predecessor ou sucessor
  seria outra aresta; corrigir é remover e registrar de novo. Tipo e nomes se
  editam livremente.
- ⛔ **FORA:** caminho crítico (CPM), cálculo/agendamento de datas, folga
  (float), percentual de avanço, e o próprio DESENHO do gráfico de Gantt — tudo
  vista de tela / frente futura, nunca dado novo aqui.

## 1. AS PEÇAS

- `gantt.dependencies` — a aresta: `predecessor_id`/`successor_id` (ids soltos,
  obrigatórios) + nomes carimbados, `dependency_type` (CHECK das quatro relações,
  default `finish_to_start`), `project_id`/`project_name` (vínculo solto
  opcional), carimbos. CHECK `predecessor_id <> successor_id`; unique
  `(tenant, predecessor, successor)`.
- Gatilhos: nascimento com autor do servidor; extremos congelam na edição;
  emissão de `registered` no INSERT e de `removed` no DELETE (payload do OLD).
- `@alsham/gantt`: `validateNewDependency`, `wouldCycle` (detecção de ciclo da
  camada de apresentação), `orderDependencies`, `summarizeDependencies`,
  `DEPENDENCY_TYPES`.

## 2. OS FATOS

`gantt.dependency.registered` (a aresta nasceu) · `gantt.dependency.removed` (a
aresta caiu — o plano mudou). Payload autossuficiente. `consumes` VAZIO (Lei 7 —
sem redeploy do `apps/api`).

## 3. AS TELAS

`/gantt` — placeholder por ora (o módulo vive no banco e no motor; a tela rica,
com o grafo desenhado sobre os marcos do `sched` por composição e o `wouldCycle`
guiando o operador, é frente de UI própria).

## 4. AS PERMISSÕES

- `gantt.dependency.manage` — registrar e remover dependências.

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- Caminho crítico (CPM), folga/float, agendamento e cálculo de datas — vista de
  leitura / motor de agenda; nunca dado novo aqui.
- Percentual de avanço automático — leitura sobre os marcos do `sched`.
- O DESENHO do gráfico de Gantt (a barra no tempo) — frente de UI.
- Tela rica — próxima frente de UI.

## 6. ESTADO DA CONSTRUÇÃO

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `gantt` (`0074_gantt.sql`) | ✅ CONSTRUÍDO (arquivo; apply do dono) |
| Pacote `@alsham/gantt` | ✅ CONSTRUÍDO |
| Seed (cartão pmo) | ✅ CONSTRUÍDO |
| Teste SQL `64_gantt_isolation.sql` + CI | ✅ CONSTRUÍDO |
| Portal `/gantt` | ✅ CONSTRUÍDO (placeholder) |
| Caminho crítico / datas / desenho | ⛔ **NÃO CONSTRUÍDO** (§5) |

## 7. APPLY (dono)

`docs/runbook/APLICAR.md §26`. Expor o schema `gantt` na Data API. `consumes`
vazio → sem redeploy do `apps/api`.
