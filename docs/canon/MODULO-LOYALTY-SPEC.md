# MÓDULO 74 — Fidelidade (loyalty)

> Vertical 🛒 **Varejo & Supermercados** (`vertical_key='retail'`) · Onda Dezoito
> (Fase 2) · migration `0089_loyalty.sql` · pacote `@alsham/loyalty` · teste
> `79_loyalty_isolation.sql`.
> O **quarto e ÚLTIMO** cartão do Vertical Varejo — **FECHA a Onda Dezoito**.
> **ARQUIVO — apply é ato do dono (runbook §31).**

---

## 1. O QUE É

O **livro de pontos** do varejo, **lançamento imutável**. Cada movimento é um
FATO CONSUMADO: o cliente **ganhou** X pontos numa compra, ou **resgatou** Y numa
troca. O registro nasce pronto — para sempre. É a **mesma física do
`timesheet`/`pcost`/`cash`**: NÃO tem coluna de status, não tem ciclo de vida, não
tem transição, não tem `updated_at`.

- O cliente não tem porta de UPDATE nem DELETE (nem policy, nem grant).
- O gatilho recusa a reescrita **até para o dono do banco**.
- Corrigir é lançar OUTRO movimento (o ato inverso), com motivo — nunca reescrever.
- O cliente vem por **id solto** ao `crm` (**obrigatório** — não há ponto sem
  dono) + nome carimbado pela tela; a venda de origem por **id solto** opcional
  (`source_id`, sem FK cruzada). O carimbo é sempre do servidor.

---

## 2. ⭐⭐ O DIVERGE `loyalty` × `pcost`/`timesheet` — a direção mora no TIPO

Copiar sem pensar e divergir sem escrever são o mesmo erro.

**O que se MANTÉM** do `timesheet`/`pcost`: livro imutável em duas camadas,
número estritamente `> 0`, carimbo do servidor.

**O que DIVERGE:**

- O `timesheet` acumula numa direção só (horas somam); o `pcost` é livro de gasto
  (`<> 0`). O `loyalty` tem **DUAS direções** — GANHAR e RESGATAR — e a direção
  mora numa coluna de **TIPO** (`entry_type` CHECK `earn`/`redeem`), **não no
  sinal do número**. É a **"sinal do tipo" do `cash`**, re-perguntada para os
  pontos: `points` é **SEMPRE > 0**, e o que soma ou subtrai é o TIPO.
- Consequência: **o saldo é VIEW**, `Σ(earn) − Σ(redeem)`
  (`loyalty.customer_balances`, `security_invoker`), **nunca coluna** — a física
  do `cash`/`inv`.

### ⭐⭐ A TERCEIRA RESPOSTA — resgatar mais que o saldo é RECUSADO

À pergunta "pode ficar negativo?", cada módulo respondeu à sua física: o `inv`
**permite** saldo negativo (físico), o `bank` **permite** (cheque especial), o
`fund` **recusa** (dinheiro coletivo de terceiros). O ponto de fidelidade é
**promessa da casa**: ninguém resgata o que não tem. O gatilho soma o saldo do
cliente **no próprio livro** (INTRA-schema, nunca schema alheio) e **recusa** o
resgate que passa do saldo — a física do `invest` (resgatar mais que a posição é
recusado), re-perguntada e assinada em teste.

---

## 3. OS FATOS

`loyalty.points.earned` · `loyalty.points.redeemed`. O envelope é autossuficiente,
com o cliente pelo **nome** carimbado (id solto) — quem escuta não faz join. Não
há permissão `decide`: o livro imutável não tem ciclo de vida, só
`loyalty.entry.manage` (lançar um movimento).

---

## 4. ⛔ FORA — declarado peça a peça

- ***Conversão pontos↔dinheiro / regra de acúmulo*** (quantos pontos por real) —
  é configuração de campanha, capacidade futura.
- ***Expiração automática de pontos por relógio*** — sem cron fingido (Lei 7); a
  baixa por validade é um `redeem` com motivo, quando construída.
- ***Catálogo de recompensas*** — frente própria, futura.
- **`consumes` VAZIO** — o `loyalty` NÃO lê o `crm` nem o `pdv`: cliente e venda
  são id solto, sem FK cruzada e sem uma linha que toque schema alheio.

---

## 5. ESTADO DA OBRA

✅ **CONSTRUÍDO na Onda Dezoito (Fase 2 — Vertical Varejo & Supermercados; a peça
que FECHA a onda).** **Arquivo, ainda não aplicado** — aplicar é ato do dono
(runbook §31).

- `supabase/migrations/0089_loyalty.sql` — `loyalty.entries` (livro imutável em
  duas camadas: cliente sem porta de UPDATE/DELETE + gatilho que recusa até o dono
  do banco), `entry_type` CHECK `earn`/`redeem`, `points > 0`, a guarda de saldo
  no resgate (INTRA-schema), `loyalty.customer_balances` (VIEW `security_invoker`)
  e os fatos autossuficientes.
- `packages/loyalty` — manifesto (capacidade *Fidelidade*, permissão
  `loyalty.entry.manage`, eventos `loyalty.points.earned/redeemed`), tipos, motor
  (saldo calculado do livro, o contraste com o `invest`/`fund`) e as suítes de
  teste.
- Cartão 74 do catálogo (`vertical_key='retail'`). Catálogo **73 → 74**.

⭐ **Ao aplicar (runbook §31):** expor o schema `loyalty` na Data API; **sem
redeploy** do `apps/api` (`consumes` vazio; guarda de CI confere). Cliente e venda
por **id solto** — o mapa SCHEMA_DE do CI reprova a leitura de schema alheio.
