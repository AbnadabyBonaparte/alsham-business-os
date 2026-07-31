# MÓDULO 80 — Continuidade de Negócios (`continuity`)

> Domain 🔐 **Segurança da Informação** (`infosec`) · Onda Dezenove (Fase 3) · migration `0095_continuity.sql` · pacote `@alsham/continuity`
> **FECHA** a Onda Dezenove — a última peça da Fase 3.
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 1. O QUE É

O **plano de continuidade de negócios** (BCP/DRP) da empresa: o **nome**, o
**escopo**, e os alvos **RTO** e **RPO** (o tempo e o ponto de recuperação
aceitáveis), mais o **livro de drills** — o registro de cada teste do plano, com
cenário e desfecho. Não é o texto do plano; é a **moldura** do plano e a **prova
de que ele foi exercitado**.

---

## 2. ⭐ O RECORTE — e por que NÃO é só o `pol`

Um plano de continuidade tem duas partes:

- O **DOCUMENTO detalhado** — o texto do plano, com procedimentos passo a passo.
  Isso é o `pol` (Política): documento versionado com ciência. Um BCP escrito
  pode viver lá; declarado, não duplicado (ver `ONDA-DEZENOVE-DECISOES.md`).
- A **PRÁTICA** — os alvos (RTO/RPO) e os **testes/drills periódicos** que provam
  que o plano **FUNCIONA**.

⭐ **O que JUSTIFICA um módulo próprio é a PRÁTICA.** Um plano de continuidade que
nunca foi testado é papel: o valor está no registro dos **drills**, e é isso que
nem o `pol` nem nenhum módulo existente guarda. Sem os drills, este módulo seria
uma cópia empobrecida do `pol` — e por isso ele **não** guarda o procedimento
detalhado, só a moldura e a prática.

---

## 3. ⭐ AS DUAS FÍSICAS — o plano que volta, o drill que não se rasura

- ⭐ **O PLANO é cadastro:** `active ↔ archived` — o plano descontinuado é
  arquivado e volta se a empresa o retomar (a física do `vendor`).
  Arquivar/reativar exige `continuity.plan.decide`.
- ⭐ **O DRILL é LIVRO IMUTÁVEL** (a física do `timesheet`/`control.tests`): cada
  teste é um **FATO CONSUMADO** — data, cenário, desfecho, nota. A evidência de
  que o plano foi exercitado não se rasura; corrigir é registrar **outro** drill.
  O cliente não tem porta de UPDATE/DELETE; o gatilho recusa reescrita até para o
  dono do banco.

⭐ **RTO/RPO em TEXTO LIVRE, não número:** "4 horas", "1 dia útil", "última
transação confirmada" — a forma como cada casa expressa o alvo é vocabulário
dela; congelar num inteiro de minutos faria o produto brigar com quem mede em
"meio período".

⛔ FORA: o procedimento detalhado do plano (é o `pol`); failover automático /
orquestração de DR (operação da plataforma/infra); árvore de chamadas
estruturada (Engine de Notificações).

---

## 4. AS PEÇAS · OS FATOS · AS PERMISSÕES

- `continuity.plans` — o cadastro (RTO/RPO texto livre, `active ↔ archived`).
- `continuity.drills` — o livro imutável de testes.
- Permissões: `continuity.plan.manage` · `continuity.plan.decide`.
- Fatos: `continuity.plan.registered` · `.archived` · `.reopened` ·
  `continuity.drill.recorded`. **`consumes` VAZIO** (Lei 7).

---

## 5. ESTADO DA OBRA

✅ **CONSTRUÍDO na Onda Dezenove (Fase 3 — FECHA a onda e o Domain Segurança da
Informação).** **Arquivo, ainda não aplicado** — aplicar é ato do dono (runbook
§32).

- `supabase/migrations/0095_continuity.sql` — `continuity.plans` (cadastro,
  RTO/RPO texto livre, `active ↔ archived`, `decide` própria) +
  `continuity.drills` (livro imutável, cenário/desfecho, gatilho anti-reescrita),
  RLS.
- `packages/continuity` — manifesto, tipos, motor (`ALLOWED_TRANSITIONS`,
  ordenação do livro) e testes.
- Seed: cartão 80 (`domain_key='infosec'`). Catálogo **79 → 80**.

⭐ **Ao aplicar (runbook §32):** expor o schema `continuity` na Data API; **sem
redeploy** (`consumes` vazio). Com esta migration, a próxima numeração livre é
**`0096`**.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
