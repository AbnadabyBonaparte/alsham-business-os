# 📜 MÓDULO 37 — POLÍTICAS

## ALSHAM Business OS™ · Especificação do módulo · Domain `hr`

> **Missão Oito (Onda 5 — o Bloco de Pessoas).** `module_id` = `pol`.
> Migration `0052_pol.sql` · pacote `@alsham/policies` · teste
> `42_pol_isolation.sql`.
> **ARQUIVO — apply é ato do dono (runbook §21).**

---

## 0. AS DECISÕES DE CANON

- ⭐⭐ **O DIVERGE do `comm` — a razão de existir deste módulo, não uma
  cópia.** No `comm`, publicar congela; a ciência é ÚNICA e ETERNA por
  DOCUMENTO (`unique (notice_id, user_id)`). Aqui `pol` DIVERGE: a política
  tem VERSÃO — a ciência é por (política, VERSÃO)
  (`unique (version_id, user_id)`). Publicar uma versão nova exige que quem
  deu ciência da anterior dê ciência **DE NOVO**. É isto que torna o `pol`
  diferente do `comm`, não uma cópia com nome trocado.
- ⚠️ **O HOMÔNIMO, declarado.** A *Políticas* de GRC (compliance
  corporativo — antifraude, risco, matriz de conformidade) é o homônimo
  declarado; aqui é a política **interna de pessoal** que o membro dá
  ciência (código de conduta, home office, uso de equipamento). Sol Único:
  o recorte fica escrito, como o `comm` fez com o vertical Condomínios.
- ⭐ **O que se MANTÉM do `comm` — a física é a mesma.** Publicar CONGELA
  o corpo (aqui, o corpo da VERSÃO); a ciência é ato PRÓPRIO (o gatilho
  força `auth.uid()`), carimbada pelo servidor, e IMUTÁVEL em 3 camadas
  (sem policy de UPDATE, sem GRANT de delete, trigger que recusa até para
  o dono do banco); `archived` é TERMINAL — a política volta com **versão
  nova**, nunca reabrindo a antiga.
- ⭐ **A numeração de versão é CALCULADA pelo servidor.** `guard_version_insert`
  ignora qualquer `version_no` enviado pela tela e computa
  `coalesce(max(version_no), 0) + 1` por política. O tenant não escolhe o
  próprio número — a mesma física do `chk` (a prancheta que só o gatilho
  escreve).
- ⭐ **Publicar exige corpo** ("política sem corpo não vale") e a
  permissão `pol.policy.manage`. O rascunho pode nascer vazio — é plano,
  não promessa.

---

## 1. AS PEÇAS

- **`pol.policies`** — o cadastro da política: `name`, `status`
  (`active`/`archived`). O corpo mora na VERSÃO, não aqui.
- **`pol.versions`** — a versão: `policy_id` (id solto dentro do próprio
  schema, com FK — `pol` não referencia schema alheio), `version_no`
  (calculado), `body`, `status` (`draft`/`published`/`archived`), o ato de
  publicar (`published_at`/`by`). RLS `enable`+`force`; sem DELETE.
- **`pol.acknowledgements`** — ⭐⭐ a ciência: `version_id` + `user_id`,
  `unique (version_id, user_id)` — **por versão**, o coração do DIVERGE.
  FK para `core.memberships` (a ciência prende o membro à história).
  IMUTÁVEL em 3 camadas.

---

## 2. OS FATOS

`pol.version.drafted` · `pol.version.published` (o corpo congela; quem deu
ciência da anterior precisa dar de novo) · `pol.version.archived`
(terminal) · `pol.version.acknowledged`. O envelope leva o nome da política
e o número da versão — **o corpo NÃO passeia no correio** (payload leve;
quem quiser o texto lê no módulo, sob RLS).

---

## 3. AS TELAS

Território de outra frente (a pele). O motor (`@alsham/policies`) já
entrega a régua: `validateNewPolicy`, `validateNewVersion`, `nextVersionNo`,
`canTransitionVersion`, `whyCannotPublish`, `whyCannotAck`, `currentVersion`,
`orderVersions`, `summarizePolicies`.

---

## 4. AS PERMISSÕES

- `pol.policy.manage` — redigir políticas, publicar versões (congela o
  corpo) e arquivar versões.
- `pol.policy.ack` — dar a PRÓPRIA ciência de uma versão publicada.

Quem impede de verdade é a RLS; o menu é cortesia.

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- **Distribuição/e-mail** — o envio ao destinatário (e-mail, WhatsApp,
  push) é integração declarada (Lei 3); o módulo registra o ATO de
  publicar e dar ciência, não o transporte.
- **Assinatura eletrônica com validade jurídica** — matéria jurídica à
  parte; não se constrói por atalho.
- **Anexos** — Storage do Core, não construído (Taxonomia §3).
- **Aprovação em fluxo antes de publicar** — o `ops` resolve esteira; este
  módulo não redesenha aprovação. Publicar é ato direto de quem tem
  `pol.policy.manage`.
- **`consumes` VAZIO** — nenhum handler de Políticas existe nesta onda
  (Lei 7). Integrações futuras são declaradas, sem handler e sem promessa.

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

✅ **CONSTRUÍDO na Missão Oito** — **arquivo, ainda não aplicado**
(runbook §21). A migration `0052_pol.sql`, o pacote `@alsham/policies`
(manifesto, tipos, motor e testes) e o teste SQL `42_pol_isolation.sql`
existem no disco. `consumes` vazio. **Não aplicado em produção** — aplicar
é ato do dono.

---

## 7. APPLY (dono)

Ver `docs/runbook/APLICAR.md §21`. Expor o schema `pol` na Data API. Sem
consumidor → **sem redeploy do `apps/api`**.
