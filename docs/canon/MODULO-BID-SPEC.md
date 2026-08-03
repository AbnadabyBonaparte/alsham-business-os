# MODULO-BID-SPEC — Módulo 87: Licitações / Bid

**Vertical 🏛 Governo · capacidade _Licitações_ · `module_id = bid` · schema `bid`**
Onda Governo (Fase 3 — o Vertical 🏛 Governo). Migration `0107_bid.sql`, pacote
`@alsham/bid`, teste `97_bid_isolation.sql`. Ver
`docs/canon/ONDA-GOVERNO-DECISOES.md` (capacidade #3).

---

## 0. AS DECISÕES DE CANON

- ⭐ **A IDENTIDADE É A DO `rfq`, RE-PERGUNTADA.** A licitação reusa a física do
  `rfq` (que já reusava a do `quote`): nasce `draft`, **PUBLICAR O EDITAL
  (draft→open) CONGELA o conteúdo** (título, descrição do edital, modalidade e
  itens não mudam mais), e os fins são **TERMINAIS** (refazer é licitação nova —
  a régua do documento). Quem DECIDE o fim é quem CONDUZ (o órgão), não o
  fornecedor. Copiar sem pensar e divergir sem escrever são o mesmo erro: cada
  decisão foi refeita.
- ⭐ **O DIVERGE do `rfq` — assinado no `lifecycle.test.ts`.** O terminal do
  `rfq` é `awarded` — o comprador **PREMIA** (ato comercial neutro, `open →
  awarded`). O terminal da licitação é `homologated` — a
  **HOMOLOGAÇÃO/ADJUDICAÇÃO**, o ato PÚBLICO mais SOLENE da Lei 14.133 (`open →
  homologated`). O nome É a decisão: publicar edital → receber propostas →
  julgar → homologar. `awarded` seria o vocabulário privado; o Estado homologa.
  O teste lê as duas migrations e exige `rfq: open→awarded` × `bid:
  open→homologated`.
- ⭐ **O vencedor é ID SOLTO + nome carimbado** (o padrão do `rfq`/`deal`), nunca
  FK a `vendor`: a licitação não conhece o schema do fornecedor. O
  `homologated_bidder_name` vem da tela; `homologated_at`/`homologated_by` são do
  SERVIDOR.
- ⭐ **Uma coerência de estado na CONSTRAINT:** `status='homologated'` ⇔
  `homologated_bidder_id is not null and homologated_at is not null`. Fora de
  `homologated`, não há vencedor. Estado e carimbo contam a mesma história ou um
  mente.
- ⭐ **A MODALIDADE em TEXTO LIVRE** (anti-viés): "pregão eletrônico",
  "concorrência", "dispensa", "credenciamento"… — o que muda por lei e por porte
  de órgão nunca vira enum, que envelheceria com a norma.
- ⭐ **Itens em TEXTO LIVRE** (anti-viés): `item` + `quantity` + `unit` (unidade
  texto livre, opcional). O que se licita é vocabulário de cada compra — nunca
  enum, nunca catálogo/SKU.
- ⭐ **`bid.proposals` — a peça que a licitação tem e o `rfq` deixou FORA.** No
  `rfq` a coleta estruturada de preços por fornecedor foi declarada capacidade
  futura; na compra PÚBLICA a proposta recebida é PARTE do rito. É um livro
  **IMUTÁVEL** (a física do `occ`/`recv`, duas camadas: cliente sem porta de
  UPDATE/DELETE, gatilho que recusa até para o dono do banco) — proposta
  registrada não se rasura (corrigir é registrar outra). **Só se recebe proposta
  na JANELA ABERTA do edital** (`status='open'`). O licitante é ID SOLTO + nome
  carimbado; o valor em centavos (`>= 0`).
- ⛔ **FORA — a PUBLICAÇÃO NO PNCP (Portal Nacional de Contratações Públicas):**
  é integração certificada com o Estado — o "NF-e da compra pública" — e cai na
  **Lei 3**. Nenhuma linha da migration fala com o PNCP. Também FORA: julgamento
  automático de propostas (ato de comissão, não de máquina); catálogo/SKU/NCM;
  preço-alvo estruturado; integração licitação→contrato.

## 1. AS PEÇAS

- `bid.tenders` — o cabeçalho: `title` (texto livre, obrigatório), `description`
  (o edital, texto livre, opcional), `modality` (texto livre, opcional), `status`
  (`draft`/`open`/`homologated`/`cancelled`), `homologated_bidder_id` (id solto),
  `homologated_bidder_name`, `homologated_at`, `homologated_by`, `cancel_reason`,
  carimbos. Constraint de coerência da homologação.
- `bid.lines` — os itens licitados: `item` (texto livre, obrigatório),
  `quantity` (> 0), `unit` (texto livre, opcional), FK tenant-safe
  `(tender_id, tenant_id)` — INTRA-schema.
- `bid.proposals` — as propostas dos licitantes (livro imutável): `bidder_id`
  (id solto, opcional), `bidder_name` (obrigatório), `amount_cents` (>= 0),
  `currency` (default `BRL`), `note` (opcional), carimbos. FK tenant-safe
  `(tender_id, tenant_id)` — INTRA-schema. Sem UPDATE/DELETE.
- `bid.allowed_transition()` — espelho de `ALLOWED_TRANSITIONS` em `@alsham/bid`:
  `draft→open`, `draft→cancelled`, `open→homologated`, `open→cancelled`.
- Gatilhos: nascimento sempre `draft` + autor do servidor; **conteúdo e linhas
  congelam fora do rascunho**; **proposta só na janela aberta + imutável**;
  transição para `homologated` gated por `bid.tender.homologate` (carimba
  `homologated_at`/`homologated_by`, exige vencedor); cancelamento gated por
  `bid.tender.manage` (exige razão); emissão de fato.

## 2. OS FATOS

`bid.tender.registered` (insert) · `bid.tender.opened` (draft→open) ·
`bid.tender.homologated` (→homologated) · `bid.tender.cancelled` (→cancelled).
Payload autossuficiente (inclui os itens e o carimbo da homologação) — ⛔ **as
propostas NÃO entram no envelope** (dado de disputa). Não há evento de edição de
rascunho nem de recebimento de proposta (Lei 7 — sem consumidor, sem excesso).
`consumes` VAZIO (sem redeploy do `apps/api`).

## 3. AS TELAS

`/licitacoes` — placeholder por ora (o módulo vive no banco e no motor; a tela
rica é frente de UI própria, como as ondas anteriores).

## 4. AS PERMISSÕES

- `bid.tender.manage` — criar/editar rascunho, incluir itens, **publicar** o
  edital, **registrar propostas** e **cancelar** (com razão).
- `bid.tender.homologate` — **homologar** o licitante vencedor (o ato de decisão
  da licitação, Lei 14.133).
- `bid.can_access` = OR das duas.

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- **Publicação no PNCP** (Portal Nacional de Contratações Públicas) — integração
  certificada com o Estado (Lei 3). Nunca schema.
- Julgamento automático de propostas (classificação/desclassificação) — ato de
  comissão, não de máquina.
- Vínculo licitação→contrato (`ctr`) e licitação→AP — não construído.
- Catálogo/SKU/NCM, preço-alvo estruturado, tabela de preço — fora do cadastro.
- Tela rica — próxima frente de UI.

## 6. ESTADO DA CONSTRUÇÃO

| Peça | Estado |
|---|---|
| Spec (este arquivo) | ✅ CONSTRUÍDO |
| Schema `bid` (`0107_bid.sql`) | ✅ CONSTRUÍDO (arquivo; apply do dono) |
| Pacote `@alsham/bid` | ✅ CONSTRUÍDO |
| Seed (cartão government) | ⏳ o pai encaixa (wiring) |
| Teste SQL `97_bid_isolation.sql` + CI | ✅ CONSTRUÍDO |
| Portal `/licitacoes` | ⏳ placeholder (frente de UI futura) |
| PNCP / julgamento / licitação→ctr | ⛔ **NÃO CONSTRUÍDO** (§5) |

## 7. APPLY (dono)

Expor o schema `bid` na Data API. `consumes` vazio → sem redeploy do `apps/api`.
