# 🛍 MÓDULO 38 — GESTÃO DE LOJISTAS

## ALSHAM Business OS™ · Especificação do módulo · Vertical `shopping-centers`

> **Missão Nove (Onda 6 — a ÚLTIMA).** `module_id` = `mall`. **O PRIMEIRO
> módulo VERTICAL do catálogo.** Migration `0053_mall.sql` · pacote
> `@alsham/mall` · teste `43_mall_isolation.sql`. **ARQUIVO — apply é ato do
> dono (runbook §22).**

---

## 0. AS DECISÕES DE CANON

- ⭐ **É VERTICAL, não Domain.** `taxonomy.layer = 'vertical'`,
  `vertical = 'shopping-centers'` (a `VerticalKey` do `@alsham/core`). A
  Store o exibe na galeria "Verticais por Setor" e gradua a pill de Shopping
  Centers (`store-taxonomy.ts`).
- ⚠️ **A Lei do Reaproveitamento (Taxonomia §9).** A unidade física que a
  loja ocupa já é um `spc.space` — o `mall` **não recria cadastro de
  espaço**: referencia por **id solto** (`space_id`, sem FK) + nome
  carimbado pela tela.
- ⭐ **`active ↔ archived` — o DIVERGE do `hr`.** No `hr` `terminated` é
  terminal (o ex-colaborador que volta assina contrato novo). Aqui o lojista
  é uma **relação comercial**, mais perto do `crm`/`spc`: a marca que fecha
  e reabre é a MESMA relação — `archived → active` existe. Contraste assinado
  em teste.
- ⭐ **Segmento é DADO DO TENANT** (texto livre), nunca enum — o vocabulário
  é de cada praça (anti-viés reforçado: zero nome/organograma de cliente).

---

## 1. AS PEÇAS

- **`mall.stores`** — os lojistas (o nome evita colidir com `core.tenants`
  na leitura de código): `store_name`, `segment`, a unidade física
  (`space_id` solto + `space_name`), `status` (`active`/`archived`). RLS
  `enable`+`force`; sem DELETE.

---

## 2. OS FATOS

`mall.store.registered` · `mall.store.updated` · `mall.store.archived` ·
`mall.store.reopened`. O envelope leva a unidade pelo NOME carimbado — quem
escuta não faz join.

---

## 3. AS TELAS

Território de outra frente. O motor (`@alsham/mall`) entrega a régua:
`validateNewStore`, `canTransition`, `orderStores`, `summarizeStores`.

---

## 4. AS PERMISSÕES

- `mall.store.manage` — cadastrar e editar.
- `mall.store.decide` — arquivar/reabrir (tira/põe no mapa do mall).

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- **Catálogo de produtos do lojista** e **comissão sobre vendas** —
  capacidade futura; a comissão sobre faturamento é do `lease` (Módulo 39).
- **Cadastro de espaço/planta do shopping** — é do `spc`, reaproveitado por
  id solto. O `mall` não o recria.
- **`consumes` VAZIO** — nenhum handler de shopping nesta onda (Lei 7).

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

✅ **CONSTRUÍDO na Missão Nove** — **arquivo, ainda não aplicado**
(runbook §22). A migration `0053_mall.sql`, o pacote `@alsham/mall` e o teste
`43_mall_isolation.sql` existem no disco. Primeiro cartão vertical do
catálogo. `consumes` vazio. **Não aplicado em produção** — aplicar é ato do
dono.

---

## 7. APPLY (dono)

Ver `docs/runbook/APLICAR.md §22`. Expor o schema `mall` na Data API. Sem
consumidor → **sem redeploy do `apps/api`**.
