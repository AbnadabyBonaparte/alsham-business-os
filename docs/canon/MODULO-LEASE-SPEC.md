# 🛍 MÓDULO 39 — LOCAÇÃO DE LOJISTAS

## ALSHAM Business OS™ · Especificação do módulo · Vertical `shopping-centers`

> **Missão Nove (Onda 6 — a ÚLTIMA).** `module_id` = `lease`. Segundo módulo
> VERTICAL do catálogo. Migration `0054_lease.sql` · pacote `@alsham/lease`
> · teste `44_lease_isolation.sql`. **ARQUIVO — apply é ato do dono
> (runbook §22).**

---

## 0. AS DECISÕES DE CANON

- ⭐⭐ **NÃO reescreve o ctr — a Lei do Reaproveitamento no seu teste mais
  difícil.** Vigência, reajuste, renovação e rescisão JÁ SÃO o `ctr`
  (Módulo 13): um contrato de locação é, na física do canon, um
  `ctr.contracts` como qualquer outro. Este módulo referencia o contrato por
  **ID SOLTO** (`contract_id`, sem FK) + nome carimbado (`contract_ref`).
  Nenhuma tabela de vigência/reajuste/renovação nasce em `lease`.
- ⭐ **O lojista também é de outro módulo.** O cadastro já é o `mall.stores`
  (Módulo 38) — referenciado por **ID SOLTO** (`store_id`, sem FK) + nome
  carimbado (`store_name`). O `lease` não recria cadastro de lojista.
- ⭐ **O que É do ofício do shopping — e só isso mora aqui:** o **termo
  comercial sobre vendas** (`revenue_share`, TEXTO LIVRE — o sistema NUNCA
  calcula percentual/regra, a mesma Lei 3 do índice de reajuste do ctr) e o
  **relatório mensal de vendas** do lojista — ato imutável, registrado por
  gente (sem POS integrado).
- ⭐ **O ciclo de vida mais simples do catálogo, de propósito.**
  `active → ended` é a ÚNICA transição. A locação é a CAMADA FINA entre o
  ctr (que já tem reajuste/renovação) e o mall (que já tem
  `active ↔ archived`) — uma camada fina não inventa física própria.
- ⭐ **Uma única permissão cobre registrar E encerrar.** `lease.agreement.manage`
  substitui o par manage/decide do mall e do ctr — não há meio-termo a
  proteger separadamente. `lease.report.manage` é a permissão do relatório
  de vendas, à parte.
- ⭐ **`ended` é TERMINAL e FROZEN.** Depois de encerrada, a linha inteira
  para de mudar — nem a anotação comercial se edita. Encerrar de novo é
  acordo novo, e isso é decisão do `ctr` sobre o contrato de baixo, fora
  deste módulo.
- ⭐ **O relatório de vendas é IMUTÁVEL** (três camadas: sem policy de
  UPDATE, sem GRANT de UPDATE/DELETE, e um trigger que recusa até para o
  dono do banco) — fato consumado não se edita: corrigir é registrar outro.

---

## 1. AS PEÇAS

- **`lease.agreements`** — a locação comercial: `contract_id` (id solto ao
  ctr) + `contract_ref`, `store_id` (id solto ao mall) + `store_name`,
  `revenue_share` (texto livre), `status` (`active`/`ended`), `end_reason`,
  `ended_at`/`ended_by` carimbados pelo servidor. RLS `enable`+`force`; sem
  DELETE.
- **`lease.sales_reports`** — o relatório mensal de vendas: `agreement_id`
  (FK real dentro do próprio schema, por `(id, tenant_id)`), `competency`
  (data), `reported_amount_cents`, `currency` opcional, `note`. IMUTÁVEL —
  `reported_at`/`reported_by` carimbados pelo servidor no INSERT.

---

## 2. OS FATOS

`lease.agreement.registered` · `lease.agreement.ended` ·
`lease.report.recorded`. O envelope leva o contrato e a loja pelo NOME
carimbado — quem escuta não faz join nem com o ctr nem com o mall.

Não existe `lease.agreement.updated`: editar campos simples de uma locação
ativa (antes de encerrar) não emite fato — só o registro e o encerramento
são eventos de negócio nesta onda.

---

## 3. AS TELAS

Território de outra frente. O motor (`@alsham/lease`) entrega a régua:
`validateNewAgreement`, `validateNewReport`, `canEnd`, `whyCannotEnd`,
`orderAgreements`, `summarize`.

---

## 4. AS PERMISSÕES

- `lease.agreement.manage` — registrar a locação (contrato e lojista por id
  solto, termo sobre vendas) **e** encerrá-la.
- `lease.report.manage` — registrar o relatório mensal de vendas — ato
  imutável.

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- **Cruzar com `ctr.contract.*`** (ex.: encerrar a locação automaticamente
  quando o contrato subjacente termina/rescinde) — integração futura,
  `consumes` **VAZIO** nesta onda (Lei 7).
- **Cálculo automático de comissão** sobre o relatório de vendas — o
  sistema REGISTRA o percentual (texto livre) e o valor vendido; não
  multiplica, não gera título a pagar/receber.
- **Integração de POS** — o relatório de vendas é digitado por gente; ler
  direto da máquina de cartão/PDV é integração futura.
- **Vigência, reajuste, renovação, rescisão** — são inteiramente do `ctr`,
  por id solto. Este módulo não os reimplementa.
- **Cadastro de lojista ou unidade física** — são do `mall`/`spc`, por id
  solto. Este módulo não os reimplementa.

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

✅ **CONSTRUÍDO na Missão Nove** — **arquivo, ainda não aplicado**
(runbook §22). A migration `0054_lease.sql`, o pacote `@alsham/lease` e o
teste `44_lease_isolation.sql` existem no disco. `consumes` vazio. **Não
aplicado em produção** — aplicar é ato do dono.

---

## 7. APPLY (dono)

Ver `docs/runbook/APLICAR.md §22`. Expor o schema `lease` na Data API. Sem
consumidor → **sem redeploy do `apps/api`**.
