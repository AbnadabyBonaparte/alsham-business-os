# MÓDULO 72 — Catálogo de Produtos (catalog)

> Vertical 🛒 **Varejo & Supermercados** (`vertical_key='retail'`) · Onda Dezoito
> (Fase 2) · migration `0087_catalog.sql` · pacote `@alsham/catalog` · teste
> `77_catalog_isolation.sql`.
> O **segundo** cartão do Vertical Varejo. **ARQUIVO — apply é ato do dono
> (runbook §31).**

---

## 1. O QUE É

O **cadastro do que a loja vende**: o **nome** do produto, um **SKU** e o **preço
de tabela**. É a lista de "quanto custa hoje" — a fonte de onde o balcão puxa o
item para o cupom do `pdv`.

- **SKU é TEXTO LIVRE e OPCIONAL** — a lição do `crm`/`vendor`. Nem toda casa usa
  código: a padaria da esquina vende "pão francês" sem SKU; o supermercado grande
  tem EAN em tudo. Congelar o código num formato (EAN-13, código interno) faria o
  produto envelhecer com o tenant que o desenhou. Um produto sem SKU é honesto.
- **O preço é valor + moeda JUNTOS** — a física de sempre (`pcost`/`cash`/`quote`):
  `price_cents` (`bigint`, ≥ 0) com a `currency` ao lado. Nunca um `float`, nunca
  um valor sem moeda. Um brinde a R$ 0 é honesto; preço negativo é infísico.

---

## 2. ⭐ O DIVERGE — `active ↔ archived`, o produto que volta é o MESMO

Copiar sem pensar e divergir sem escrever são o mesmo erro. A pergunta foi
refeita: o produto é **GENTE** (a física do `hr`, onde `terminated` é terminal) ou
**ATIVO DE CADASTRO que volta** (a física do `vendor`/`mall`/`dc`)?

É cadastro. O produto **descontinuado** que a loja volta a vender é o **MESMO
produto** — obrigá-lo a renascer partiria o histórico de venda em dois. Então
`archived → active` **existe**: o ciclo é `active ↔ archived`, reversível.
Arquivar e reativar são DECISÕES (`catalog.product.decide`, separada de
`catalog.product.manage`), com a lição do `vendor` no USING da policy — quem só
arquiva ALCANÇA a linha e bate no gatilho, em vez de a RLS filtrar em silêncio.
Sem DELETE: produto descontinuado é história de venda. O contraste catalog×hr
fica assinado no teste.

---

## 3. ⭐ PREÇO DE TABELA × PREÇO EFETIVO — quem manda é a venda

O catálogo diz **"quanto custa hoje"**. A venda diz **"quanto custou"**. São
coisas distintas de propósito:

- O **preço de tabela** vive aqui (`catalog.products.price_cents`) — a lista.
- O **preço efetivo** da venda vive no **item do cupom**
  (`pdv.sale_items.unit_price_cents`), congelado no fechamento da venda.

Um produto pode mudar de preço amanhã sem reescrever nenhuma venda antiga: a
venda carimbou o `product_name` e o `unit_price_cents` no ato. O catálogo é a
referência viva; o cupom é o fato consumado.

### ⛔ FORA — declarado peça a peça

- ***Estoque de varejo*** — é o `inv` genérico (o livro de movimentos, saldo por
  view), referenciado por **id solto**; o catálogo não guarda saldo.
- ***Variação/grade*** (tamanho · cor · sabor) — capacidade futura.
- ***Imagem do produto*** — depende do Storage do Core, que é capacidade do Core
  ainda não construída; o catálogo não finge cofre de arquivo.
- ***Marketplace próprio*** — e-commerce é integração futura.
- **`consumes` VAZIO** — nenhum handler nesta onda (Lei 7).

---

## 4. OS FATOS

`catalog.product.registered` · `catalog.product.updated` ·
`catalog.product.archived` · `catalog.product.reopened`. O envelope é
autossuficiente (nome, SKU, preço, moeda, status) — quem escuta não faz join.

---

## 5. ESTADO DA OBRA

✅ **CONSTRUÍDO na Onda Dezoito (Fase 2 — Vertical Varejo & Supermercados).**
**Arquivo, ainda não aplicado** — aplicar é ato do dono (runbook §31).

- `supabase/migrations/0087_catalog.sql` — `catalog.products`, RLS
  `enable`+`force`, nascimento sempre `active` com autor carimbado pelo servidor,
  ciclo `active ↔ archived` (`allowed_transition` + `product.decide`), preço
  valor + moeda, SKU texto livre opcional e os fatos autossuficientes.
- `packages/catalog` — manifesto (capacidade *Catálogo*, permissões
  `catalog.product.manage` e `catalog.product.decide`, os quatro eventos), tipos,
  motor (`ALLOWED_TRANSITIONS`, o contraste com o `hr` terminal) e as suítes de
  teste.
- Cartão 72 do catálogo (`vertical_key='retail'`). Catálogo **71 → 72**.

⭐ **Ao aplicar (runbook §31):** expor o schema `catalog` na Data API; **sem
redeploy** do `apps/api` (`consumes` vazio; guarda de CI confere). Nenhuma leitura
de schema alheio — o mapa SCHEMA_DE do CI confere.
