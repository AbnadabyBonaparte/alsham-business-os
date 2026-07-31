# 🧩 CORE-SPEC — O CONTRATO DO LEGO
## ALSHAM Business OS™ · Especificação do Core · Fase 1

**Versão:** 1.0 · **Data:** 27/07/2026 · **Status:** Canônico
**Subordinação:** este documento obedece à [Taxonomia Empresarial ALSHAM](TAXONOMIA-EMPRESARIAL-ALSHAM.md) e ao [Roadmap Técnico V1](ROADMAP-TECNICO-V1.md). Em divergência, os dois vencem.

**Natureza:** esta é a especificação que amarra três peças que nasceram juntas e não fazem sentido separadas:

| Peça | O que é |
|---|---|
| `packages/config` | as constantes canônicas — o que a empresa é |
| `packages/core` | os **tipos** que todo módulo obedece — zero runtime |
| `supabase/migrations/0001_core.sql` | o **schema** que sustenta esses tipos — **aplicado em produção** (§5) |

> **Lei 7:** o que ainda não existe está marcado como **NÃO CONSTRUÍDO**, e o estado corrente de cada peça está em **[§5](#5-estado-da-obra--o-que-existe-e-o-que-não-existe)** — que é atualizado a cada etapa, não congelado na etapa que escreveu este documento.

---

## 1. A TESE, EM UMA FRASE

> A empresa não compra um sistema. Ela **monta** o sistema dela — Core + módulos, como Lego.

Para isso ser verdade e não slogan, uma coisa precisa ser mecanicamente impossível: **um módulo depender de outro módulo.** Se o Financeiro importar o CRM, o cliente que quer só Financeiro leva o CRM junto — e o Lego virou monolito com nome bonito.

Todo o resto deste documento existe para tornar essa dependência impossível.

---

## 2. AS TRÊS PROIBIÇÕES QUE SUSTENTAM O CORE

**1. Módulo não importa módulo.** `ModuleManifest` não tem campo `dependsOn`. A única dependência declarável é `requiresCore`. O que o tipo não deixa escrever, ninguém precisa lembrar de proibir na revisão de código.

**2. Módulo não lê tabela de outro módulo.** O que atravessa a fronteira é o `EventEnvelope`, e só ele. Consumir o evento de outro módulo **não é depender dele**: o acoplamento é com o *tipo do evento*, que é contrato público. Se ninguém emitir aquele tipo, o consumidor simplesmente não é acordado — não quebra.

**3. Nenhuma query sem `tenant_id`.** Toda tabela de dados de tenant carrega `tenant_id`, e toda tabela tem RLS ligada com policy real. As duas exceções do schema — `module_registry` e `plan_limits` — são catálogo da plataforma, não dado de tenant, e estão sinalizadas no próprio SQL.

---

## 3. O CICLO DE VIDA DE UM MÓDULO

```
   ┌───────────────────────────────────────────────────────────────────┐
   │ 1. DECLARA                                       (o módulo, em código) │
   │    ModuleManifest: id · taxonomia · capacidades · permissões ·    │
   │    eventos que emite e consome · requiresCore                     │
   │                                                                   │
   │    Lei 7 vive aqui: capacidade só entra na lista quando está      │
   │    construída. O manifesto é o que a Store exibe.                 │
   └───────────────────────────────┬───────────────────────────────────┘
                                   │  service_role, do servidor
                                   ▼
   ┌───────────────────────────────────────────────────────────────────┐
   │ 2. REGISTRA                                  core.module_registry │
   │    O Core valida o manifesto e grava no catálogo.                 │
   │    status: draft → published → deprecated                         │
   │                                                                   │
   │    Só `published` aparece na vitrine (policy, não filtro de tela). │
   │    `deprecated` some da vitrine; quem já instalou continua.        │
   └───────────────────────────────┬───────────────────────────────────┘
                                   │  o tenant escolhe, na apps/store
                                   ▼
   ┌───────────────────────────────────────────────────────────────────┐
   │ 3. TENANT INSTALA                             core.tenant_modules │
   │    (tenant_id, module_id, version, settings)                      │
   │    Exige a permissão `core.module.install` naquele tenant.        │
   │                                                                   │
   │    `settings` é onde a Lei anti-viés se materializa: o que é       │
   │    específico de UM cliente vira chave aqui, nunca código no       │
   │    módulo.                                                         │
   │                                                                   │
   │    Desinstalar = status 'uninstalled'. Não apaga a linha: o        │
   │    histórico do que o tenant já teve sobrevive.                   │
   └───────────────────────────────┬───────────────────────────────────┘
                                   ▼
   ┌───────────────────────────────────────────────────────────────────┐
   │ 4. RECEBE PERMISSÕES                         core.role_permissions │
   │    As permissões do manifesto passam a existir naquele tenant e    │
   │    ficam disponíveis para os papéis.                              │
   │                                                                   │
   │    O prefixo `<moduleId>.` é o que permite revogar TUDO de um      │
   │    módulo de uma vez quando ele sai.                              │
   │                                                                   │
   │    Duas camadas, sempre: RLS impede o tenant errado de VER a       │
   │    linha; a permissão impede o membro errado de FAZER a ação.      │
   └───────────────────────────────┬───────────────────────────────────┘
                                   ▼
   ┌───────────────────────────────────────────────────────────────────┐
   │ 5. CONVERSA POR EVENTOS                                            │
   │                                                                   │
   │    módulo A                    CORE                    módulo B    │
   │       │                          │                          │      │
   │       │ grava dado + evento      │                          │      │
   │       │ na MESMA transação       │                          │      │
   │       ├─────────────────────────►│ core.event_outbox        │      │
   │       │                          │ (status: pending)        │      │
   │       │                          │                          │      │
   │       │                     entrega com                     │      │
   │       │                   backoff e reentrega               │      │
   │       │                          ├─────────────────────────►│      │
   │       │                          │                          │      │
   │       │                          │  B grava event_id em     │      │
   │       │                          │  core.processed_events   │      │
   │       │                          │  ANTES de agir           │      │
   │       │                          │◄─────────────────────────┤      │
   │       │                          │                          │      │
   │       │                          │  event_id repetido =     │      │
   │       │                          │  insert falha = descarta │      │
   │                                                                   │
   │    A nunca soube que B existe. B pode ser desinstalado sem que A   │
   │    mude uma linha.                                                │
   └───────────────────────────────────────────────────────────────────┘
```

### 3.1 Por que a caixa de saída, e não uma chamada direta

Chamada direta tem dois modos de falha que não se resolvem com `try/catch`: o dado grava e o evento não sai; ou o evento sai e o dado não grava. A caixa de saída elimina os dois — o evento é gravado na **mesma transação** do dado que ele descreve, e a entrega vem depois, com reentrega.

Isso não é teoria: é o padrão do `casa-bonaparte-saas` (`pg_cron` + `pg_net`, job de reentrega por minuto), registrado no Balanço de Tecnologia como **PROVADO ponta a ponta** — e foi ele que segurou uma falha real em 24/07.

### 3.2 Por que a idempotência é por consumidor

A chave primária de `processed_events` é `(event_id, consumer)`, não `event_id`. O mesmo evento **deve** ser processado uma vez por cada consumidor interessado. Chave só em `event_id` faria o segundo consumidor achar que o evento já foi tratado — e perder o fato em silêncio.

---

## 4. A TRILHA — o que fica registrado

Toda mudança de estado no Core escreve em `core.audit_log`: **quem, o quê, quando, em qual tenant.** Minerado do padrão do peritus, a régua de auditoria do império (**PROVADO**).

Três regras que o schema impõe, não pede:

1. **Append-only de verdade.** Sem policy de UPDATE ou DELETE, **e** com trigger que bloqueia as duas — inclusive para o `service_role`, que passaria por cima da RLS. Corrigir um erro é escrever uma entrada nova.
2. **Sobrevive ao dado.** `resource_id` é solto, não chave estrangeira: apagar o recurso não cascateia o apagamento da trilha.
3. **Nunca guarda segredo.** Senha, token e chave são redigidos antes de chegar. Trilha de auditoria é o último lugar onde um segredo deveria vazar, e o que mais dói quando vaza.

O ator não é sempre humano: `user`, `agent` (doutrina da Casa — agente embarcado sempre que possível) ou `system` (job, cron, migração). Tratar agente e cron como "usuário do sistema" é exatamente como se perde a trilha.

---

## 5. ESTADO DA OBRA — o que existe e o que não existe

Honestidade de escopo (Lei 7). **Esta seção é do repositório, não da etapa que escreveu este documento** — quem entregar uma peça atualiza a linha dela aqui, e há guarda no CI contra deixá-la envelhecer.

*Conferido em 28/07/2026, depois da Etapa 13.*

| Peça | Estado |
|---|---|
| Tipos do Core (`@alsham/core`) | ✅ construído — zero runtime, só tipos |
| Constantes canônicas (`@alsham/config`) | ✅ construído |
| Schema do Core (`0001_core.sql`) | ✅ **APLICADO em produção** — ver aviso abaixo |
| **O Lego com DOIS módulos** | ✅ **PROVADO na Etapa 7** — `marketing` reage a `recon.approval.decided` sem importá-lo, sem ler seu schema e sem conhecer o correio ([MODULO-MARKETING-SPEC](MODULO-MARKETING-SPEC.md)) |
| ⭐ **O TRIÂNGULO — o Lego com TRÊS módulos** | ✅ **PROVADO na Etapa 10** — `ap` emite e `recon` projeta. O módulo mais antigo, que ninguém escreveu para escutar, virou consumidor **sem que uma linha do `0002_recon.sql` mudasse**: a tabela nasceu na Etapa 2 com `source='event'` e `source_module_id`, esperando um módulo que ainda não existia ([MODULO-AP-SPEC](MODULO-AP-SPEC.md)) |
| **Módulo 3 — Contas a Pagar** (`@alsham/accounts-payable` + `0007_ap.sql`) | ✅ **CONSTRUÍDO na Etapa 10** e **APLICADO em produção** em 28/07/2026, informado pelo dono — ⚠️ **NÃO VERIFICADO** por este repositório. Instalado no tenant piloto pela Store, com o clique do dono |
| **Módulo 4 — Relacionamentos** (`@alsham/crm` + `0009_crm.sql`) | ✅ **CONSTRUÍDO na Etapa 11** e **APLICADO em produção** em 28/07/2026, informado pelo dono — ⚠️ **NÃO VERIFICADO** por este repositório. O 4º cartão da Store ([MODULO-CRM-SPEC](MODULO-CRM-SPEC.md)) |
| **Módulo 5 — Contas a Receber** (`@alsham/accounts-receivable` + `0010_ar.sql`) | ✅ **CONSTRUÍDO na Etapa 12** e **APLICADO em produção** em 29/07/2026, informado pelo dono — ⚠️ **NÃO VERIFICADO** por este repositório. O espelho consciente do Módulo 3, com uma divergência declarada ([MODULO-AR-SPEC](MODULO-AR-SPEC.md)) |
| **Módulo 6 — Compras (Pedidos)** (`@alsham/purchase-orders` + `0017_po.sql`) | ✅ **CONSTRUÍDO** — **arquivo, ainda não aplicado**. Domain `procurement`. `consumes` vazio; caminho pedido→AP NÃO CONSTRUÍDO ([MODULO-PO-SPEC](MODULO-PO-SPEC.md)) |
| **Módulo 7 — Esteira de Produção** (`@alsham/ops` + `0018_ops.sql`) | ✅ **CONSTRUÍDO na Etapa 13** — **arquivo, ainda não aplicado** (runbook §11). ⭐ **É ele que prova que o produto não é de ninguém em particular:** a esteira é DADO DO TENANT, e o teste SQL escreve a de uma agência e a de uma manutenção predial na mesma tabela ([MODULO-OPS-SPEC](MODULO-OPS-SPEC.md)) |
| **Módulo 8 — Estoque** (`@alsham/inventory` + `0023_inv.sql`) | ✅ **CONSTRUÍDO na Missão Trina** — **arquivo, ainda não aplicado** (runbook §16). ⭐ **O saldo não é coluna:** o estoque é um LIVRO de movimentos imutável e o saldo é a soma dele, com saldo NEGATIVO permitido por decisão declarada ([MODULO-INV-SPEC](MODULO-INV-SPEC.md)) |
| **Módulo 9 — Propostas** (`@alsham/quotes` + `0024_quote.sql`) | ✅ **CONSTRUÍDO na Missão Trina** — **arquivo, ainda não aplicado** (runbook §16). ⭐ **Identidade por DOCUMENTO:** a mesa congela o conteúdo, o aceite carimba quem/quando pelo servidor, e os quatro fins são terminais — renegociar é documento novo ([MODULO-QUOTE-SPEC](MODULO-QUOTE-SPEC.md)) |
| **Módulo 10 — Funil Comercial** (`@alsham/deals` + `0025_deal.sql`) | ✅ **CONSTRUÍDO na Missão Trina** — **arquivo, ainda não aplicado** (runbook §16). ⭐ **A Lei das Etapas, segunda aplicação:** estágios do tenant, movimento LIVRE com trilha imutável, desfecho terminal com razão, vínculo com o crm por ID SOLTO + nome carimbado ([MODULO-DEAL-SPEC](MODULO-DEAL-SPEC.md)) |
| **Módulo 11 — Eventos** (`@alsham/event-management` + `0026_evt.sql`) | ✅ **CONSTRUÍDO na Missão Trina** — **arquivo, ainda não aplicado** (runbook §16). ⭐ **O evento UNIVERSAL** (Domain marketing, não o vertical): a lista abre ao publicar, a lotação recusa claro, a presença é ato carimbado. `module_id` é `evt` — "evento" já é vocabulário do Core ([MODULO-EVT-SPEC](MODULO-EVT-SPEC.md)) |
| **Módulo 12 — Régua de Cobrança** (`@alsham/dunning` + `0027_dun.sql`) | ✅ **CONSTRUÍDO na Missão Trina** — **arquivo, ainda não aplicado** (runbook §16). ⭐⭐ **O quarto consumidor:** projeta os fatos de títulos a receber (padrão E10), a baixa na origem tira da régua sozinha, e executar passo é ato carimbado. A régua é DESENHO DO TENANT — Lei das Etapas, terceira aplicação ([MODULO-DUN-SPEC](MODULO-DUN-SPEC.md)) |
| **Módulo 13 — Contratos** (`@alsham/contracts` + `0028_ctr.sql`) | ✅ **CONSTRUÍDO na Missão Quadra** — **arquivo, ainda não aplicado** (runbook §17). ⭐ **O termo vigente NÃO é coluna:** os termos originais congelam em vigor e o vigente é calculado dos ATOS imutáveis — reajuste (índice em texto livre, sem cálculo) e renovação (que estende o MESMO contrato, o DIVERGE consciente do quote). Encerrar é calendário; rescindir exige razão ([MODULO-CTR-SPEC](MODULO-CTR-SPEC.md)) |
| **Módulo 14 — Fluxo de Caixa** (`@alsham/cashflow` + `0029_cash.sql`) | ✅ **CONSTRUÍDO na Missão Quadra** — **arquivo, ainda não aplicado** (runbook §17). ⭐ O livro do `inv` NO DINHEIRO: lançamentos imutáveis com o sinal no TIPO, categoria como DADO DO TENANT (sem categoria é permitido — e honesto), saldo sempre em view. **CAIXA realizado: o futuro é recusado** (previsão é Orçamento). `consumes` vazio pela decisão contra a dupla contagem ([MODULO-CASH-SPEC](MODULO-CASH-SPEC.md)) |
| **Módulo 15 — Atendimento** (`@alsham/care` + `0030_care.sql`) | ✅ **CONSTRUÍDO na Missão Quadra** — **arquivo, ainda não aplicado** (runbook §17). ⭐ **A terceira identidade:** o caso reabre de `resolved` (o pedido é o mesmo — o argumento do ops) mas `closed` é terminal (o fim confirmado — o argumento do quote). Categoria E prioridade são dado do tenant; a conversa é imutável em 3 camadas; resolver carimba pelo servidor ([MODULO-CARE-SPEC](MODULO-CARE-SPEC.md)) |
| **Módulo 16 — Ocorrências** (`@alsham/occurrences` + `0031_occ.sql`) | ✅ **CONSTRUÍDO na Missão Quadra** — **arquivo, ainda não aplicado** (runbook §17). ⭐⭐ **A outra física, de propósito:** o REGISTRO do fato consumado nasce imutável (o care edita o pedido vivo; aqui corrigir é TRATATIVA em linha eterna), o encerramento exige DESFECHO escrito e é terminal, e a gravidade é dado do tenant com posição ([MODULO-OCC-SPEC](MODULO-OCC-SPEC.md)) |
| **Módulo 17 — Manutenção** (`@alsham/maintenance` + `0032_mnt.sql`) | ✅ **CONSTRUÍDO na Missão Quadra** — **arquivo, ainda não aplicado** (runbook §17). ⭐ Corretiva/preventiva como CHECK argumentado (física do domínio); `done → in_progress` MANTIDO do ops com teste que assina a decisão; recorrência do tenant com a PRÓXIMA DEVIDA calculada (sem cron fingido); concluir exige o relato ([MODULO-MNT-SPEC](MODULO-MNT-SPEC.md)) |
| **Módulo 18 — Patrimônio** (`@alsham/assets` + `0033_pat.sql`) | ✅ **CONSTRUÍDO na Missão Penta** — **arquivo, ainda não aplicado** (runbook §18). ⭐ **A localização vigente NÃO é coluna:** o livro de transferências com o "de onde" do servidor; a baixa é terminal com razão — o DIVERGE consciente do crm ([MODULO-PAT-SPEC](MODULO-PAT-SPEC.md)) |
| **Módulo 19 — Checklists** (`@alsham/checklists` + `0034_chk.sql`) | ✅ **CONSTRUÍDO na Missão Penta** — **arquivo, ainda não aplicado** (runbook §18). ⭐ **Executar congela o modelo por CÓPIA, pelo gatilho;** a resposta é ato que não se rasura; concluir exige tudo respondido ([MODULO-CHK-SPEC](MODULO-CHK-SPEC.md)) |
| **Módulo 20 — Reserva de Espaços** (`@alsham/spaces` + `0035_spc.sql`) | ✅ **CONSTRUÍDO na Missão Penta** — **arquivo, ainda não aplicado** (runbook §18). ⭐ **A física mora na CONSTRAINT:** exclusion parcial (a cancelada libera sozinha); o passado é permitido — o DIVERGE consciente do cash ([MODULO-SPC-SPEC](MODULO-SPC-SPEC.md)) |
| **Módulo 21 — Visitas** (`@alsham/visits` + `0036_vis.sql`) | ✅ **CONSTRUÍDO na Missão Penta** — **arquivo, ainda não aplicado** (runbook §18). ⭐ **A quarta identidade:** a visita é o EVENTO DE PRESENÇA e não volta; carimbos do servidor; o documento não passeia pelo correio ([MODULO-VIS-SPEC](MODULO-VIS-SPEC.md)) |
| **Módulo 22 — Leads** (`@alsham/leads` + `0037_lead.sql`) | ✅ **CONSTRUÍDO na Missão Penta** — **arquivo, ainda não aplicado** (runbook §18). ⭐ **A quinta identidade:** o lead é a MANIFESTAÇÃO DE INTERESSE com origem própria; desfechos terminais; vínculos SOLTOS carimbados pela tela ([MODULO-LEAD-SPEC](MODULO-LEAD-SPEC.md)) |
| **Módulo 23 — Metas** (`@alsham/goals` + `0038_goal.sql`) | ✅ **CONSTRUÍDO na Missão Sexta** — **arquivo, ainda não aplicado** (runbook §19). ⭐ **O progresso é o último check-in do livro — view, nunca coluna;** a trave congela na ativação; fechar a época é decisão de gente com número na mesa ([MODULO-GOAL-SPEC](MODULO-GOAL-SPEC.md)) |
| **Módulo 24 — Comunicados** (`@alsham/comms` + `0039_comm.sql`) | ✅ **CONSTRUÍDO na Missão Sexta** — **arquivo, ainda não aplicado** (runbook §19). ⭐ **Publicar congela a palavra dada;** corrigir é comunicado novo com o título carimbado pelo servidor; a ciência é ato próprio, único e eterno ([MODULO-COMM-SPEC](MODULO-COMM-SPEC.md)) |
| **Módulo 25 — Calendário Editorial** (`@alsham/editorial` + `0040_edcal.sql`) | ✅ **CONSTRUÍDO na Missão Sexta** — **arquivo, ainda não aplicado** (runbook §19). ⭐ **A Lei das Etapas, 4ª aplicação** (sem a flag de aprovação — DIVERGE assinado do ops); reagendar é plano sem trilha; o fim congela com a data REAL ao lado da planejada ([MODULO-EDCAL-SPEC](MODULO-EDCAL-SPEC.md)) |
| **Módulo 26 — Biblioteca de Mídia** (`@alsham/media` + `0041_media.sql`) | ✅ **CONSTRUÍDO na Missão Sexta** — **arquivo, ainda não aplicado** (runbook §19). ⭐ **CATÁLOGO, não cofre** (o onde-vive em texto livre); o acervo volta do arquivo — o DIVERGE assinado do pat; o uso é livro imutável com vínculo solto ([MODULO-MEDIA-SPEC](MODULO-MEDIA-SPEC.md)) |
| **Módulo 27 — Pesquisas** (`@alsham/nps` + `0042_nps.sql`) | ✅ **CONSTRUÍDO na Missão Sexta** — **arquivo, ainda não aplicado** (runbook §19). ⭐ **A régua 0–10 é física do método (CHECK argumentado);** o placar é view calculada do livro; closed é terminal — o DIVERGE assinado do care; anon = NADA ([MODULO-NPS-SPEC](MODULO-NPS-SPEC.md)) |
| **Módulo 28 — Centros de Custo & Rateio** (`@alsham/cost-centers` + `0043_cc.sql`) | ✅ **CONSTRUÍDO na Missão Sete** — **arquivo, ainda não aplicado** (runbook §20). ⭐ **A regra fecha 100% ao ativar (física);** o centro é dado do tenant que volta do arquivo; executar é ato de gente (sem cron), com lançamentos imutáveis, um por centro, sem perder centavo — origem por id solto + nome carimbado. `consumes` vazio ([MODULO-CC-SPEC](MODULO-CC-SPEC.md)) |
| **Módulo 29 — Orçamentos** (`@alsham/budgets` + `0044_bud.sql`) | ✅ **CONSTRUÍDO na Missão Sete** — **arquivo, ainda não aplicado** (runbook §20). ⭐ **Ativar CONGELA a trave** (categoria, período, teto) — o MANTIDO assinado do goal no dinheiro; **o realizado é view calculada do livro do cash, nunca coluna.** ⭐⭐ `consumes` NÃO vazio (`cash.entry.registered`, com handler `realized.ts` — o quinto consumidor); **EXIGE redeploy do `apps/api`** no apply ([MODULO-BUD-SPEC](MODULO-BUD-SPEC.md)) |
| **Módulo 30 — Contas Bancárias** (`@alsham/bank-accounts` + `0045_bank.sql`) | ✅ **CONSTRUÍDO na Missão Sete** — **arquivo, ainda não aplicado** (runbook §20). ⭐ **SOL ÚNICO: a conciliação é do recon — não se refaz.** Cadastro de contas (voltam do arquivo) e livro por conta; **o saldo é view e PODE ser negativo (cheque especial) — o DIVERGE assinado do inv;** a transferência é atômica (duas pernas, um transfer_id). `consumes` vazio ([MODULO-BANK-SPEC](MODULO-BANK-SPEC.md)) |
| **Módulo 31 — Investimentos** (`@alsham/investments` + `0046_invest.sql`) | ✅ **CONSTRUÍDO na Missão Sete** — **arquivo, ainda não aplicado** (runbook §20). ⭐ **A posição é a soma dos atos (view), SEM cotação de mercado (Lei 3/7);** o rendimento é ato de gente. ⭐⭐ **Resgatar mais que a posição é RECUSADO — a TERCEIRA resposta, assinada** (ar permite overpay, inv permite negativo, invest recusa). `consumes` vazio ([MODULO-INVEST-SPEC](MODULO-INVEST-SPEC.md)) |
| **Módulo 32 — DRE Gerencial** (`@alsham/dre` + `0047_dre.sql`) | ✅ **CONSTRUÍDO na Missão Sete** — **arquivo, ainda não aplicado** (runbook §20). ⛔ **Gerencial, NÃO fiscal (Lei 3).** O plano de linhas é do tenant (natureza é o único enum, CHECK argumentado). ⭐⭐ **Os valores nascem dos livros: `consumes` cash.entry.registered E cc.rateio.executed — o SEXTO consumidor, o primeiro com DOIS produtores (handler `realized.ts`); EXIGE redeploy do `apps/api`.** ⭐ Linha sem lançamento não aparece (INNER JOIN, nps); totais são views ([MODULO-DRE-SPEC](MODULO-DRE-SPEC.md)) |
| **Módulo 33 — Cadastro de Colaboradores** (`@alsham/hr` + `0048_hr.sql`) | ✅ **CONSTRUÍDO na Missão Oito** — **arquivo, ainda não aplicado** (runbook §21). ⚠️ **Dado de pessoa física: nome é neutro; ZERO CPF/saúde/banco.** Cargo/departamento texto livre (nunca enum). ⭐ **`on_leave` volta; `terminated` é TERMINAL — o DIVERGE do crm** (quem retorna é admissão nova, vínculo solto ao anterior); desligar exige razão + `hr.employee.decide`. `consumes` vazio ([MODULO-HR-SPEC](MODULO-HR-SPEC.md)) |
| **Módulo 34 — Escalas** (`@alsham/shift-scheduling` + `0049_shift.sql`) | ✅ **CONSTRUÍDO na Missão Oito** — **arquivo, ainda não aplicado** (runbook §21). ⭐ **A física do `spc` reaproveitada para a PESSOA:** duas escalas não ocupam o mesmo colaborador no mesmo período (EXCLUSION parcial — a cancelada libera sozinha). ⭐ **Passado permitido — o DIVERGE do cash.** Vínculo com `hr` por id SOLTO + nome carimbado. `consumes` vazio ([MODULO-SHIFT-SPEC](MODULO-SHIFT-SPEC.md)) |
| **Módulo 35 — Treinamentos** (`@alsham/training` + `0050_train.sql`) | ✅ **CONSTRUÍDO na Missão Oito** — **arquivo, ainda não aplicado** (runbook §21). ⭐ **A identidade do `evt` aplicada ao treino:** turma publicada abre inscrição, lotação recusa clara, presença é ato imutável carimbado; turma concluída/cancelada terminal. Colaborador por id solto. Certificado (Storage) declarado FORA. `consumes` vazio ([MODULO-TRAIN-SPEC](MODULO-TRAIN-SPEC.md)) |
| **Módulo 36 — Avaliação de Desempenho** (`@alsham/performance` + `0051_perf.sql`) | ✅ **CONSTRUÍDO na Missão Oito** — **arquivo, ainda não aplicado** (runbook §21). ⭐ **NÃO é o goal: avaliador × avaliado — dois papéis** (o goal mede a própria ambição; perf é o julgamento de outra pessoa). Ciclo texto livre; a avaliação é ato IMUTÁVEL com o avaliador carimbado; o ciclo fechado é TERMINAL. OKRs estruturados FORA. `consumes` vazio ([MODULO-PERF-SPEC](MODULO-PERF-SPEC.md)) |
| **Módulo 37 — Políticas** (`@alsham/policies` + `0052_pol.sql`) | ✅ **CONSTRUÍDO na Missão Oito** — **arquivo, ainda não aplicado** (runbook §21). ⭐⭐ **O DIVERGE do `comm`: política tem VERSÃO — a ciência é por (política, versão)**, então uma versão nova exige ciência de novo (unique `version_id,user_id`). Publicar congela o corpo; versão arquivada terminal. A *Políticas* de GRC é o homônimo declarado. `consumes` vazio ([MODULO-POL-SPEC](MODULO-POL-SPEC.md)) |
| **Módulo 38 — Gestão de Lojistas** (`@alsham/mall` + `0053_mall.sql`) | ✅ **CONSTRUÍDO na Missão Nove** — **arquivo, ainda não aplicado** (runbook §22). ⭐ **O PRIMEIRO módulo VERTICAL do catálogo** (`vertical_key='shopping-centers'`). Segmento texto livre; a unidade física por id solto ao `spc` (não recria cadastro de espaço — Lei do Reaproveitamento). ⭐ **`active ↔ archived` — o DIVERGE do `hr`** (o lojista é relação comercial que volta). `consumes` vazio ([MODULO-MALL-SPEC](MODULO-MALL-SPEC.md)) |
| **Módulo 39 — Locação de Lojistas** (`@alsham/lease` + `0054_lease.sql`) | ✅ **CONSTRUÍDO na Missão Nove** — **arquivo, ainda não aplicado** (runbook §22). ⭐⭐ **CAMADA COMERCIAL sobre o `ctr` — não o reescreve** (vigência/reajuste/renovação são do `ctr`, por id solto). Registra o termo comercial sobre vendas (texto livre) e o relatório mensal de vendas (ato imutável). `consumes` vazio ([MODULO-LEASE-SPEC](MODULO-LEASE-SPEC.md)) |
| **Módulo 40 — Fundo de Promoção** (`@alsham/fund` + `0055_fund.sql`) | ✅ **CONSTRUÍDO na Missão Nove** — **arquivo, ainda não aplicado** (runbook §22). Livro próprio de contribuições e gastos (autossuficiente — não importa o `cc`). ⭐⭐ **O saldo NUNCA fica negativo — a TERCEIRA resposta ao "pode ficar negativo?"** (o `bank` permite cheque especial, o `inv` permite estoque negativo, o `fund` RECUSA: é dinheiro coletivo de terceiros). `consumes` vazio ([MODULO-FUND-SPEC](MODULO-FUND-SPEC.md)) |
| **Módulo 41 — Estacionamento** (`@alsham/park` + `0056_park.sql`) | ✅ **CONSTRUÍDO na Missão Nove** — **arquivo, ainda não aplicado** (runbook §22). ⭐ **A identidade do `vis`:** veículo NEUTRO (placa texto livre), entrada e saída carimbadas pelo SERVIDOR (nunca pela tela), correção é registro novo. Tarifa opcional em texto; sem cálculo de tarifa progressiva. `consumes` vazio ([MODULO-PARK-SPEC](MODULO-PARK-SPEC.md)) |
| **Módulo 42 — Segurança / Rondas** (`@alsham/sec` + `0057_sec.sql`) | ✅ **CONSTRUÍDO na Missão Nove — a ÚLTIMA peça (42/42)** — **arquivo, ainda não aplicado** (runbook §22). ⭐⭐ **NÃO reescreve o `occ`:** o incidente É uma Ocorrência (que já existe); este módulo é só a RONDA — postos do tenant e o livro de rondas (ato pontual imutável, carimbado pelo servidor). `consumes` vazio ([MODULO-SEC-SPEC](MODULO-SEC-SPEC.md)) |
| **Módulo 43 — Fornecedores** (`@alsham/vendor` + `0058_vendor.sql`) | ✅ **CONSTRUÍDO na Onda Dez (Fase 2 — completar o Domain Compras)** — **arquivo, ainda não aplicado** (runbook §23). Nome e segmento em texto livre; `active ↔ archived` — o fornecedor é relação comercial que volta (o DIVERGE do `hr`, assinado). `consumes` vazio ([MODULO-VENDOR-SPEC](MODULO-VENDOR-SPEC.md)) |
| **Módulo 44 — Cotações** (`@alsham/rfq` + `0059_rfq.sql`) | ✅ **CONSTRUÍDO na Onda Dez** — **arquivo, ainda não aplicado** (runbook §23). Reaproveita a identidade do `quote`: enviar congela o conteúdo. ⭐ **O DIVERGE assinado:** o destino é **PREMIADA (awarded)** — quem decide é o COMPRADOR, não o cliente. `consumes` vazio ([MODULO-RFQ-SPEC](MODULO-RFQ-SPEC.md)) |
| **Módulo 45 — Recebimento** (`@alsham/recv` + `0060_recv.sql`) | ✅ **CONSTRUÍDO na Onda Dez** — **arquivo, ainda não aplicado** (runbook §23). Ato pontual imutável (carimbado pelo servidor). ⭐ **Receber a maior é PERMITIDO — a física do overpay do `ar`, re-perguntada para a mercadoria** (contraste `recv × ar` assinado). `consumes` vazio ([MODULO-RECV-SPEC](MODULO-RECV-SPEC.md)) |
| **Módulo 46 — Avaliação de Fornecedores** (`@alsham/vperf` + `0061_vperf.sql`) | ✅ **CONSTRUÍDO na Onda Dez** — **arquivo, ainda não aplicado** (runbook §23). Reaproveita a identidade do `perf` (avaliador carimbado × avaliado). ⭐ **O DIVERGE assinado: SEM ciclo** — ato pontual imutável, a física do `sec.patrols`, não a do `perf.cycles`. Nota 0–100 obrigatória. `consumes` vazio ([MODULO-VPERF-SPEC](MODULO-VPERF-SPEC.md)) |
| **Módulo 47 — Estoque Mínimo** (`@alsham/reorder` + `0062_reorder.sql`) | ✅ **CONSTRUÍDO na Onda Dez** — **arquivo, ainda não aplicado** (runbook §23). ⭐⭐ **Guarda SÓ a configuração; NÃO lê o `inv` por dentro** (guarda de CI no mapa SCHEMA_DE). A comparação "estoque < mínimo" é da CAMADA DE APRESENTAÇÃO (`needsReorder()`), alimentada com o saldo de fora. `active ↔ archived`. `consumes` vazio ([MODULO-REORDER-SPEC](MODULO-REORDER-SPEC.md)) |
| **Módulo 48 — Planejamento de Demanda** (`@alsham/dem` + `0063_dem.sql`) | ✅ **CONSTRUÍDO na Onda Onze (Fase 2 — o Domain Supply Chain, SEPARADO de Compras)** — **arquivo, ainda não aplicado** (runbook §24). Plano por período (texto livre) + linhas; PUBLICAR congela as linhas. ⭐ **O DIVERGE do `rfq`: `published` é TERMINAL** — não há segundo ato (nada de premiar); o próximo período é plano novo (a física do `bud`). `consumes` vazio ([MODULO-DEM-SPEC](MODULO-DEM-SPEC.md)) |
| **Módulo 49 — S&OP (Rodadas de Consenso)** (`@alsham/sop` + `0064_sop.sql`) | ✅ **CONSTRUÍDO na Onda Onze** — **arquivo, ainda não aplicado** (runbook §24). ⭐ **A CAMADA DE GOVERNANÇA sobre o plano de demanda** — referencia um plano do `dem` por ID SOLTO + nome (nunca FK cruzada). APROVAR congela e é terminal; a permissão `sop.round.approve` é PRÓPRIA (aprovar o consenso é decisão de outro papel, mais sênior que quem desenha o plano). `consumes` vazio ([MODULO-SOP-SPEC](MODULO-SOP-SPEC.md)) |
| **Módulo 50 — Centros de Distribuição** (`@alsham/dc` + `0065_dc.sql`) | ✅ **CONSTRUÍDO na Onda Onze** — **arquivo, ainda não aplicado** (runbook §24). Nome + endereço em texto livre; `active ↔ archived` — o CD é ativo de operação que volta (o DIVERGE do `hr`, assinado). `consumes` vazio ([MODULO-DC-SPEC](MODULO-DC-SPEC.md)) |
| **Módulo 51 — Distribuição / Despacho** (`@alsham/disp` + `0066_disp.sql`) | ✅ **CONSTRUÍDO na Onda Onze** — **arquivo, ainda não aplicado** (runbook §24). ⭐ **O ESPELHO INVERTIDO do `recv`:** se o `recv` é o livro de CHEGADA, o `disp` é o de SAÍDA — mesma física de ATO PONTUAL IMUTÁVEL (duas camadas), sem ciclo de vida. Origem por ID SOLTO ao `dc` (NÃO lê o schema — guarda SCHEMA_DE). `consumes` vazio ([MODULO-DISP-SPEC](MODULO-DISP-SPEC.md)) |
| **Módulo 52 — Performance Logística** (`@alsham/logperf` + `0067_logperf.sql`) | ✅ **CONSTRUÍDO na Onda Onze** — **arquivo, ainda não aplicado** (runbook §24). Reaproveita a identidade do `vperf` (ato pontual imutável, nota 0–100). ⭐ **O DIVERGE: o avaliado é ROTA/TRANSPORTADORA/CD em TEXTO LIVRE** + id solto opcional ao `dc` (não um fornecedor). `consumes` vazio ([MODULO-LOGPERF-SPEC](MODULO-LOGPERF-SPEC.md)) |
| **Módulo 53 — Projetos** (`@alsham/proj` + `0068_proj.sql`) | ✅ **CONSTRUÍDO na Onda Doze parte 1/2 (Fase 2 — o Domain PMO & Projetos, o MAIOR do mapa)** — **arquivo, ainda não aplicado** (runbook §25). Ciclo `planning → active → completed/cancelled`, os dois fins **TERMINAIS** (a física do `bud`/`dem` — o projeto encerrado não reabre). ⭐ Cancelar exige razão; concluir tem nota opcional. `consumes` vazio ([MODULO-PROJ-SPEC](MODULO-PROJ-SPEC.md)) |
| **Módulo 54 — Cronogramas** (`@alsham/sched` + `0069_sched.sql`) | ✅ **CONSTRUÍDO na Onda Doze** — **arquivo, ainda não aplicado** (runbook §25). Marcos vinculados ao `proj` por id solto. ⭐ **O DIVERGE do `dem`/`bud`: reabrir (`done→planned`) É PERMITIDO** — corrigir um marco concluído por engano é rotina do projeto, não reabertura de período fechado. `consumes` vazio ([MODULO-SCHED-SPEC](MODULO-SCHED-SPEC.md)) |
| **Módulo 55 — Kanban (Quadro de Tarefas)** (`@alsham/kanban` + `0070_kanban.sql`) | ✅ **CONSTRUÍDO na Onda Doze** — **arquivo, ainda não aplicado** (runbook §25). ⭐⭐ **Reaproveita a física do `ops`** (estágios do tenant + card que se move), mas com ESCOPO diferente: aqui o card pertence a um PROJETO específico (`proj` por id solto, obrigatório). NÃO é "instalar o `ops` de novo" — a lição do `disp`/`recv`. `consumes` vazio ([MODULO-KANBAN-SPEC](MODULO-KANBAN-SPEC.md)) |
| **Módulo 56 — Recursos (Alocação)** (`@alsham/alloc` + `0071_alloc.sql`) | ✅ **CONSTRUÍDO na Onda Doze** — **arquivo, ainda não aplicado** (runbook §25). Alocação ao `proj` por id solto; o recurso em texto livre + id solto OPCIONAL ao `hr` (terceiro/freelancer não tem cadastro). Percentual (não horas — decisão assinada). `active ↔ archived` (a física do `vendor`/`dc`). `consumes` vazio ([MODULO-ALLOC-SPEC](MODULO-ALLOC-SPEC.md)) |
| **Módulo 57 — Custos do Projeto** (`@alsham/pcost` + `0072_pcost.sql`) | ✅ **CONSTRUÍDO na Onda Doze** — **arquivo, ainda não aplicado** (runbook §25). Livro IMUTÁVEL (duas camadas) de gastos do projeto (`proj` por id solto), valor + moeda, categoria texto livre opcional. ⭐ **O DIVERGE do `fund`: NÃO há teto de saldo** — é só o livro de gastos; o orçamento é o `bud` genérico por id solto (futuro). `consumes` vazio ([MODULO-PCOST-SPEC](MODULO-PCOST-SPEC.md)) |
| **Módulo 58 — Scrum / Sprints** (`@alsham/scrum` + `0073_scrum.sql`) | ✅ **CONSTRUÍDO na Onda Treze parte 2/2 (Fase 2 — FECHA o Domain PMO & Projetos)** — **arquivo, ainda não aplicado** (runbook §26). A MOLDURA TEMPORAL (time-box) do projeto: nome/objetivo texto livre, janela, vínculo ao `proj` por id solto. ⭐⭐ **UM sprint ativo por projeto — na CONSTRAINT** (índice único parcial, a lição do `spc`/`shift`). ⭐ `closed` TERMINAL. Os itens de trabalho são os cartões do `kanban` — NÃO reconstruídos (composição de tela). `consumes` vazio ([MODULO-SCRUM-SPEC](MODULO-SCRUM-SPEC.md)) |
| **Módulo 59 — Gantt / Dependências** (`@alsham/gantt` + `0074_gantt.sql`) | ✅ **CONSTRUÍDO na Onda Treze** — **arquivo, ainda não aplicado** (runbook §26). A ARESTA entre marcos (predecessor → sucessor), id solto ao `sched` (NÃO lê o schema — guarda SCHEMA_DE). ⭐ **Registro MUTÁVEL (o DIVERGE dos livros imutáveis):** a dependência é metadado do plano — some quando o plano muda. Sem cálculo de caminho crítico/datas (FORA). `consumes` vazio ([MODULO-GANTT-SPEC](MODULO-GANTT-SPEC.md)) |
| **Módulo 60 — Riscos** (`@alsham/risk` + `0075_risk.sql`) | ✅ **CONSTRUÍDO na Onda Treze** — **arquivo, ainda não aplicado** (runbook §26). Registro de riscos do projeto (`proj` por id solto), probabilidade e impacto **1–5 CHECK** (física do método, a lição do `nps`/`vperf`). ⭐⭐ **Física NOVA: `mitigated` REABRE (`mitigated→open`), mas `closed` é TERMINAL** — o risco que volta é o MESMO; o encerrado que recorre é registro novo. `consumes` vazio ([MODULO-RISK-SPEC](MODULO-RISK-SPEC.md)) |
| **Módulo 61 — Timesheet / Apontamento** (`@alsham/timesheet` + `0076_timesheet.sql`) | ✅ **CONSTRUÍDO na Onda Treze** — **arquivo, ainda não aplicado** (runbook §26). Livro IMUTÁVEL (duas camadas) de horas trabalhadas (`proj` por id solto; colaborador texto livre + id solto opcional ao `hr`), `hours > 0`. ⭐ **O contraste assinado: timesheet (REALIZADO — fato consumado) × `alloc` (PLANEJADO — percentual).** `consumes` vazio ([MODULO-TIMESHEET-SPEC](MODULO-TIMESHEET-SPEC.md)) |
| **Módulo 62 — Portfólio** (`@alsham/pfolio` + `0077_pfolio.sql`) | ✅ **CONSTRUÍDO na Onda Treze — a ÚLTIMA peça; PMO 10/10** — **arquivo, ainda não aplicado** (runbook §26). Portfólios (`active ↔ archived`, a física do `vendor`/`dc`) + membros N:N. ⭐ FK INTRA-schema `members → portfolios` (permitida) × id solto ao `proj` (cross-module). Um projeto pode estar em VÁRIOS portfólios. Sem rollup automático (Lei 7 — FORA). `consumes` vazio ([MODULO-PFOLIO-SPEC](MODULO-PFOLIO-SPEC.md)) |
| **Módulo 63 — Não Conformidades** (`@alsham/non-conformities` + `0078_nc.sql`) | ✅ **CONSTRUÍDO na Onda Quatorze (Fase 2 — ABRE o Domain Qualidade)** — **arquivo, ainda não aplicado** (runbook §27). O registro imutável do desvio constatado (a identidade do `occ`). ⭐⭐ **O DIVERGE do `occ`: fechar exige a NOTA DE VERIFICAÇÃO** — quem conferiu que a causa foi corrigida (o `occ` encerra com desfecho livre). `open → closed` terminal; recorrência é NC nova por id solto; vínculo ao `capa` por id solto. `consumes` vazio ([MODULO-NC-SPEC](MODULO-NC-SPEC.md)) |
| **Módulo 64 — Auditorias** (`@alsham/audits` + `0079_audit.sql`) | ✅ **CONSTRUÍDO na Onda Quatorze** — **arquivo, ainda não aplicado** (runbook §27). Auditorias de qualidade: ciclo `planned → completed/cancelled` terminal (a física do `proj`), cancelar exige razão; tipo/escopo texto livre. ⭐ O achado (`findings`) é imutável, com **FK composta INTRA-schema** à auditoria × **id solto** ao `nc` (dois vínculos de natureza diferente). NÃO é a Auditoria do Core/GRC (homônimos declarados). `consumes` vazio ([MODULO-AUDIT-SPEC](MODULO-AUDIT-SPEC.md)) |
| **Módulo 65 — CAPA** (`@alsham/capa` + `0080_capa.sql`) | ✅ **CONSTRUÍDO na Onda Quatorze** — **arquivo, ainda não aplicado** (runbook §27). Ações corretivas/preventivas: ⭐ o tipo `corrective`/`preventive` é **CHECK** (física do método, a lição do `mnt`/`nps`). ⭐ Ciclo `open → verified → closed` escolhido de propósito — **sem `verified`, não fecha**: a verificação (quem confirmou que a ação funcionou, carimbado pelo servidor) é o que a separa de um marco genérico. `closed` terminal; vínculo ao `nc` por id solto. `consumes` vazio ([MODULO-CAPA-SPEC](MODULO-CAPA-SPEC.md)) |
| **Módulo 66 — Requisitos ISO** (`@alsham/iso` + `0081_iso.sql`) | ✅ **CONSTRUÍDO na Onda Quatorze — FECHA a onda** — **arquivo, ainda não aplicado** (runbook §27). Requisitos de norma: cláusula texto livre (dado do tenant). ⭐⭐ **A conformidade (`compliant`/`non_compliant`/`not_applicable`) é MUTÁVEL — o DIVERGE assinado de todo módulo com ciclo terminal:** é avaliação que muda a cada auditoria, não uma máquina de estados. `active ↔ archived` reversível para cláusulas fora de escopo (outro conceito, distinto da conformidade). `consumes` vazio ([MODULO-ISO-SPEC](MODULO-ISO-SPEC.md)) |
| **Módulo 67 — Métricas Ambientais** (`@alsham/esg` + `0082_esg.sql`) | ✅ **CONSTRUÍDO na Onda Quinze (Fase 2 — ABRE o Domain ESG & Sustentabilidade)** — **arquivo, ainda não aplicado** (runbook §28). ⭐⭐ **UM módulo para as quatro capacidades de medição** (carbono/água/energia/resíduo) — na física são a mesma leitura periódica, distinguidas por `metric_type` (**CHECK** das quatro dimensões clássicas, física do método). O livro de leituras é ATO IMUTÁVEL (duas camadas — a física do `pcost`/`timesheet`). ⭐ **`quantity >= 0` — o DIVERGE assinado** (nem o `<> 0` do `pcost`, nem o `> 0` estrito do `timesheet`: zero é leitura real, negativo é infísico). *Indicadores ESG* é o `goal` e *Relatórios ESG* é o `pol` — ambos DECLARADOS FORA. `consumes` vazio ([MODULO-ESG-SPEC](MODULO-ESG-SPEC.md)) |
| **Módulo 68 — Ideias & Pipeline de Inovação** (`@alsham/idea` + `0083_idea.sql`) | ✅ **CONSTRUÍDO na Onda Dezesseis (Fase 2 — ABRE o Domain Pesquisa & Desenvolvimento)** — **arquivo, ainda não aplicado** (runbook §29). O funil: etapas do tenant (texto livre, ordenadas) + ideias que andam por UPDATE simples (a física do `kanban`). ⭐⭐ **O DIVERGE do `kanban`: a ideia NÃO tem `project_id`** — nasce antes de qualquer projeto; o único elo é o `promoted_project_id` (id solto) do DESTINO, na promoção. Ciclo: `active → promoted` (terminal) / `active ↔ archived` (reversível). Etapa é FK INTRA-schema. `consumes` vazio ([MODULO-IDEA-SPEC](MODULO-IDEA-SPEC.md)) |
| **Módulo 69 — Propriedade Intelectual** (`@alsham/ip` + `0084_ip.sql`) | ✅ **CONSTRUÍDO na Onda Dezesseis — FECHA a onda** — **arquivo, ainda não aplicado** (runbook §29). Ativos de PI: ⭐⭐ o `asset_type` é **CHECK** das quatro categorias clássicas (`patent`/`trademark`/`copyright`/`trade_secret` — física do direito, não vocabulário do tenant). ⭐ **Ciclo TERMINAL sem reabertura:** `filed → granted/rejected`, `granted → expired` — o indeferido/expirado que volta é depósito novo (a física do `proj`/`nc`, o DIVERGE do `iso` mutável). A identidade congela fora do depósito; a origem (idea/proj) por id solto. `consumes` vazio ([MODULO-IP-SPEC](MODULO-IP-SPEC.md)) |
| **Módulo 70 — Certificado Digital** (`@alsham/fiscalcert` + `0085_fiscalcert.sql`) | ✅ **CONSTRUÍDO na Onda Dezessete (Fase 2 — ABRE o Domain Contábil & Fiscal, o mais restrito por LEI)** — **arquivo, ainda não aplicado** (runbook §30). ⚠️⚠️ **7 das 8 capacidades ficam FORA (Lei 3):** NF-e/NFS-e/NFC-e/SPED/eSocial (emitidos/validados pelo Fisco — integração certificada), Apuração (motor de cálculo fiscal), Integração com contador (é o ponto de integração; o contato é o `crm`). Sobra *Certificado digital*, e só o **REGISTRO DE METADADOS**: ⛔⛔ nunca o arquivo `.pfx`, nunca a chave privada, nunca a assinatura (Lei 3 + segurança; guarda de CI). tipo/titular texto livre; `valid_until` obrigatória (o dado que justifica o módulo). `active ↔ archived` (a física do `vendor`), arquivar/reativar exige `certificate.decide`. `consumes` vazio ([MODULO-FISCALCERT-SPEC](MODULO-FISCALCERT-SPEC.md)) |
| **A composição** (`apps/api`) | ✅ **CONSTRUÍDA na Etapa 8** — o único lugar do repositório onde os módulos se conhecem. Importa todos; nenhum importa outro |
| Contabilidade de uso (`0003_billing.sql` + `@alsham/billing`) | ✅ construído e **APLICADO em produção** (informado pelo dono, ⚠️ NÃO VERIFICADO aqui). Sem preço (Lei 7) |
| **Despachante da caixa de saída** (`@alsham/workflow` + `apps/api`) | ✅ **NO AR desde 28/07/2026** — o dono ligou: `apps/api` publicado, `pg_cron` + `pg_net`, job de 1 em 1 minuto. ⚠️ **NÃO VERIFICADO** por este repositório |
| Visão de saúde da fila | ✅ **CONSTRUÍDA na Etapa 8** — `core.courier_status()` responde OK · ATRASADO · PARADO · ATENCAO |
| UI | ✅ construída — `apps/portal`: login, quatro telas do Módulo 1 e a carteira de campanhas do Módulo 2 |
| **Instalador de módulo em runtime** | ✅ **CONSTRUÍDO na Etapa 9** (`0006_install.sql`) — `core.install_module` / `core.uninstall_module` fecham os passos 3 e 4 deste documento. Exigem `core.module.install`, só aceitam módulo publicado e papel DO TENANT, respeitam `plan_limits` e emitem `core.module.*`. **Desinstalar não apaga dado** |
| **A Store** | ✅ **CONSTRUÍDA na Etapa 9** — `apps/portal/src/app/store/`, mostrando só o que a policy deixa ver |
| ⭐ **A FORJA — IA Base** (`@alsham/ai` + `0019_forge.sql` + `0020_ops_machine_draft.sql`) | ✅ **CONSTRUÍDA na Etapa 14** — **arquivo, ainda não aplicada** (runbook §13). É **capacidade do Core** (Taxonomia §3), não módulo: escreve em `core`, **não aparece na Store**, e qualquer módulo pede geração sem conhecê-la. ⚖️ O fornecedor é receita interna: o cliente vê o **motor ALSHAM**, e o tipo `EngineLabel` **não tem campo** para outro nome. ⛔ **Sem medição, sem geração** — o botão nem aparece. ⛔ **O prompt NUNCA vai ao envelope** |
| ⭐ **O PAINEL EXECUTIVO** (`0021_tenant_panel.sql` + `apps/portal/src/app/page.tsx`) | ✅ **CONSTRUÍDO na Etapa 15** — **arquivo, ainda não aplicado** (runbook §14). É **Core**, não módulo: não tem manifesto e não entra no catálogo. Cada número sai de um `count()` ou de `core.plan_limits`. ⛔ A saúde do correio vem de `core.tenant_courier_summary()` — **`core.courier_status()` continua fechada**, porque ela conta a fila de TODOS |
| Fechar o `EXECUTE` de `PUBLIC` (`0022_revoke_public_execute.sql`) | ✅ **CONSTRUÍDO na Etapa 15** — **arquivo, ainda não aplicado** (runbook §15). Função nasce ABERTA a `PUBLIC` no PostgreSQL; oito funções `security definer` eram chamáveis por `anon`. Nenhuma vazava dado (todas checam vínculo), mas a porta não devia estar no corredor |
| Geração ASSÍNCRONA (fila de jobs) | **NÃO CONSTRUÍDA**, e é decisão: a geração da Etapa 14 é **síncrona**. Se um dia for assíncrona, a fila é o **correio do Core** — nunca uma segunda |
| Política de repetição de geração que FALHOU | **NÃO CONSTRUÍDA** — repetir chamada paga sem política é pagar duas vezes por um erro. Declarado no `0019` |
| Validador de manifesto | **NÃO CONSTRUÍDO** — hoje o manifesto é conferido por tipo em build, nunca em runtime |
| Resolvedor de permissão em runtime | **NÃO CONSTRUÍDO** como código de aplicação — quem barra é `core.has_permission()` no banco, chamado pelas policies e pelo instalador |
| Instalação automática de CONSUMIDOR de evento | **NÃO CONSTRUÍDA** — instalar dá acesso e permissões; o handler é código, inscrito à mão na composição. Não há plugin dinâmico |
| SDK (`@alsham/sdk`) | **NÃO INICIADO** — `apps/portal` fala com o banco pelo adaptador dele |
| Alarme automático de fila parada | **NÃO CONSTRUÍDO** — a saúde é consulta, não notificação |

### ⛔ O apply de produção já aconteceu

O dono informou em 27/07/2026 ter aplicado `0001_core.sql`, `0002_recon.sql` e o seed num projeto Supabase de produção, com um tenant piloto. **Este repositório NÃO VERIFICOU esse apply** — nenhum agente daqui conecta a banco remoto com dado de cliente.

Verificado ou não, a regra que ele cria vale desde já: **`0001` e `0002` não se editam mais.** Arquivo aplicado é história; corrigir no lugar faz o próximo ambiente nascer diferente da produção sem ninguém perceber. Correção é migration nova — a próxima é `0004_*.sql`.

Nenhum segredo existe no repositório.

---

## 6. O PLANO QUE A ETAPA 1 DEIXOU ESCRITO — *lista, não obra*

> **Registro histórico, não estado.** Esta seção é a lista que a Etapa 1 fez do que viria a seguir; parte dela foi construída depois (a conciliação, o reentregador, o `usage_ledger`), parte não (o motor de pagamento, o preço). **O estado corrente é o [§5](#5-estado-da-obra--o-que-existe-e-o-que-não-existe), sempre** — nada aqui deve ser lido como promessa em aberto.

### 6.1 Billing minerado da Casa

Trazer para `packages/billing` o padrão registrado como **PROVADO ponta a ponta** no Balanço de Tecnologia §1:

- motor de pagamento multi-secret com cofre de segredos em cascata;
- webhook idempotente por `event.id` — reaproveitando `core.processed_events` já desenhado nesta etapa;
- reentregador com backoff — reaproveitando `core.event_outbox`;
- `usage_ledger` + medição de consumo por tenant, minerado do kraken-v2 (**PROVADO**, com economia unitária calculada);
- ligação de `plan_limits` ao que o tenant pode instalar e consumir.

**Fronteira a respeitar:** o catálogo (`module_registry`) descreve o que o módulo **é**; o preço é de billing. Manter separado é o que permite preço diferente por plano sem reescrever o catálogo.

### 6.2 Módulo Conciliação & Aprovações

O primeiro módulo de produto sobre o Core — e o teste real do contrato: se ele nascer sem importar nenhum outro módulo, o Lego funciona.

- **Taxonomia:** Domain `finance` (Financeiro, §5) — capacidades *Conciliação bancária* e *Aprovações financeiras*.
- **Fase:** Fase 3 do Roadmap, que traz o **Smart Reconciliation™** como módulo premium.
- **Estado da peça no Balanço:** ⚠️ **NÃO TEMOS.** O Balanço de Tecnologia §2 é explícito — a base de pagamento existe e está provada, mas *conciliação, DRE e tesouraria* são obra genuinamente nova. Esta é a primeira peça do Business OS que não é montagem.
- **Teste anti-viés a aplicar em cada requisito:** *"outra empresa do mesmo setor usaria isso exatamente como está?"* Regra de conciliação específica de um cliente vira `tenant_modules.settings`, nunca código no módulo.
- **Lei 3 (construir × INTEGRAR):** conciliação **constrói**; o lado fiscal (NF/SPED/SAT) **integra**, salvo decisão de dono explícita.

### 6.3 O que a Etapa 2 ainda não decide

Fica registrado para não virar decisão por omissão:

- ~~aplicar `0001_core.sql` num projeto Supabase — **ato do dono**~~ → **feito pelo dono em 27/07/2026** (§5). A migration passa a ser história e não se edita;
- a emenda de stack na Carta Magna do `alsham-events-os`, que ainda descreve a Linha B (MySQL/Drizzle) — **pendente, e naquele repositório**;
- as pendências de sonda que os próprios Balanços abriram: onde vivem os prompts do Cognitive Mirror, a faxina do `system_health_log`, o banco real do kraken-v2.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
