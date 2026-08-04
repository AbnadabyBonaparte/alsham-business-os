# 🏛 MÓDULO 88 — PROTOCOLO (processo administrativo)
## ALSHAM Business OS™ · Especificação do módulo · Vertical `government`

> Onda Governo · cartão 1/4 · `module_id = proc` · schema `proc` ·
> migration `0105_proc.sql` · teste `95_proc_isolation.sql`.
> **ARQUIVO — apply é ato do dono. NÃO MERGEIE.**

O **Protocolo** é a porta da frente do Estado: o cidadão protocola um pedido,
recebe um **número de protocolo** para acompanhar, e o processo anda por um
**rito** que o próprio órgão desenha, até uma **decisão formal** — o ato de
império. Este módulo reaproveita a **Lei das Etapas do `ops`** (Módulo 7),
re-perguntada para o processo PÚBLICO, como o `kanban` reusou o `ops` num escopo
próprio. **NÃO é "instalar o `ops` de novo"** — cada decisão foi re-perguntada e
escrita, inclusive as que se mantiveram.

---

## 0. AS DECISÕES DE CANON

### 0.1 `module_id` = `proc`, `taxonomy.layer = 'vertical'`, `vertical = 'government'`

O prefixo de permissão e de evento é `proc.%`. É módulo **VERTICAL** — a
Taxonomia §6 lista *Protocolo* como a primeira capacidade de **🏛 Governo (8)**.
`consumes` VAZIO (Lei 7): sem redeploy do `apps/api`.

### 0.2 De onde vem: a Lei das Etapas do `ops`, re-perguntada

O `proc` herda a física do `ops`: **rito desenhado pelo tenant + etapas como
DADO DO TENANT + o item que anda pelo rito + a trilha imutável +
avançar/pular/devolver**. A tradução dos nomes:

| `ops` | `proc` |
|---|---|
| `ops.pipelines` | `proc.workflows` (o rito) |
| `ops.pipeline_stages` | `proc.workflow_stages` |
| `ops.orders` | `proc.processes` (o processo/protocolo) |
| `ops.order_events` | `proc.movements` (a trilha imutável) |
| `ops.pipeline.design` | `proc.workflow.manage` |
| `ops.order.manage` | `proc.process.manage` |
| `ops.order.decide` | `proc.process.decide` |

---

## 1. ⭐ A LEI DAS ETAPAS — MANTIDA AO PÉ DA LETRA

Não existe `create type proc.stage as enum`, nem tipo com nome de etapa em
`@alsham/proc`. A etapa é linha de `proc.workflow_stages` com o nome que o órgão
escolheu ("protocolado → análise → parecer → decisão"; outro órgão nomeia
diferente). As duas colunas que fazem o rito ser desenho, não decoração:

- `requires_approval` — passar desta etapa é DECISÃO, e exige
  `proc.process.decide`. **Quem diz o que é decisão é a coluna, nunca o nome da
  etapa.** O produto não procura a palavra "aprovação".
- `skippable` — a etapa pode não se aplicar. **Pular é ATO REGISTRADO** (quem,
  quando, por quê), numa linha imutável da trilha.

A trilha **carimba o NOME da etapa** e guarda o id solto, sem FK — é o que a faz
sobreviver ao redesenho do rito (CORE-SPEC §4). Há cenário de teste que APAGA
uma etapa percorrida e confere que a história continua legível.

---

## 2. ⭐ O DIVERGE — assinado, decisão por decisão

### 2.1 Número de protocolo — a identidade PÚBLICA (o DIVERGE #1)

O `ops` decidiu **NÃO** ter número de OS ("formato de numeração é convenção de
cada casa"). O `proc` DIVERGE: o processo público é a porta da frente do Estado,
e o cidadão sai da repartição com um número na mão. **Sem número, não há
protocolo.**

Mas o DIVERGE é só sobre a EXISTÊNCIA, nunca sobre o FORMATO. `protocol_number`
é **TEXTO LIVRE**, fornecido pelo tenant (cada órgão tem sua convenção —
`2026.0001`, `PROT-123/26`, `45.678.901/2026-12`), obrigatório e **ÚNICO POR
TENANT** (`constraint processes_protocol_unique`). Não há `create sequence`: a
casa numera; o produto só garante que dois processos do mesmo órgão nunca
compartilham o número que o cidadão cita. É a lição do `ops` (não impor formato)
mantida, com a existência exigida.

### 2.2 Interessado — o processo é SEMPRE o pedido de alguém (o DIVERGE #2)

A OS do `ops` não tem requerente. Um processo administrativo existe porque
alguém REQUEREU algo. O `proc` carrega o interessado: `interested_party_id`
(**ID SOLTO**, sem FK cross-schema — o vínculo ao cadastro é do `crm`, e amarrá-lo
com chave estrangeira leria o schema alheio, o que a guarda SCHEMA_DE do CI
reprova) + `interested_party_name` (**TEXTO CARIMBADO**). É o padrão
id-solto-+-nome do `deal`.

### 2.3 ⭐⭐ A decisão formal é TERMINAL — o ato de império (o DIVERGE #3)

A divergência mais forte. O `ops` termina em `done`/`cancelled` neutros, e
**`done → in_progress` EXISTE**: "trabalho tem identidade por serviço", a
entrega devolvida é o mesmo trabalho. O `proc` re-pergunta e responde diferente:
o processo público termina num **ATO DE IMPÉRIO** — `deferred` (deferido) ·
`denied` (indeferido) · `dismissed` (arquivado) — e esse ato é **DEFINITIVO**.

- **Decidir exige `proc.process.decide` E o `decision_note`** (o DESPACHO — a
  razão, obrigatória: decisão administrativa sem motivação é nula, Lei 9.784/99
  art. 50). O porteiro `proc.guard_status_transition()` confere os dois.
- **Os três desfechos são TERMINAIS.** Não há `deferred → in_progress` nem saída
  de nenhum. Um processo decidido que "volta" é um **RECURSO** ou um **NOVO
  protocolo** — nunca a reabertura do ato consumado. E `proc.send_back_process()`
  recusa devolver um processo já decidido (o DIVERGE do `ops`, cujo devolver
  reabre a OS concluída).
- **Cancelar não existe:** um processo que "não vai ser feito" é ARQUIVADO
  (`dismissed`), com despacho.

O contraste vs o `ops` é a régua das três identidades do dinheiro/trabalho/ato:

| módulo | terminal | reabre? | porque |
|---|---|---|---|
| `ap` | `settled` | não | dinheiro tem identidade por **documento** |
| `ops` | `done` | **sim** (`done→in_progress`) | trabalho tem identidade por **serviço** |
| `proc` | `deferred`/`denied`/`dismissed` | **não** | o ato de império tem identidade por **decisão**: proferido, é definitivo |

O CONTRASTE é PROVADO em teste: `lifecycle.test.ts` lê as duas migrations e
confere que o `ops` tem `done → in_progress` e que **nenhum** terminal do `proc`
tem transição de saída; o `95_proc_isolation.sql` prova contra o gatilho real que
reabrir e devolver um processo decidido são recusados.

---

## 3. O QUE ESTE MÓDULO GUARDA

- `proc.workflows` — o rito que o órgão desenha (`active`/`archived`; sem
  DELETE). Sem rito "padrão" semeado.
- `proc.workflow_stages` — as etapas (a Lei das Etapas em tabela). **Única
  tabela com porta de DELETE** (desenhar o rito é tentativa e erro; a trilha
  sobrevive porque carimba o nome).
- `proc.processes` — o processo/protocolo: `protocol_number`, interessado
  (id solto + nome), `subject`, `description`, `assignee_user_id` (membro do
  tenant), `due_date`, `status`, `decision_note`. Sem DELETE (arquivar é status).
- `proc.movements` — a trilha, **imutável em três camadas** (sem policy de
  UPDATE/DELETE; sem GRANT de UPDATE/INSERT/DELETE; gatilho que recusa até para
  o dono do banco). `kind ∈ {registered, advanced, skipped, sent-back, decided}`.

Os movimentos que mudam a etapa (`advance_process`, `skip_stage`,
`send_back_process`) são funções `security definer set search_path=''` — atômicas
(mudam a etapa E escrevem a trilha), leem o nome da etapa no servidor, e conferem
a permissão que depende do DESENHO. A decisão formal é UPDATE comum guardado pelo
porteiro de estado + gatilho que escreve a linha `decided` e emite o fato.

---

## 4. OS CINCO FATOS

Todos por `proc.emit_event()`, prefixo `proc.%`, payload AUTOSSUFICIENTE (leva o
número de protocolo, o nome do interessado, do rito e da etapa — nunca só ids):

| fato | quando |
|---|---|
| `proc.process.registered` | o processo foi protocolado, com número, interessado e a etapa inicial |
| `proc.stage.advanced` | passou para a próxima etapa do rito |
| `proc.stage.skipped` | uma etapa foi pulada (com quem, quando, razão) |
| `proc.process.sent-back` | devolvido para etapa anterior com a instrução do que refazer |
| `proc.process.decided` | a decisão formal (deferido/indeferido/arquivado) com o despacho — TERMINAL |

`consumes` é **VAZIO**, e é Lei 7: a integração óbvia (`crm.party.registered`
traria o interessado) existe, mas o handler não existe. O interessado é id solto
+ nome carimbado, e basta.

---

## 5. ESTADO DA OBRA — o que existe e o que não existe

**EXISTE (neste PR):**

- `packages/proc/` — manifesto, tipos, motor puro (`ALLOWED_TRANSITIONS`,
  `permissionToAdvance`, `buildBoard`, `validateNewProcess`, `validateDecision`,
  `validateStages`, `summarizeProcesses`), e os três arquivos de teste.
- `supabase/migrations/0105_proc.sql` — schema `proc` completo, RLS ligada e
  forçada nas quatro tabelas, trilha imutável, o porteiro do estado, os três
  movimentos e o revoke de fechamento DEPOIS das funções (lição do 0022).
- `supabase/tests/95_proc_isolation.sql` — nove cenários com usuário real.

**NÃO EXISTE / FICA DE FORA (declarado):**

- Sem upload de documento/anexo: *Storage & Arquivos* é capacidade do **Core**
  (Taxonomia §3), NÃO CONSTRUÍDA. Um processo real anexa documentos; quando o
  Storage existir, o anexo entra por id solto, sem migration corretiva.
- Sem sigilo/LAI, sem prioridade, sem prazo legal calculado, sem numeração
  automática — cada um é configuração do tenant ou capacidade própria.
- As outras 7 capacidades do vertical Governo ficam em outros cartões/módulos:
  Ouvidoria→`ombuds`, Licitações→`bid`, Fiscalização→`fisc`; Convênios→`ctr`,
  Patrimônio→`pat`, Obras→`proj`, Tributos FORA por Lei 3.

---

## 6. O QUE A PRÓXIMA ETAPA HERDA

O `proc` prova, pela segunda vez depois do `kanban`, que a física do `ops` (a Lei
das Etapas) é reutilizável num escopo próprio sem ser reinstalada — e mostra como
um vertical DIVERGE do genérico por escrito: número público, requerente, e a
máquina de estados terminal do ato administrativo. Qualquer módulo futuro que
precise de "um item que anda por um fluxo desenhado pelo tenant e termina num ato
definitivo" re-pergunta estas três decisões antes de copiá-las.
