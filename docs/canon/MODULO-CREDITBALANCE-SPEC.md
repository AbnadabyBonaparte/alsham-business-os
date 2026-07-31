# MÓDULO 84 — Créditos de Compensação (creditbalance)

> Vertical ☀️ **Energia** (`vertical_key='energy'`) · Onda Vinte (Fase 3) ·
> migration `0099_creditbalance.sql` · pacote `@alsham/creditbalance` · teste
> `89_creditbalance_isolation.sql`.
> O **quarto e ÚLTIMO** cartão do Vertical Energia — **FECHA a Onda Vinte**.
> **ARQUIVO — apply é ato do dono (runbook §33).**

---

## 1. O QUE É

O **livro de créditos de energia** — o Sistema de Compensação de Energia Elétrica
(SCEE) da ANEEL / Lei 14.300. Quando uma unidade geradora injeta na rede MAIS do
que consome, o excedente vira CRÉDITO DE ENERGIA (em kWh), que fica em banco e
abate consumo de ciclos seguintes.

Cada lançamento é um FATO CONSUMADO: a direção mora no TIPO (`credit_type`
`generated` soma / `consumed` subtrai), a quantidade é SEMPRE em kWh positivos, e
o SALDO é uma **VIEW** (`Σ generated − Σ consumed`), nunca coluna. É a **mesma
física do `loyalty`**: livro imutável (duas camadas), a sinal na coluna de tipo,
saldo como view. A assinatura de origem vem por **id solto** OPCIONAL.

---

## 2. ⭐⭐ A DECISÃO DO SALDO NEGATIVO — RECUSADO, pela física da compensação

O bastão mandou decidir e argumentar pela física REAL, sem copiar o `loyalty`.

- **(a) "O saldo pode ficar negativo — é dívida de energia que será compensada
  depois." — REJEITADA.** No SCEE não existe DÍVIDA de crédito de energia: um
  crédito só existe porque energia excedente foi FISICAMENTE gerada e injetada. A
  distribuidora não EMPRESTA kWh de crédito. O consumo que os créditos bancados
  não cobrem não vira saldo negativo — é faturado normalmente pela distribuidora,
  FORA deste livro (integração de fatura, Lei 3).
- **(b) "Consumir mais crédito do que o saldo é RECUSADO." — ESCOLHIDA.**
  Registrar saldo negativo INVENTARIA energia injetada que nunca existiu — o mesmo
  argumento INFÍSICO do `esg`/`genreading` (`>= 0`: não se gera energia negativa).
  Você não compensa com energia que não gerou.

⭐⭐ **A TERCEIRA RESPOSTA, POR FÍSICA PRÓPRIA.** O resultado — recusar — é o MESMO
do `loyalty` e do `invest`, mas por motivos DIFERENTES (contraste assinado no
teste):

| Módulo | Recusa consumo/resgate > saldo porque… |
|---|---|
| `invest` | não se resgata investimento que não se tem |
| `loyalty` | ponto é PROMESSA da casa — não se dá o que não há |
| `creditbalance` | crédito é ENERGIA REALMENTE GERADA — compensar com energia inexistente é infísico |

E o outro lado do eixo: o `bank` PERMITE saldo negativo (cheque especial), o
`inv` PERMITE (físico). Aqui NÃO: **energia não se deve, se gera.**

O guarda soma o saldo **INTRA-schema** (o próprio livro, nunca schema alheio),
agrupado por `(tenant, assinatura)` — a mesma conta do guarda do `loyalty` (que
agrupa por cliente), com a assinatura como chave de conta (o `NULL` é o balcão
geral do tenant, `is not distinct from`).

---

## 3. ANTI-VIÉS — o que ENTRA e o que fica FORA

**✅ ENTRA:** o TIPO (`generated`/`consumed`, CHECK); a quantidade em kWh (`> 0` —
o sinal é o tipo); o motivo TEXTO LIVRE opcional; a assinatura por id solto
OPCIONAL + nome carimbado.

**❌ FORA:** validade/expiração de crédito por relógio (o SCEE dá 60 meses — motor
de calendário, futuro, sem cron fingido — Lei 7); cálculo de abatimento na fatura
(é o `dre`/`cash`, FORA); a fatura de energia (integração com a distribuidora,
Lei 3). `consumes` **VAZIO**.

---

## 4. ESTADO

✅ **CONSTRUÍDO na Onda Vinte (Vertical ☀️ Energia — FECHA a onda)** — arquivo,
ainda **NÃO APLICADO** (runbook §33). Schema `creditbalance`, RLS por tenant,
motor `@alsham/creditbalance`, teste de isolamento `89`. `consumes` vazio.
