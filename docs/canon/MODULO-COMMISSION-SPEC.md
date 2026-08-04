# 💇 MÓDULO 99 — COMISSÕES

## ALSHAM Business OS™ · Especificação do módulo · Vertical `beauty`

> **Vertical 💇 Beleza & Estética.** `module_id` = `commission`. Cartão VERTICAL
> do catálogo (`vertical_key='beauty'`, VerticalKey do `@alsham/core`).
> Migration `0114_commission.sql` · pacote `@alsham/commission` · teste
> `104_commission_isolation.sql`. **ARQUIVO — apply é ato do dono. NÃO MERGEIE —
> o merge é do dono.**

---

## 0. AS DECISÕES DE CANON

- ⭐⭐ **A física é a do LANÇAMENTO IMUTÁVEL (o `timesheet`/`pcost`/`loyalty`).**
  Cada comissão é um FATO CONSUMADO: um profissional ganhou tanto por um serviço
  prestado, num dia, e o registro nasce pronto — para sempre. NÃO TEM coluna de
  status, não tem ciclo de vida, não tem transição. Não existe "comissão em
  aberto". Corrigir é lançar OUTRA comissão (o ato inverso, com nota), nunca
  reescrever. Consequência: `commission.commissions` **NÃO TEM
  `allowed_transition`** e **NÃO TEM `updated_at`**. O cliente não tem porta de
  UPDATE nem DELETE (nem policy, nem grant); e mesmo assim o gatilho recusa a
  reescrita até para o dono do banco (errcode 42501) — as DUAS camadas do
  `timesheet`/`fisc`.
- ⚠️ **NÃO É MOTOR DE CÁLCULO (Lei 7) — a decisão central.** A tentação de
  "salão" é multiplicar o preço do serviço por um percentual e gravar a comissão
  automaticamente. **Isso não acontece aqui.** O valor da comissão
  (`commission_amount_cents`) é REGISTRADO por quem lança — nunca derivado por
  regra. O `base_amount_cents` (o preço do serviço sobre o qual a comissão foi
  combinada) é apenas INFORMATIVO: registra sobre quanto se combinou, mas NÃO
  existe nenhuma função, trigger ou coluna gerada que multiplique. A régua de %
  por serviço/profissional é configuração do tenant (capacidade futura); a
  apuração e o pagamento são o `cash`/`ap` genérico. Um número que não foi
  construído não vai ao ar.
- ⭐ **`commission_amount_cents >= 0` — CHECK argumentado.** Zero é permitido (um
  serviço de cortesia sem comissão é um fato real e honesto); negativo não é
  comissão — corrigir a mais é lançar o ato inverso, nunca um número negativo na
  linha.
- ⭐ **O profissional é ID SOLTO + nome carimbado.** O cadastro do profissional é
  do módulo `professional` (por id solto, sem FK cruzada); aqui carimba-se
  `professional_name` pela tela, que sobrevive ao redesenho do cadastro. O
  serviço é TEXTO LIVRE (corte/coloração/manicure é vocabulário de cada casa,
  NUNCA enum — a mesma Lei 3 do segmento do mall).
- ⛔ **`consumes` VAZIO.** Projetar a comissão a partir de uma venda/serviço de
  outro módulo, ou gerar título a pagar, é integração futura (Lei 7): sem
  handler, sem promessa. Sem redeploy do `apps/api`.

---

## 1. AS PEÇAS

- **`commission.commissions`** — o livro de comissões: `professional_id` (id
  solto ao `professional`, **obrigatório**) + `professional_name` (texto livre,
  obrigatório), `service` (texto livre, obrigatório), `base_amount_cents`
  (bigint, opcional — INFORMATIVO), `commission_amount_cents` (bigint, `>= 0`,
  REGISTRADO), `occurred_on` (date), `note` (texto livre, opcional), `created_at`
  / `created_by` carimbados pelo servidor. RLS `enable`+`force`; só SELECT +
  INSERT; IMUTÁVEL (gatilho recusa UPDATE/DELETE); sem coluna de status.

---

## 2. OS FATOS

`commission.commission.registered`. O envelope leva o profissional pelo NOME
carimbado (id solto), o serviço e os valores — quem escuta não faz join com o
schema `professional`. Não há outro fato: sem ciclo de vida, não há
arquivar/reabrir; a comissão só nasce.

---

## 3. AS TELAS

Território de outra frente. O motor (`@alsham/commission`) entrega a régua:
`validateNewCommission`, `orderCommissions`, `totalCents`, `groupByProfessional`,
`summarize`. ⚠️ Nenhuma função de cálculo de comissão por percentual — a régua
soma o que já está no livro, nunca deriva.

---

## 4. AS PERMISSÕES

- `commission.commission.record` — registrar uma comissão (o profissional, o
  serviço, o valor e o dia). Lançamento imutável.

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- **Cálculo da comissão por percentual** — o valor é registrado por quem lança
  (Lei 7). Nenhuma multiplicação `base × %`; o `base_amount_cents` é só
  informativo.
- **Régua de % por serviço/profissional** — configuração do tenant, capacidade
  futura.
- **Apuração / fechamento de período de comissão e pagamento** — é o `cash`/`ap`
  genérico, por id solto.
- **Cadastro do profissional** — é o módulo `professional`, por id solto.
- **Projetar comissão a partir de venda/serviço de outro módulo, ou gerar título
  a pagar** — integração futura, `consumes` **VAZIO** (Lei 7).

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

✅ **CONSTRUÍDO** — **arquivo, ainda não aplicado**. A migration
`0114_commission.sql`, o pacote `@alsham/commission` e o teste
`104_commission_isolation.sql` existem no disco. `consumes` vazio. **Não
aplicado em produção** — aplicar é ato do dono.

⚠️ O **cartão no seed** (`0001_platform.sql`) e a ligação no CI são wiring do
parent; até lá, os testes de seed do pacote ficam em modo de espera (⏭), sem
reprovar.

---

## 7. APPLY (dono)

Expor o schema `commission` na Data API. `consumes` vazio → **sem redeploy do
`apps/api`**. Vínculo com o profissional por ID SOLTO — o mapa SCHEMA_DE do CI
reprova a leitura de schema alheio; não há FK cruzada.
