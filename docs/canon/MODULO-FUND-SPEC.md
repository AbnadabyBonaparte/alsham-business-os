# 🛍 MÓDULO 40 — FUNDO DE PROMOÇÃO

## ALSHAM Business OS™ · Especificação do módulo · Vertical `shopping-centers`

> **Missão Nove (Onda 6 — a ÚLTIMA).** `module_id` = `fund`. **O TERCEIRO
> módulo VERTICAL do catálogo**, depois do `mall` (Módulo 38) e do `lease`
> (Módulo 39). Migration `0055_fund.sql` · pacote `@alsham/fund` · teste
> `45_fund_isolation.sql`. **ARQUIVO — apply é ato do dono (runbook §22).**

---

## 0. AS DECISÕES DE CANON

### 0.1 ⭐ AUTOSSUFICIENTE — não importa o `cc` (física duplicada de propósito)

O `cc` (Módulo 28, Centros de Custo & Rateio) já sabe **dividir** um valor
entre centros por regra. Este módulo **não** importa `@alsham/cost-centers`,
**não** lê o schema `cc` e **não** chama `cc.execute_rateio()`: o Fundo de
Promoção não reparte custo entre centros — é um **livro próprio de duas
mãos** (contribuições que ENTRAM dos lojistas, gastos que SAEM em
promoção), com uma física que o `cc` não tem — o saldo nunca fica negativo.

É a mesma decisão que o `spc`→`shift` já ensinou: a exclusão por período do
`spc` foi **reaproveitada por FÍSICA DUPLICADA** — escrita de novo, para a
pessoa — no `shift`, porque o objeto que ocupa o tempo (espaço vs. pessoa) é
diferente. Aqui a física de "livro imutável com saldo calculado" já existe
em `cc`/`bank`/`invest`; duplicá-la, PEQUENA e PRÓPRIA, é mais barato e mais
honesto do que forçar uma dependência cruzada que a Lei do Lego proíbe. O
cabeçalho do `0043_cc.sql` já avisou: *"o Fundo de Promoção da Vertical
(Q6·fund) vai se PENDURAR aqui pela origem (id solto + nome)"* — e é
exatamente isso que este módulo faz com `mall.stores` (contribuinte) e
`marketing` (campanha): **ID SOLTO, sem FK cruzada, sem ler schema alheio.**

### 0.2 ⭐⭐ O SALDO NUNCA FICA NEGATIVO — a QUARTA resposta, e a mais estrita

Três precedentes já responderam "pode ficar negativo?":

| Módulo | Resposta |
|---|---|
| `bank` (Módulo 30) | **PERMITE** — cheque especial é produto bancário real; nenhuma constraint barra. |
| `inv` (Módulo 8) | **PERMITE** — o overpay do `ar` re-perguntado para o estoque físico. |
| `invest` (Módulo 31) | **RECUSA** resgatar MAIS que a posição — mas só o excesso; uma posição em zero não tem guarda contra QUALQUER movimento, só contra o que ultrapassa. |
| **`fund` (Módulo 40)** | **RECUSA de forma ESTRUTURAL** — todo gasto é conferido contra o saldo (contribuições − gastos) ANTES de ser aceito, sempre. |

A diferença do `fund` para o `invest` não é de grau, é de **natureza do
dinheiro**: o saldo do investimento é *do tenant* (ele decide quanto
resgatar, e a única regra é não inventar dinheiro que não está no papel). O
saldo do fundo é **dinheiro coletivo dos lojistas**, arrecadado com um
propósito. Gastar mais do que arrecadou não é "descoberto" nem "cheque
especial" — é o operador do shopping usando dinheiro que os lojistas não
deram. Por isso o gatilho `fund.guard_expense_balance()` confere o saldo
**antes** de aceitar cada gasto, e recusa com a mensagem exata:

> *"o fundo não pode ficar negativo: gastar mais do que arrecadou é
> descontrole"*

Há teste de contraste `fund×bank×invest` (`lifecycle.test.ts`) que lê as
três migrations e assina as quatro respostas.

### 0.3 Dois livros imutáveis, vínculo por ID SOLTO

- `fund.contributions` — o lojista (id solto ao `mall.stores`, **sem FK**)
  contribui, por competência.
- `fund.expenses` — o fundo gasta, com uma campanha (id solto à
  `marketing`, opcional, **sem FK**) e **razão obrigatória** (a física do
  `cc`/`inv`: gasto sem razão é a linha muda que esconde o desvio).

Os dois são fato consumado: **sem UPDATE, sem DELETE** — corrigir é lançar
o ato inverso, nunca reescrever.

### 0.4 Anti-viés reforçado

Zero nome/organograma de cliente. O contribuinte é referenciado por id
solto — o `fund` não sabe o que é um "lojista", só que alguém contribuiu.
"shopping" é o vertical; nada aqui pressupõe o cliente inaugural.

---

## 1. AS PEÇAS

- **`fund.contributions`** — `store_id` (solto) + `store_name`,
  `competence_on`, `amount_cents` (> 0), `currency` (ISO opcional), `note`.
  Imutável (sem UPDATE/DELETE); `contributed_by`/`contributed_at`
  carimbados pelo servidor.
- **`fund.expenses`** — `campaign_id` (solto, opcional) + `campaign_name`,
  `amount_cents` (> 0), `currency` (ISO opcional), `reason` (obrigatória).
  Imutável; `spent_by`/`spent_at` carimbados pelo servidor. **O gatilho
  confere o saldo antes de aceitar** (§0.2).
- **`fund.balance`** — view `security_invoker`: contribuições − gastos, por
  tenant. Calculado, nunca coluna.

---

## 2. OS FATOS

`fund.contribution.recorded` · `fund.expense.recorded`. Os envelopes são
autossuficientes: o lojista e a campanha vão pelo **nome carimbado** — quem
escuta não faz join.

---

## 3. AS TELAS

Território de outra frente. O motor (`@alsham/fund`) entrega a régua:
`validateNewContribution`, `validateNewExpense`, `computeBalance`,
`canSpend`, `whyCannotSpend`, `summarize`.

---

## 4. AS PERMISSÕES

- `fund.contribution.manage` — registrar contribuições.
- `fund.expense.manage` — registrar gastos (recusados se estouram o saldo).

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- **Rateio do fundo entre centros** — não existe; o `fund` é livro próprio,
  não um consumidor de `cc.execute_rateio()`.
- **Aprovação/orçamento do gasto** — não há fluxo de aprovação prévia; o
  único porteiro é o saldo (§0.2).
- **`consumes` VAZIO** — quem contribui e quem gasta é gente, pela tela;
  nenhum handler nesta onda (Lei 7).

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

✅ **CONSTRUÍDO na Missão Nove** — **arquivo, ainda não aplicado**
(runbook §22). A migration `0055_fund.sql`, o pacote `@alsham/fund` e o
teste `45_fund_isolation.sql` existem no disco. Terceiro cartão vertical do
catálogo. `consumes` vazio. **Não aplicado em produção** — aplicar é ato do
dono.

---

## 7. APPLY (dono)

Ver `docs/runbook/APLICAR.md §22`. **Expor o schema `fund` na Data API.**
`consumes` vazio → **sem redeploy do `apps/api`**.
