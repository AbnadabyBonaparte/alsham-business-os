# MODULO-RFQ-SPEC — Módulo 44: Cotações / RFQ

**Domain 📦 Compras · capacidade _Cotações_ · `module_id = rfq` · schema `rfq`**
Onda Dez (Fase 2 — completar o Domain Compras). Migration `0059_rfq.sql`,
pacote `@alsham/rfq`, teste `49_rfq_isolation.sql`.

---

## 0. AS DECISÕES DE CANON

- ⭐ **A IDENTIDADE É A DO `quote`, RE-PERGUNTADA.** A RFQ reusa a física do
  `quote`: nasce `draft`, **ENVIAR (draft→open) CONGELA o conteúdo** (título,
  descrição e itens não mudam mais), e os fins são **TERMINAIS** (refazer é
  cotação nova — a régua do documento). Copiar sem pensar e divergir sem
  escrever são o mesmo erro: cada decisão foi refeita.
- ⭐ **O DIVERGE do `quote` — assinado no `lifecycle.test.ts`.** O terminal do
  `quote` é a **resposta do CLIENTE** (`accepted`/`declined` — a contraparte
  responde à proposta que a empresa fez). O terminal da RFQ é a **escolha do
  COMPRADOR**: `awarded` (o comprador PREMIA um fornecedor vencedor, via
  `awarded_supplier_id` **id solto**) ou `cancelled` (encerrada sem vencedor,
  com razão). No `quote` a empresa PROPÕE; na RFQ a empresa PERGUNTA ao mercado
  e DECIDE. O teste lê as duas migrations e exige `quote: sent→accepted` ×
  `rfq: open→awarded`.
- ⭐ **O vencedor é ID SOLTO + nome carimbado** (o padrão do `deal`), nunca FK a
  `vendor`: a RFQ não conhece o schema do fornecedor. O `awarded_supplier_name`
  vem da tela; `awarded_at`/`awarded_by` são do SERVIDOR.
- ⭐ **Uma coerência de estado na CONSTRAINT:** `status='awarded'` ⇔
  `awarded_supplier_id is not null and awarded_at is not null`. Fora de
  `awarded`, não há vencedor. Estado e carimbo contam a mesma história ou um
  mente.
- ⭐ **Itens em TEXTO LIVRE** (anti-viés): `item` + `quantity` + `unit` (unidade
  texto livre, opcional). O que se cota é vocabulário de cada compra — nunca
  enum, nunca catálogo/SKU.
- ⛔ **FORA:** a coleta estruturada de preços por fornecedor (cada fornecedor
  respondendo com seu preço) é capacidade futura — aqui a RFQ registra **o que**
  se pede e **quem** ganhou; catálogo/SKU/NCM; preço-alvo; integração
  cotação→pedido (`po`) ou cotação→AP.

## 1. AS PEÇAS

- `rfq.requests` — o cabeçalho: `title` (texto livre, obrigatório),
  `description` (texto livre, opcional), `status`
  (`draft`/`open`/`awarded`/`cancelled`), `awarded_supplier_id` (id solto),
  `awarded_supplier_name`, `awarded_at`, `awarded_by`, `cancel_reason`,
  carimbos. Constraint de coerência do prêmio.
- `rfq.request_lines` — os itens cotados: `item` (texto livre, obrigatório),
  `quantity` (> 0), `unit` (texto livre, opcional), FK tenant-safe
  `(request_id, tenant_id)`.
- `rfq.allowed_transition()` — espelho de `ALLOWED_TRANSITIONS` em `@alsham/rfq`:
  `draft→open`, `draft→cancelled`, `open→awarded`, `open→cancelled`.
- Gatilhos: nascimento sempre `draft` + autor do servidor; **conteúdo e linhas
  congelam fora do rascunho**; transição para `awarded` gated por
  `rfq.request.award` (carimba `awarded_at`/`awarded_by`, exige vencedor);
  cancelamento gated por `rfq.request.manage` (exige razão); emissão de fato.

## 2. OS FATOS

`rfq.request.registered` (insert) · `rfq.request.opened` (draft→open) ·
`rfq.request.awarded` (→awarded) · `rfq.request.cancelled` (→cancelled).
Payload autossuficiente (inclui os itens e o carimbo do prêmio). Não há evento
de edição de rascunho (Lei 7 — sem consumidor, sem excesso). `consumes` VAZIO
(sem redeploy do `apps/api`).

## 3. AS TELAS

`/cotacoes` — placeholder por ora (o módulo vive no banco e no motor; a tela
rica é frente de UI própria, como as ondas anteriores).

## 4. AS PERMISSÕES

- `rfq.request.manage` — criar/editar rascunho, incluir itens, **enviar** ao
  mercado e **cancelar** (com razão).
- `rfq.request.award` — **premiar** o fornecedor vencedor (a decisão de compra).
- `rfq.can_access` = OR das duas.

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- Coleta estruturada de preços por fornecedor (respostas de cada cotado) —
  capacidade futura (integração/UI própria).
- Vínculo cotação→pedido (`po`) e cotação→AP — não construído.
- Catálogo/SKU/NCM, preço-alvo, tabela de preço — fora do cadastro.
- Tela rica — próxima frente de UI.

## 6. ESTADO DA CONSTRUÇÃO

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `rfq` (`0059_rfq.sql`) | ✅ CONSTRUÍDO (arquivo; apply do dono) |
| Pacote `@alsham/rfq` | ✅ CONSTRUÍDO |
| Seed (cartão procurement) | ✅ CONSTRUÍDO |
| Teste SQL `49_rfq_isolation.sql` + CI | ✅ CONSTRUÍDO |
| Portal `/cotacoes` | ✅ CONSTRUÍDO (placeholder) |
| Coleta de preços / cotação→po / cotação→AP | ⛔ **NÃO CONSTRUÍDO** (§5) |

## 7. APPLY (dono)

`docs/runbook/APLICAR.md §24`. Expor o schema `rfq` na Data API. `consumes`
vazio → sem redeploy do `apps/api`.
