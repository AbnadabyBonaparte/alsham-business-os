# Mandato de Beleza — Fatia 5b: Auditoria Completa das Telas de Módulo

> **Tarefa só de leitura.** Nenhum arquivo de código foi alterado nesta passada.
> Objetivo: mapear, de uma vez, o estado real de TODAS as páginas de módulo do
> portal, pra virar plano de prioridade em vez de descobrir surpresa a cada bloco.
>
> Base: `main` @ `#54` mergeado (89 módulos publicados). Evidência colhida do
> disco — nenhuma inferência: existência de porta em `apps/portal/src/lib/data/`,
> conteúdo real do `page.tsx` e do componente de listagem. Mesma régua das levas
> anteriores.

## A régua (4 categorias)

- **STUB** — só `PageHero` + `EmptyState` ("a tela detalhada é a próxima frente");
  **não existe** `<módulo>-port.ts` em `lib/data/`; nenhum import de domínio real
  (as refs `@alsham/*` no arquivo são texto de subtítulo, não `import`). Zero
  registro renderizado. ~26–30 linhas.
- **TABELA** — porta de dados real + um componente de listagem que mapeia um array
  de registros em cards/linhas repetidos (`flex flex-col gap-3` de `Panel`).
  Candidata direta ao padrão `components/table.tsx` (tabela + linha expansível).
- **CARD** — porta real, mas a interação é config-por-item / cartões de configuração
  com ação inline (não um roster longo). Já é o formato certo — **não** vira tabela.
- **TERCEIRO PADRÃO** — leitura visual/espacial que a tabela destruiria (kanban por
  estágio, designer/canvas). Registrado qual é o padrão e por quê.

---

## Resumo — quantas telas em cada categoria

Universo: **as telas de módulo** (um item de menu por tela; `recon` tem 4 telas,
`ops` tem 2). Fora do universo: o Painel (`/`), a Store, os Ajustes e o login —
plataforma, não catálogo.

| Categoria | Total | Já auditadas (levas 1–3) | 🆕 Auditadas agora |
|---|---:|---:|---:|
| **STUB** | 56 | 5 (RH) | 51 |
| **TABELA** | 26 | 10 | **16** |
| **CARD** | 2 | 2 | 0 |
| **TERCEIRO PADRÃO** | 3 | 1 (funil) | 2 (esteira, esteiras) |
| **Core / original** (fora do sweep) | 5 | — | — |
| **TOTAL** | **92** | 18 | 69 |

**A leitura de uma frase:** o portal tem **56 telas ainda em esboço** (a maioria — os
módulos das Missões 8→21 nasceram no banco com a tela adiada) e **16 telas prontas,
data-backed, esperando só a passada de beleza** — conversão mecânica, mesmo padrão
das levas Financeiro/Comercial. Fora isso, 2 CARD e 3 TERCEIRO PADRÃO já estão no
formato certo e não se mexe.

---

## Auditoria por bloco

Legenda de status: ✅ = auditada em leva anterior · 🆕 = auditada nesta passada.

### 💰 Financeiro (`finance`) — 10 módulos, 13 telas

| Tela | Módulo | Categoria | Status | Evidência |
|---|---|---|---|---|
| /importar | recon | Core/original | — | `import-form` — tela fundadora do Módulo 1 (importar extrato). Data-backed. |
| /conciliacao | recon | Core/original (já tabela) | — | `reconciliation-table` — já é tabela desde a origem. |
| /aprovacoes | recon | Core/original | — | `approval-queue` — fila de aprovação, fundadora. |
| /fechamento | recon | Core/original | — | `close-period` — fechar período, fundadora. |
| /contas-a-pagar | ap | **TABELA** | ✅ | `payable-list` (usa `components/table`). |
| /contas-a-receber | ar | **TABELA** | ✅ | `receivable-list` (usa `components/table`). |
| /caixa | cash | **TABELA** | ✅ | `cash-ledger` (usa `components/table`). |
| /centros-de-custo | cc | **TABELA** | ✅ | `cc-board` (leituras statement-like em tabela; regras de rateio ficaram card). |
| /orcamentos | bud | **TABELA** | ✅ | `bud-board` (usa `components/table`). |
| /dre | dre | **TABELA** | ✅ | `dre-board` statement-like (usa `components/table`). |
| /contas-bancarias | bank | **CARD** | ✅ | `bank-forms` — cartões de conta com saldo/ação inline. Formato certo. |
| /investimentos | invest | **CARD** | ✅ | `invest-forms` — posição por aplicação, form-por-item. Formato certo. |
| /cobranca | dun | **TABELA** | 🆕 | `dun-queue`: `titles.filter(isInQueue)` → `TitleCard` em `flex flex-col gap-3`. Porta `getDunPort()`+`loadTitles()`. |

### 🤝 CRM & Comercial (`crm`) — 4 módulos, 4 telas

| Tela | Módulo | Categoria | Status | Evidência |
|---|---|---|---|---|
| /relacionamentos | crm | **TABELA** | ✅ | `party-list` (usa `components/table`; toolbar de busca preservada). |
| /propostas | quote | **TABELA** | ✅ | `proposal-list` (usa `components/table`; itens+ações na linha expansível). |
| /leads | lead | **TABELA** | ✅ | `lead-queue` (usa `components/table`; ordem FIFO preservada). |
| /funil | deal | **TERCEIRO PADRÃO** (kanban) | ✅ | `funnel-board` — colunas por estágio; tabela destruiria a leitura do pipeline. |

### ⚙️ Operações (`operations`) — 8 módulos, 9 telas

| Tela | Módulo | Categoria | Status | Evidência |
|---|---|---|---|---|
| /estoque | inv | **TABELA** | 🆕 | `InventoryList` mapeia `balances` → `ItemCard` (Panel) com Extrato/Arquivar inline. `getInvPort()`. |
| /ocorrencias | occ | **TABELA** | 🆕 | `OccBook` mapeia `orderOccurrences(...)` → `OccCard` com tratativa/encerrar inline. `getOccPort()`. |
| /manutencao | mnt | **TABELA** | 🆕 | `MntBoard` (apesar do nome) é pilha vertical de `MntCard`, sem colunas. `getMntPort()`. |
| /patrimonio | pat | **TABELA** | 🆕 | `PatBook` mapeia `orderAssets(assets)` → `PatCard` com transferir/baixar/histórico. `getPatPort()`. |
| /checklists | chk | **TABELA** | 🆕 | `chk-board` mapeia `runs` → `ChkRunCard` com "prancheta" expansível. `getChkPort()`. |
| /espacos | spc | **TABELA** | 🆕 | `spc-agenda` mapeia `orderAgenda(reservations)` → `ReservaCard` (lista, não grade). `getSpcPort()`. |
| /visitas | vis | **TABELA** | 🆕 | `VisGate` mapeia `orderGate(visits)` → `VisitaCard` com check-in/out inline. `getVisPort()`. |
| /esteira | ops | **TERCEIRO PADRÃO** (kanban) | 🆕 | `PipelineBoard`: `buildBoard(stages, orders)` = UMA coluna por etapa do tenant, scroll horizontal. Tabela destruiria. |
| /esteiras | ops | **TERCEIRO PADRÃO** (designer) | 🆕 | `pipeline-designer`: canvas de etapas reordenáveis (↑/↓/✕, `validateStages()`). Editor espacial de processo. |

### 📣 Marketing (`marketing`) — 4 módulos, 4 telas

| Tela | Módulo | Categoria | Status | Evidência |
|---|---|---|---|---|
| /campanhas | marketing | Core/original (board) | — | `campaign-board` — carteira de campanhas do Módulo 2, fundadora. |
| /eventos | evt | **TABELA** | 🆕 | `EventList` mapeia `events` → `EventCard` com inscrições expansíveis. `getEvtPort()`. |
| /calendario | edcal | **TABELA** | 🆕 | `edcal-board` mapeia `orderCalendar(pieces)` → `PieceCard` (lista por data, NÃO grade). `getEdcalPort()`. |
| /midia | media | **TABELA** | 🆕 | `MediaShelf` mapeia `orderShelf(assets)` → `AssetCard` com etiquetas/uso inline. `getMediaPort()`. |

### 🎧 Atendimento ao Cliente (`cx`) — 2 módulos, 2 telas

| Tela | Módulo | Categoria | Status | Evidência |
|---|---|---|---|---|
| /atendimento | care | **TABELA** | 🆕 | `care-queue` mapeia `orderTickets(...)` → `TicketCard` (roster de casos). `getCarePort()`. |
| /pesquisas | nps | **TABELA** | 🆕 | `NpsBoard` mapeia `orderSurveys(surveys)` → `SurveyCard` com registrar voz/encerrar inline. `getNpsPort()`. |

**Bloco 100% TABELA e 100% não-auditado — candidato limpo à próxima leva.**

### 📊 BI (`bi`) — 1 módulo, 1 tela

| Tela | Módulo | Categoria | Status | Evidência |
|---|---|---|---|---|
| /metas | goal | **TABELA** | 🆕 | `GoalBoard` mapeia `orderGoals(goals)` → `GoalCard` com check-in/fechar inline. `getGoalPort()`. |

### 👥 RH / Pessoas (`hr`) — 6 módulos, 6 telas

| Tela | Módulo | Categoria | Status | Evidência |
|---|---|---|---|---|
| /comunicados | comm | **TABELA** | 🆕 | `comm-board` mapeia `orderBoard(notices)` → `NoticeCard`. `getCommPort()`. (Nota: `comm` é domínio hr.) |
| /colaboradores | hr | **STUB** | ✅ | PageHero+EmptyState; sem `hr-port`. (PR #54) |
| /escalas | shift | **STUB** | ✅ | PageHero+EmptyState; sem `shift-port`. (PR #54) |
| /treinamentos | train | **STUB** | ✅ | PageHero+EmptyState; sem `train-port`. (PR #54) |
| /avaliacoes | perf | **STUB** | ✅ | PageHero+EmptyState; sem `perf-port`. (PR #54) |
| /politicas | pol | **STUB** | ✅ | PageHero+EmptyState; sem `pol-port`. (PR #54) |

### 🛒 Compras (`procurement`) — 6 módulos, 6 telas

| Tela | Módulo | Categoria | Status | Evidência |
|---|---|---|---|---|
| /compras | po | **TABELA** | 🆕 | `order-list` mapeia `orders` → `OrderCard` com itens em `<ul>`; EmptyState "Nenhum pedido". `getPoPort()`. |
| /fornecedores | vendor | **STUB** | 🆕 | PageHero+EmptyState (28L); sem `vendor-port`. |
| /cotacoes | rfq | **STUB** | 🆕 | PageHero+EmptyState (28L); sem `rfq-port`. |
| /recebimentos | recv | **STUB** | 🆕 | PageHero+EmptyState (28L); sem `recv-port`. |
| /avaliacao-fornecedores | vperf | **STUB** | 🆕 | PageHero+EmptyState (28L); sem `vperf-port`. |
| /estoque-minimo | reorder | **STUB** | 🆕 | PageHero+EmptyState (29L); sem `reorder-port`. |

### 🚚 Supply Chain (`supply-chain`) — 5 módulos, 5 telas · **100% STUB**

| Tela | Módulo | Categoria | Status | Evidência |
|---|---|---|---|---|
| /planejamento-demanda | dem | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |
| /sop | sop | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |
| /centros-distribuicao | dc | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |
| /despachos | disp | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |
| /performance-logistica | logperf | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |

### 📐 PMO & Projetos (`pmo`) — 10 módulos, 10 telas · **100% STUB**

| Tela | Módulo | Categoria | Status | Evidência |
|---|---|---|---|---|
| /projetos | proj | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |
| /cronogramas | sched | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |
| /kanban | kanban | **STUB** | 🆕 | PageHero+EmptyState; sem porta. (Quando construído, tende a TERCEIRO/kanban.) |
| /recursos | alloc | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |
| /custos-projeto | pcost | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |
| /sprints | scrum | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |
| /gantt | gantt | **STUB** | 🆕 | PageHero+EmptyState; sem porta. (Quando construído, tende a TERCEIRO/gantt.) |
| /riscos | risk | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |
| /apontamentos | timesheet | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |
| /portfolio | pfolio | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |

### ✔️ Qualidade (`quality`) — 4 módulos, 4 telas · **100% STUB**

| Tela | Módulo | Categoria | Status | Evidência |
|---|---|---|---|---|
| /nao-conformidades | nc | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |
| /auditorias | audit | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |
| /capa | capa | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |
| /iso | iso | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |

### 🏛 GRC (`grc`) — 3 módulos, 3 telas · **100% STUB**

| Tela | Módulo | Categoria | Status | Evidência |
|---|---|---|---|---|
| /riscos-corporativos | erisk | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |
| /controles-internos | control | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |
| /denuncias | whistle | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |

### 🔐 Segurança da Informação (`infosec`) — 3 módulos, 3 telas · **100% STUB**

| Tela | Módulo | Categoria | Status | Evidência |
|---|---|---|---|---|
| /vulnerabilidades | vuln | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |
| /incidentes-seguranca | secincident | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |
| /continuidade | continuity | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |

### 🌱 ESG (`esg`) — 1 módulo · 🔬 P&D (`rnd`) — 2 módulos · 🧾 Contábil (`accounting`) — 1 módulo · **todos STUB**

| Tela | Módulo | Domínio | Categoria | Status | Evidência |
|---|---|---|---|---|---|
| /esg | esg | esg | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |
| /ideias | idea | rnd | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |
| /propriedade-intelectual | ip | rnd | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |
| /certificados | fiscalcert | accounting | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |

### 🏢 Vertical Shopping Centers (`shopping-centers`) — 5 módulos · **100% STUB**

| Tela | Módulo | Categoria | Status | Evidência |
|---|---|---|---|---|
| /lojistas | mall | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |
| /locacao | lease | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |
| /fundo-promocao | fund | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |
| /estacionamento | park | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |
| /rondas | sec | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |

### 🛍 Vertical Varejo (`retail`) — 4 módulos · **100% STUB**

| Tela | Módulo | Categoria | Status | Evidência |
|---|---|---|---|---|
| /pdv | pdv | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |
| /catalogo | catalog | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |
| /caixa-sessao | cashregister | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |
| /fidelidade | loyalty | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |

### ☀️ Vertical Energia (`energy`) — 4 módulos · **100% STUB**

| Tela | Módulo | Categoria | Status | Evidência |
|---|---|---|---|---|
| /usinas | plant | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |
| /assinaturas | subscription | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |
| /geracao | genreading | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |
| /creditos | creditbalance | **STUB** | 🆕 | PageHero+EmptyState; sem porta. |

### 🏥 Vertical Saúde (`health`) — 5 módulos · **100% STUB**

| Tela | Módulo | Categoria | Status | Evidência |
|---|---|---|---|---|
| /pacientes | patient | **STUB** | 🆕 | PageHero+EmptyState; sem porta. (Telas-stub criadas na PR #55 pra guarda "o menu não mente".) |
| /agenda | appointment | **STUB** | 🆕 | idem. |
| /prontuario | record | **STUB** | 🆕 | idem. Módulo clínico — a tela nascerá pela porta que loga o acesso. |
| /exames | exam | **STUB** | 🆕 | idem. Módulo clínico. |
| /receitas | prescription | **STUB** | 🆕 | idem. Módulo clínico. |

---

## Recomendação — ordem para as próximas levas

### A) Converter já (mecânico, rápido) — 16 telas TABELA, mesmo padrão pronto

Nenhuma dessas precisa de construção: têm porta de dados real e renderizam um
roster que já pede tabela. Ordem sugerida pelo **tamanho do ganho por bloco**
(conversão em lote, um `Table` só):

1. **⚙️ Operações — 7 telas** (`estoque`, `ocorrencias`, `manutencao`,
   `patrimonio`, `checklists`, `espacos`, `visitas`). O maior lote do portal, todas
   o mesmo `*-board`/`*-book`. *(As 2 telas de esteira ficam de fora — são kanban.)*
2. **📣 Marketing — 3 telas** (`eventos`, `calendario`, `midia`).
3. **🎧 Atendimento (cx) — 2 telas** (`atendimento`, `pesquisas`). Bloco 100% TABELA.
4. **Avulsas — 4 telas:** `metas` (BI), `cobranca` (Finance), `compras` (Compras),
   `comunicados` (RH). Uma tela cada, encaixam em qualquer leva.

> Uma leva "Operações" sozinha já converte 7 das 16 — é o melhor custo/benefício.

### B) Não mexer — já estão no formato certo

- **CARD (2):** `contas-bancarias`, `investimentos` — cartões de config, não roster.
- **TERCEIRO PADRÃO (3):** `funil` (kanban), `esteira` (kanban por etapa),
  `esteiras` (designer de processo). Tabela destruiria a leitura.

### C) Precisa construir a UI antes de embelezar — 51 telas STUB (+ 5 do RH já sabidas)

Blocos onde a tela é só esboço (`PageHero`+`EmptyState`, sem porta de dados). A
beleza não se aplica: primeiro é preciso a **frente de UI** (porta de dados +
listagem), e aí a tela nasce já no padrão certo. **Decisão de prioridade é do dono.**
Blocos inteiros em esboço, do maior pro menor:

| Bloco | Telas STUB | Observação |
|---|---:|---|
| 📐 PMO & Projetos | 10 | `kanban`/`gantt` nascerão TERCEIRO; o resto, TABELA. |
| 👥 RH / Pessoas | 5 | já auditado (PR #54); `comunicados` é a exceção (TABELA). |
| 🛒 Compras (resto) | 5 | só `compras` está pronta. |
| 🚚 Supply Chain | 5 | bloco inteiro. |
| 🏢 Shopping Centers | 5 | vertical inteiro. |
| 🏥 Saúde | 5 | vertical inteiro; 3 clínicos precisam da porta que loga. |
| ✔️ Qualidade | 4 | bloco inteiro. |
| 🛍 Varejo | 4 | vertical inteiro. |
| ☀️ Energia | 4 | vertical inteiro. |
| 🏛 GRC | 3 | bloco inteiro. |
| 🔐 InfoSec | 3 | bloco inteiro. |
| 🔬 P&D | 2 | bloco inteiro. |
| 🌱 ESG · 🧾 Contábil | 1 + 1 | um módulo cada. |

**Padrão dominante do portal hoje:** os módulos das grandes ondas (8→21) nasceram
provados no banco com a **tela deliberadamente adiada** — exatamente o que o RH já
mostrou. A beleza avança rápido no que a plataforma fundadora (Missões Quadra→Sexta)
construiu com tela; o resto espera a frente de UI.

---

*Auditoria de leitura · Mandato de Beleza, Fatia 5b · nenhuma tela convertida nesta passada.*
