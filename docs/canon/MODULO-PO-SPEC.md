# 📦 MÓDULO 6 — COMPRAS (PEDIDOS DE COMPRA)
## ALSHAM Business OS™ · Especificação do módulo · Domain `procurement`

> Leitura obrigatória para quem for mexer no schema `po` ou no pacote
> `@alsham/purchase-orders`. **Leia junto com [MODULO-AP-SPEC](MODULO-AP-SPEC.md):**
> o ciclo de vida daqui foi re-perguntado contra o do Contas a Pagar.
>
> Em divergência com `docs/canon/`, o canon vence. Este documento **é** canon.

---

## 0. AS DECISÕES DE CANON

**`module_id` = `po`.** O CORE-SPEC define o evento como `<moduleId>.<agregado>.<fato>`
e o cinto de `emit_event()` confere o prefixo. Com eventos em `po.*`, qualquer
outro id faria a porta de saída recusar os próprios eventos. O pacote é
`@alsham/purchase-orders`; o nome na Store é *Compras (Pedidos)*.

**`domain_key` = `procurement`** — [Taxonomia](TAXONOMIA-EMPRESARIAL-ALSHAM.md) / `DomainKey` em `@alsham/core`,
bloco **📦 Compras (9)**: Solicitações · Cotações · Aprovações · Fornecedores ·
**Pedidos** · **Recebimento** · Contratos de fornecimento · Avaliação de
fornecedores · Estoque mínimo.

Este módulo entrega **só Pedidos + Recebimento do pedido**. Solicitações,
cotações, aprovações de compra, catálogo/SKU/NCM, centro de custo e supply
chain são capacidades próprias — **não entram** (Lei anti-viés + Lei 7).

**`consumes` = VAZIO.** Protocolo paralelo (PR de guerra / composição). A
integração óbvia (pedido recebido → título no `ap`) está **NÃO CONSTRUÍDA** —
ver §2.3.

Pedreira Inteligência de Compras (`alshamglobalcommerce/docs/candidatas/`):
**NÃO VERIFICADO** neste repositório nesta etapa (caminho local/remoto não
lido aqui). O registro nasce para um dia alimentar aquela leitura; o dossiê
não ditou coluna nenhuma.

---

## 1. ⭐ O QUADRO DO ESPELHO — AP/AR re-perguntados

| Decisão do irmão | Resposta no `po` | Por quê |
|---|---|---|
| AP nasce `open` (já é dívida) | ⛔ **DIVERGE** — nasce `draft` | Pedir tem fase de rascunho antes de comprometer o fornecedor |
| `external_ref` único por tenant | ✅ **mantido** | o pedido não entra duas vezes; chave de quem projetar |
| `currency` sem default | ✅ **mantido** | moeda presumida é viés |
| `supplier_name` + `counterparty_tax_id` | ✅ **mantido** (mesmos nomes) | neutro de país; alinhado ao AP/recon |
| cancelar é status, nunca `delete` | ✅ **mantido** | pedido apagado some da trilha |
| permissão própria para cancelar | ✅ **mantido** (`po.order.cancel`) | registrar ≠ matar |
| `settled`/`received` → `cancelled` | ✅ **mantido espírito** — `received → cancelled` **não existe** | pedido já recebido não se apaga; devolução é capacidade futura |
| AP recusa pagar a maior | ⛔ **DIVERGE** — **receber qty a maior é permitido** | alinhado ao AR: o fornecedor entregou; mentir na quantidade seria pior |
| duas permissões (manage/cancel) | ⛔ **DIVERGE** — **terceira** `po.order.receive` | comprador ≠ quem confere recebimento |
| itens / catálogo | ⛔ **DIVERGE do ERP típico** — linha é texto + qty + unitário em cents; **sem SKU/NCM** | catálogo é capacidade própria |

### Ciclo de vida

```
draft → submitted → partially_received → received
  ↓         ↓              ↓
cancelled cancelled    cancelled
```

- `received` e `cancelled` são terminais para cancelamento (não se cancela o já recebido).
- Status de recebimento: `qty_received >= quantity` em **todas** as linhas ⇒ `received`;
  alguma linha com recebimento e não todas completas ⇒ `partially_received`.

---

## 2. O QUE ATRAVESSA A FRONTEIRA

### 2.1 O módulo EMITE

| Evento | Quando |
|---|---|
| `po.order.registered` | o pedido nasceu (inclui rascunho) |
| `po.order.updated` | mudou fato: status, totais, itens materiais, quantidades recebidas |
| `po.order.cancelled` | o pedido foi cancelado |

**Corrigir só a descrição cosmética do cabeçalho não emite.** Payload
**autossuficiente COM os itens** (array): quem escuta não faz join em `po.*`.

### 2.2 O módulo CONSOME: vazio

Lei 7: sem handler, sem promessa.

### 2.3 ⛔ NÃO CONSTRUÍDO — pedido recebido → Contas a Pagar

Caminho declarado (não implementado):

1. Este módulo emite `po.order.updated` (ou fato dedicado futuro) com
   `status=received` e itens no payload.
2. Um consumidor no **`ap`** (ou projeção) traduz o fato em título a pagar —
   acoplado só ao **tipo do evento**, sem importar `@alsham/purchase-orders`.
3. Exige handler + `consumes` no manifesto do AP + inscrição em `apps/api` +
   teste — **outra etapa**.

---

## 3. PERMISSÕES

| Chave | Quem |
|---|---|
| `po.order.manage` | criar/editar rascunho, enviar (`submitted`) |
| `po.order.cancel` | cancelar (status) |
| `po.order.receive` | registrar quantidades recebidas / avançar recebimento |

O produto PERMITE as três no mesmo papel; não PRESUME.

---

## 4. ESTADO DA CONSTRUÇÃO

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `po` (`0017_po.sql`) | ✅ CONSTRUÍDO (arquivo; apply do dono) |
| Pacote `@alsham/purchase-orders` | ✅ CONSTRUÍDO |
| Seed (6º cartão) | ✅ CONSTRUÍDO |
| Testes SQL + CI | ✅ CONSTRUÍDO |
| Portal `/compras` | ✅ CONSTRUÍDO |
| Consumidor → `ap` | ⛔ **NÃO CONSTRUÍDO** (§2.3) |
| Cotação / aprovação / catálogo | ⛔ fora de escopo |

---

## 5. APPLY (dono)

1. Aplicar `0017_po.sql` depois da cadeia vigente.
2. Reaplicar seed (idempotente; `do update`).
3. **Expor schema `po` na Data API** (Project Settings → API → Exposed schemas).
4. Instalar o módulo pela Store no tenant.

Nenhum agente aplica em produção.
