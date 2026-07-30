# 💰 MÓDULO 14 — FLUXO DE CAIXA

## ALSHAM Business OS™ · Especificação do módulo · Domain `finance`

> Leitura obrigatória para quem for mexer no schema `cash` ou no pacote
> `@alsham/cashflow`.
>
> **Leia junto com [MODULO-INV-SPEC](MODULO-INV-SPEC.md)** — o livro
> imutável com o sinal no tipo, que aqui é aplicado ao dinheiro — e com
> [MODULO-DUN-SPEC](MODULO-DUN-SPEC.md), a outra fronteira do Financeiro.
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 0. AS DECISÕES DE CANON

**`module_id` = `cash`.** `finance` é o Domain inteiro (e `packages/finance`
é pasta reservada); `caixa` não caberia no padrão em inglês do CORE-SPEC;
`flow` é genérico demais para se grepar. `cash` diz o REGIME — caixa, não
competência — e foi conferido por grep com fronteira de palavra: zero
colisões.

**`domain_key` = `finance`** — Taxonomia §5, bloco **💰 Financeiro (19)**,
capacidade **Fluxo de caixa**. DRE, Balancete, Orçamento, Centro de custo,
Bancos, Caixa (PDV) e Conciliação bancária são capacidades PRÓPRIAS do mesmo
bloco — nenhuma entra aqui de contrabando.

**⭐ CAIXA, NÃO COMPETÊNCIA.** `occurred_on` é o dia em que o dinheiro
MOVEU. Regime de competência é ofício do contador (Lei 3 vizinha) e
capacidade própria — declarada em §5, nunca meia-entrega.

**⭐ O FUTURO É RECUSADO — o DIVERGE consciente do `inv`.** O livro do
estoque aceita qualquer data (o físico já aconteceu quando se registra); um
lançamento de caixa datado de amanhã é PREVISÃO, e previsão é *Orçamento*.
Um caixa que mistura realizado com previsto mente para quem decide com ele.
Há teste que EXIGE o contraste entre as duas migrations.

**⭐ CATEGORIA É DADO DO TENANT — e lançar SEM categoria é PERMITIDO.**
A Lei das Etapas aplicada à classificação: nome livre, ativa/arquivada,
`archived → active` existe (a série que volta é a MESMA série). Obrigar
categoria inventa dado: o operador classifica errado só para o formulário
passar, e o relatório mente melhor do que um "sem categoria" honesto.

**⭐ `consumes` VAZIO — a decisão contra a DUPLA CONTAGEM.** O mesmo
dinheiro chega por três portas: o fato do módulo (`ap`/`ar`), o lançamento
manual e o extrato conciliado (`recon`). Sem uma regra de EXCLUSIVIDADE DE
FONTE + idempotência por documento entre as três, o caixa conta duas vezes
sem erro nenhum — o pior defeito possível num caixa. Essa regra ninguém
desenhou. Ver §5.

---

## 1. O LIVRO — o padrão do inv no dinheiro

- `cash.entries`: imutável em TRÊS camadas. Entrada/saída sempre positivas
  (o sinal é do TIPO — `signed_amount_cents` gerada); AJUSTE aceita negativo
  e EXIGE razão (a linha muda esconde o desvio). Corrigir é lançar ajuste;
  **reclassificar é estornar e relançar — o livro não se rasura.**
- A permissão do INSERT depende do TIPO: `cash.entry.register` para
  entrada/saída, `cash.entry.adjust` para o ajuste — quem conta não é quem
  confere.
- `account` TEXTO LIVRE opcional — multi-conta estruturada é *Bancos* (§5).
- Categoria arquivada não recebe lançamento novo.

## 2. O SALDO — consequência calculada

`cash.balances` (por moeda), `cash.monthly` (fluxo mensal) e
`cash.by_category` (com o "sem categoria" aparecendo em nulo — honesto,
nunca escondido). Todas com `security_invoker`: a RLS de `entries` decide o
que entra na soma.

## 3. OS FATOS

| Fato | Quando |
|---|---|
| `cash.entry.registered` | um lançamento entrou no livro — categoria pelo NOME |
| `cash.category.registered` | uma categoria nasceu |
| `cash.category.updated` | mudou nome (ou reativou — mesma categoria, um fato) |
| `cash.category.archived` | saiu de uso — o livro dela continua inteiro |

## 4. AS TELAS

`/caixa`: saldos por moeda (badges vindos de `balancesByCurrency()` — a tela
não soma nada), lançar entrada/saída/ajuste (a validação é
`validateNewEntry()`, com o relógio por parâmetro), desenhar categorias e o
livro com o "sem categoria" à vista. Porta própria (`cash-port`), mock
honesto, menu por permissão.

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

| Peça | O que falta |
|---|---|
| Consumo `ap.payable.*` / `ar.receivable.*` → lançamento automático | a REGRA DE EXCLUSIVIDADE DE FONTE (fato × manual × extrato) + idempotência por documento entre as três portas. Sem ela, dupla contagem silenciosa. Handler completo padrão dun quando a regra for desenhada |
| Previsão / Orçamento | capacidade própria (*Orçamento*, Taxonomia §5) — é por isso que o futuro é RECUSADO aqui |
| Competência, DRE, Balancete | ofício do contador (Lei 3) e capacidades próprias do Domain |
| Multi-conta estruturada (banco, agência, saldo por conta) | capacidade *Bancos* — `account` texto livre serve o honesto até lá |
| Centro de custo e rateio | capacidades próprias do Domain |
| Conciliação do caixa com extrato | é o Módulo 1 (`recon`) — outro módulo, outra porta |

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

*Conferido em 30/07/2026, na Missão Quadra.*

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `cash` (`0029_cash.sql`) | ✅ **ARQUIVO, não aplicado.** Aplicar é ato do dono (runbook §17) |
| Pacote `@alsham/cashflow` (livro, saldos, fluxos, validação) | ✅ construído, com testes |
| Seed (14º cartão) | ✅ CONSTRUÍDO |
| Teste SQL (`19_cash_isolation.sql`) + guardas de CI | ✅ CONSTRUÍDO |
| Portal `/caixa` (livro, lançar, categorias, saldos) | ✅ CONSTRUÍDO |
| Consumo ap/ar · previsão · competência · multi-conta | ⛔ **NÃO CONSTRUÍDO** — ver §5 |

---

## 7. APPLY (dono)

1. Aplicar `0029_cash.sql` (depois do `0028`).
2. Reaplicar o seed — o 14º cartão entra.
3. ⚠️ **Expor o schema `cash` na Data API.**
4. Instalar pela Store, no tenant que o comprou.

Nenhum agente aplica em produção.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
