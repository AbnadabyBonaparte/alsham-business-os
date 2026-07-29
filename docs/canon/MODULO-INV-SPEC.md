# 🏭 MÓDULO 8 — ESTOQUE

## ALSHAM Business OS™ · Especificação do módulo · Domain `operations`

> Leitura obrigatória para quem for mexer no schema `inv` ou no pacote
> `@alsham/inventory`.
>
> **Leia junto com [MODULO-OPS-SPEC](MODULO-OPS-SPEC.md)** — o irmão de Domain,
> de quem este módulo herda a imutabilidade em três camadas — e com
> [MODULO-AR-SPEC](MODULO-AR-SPEC.md), cuja decisão de overpay este módulo
> re-pergunta para o físico.
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 0. AS DECISÕES DE CANON

**`module_id` = `inv`, e não `estoque` nem `stock`.** O cinto de
`inv.emit_event()` confere o prefixo `<moduleId>.<agregado>.<fato>` em inglês
(CORE-SPEC §3); `estoque` quebraria o padrão, e `stock` é vocabulário de
mercado financeiro. O prefixo `inv.` foi conferido por grep com fronteira de
palavra contra o código de TODAS as migrations existentes antes de nascer:
zero colisões. (A lição do `os`/`ops` aplicada ANTES do erro, não depois.)

**`domain_key` = `operations`** — Taxonomia §5, bloco **🏭 Operações (10)**:

> Ordens de serviço · Checklist · Manutenção · Facilities · Ocorrências ·
> Segurança · Patrimônio · Almoxarifado · **Estoque** · Inventário

Este módulo entrega **uma** capacidade: *Estoque*. ⚠️ Os homônimos que NÃO
são ele: *Estoque mínimo* é de **Compras** (reposição é decisão de compra);
*Inventário de carbono* é de **ESG**; *Estoque de varejo/de produtos/de
insumos* são de verticais. Sol Único: uma palavra, um dono por contexto.

**consumes = VAZIO.** Lei 7: sem handler, sem promessa. Ver §5.

---

## 1. ⭐ A LEI DO MÓDULO: O ESTOQUE É UM LIVRO, NÃO UM NÚMERO

> **O saldo não é coluna. É a soma de um livro de movimentos imutável.**
> Corrigir não é editar — é lançar um AJUSTE com razão, que fica no livro
> para sempre.

Minerado do `usage_ledger` do kraken-v2 (**PROVADO**, com assinante pagante)
e da trilha do `ops` (três camadas). Um número editável esquece como chegou
lá; um livro imutável lembra tudo — inclusive o desvio.

| Onde | Como se verifica |
|---|---|
| `0023_inv.sql` §3 | `inv.movements` sem policy/grant de UPDATE/DELETE + trigger que recusa até o dono do banco |
| `0023_inv.sql` §4 | o saldo é `create view inv.balances` com `security_invoker` — nenhuma coluna de saldo existe |
| `@alsham/inventory` | teste lê a migration e reprova coluna de saldo em `inv.items` |
| CI (`db-verify`) | guarda "nenhuma porta de escrita em inv.movements" contra o banco aplicado |

### 1.1 ⭐ O ajuste exige RAZÃO, e exige a mão mais pesada

"Ajuste" sem motivo é o buraco por onde todo estoque do mundo vaza. A
constraint recusa a linha muda, e a permissão é própria
(`inv.movement.adjust` ≠ `inv.movement.register`): **quem conta não é
necessariamente quem confere**. A policy de INSERT confere o TIPO do
movimento contra a permissão — mesma mecânica da etapa `requires_approval`
do `ops`, chegando por outro caminho.

### 1.2 O sinal é do TIPO, nunca do operador

Entrada soma, saída subtrai (`signed_quantity`, coluna gerada). Só o AJUSTE
carrega o próprio sinal — ajustar para menos (quebra, perda, contagem que
achou menos) é o caso clássico.

---

## 2. ⭐⭐ A DIVERGÊNCIA: SALDO NEGATIVO É PERMITIDO

O overpay do `ar` (0010 §2.1), re-perguntado para o físico — e a resposta é a
mesma, pelo mesmo teste: **recusar obrigaria o operador a mentir?**

A mercadoria já saiu do balcão. O registro chega depois do fato — e às vezes
antes da entrada que o cobriria (nota atrasada, contagem inicial nunca
lançada, livro que começou no meio da vida da empresa). Recusar a saída "por
falta de saldo" obrigaria o operador a inventar uma entrada FALSA para
registrar uma saída VERDADEIRA.

O saldo negativo aparece na tela com o estado `negative`, dizendo
"investigue". A correção é humana: um ajuste com razão.

### 2.1 O quadro do espelho — decisões re-perguntadas

| Decisão do irmão | Resposta no `inv` | Por quê |
|---|---|---|
| ledger imutável, correção é lançamento (`0003_billing`) | ✅ **mantido** | fato consumado não se edita |
| imutabilidade em 3 camadas (`crm`/`ops`) | ✅ **mantido** | as duas primeiras não valem para o dono do banco |
| `archived → active` existe (`crm`) | ✅ **mantido** | o item que volta é o MESMO item; livro partido em dois mente o saldo |
| INSERT direto na tabela imutável (`crm.interactions`) | ✅ **mantido** | o fato É o dado; a permissão do ato cabe na policy (o tipo decide) |
| `settled`/`cancelled` terminal (`ap`) | ✅ mantido no que cabe | item não tem terminal: arquivar reabre — identidade por item, não por documento |
| overpay recusado (`ap`) / aceito (`ar`) | ⛔ **DIVERGE para o lado do `ar`** | o físico já saiu; o banco aceita o que o mundo impõe |
| itens de texto com catálogo futuro (`po`) | ✅ **mantido** | NCM/EAN/categoria congelariam o fisco de um país no schema de todos |

---

## 3. O QUE ESTE MÓDULO GUARDA

### 3.1 `inv.items`

Descrição TEXTO LIVRE · unidade TEXTO LIVRE ("un", "kg", "m²", "hora") · SKU
**opcional**, do tenant, sem formato, único por tenant quando informado
(caixa ignorada). Status `active`/`archived` — sem DELETE. Item arquivado
**não movimenta**; reativado, movimenta de novo, no MESMO livro.

**Não entra:** NCM, CEST, EAN/GTIN, categoria em árvore, foto, custo médio,
preço de venda, fornecedor preferencial, estoque mínimo. Ver §6.

### 3.2 `inv.movements` — o livro

`kind` ∈ `in` · `out` · `adjustment`. Quantidade positiva nas duas
primeiras; ajuste aceita negativo e recusa zero. Razão obrigatória no
ajuste. `external_ref` opcional (nota, pedido, romaneio — opaco).
`location` TEXTO LIVRE opcional. `occurred_at` aceita o passado — a
mercadoria entra no sábado e o registro acontece na segunda.

### 3.3 `inv.balances` / `inv.balances_by_location` — o saldo

Views com `security_invoker = true` (⚠️ sem isso a view somaria o estoque de
todos os tenants: view roda como o dono, e o dono atravessa a RLS).
Movimento sem local soma no local nulo — o livro não inventa onde.

---

## 4. OS QUATRO FATOS

| Fato | Quando |
|---|---|
| `inv.item.registered` | um item entrou no catálogo do tenant |
| `inv.item.updated` | mudou fato do item (descrição, unidade, SKU) — ou ele voltou do arquivo |
| `inv.item.archived` | o item foi arquivado — a ação destrutiva do módulo |
| `inv.movement.registered` | uma linha entrou no livro |

⭐ O payload é AUTOSSUFICIENTE: o movimento leva o item pelo NOME, a unidade
e o **saldo resultante**, somado no instante do fato — quem escuta não tem
como somar um livro que não pode ler. Reativar não tem fato próprio (emite
`updated`): dois fatos para um ato fariam todo consumidor contar duas vezes.

---

## 5. ⛔ NÃO CONSTRUÍDO — recebimento do `po` → entrada no livro

A integração óbvia, declarada e **não prometida**. O que falta, em ordem:

1. o `po` emite `po.order.updated` com o estado ACUMULADO das linhas
   (`qtyReceived` total), nunca o DELTA de um recebimento — o consumidor
   teria de guardar o estado anterior e diferenciá-lo;
2. a linha do pedido é TEXTO LIVRE por decisão de canon do próprio `po`
   (sem catálogo, sem SKU): não existe vínculo entre "Parafuso 8mm" do
   pedido e um item deste estoque, e casá-los por nome seria adivinhação;
3. handler completo no pacote + inscrição na composição + teste triangular
   no padrão da Etapa 10, lendo `envelope.producedBy`.

Enquanto os três não existem, `consumes` fica vazio — e há guarda no CI
conferindo o cartão no banco aplicado.

---

## 6. O QUE FICOU DE FORA, E POR QUÊ

- **Almoxarifado** (capacidade da Taxonomia): multi-depósito ESTRUTURADO —
  cadastro de locais, transferência entre depósitos, endereçamento. Aqui o
  local é texto livre do movimento. Transferência hoje = saída de um local +
  entrada no outro, duas linhas honestas.
- **Inventário** (capacidade da Taxonomia): contagem periódica com abertura,
  conferência cega e fechamento. Aqui existe o ajuste avulso com razão.
- **Catálogo rico**: NCM/EAN/foto/categoria — fiscal é Lei 3 (INTEGRAR).
- **Custo e valorização** (custo médio, PEPS/UEPS): dinheiro é do Domain
  Financeiro; misturar quantidade com valor no mesmo livro dobraria o módulo.
- **Estoque mínimo / reposição**: capacidade de COMPRAS na Taxonomia.

---

## 7. ESTADO DA OBRA — o que existe e o que não existe

*Conferido em 29/07/2026, na Missão Trina.*

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `inv` (`0023_inv.sql`) | ✅ **ARQUIVO, não aplicado.** Aplicar é ato do dono (runbook §16) |
| Pacote `@alsham/inventory` (manifesto, tipos, motor, validação) | ✅ construído, com testes |
| Seed (8º cartão) | ✅ CONSTRUÍDO |
| Teste SQL (`13_inv_isolation.sql`) + guardas de CI | ✅ CONSTRUÍDO |
| Portal `/estoque` (itens, lançar movimento, extrato) | ✅ CONSTRUÍDO |
| Consumidor `po` → `inv` | ⛔ **NÃO CONSTRUÍDO** — ver §5 |
| Almoxarifado · Inventário · catálogo rico · custo · estoque mínimo | ⛔ fora de escopo — ver §6 |

---

## 8. APPLY (dono)

1. Aplicar `0023_inv.sql` no projeto de produção.
2. Reaplicar o seed (`0001_platform.sql`) — o 8º cartão entra no catálogo.
3. ⚠️ **Expor o schema `inv` na Data API** (Project Settings → API → Exposed
   schemas) — sem isso a tela carrega vazia, sem erro que diga o motivo.
4. Instalar o módulo pela Store, no tenant que o comprou.

Nenhum agente aplica em produção.

---

*Universo Bonaparte · ALSHAM Global Commerce Ltda · Powered by ALSHAM*
