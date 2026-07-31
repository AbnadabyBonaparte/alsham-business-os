# MODULO-RECV-SPEC — Módulo 45: Recebimento (Goods Receipt)

**Domain 📦 Compras · capacidade _Recebimento_ · `module_id = recv` · schema `recv`**
Onda Dez (Fase 2 — completar o Domain Compras). Migration `0060_recv.sql`,
pacote `@alsham/recv`, teste `50_recv_isolation.sql`.

---

## 0. AS DECISÕES DE CANON

- ⭐⭐ **O recebimento é ATO PONTUAL, IMUTÁVEL — a física do `sec`/`perf`/`occ`.**
  Cada recebimento é fato consumado: a mercadoria chegou, alguém registrou o que
  chegou e quanto, e o registro nasce pronto — para sempre. **NÃO TEM coluna de
  status, NÃO TEM ciclo de vida, NÃO TEM `allowed_transition`, NÃO TEM
  `updated_at`.** Não existe "recebimento aberto". O cliente não tem porta de
  UPDATE nem DELETE (nem policy, nem grant), e um gatilho `before update or
  delete` recusa a reescrita até para o dono do banco. **Corrigir é registrar
  OUTRO recebimento, com nota.**
- ⭐⭐ **RECEBER A MAIOR É PERMITIDO — o paralelo recv × ar, assinado.** A
  pergunta foi feita: o recebimento pode registrar MAIS do que foi pedido?
  **Sim.** A sobra/excedente que o fornecedor entregou é FATO do mundo real;
  recusá-la obrigaria o operador a MENTIR sobre o que fisicamente chegou na doca.
  É EXATAMENTE a física que o `ar` (Módulo 5) já decidiu para o dinheiro em
  `0010_ar.sql §2.1` (**receber a maior é permitido**; o `no_overpay` fica só do
  lado do débito). O `ar` recebe dinheiro a mais; o `recv` recebe mercadoria a
  mais. Nos dois casos: o schema recusa o que o SISTEMA controla e aceita o que o
  MUNDO impõe. O contraste é assinado no `lifecycle.test.ts` (lê as duas
  migrations) e no `50_recv_isolation.sql` (a sobra enorme entra sem trave).
- ⭐ **Não há "quantidade pedida" para comparar — e é de propósito.** Pela Lei do
  Lego, o `recv` **NÃO LÊ o `po`** (não importa, não lê o schema, sem FK
  cruzada). O `order_id` é ID SOLTO e o `order_ref` é o número/nome do pedido
  carimbado pela TELA. Não existe, no schema do `recv`, uma quantidade esperada
  contra a qual a sobra pudesse ser recusada — a sobra é registrada, e ponto.
- ⭐ **O vínculo com o pedido é OPCIONAL.** Um recebimento pode existir sem
  pedido nenhum (doação, brinde, amostra). `order_id` é nullable.
- ⭐ **Os carimbos são do SERVIDOR.** `received_at`/`received_by` são sempre
  `now()`/`auth.uid()` no INSERT — o que o cliente mandar de quem/quando é
  descartado (a lição do `vis`/`sec`).
- ⛔ **FORA:** conciliação recebimento→pedido e recebimento→AP (precisam de
  handler real, Lei 7 — declarado NÃO CONSTRUÍDO); SKU/catálogo (é `po` Sol
  Único / capacidade futura); inspeção de qualidade (é o `chk` genérico, por id
  solto); Storage de nota/foto (capacidade do Core, não construída — `note` é
  texto). `consumes` VAZIO.

## 1. AS PEÇAS

- `recv.receipts` — o livro: `order_id` (uuid solto, opcional), `order_ref`
  (texto, carimbado pela tela), `item` (texto livre, obrigatório), `quantity`
  (numeric, `> 0`, SEM teto), `received_on` (data, obrigatória), `note` (texto,
  opcional), `received_at`/`received_by` (carimbo do servidor), `created_at`.
  **Sem status. Sem updated_at.**
- Gatilhos: carimbo do servidor no nascimento (`before insert`); imutabilidade
  (`before update or delete` → RAISE `42501`); emissão do fato por INSERT.
- `@alsham/recv`: `validateNewReceipt` (item obrigatório; quantidade `> 0` sem
  teto; `received_on` no formato ISO; pedido e nota opcionais), `orderReceipts`
  (do mais recente ao mais antigo), `summarizeReceipts` (conta + soma
  quantidades). **Sem `canTransition`/`ALLOWED_TRANSITIONS` — a ausência é a
  lei.**

## 2. OS FATOS

`recv.receipt.recorded` (após INSERT). Payload autossuficiente (`orderId`,
`orderRef`, `item`, `quantity`, `receivedOn`). `consumes` VAZIO (Lei 7 — sem
redeploy do `apps/api`).

## 3. AS TELAS

`/recebimentos` — placeholder por ora (o módulo vive no banco e no motor;
a tela rica é frente de UI própria, como as ondas anteriores).

## 4. AS PERMISSÕES

- `recv.receipt.record` — registrar um recebimento (o único ato do módulo).
  `can_access` usa esta permissão.

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- Conciliação recebimento→pedido — mudaria o motor do Módulo 1, que recusa linha
  de crédito (`matching.ts`) e cuja tabela de casamento tem `payable_id NOT
  NULL`. Precisa de handler real (Lei 7).
- Conciliação recebimento→AP — mesmo motivo; precisa de consumidor construído.
- SKU / catálogo de produtos — é `po` (Sol Único) / capacidade futura.
- Inspeção de qualidade no recebimento — é o `chk` genérico, por id solto.
- Storage de nota/foto do recebimento — capacidade do Core, não construída.
- Tela rica — próxima frente de UI.

## 6. ESTADO DA CONSTRUÇÃO

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `recv` (`0060_recv.sql`) | ✅ CONSTRUÍDO (arquivo; apply do dono) |
| Pacote `@alsham/recv` | ✅ CONSTRUÍDO |
| Seed (cartão procurement) | ⛔ **NÃO CONSTRUÍDO** (arquivo compartilhado — próximo passo) |
| Teste SQL `50_recv_isolation.sql` + CI | ✅ CONSTRUÍDO |
| Portal `/recebimentos` | ✅ CONSTRUÍDO (placeholder) |
| Conciliação / SKU / inspeção / Storage | ⛔ **NÃO CONSTRUÍDO** (§5) |

## 7. APPLY (dono)

`docs/runbook/APLICAR.md`. Expor o schema `recv` na Data API. `consumes`
vazio → sem redeploy do `apps/api`.
