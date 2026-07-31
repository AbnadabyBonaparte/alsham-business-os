# MODULO-REORDER-SPEC — Módulo 47: Estoque Mínimo

**Domain 📦 Compras · capacidade _Estoque mínimo_ · `module_id = reorder` · schema `reorder`**
Onda Dez (Fase 2 — completar o Domain Compras), o QUINTO e ÚLTIMO módulo da
onda. Migration `0062_reorder.sql`, pacote `@alsham/reorder`, teste
`52_reorder_isolation.sql`.

---

## 0. AS DECISÕES DE CANON

- ⭐⭐ **A DECISÃO-ESTRELA: este módulo NÃO lê o `inv` por dentro.** *Estoque
  mínimo* é reposição — DECISÃO DE COMPRA, não de contagem (o próprio `inv`,
  Módulo 8, declara este homônimo como sendo de Compras). Então o `reorder`
  guarda **só a configuração**: o produto (texto livre) + a quantidade mínima
  desejada, com um vínculo SOLTO (`inv_item_id` + nome carimbado) ao item de
  estoque, quando houver um. **A comparação "estoque atual < mínimo" acontece
  na CAMADA DE APRESENTAÇÃO** — um Server Action do portal, em TypeScript, que
  lê o saldo do `inv` na tela e o confronta com a regra pela função pura
  `needsReorder()` do pacote. Não existe view que faça join entre `reorder` e
  `inv`; a migration não contém nem a palavra `inv.` (há teste e grep que
  conferem). É a Lei do Lego levada ao limite: "módulo não conhece módulo" — o
  acoplamento é ZERO, nem por evento; é só um id solto que a tela resolve.
- ⭐ **`active ↔ archived` EXISTE — e o DIVERGE do `hr` é assinado.** Copiar o
  `vendor` "por consistência" seria erro; copiar sem pensar e divergir sem
  escrever são o mesmo erro. A pergunta foi refeita: a regra é FATO CONSUMADO
  (o `occ`, imutável) ou CONFIGURAÇÃO que a empresa liga e desliga? É
  configuração — um produto que saiu de linha e volta a ser reposto usa a
  MESMA regra. Obrigá-la a renascer partiria o histórico da parametrização.
  Então `archived → active` existe, como no `vendor`. O contraste
  `reorder × hr` é assinado no `lifecycle.test.ts`.
- ⭐ **Produto/categoria é TEXTO LIVRE** (anti-viés) e a **quantidade mínima é
  campo de domínio real** — nunca negativa (CHECK na coluna + validação no
  pacote).
- ⛔ **FORA:** cálculo de lote econômico, lead time do fornecedor, geração
  automática de pedido de compra (comprar é o `po`, por decisão manual — a
  sugestão de reabastecer é ATO DE GENTE), e a leitura do saldo (é do `inv`,
  na tela).

## 1. AS PEÇAS

- `reorder.rules` — a configuração: `product` (texto livre, obrigatório),
  `inv_item_id` (uuid nullable — vínculo SOLTO, SEM FK ao `inv`), `inv_item_name`
  (texto livre, carimbado pela tela), `minimum_quantity` (numeric, `>= 0`),
  `status` (`active`/`archived`), carimbos.
- `reorder.allowed_transition()` — espelho de `ALLOWED_TRANSITIONS` em
  `@alsham/reorder`: `active ↔ archived`.
- `needsReorder()` / `flagLowStock()` — as funções PURAS da camada de
  apresentação: recebem o saldo POR PARÂMETRO (de fora) e apontam as regras
  abaixo do mínimo. Nunca leem o `inv`.
- Gatilhos: nascimento sempre ativo + autor carimbado pelo servidor; transição
  gated por `reorder.rule.decide`; emissão de fato por INSERT/UPDATE.

## 2. OS FATOS

`reorder.rule.registered` · `reorder.rule.updated` · `reorder.rule.archived` ·
`reorder.rule.reopened`. Payload autossuficiente (leva a regra; **nunca** o
saldo de estoque — este módulo não o conhece). `consumes` VAZIO (Lei 7 — sem
redeploy do `apps/api`).

## 3. AS TELAS

`/estoque-minimo` — placeholder por ora. É nela (na frente de UI própria, como
as ondas anteriores) que o Server Action cruza a regra com o saldo do `inv` via
`needsReorder()` e lista as sugestões de reabastecimento.

## 4. AS PERMISSÕES

- `reorder.rule.manage` — cadastrar e editar regras.
- `reorder.rule.decide` — arquivar/reativar (a configuração que sai e volta).

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- Comparação/leitura do saldo dentro do módulo — é da apresentação, por lei.
- Lote econômico, lead time, ponto de pedido calculado — capacidade futura.
- Geração automática de pedido de compra — é o `po`, por decisão manual.
- Tela rica — próxima frente de UI.

## 6. ESTADO DA CONSTRUÇÃO

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `reorder` (`0062_reorder.sql`) | ✅ CONSTRUÍDO (arquivo; apply do dono) |
| Pacote `@alsham/reorder` | ✅ CONSTRUÍDO |
| Seed (cartão procurement) | ✅ CONSTRUÍDO |
| Teste SQL `52_reorder_isolation.sql` + CI | ✅ CONSTRUÍDO |
| Portal `/estoque-minimo` | ✅ CONSTRUÍDO (placeholder) |
| Leitura de saldo / lote econômico / pedido automático | ⛔ **NÃO CONSTRUÍDO** (§5) |

## 7. APPLY (dono)

`docs/runbook/APLICAR.md §23`. Expor o schema `reorder` na Data API. `consumes`
vazio → sem redeploy do `apps/api`.
