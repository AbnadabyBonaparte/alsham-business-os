# 🎪 MÓDULO 96 — PATROCÍNIOS

## ALSHAM Business OS™ · Especificação do módulo · Vertical `events`

> **Onda Eventos (Fase 3).** `module_id` = `sponsor`. Terceiro e ÚLTIMO módulo
> da onda, e um dos cartões VERTICAL do catálogo. Migration `0111_sponsor.sql`
> · pacote `@alsham/sponsor` · teste `101_sponsor_isolation.sql`. **ARQUIVO —
> apply é ato do dono. NÃO MERGEIE — o merge é do dono.**

---

## 0. AS DECISÕES DE CANON

- ⭐⭐ **NÃO reescreve o ctr, o deal nem o evt — é a camada de patrocínio sobre
  eles, como o `lease` é a camada comercial sobre o ctr.** O contrato JURÍDICO
  do patrocínio é o `ctr` (Módulo 13); a NEGOCIAÇÃO que fechou a cota é o `deal`
  (Módulo 10); o EVENTO patrocinado é o `evt` (Módulo 11). Este módulo
  referencia os três por **ID SOLTO** (sem FK cruzada) + nome carimbado pela
  tela (`event_ref`, `contract_ref`; o `sponsor_name` já é o nome livre do
  patrocinador). Nenhuma tabela de contrato/vigência/negociação nasce em
  `sponsor`.
- ⭐ **O que É do ofício de EVENTO — e só isso mora aqui:** a **cota** de
  patrocínio (`tier`, TEXTO LIVRE — "ouro"/"prata"/"apoio"/"naming rights" é
  vocabulário de cada evento, a mesma Lei 3 do índice do ctr e do segmento do
  mall), o **valor** opcional da cota (`amount_cents` — a cota pode ser
  permuta) e os **entregáveis de ativação por evento** (`deliverables`: logo no
  palco, 10 cortesias, ativação no foyer). ⭐ É este checklist de ativação, e
  não o contrato, que distingue o `sponsor` de um `ctr` qualquer.
- ⭐ **`active ↔ archived` — a física do mall/vendor, o DIVERGE assinado do
  `lease`.** O `lease` (a outra camada-sobre-ctr do império) é `active → ended`
  TERMINAL, porque a locação é uma camada fina entre o ctr (que já tem rescisão)
  e o mall (que já volta), e não inventa física própria. O patrocínio é OUTRA
  coisa: é a RELAÇÃO com o patrocinador — mais perto do `mall.stores`/`vendor`.
  Um patrocinador que volta na edição seguinte é a MESMA relação comercial;
  obrigá-lo a nascer de novo partiria o histórico em dois. Então
  `archived → active` EXISTE, arquivar NÃO exige razão (é reversível — só o
  encerramento terminal do lease/ctr exige) e a linha arquivada NÃO congela.
- ⭐ **Duas permissões, divididas por TABELA (como no lease).**
  `sponsor.sponsorship.manage` cobre registrar E arquivar/reabrir a cota (a
  relação comercial não tem o par manage/decide do mall — mover no arquivo é o
  mesmo ofício de registrar). `sponsor.deliverable.manage` é o checklist de
  ativação, à parte — a mesma divisão agreement×report do `lease`.
- ⭐ **O entregável é MUTÁVEL — o DIVERGE do livro imutável do `lease`
  (sales_reports).** Um relatório de vendas é fato consumado (imutável); um item
  de checklist de ativação é uma PROMESSA que se acompanha (marca-se feito,
  desmarca-se). Por ser checklist e não livro de fatos, o entregável **não emite
  evento próprio** — só o servidor carimba `delivered_at`/`delivered_by`.
- ⛔ **Venda de ingresso/cortesia com pagamento FORA (Lei 3 + `canta-siriema`).**
  A "10 cortesias" mora como TEXTO no entregável, nunca como emissão de ingresso
  com valor — bilheteria é o produto `canta-siriema` do império, declarado FORA
  da onda.

---

## 1. AS PEÇAS

- **`sponsor.sponsorships`** — o patrocínio: `event_id` (id solto ao evt,
  **obrigatório**) + `event_ref`, `sponsor_name` (texto livre, obrigatório),
  `party_id` (id solto ao crm, opcional), `tier` (texto livre — a cota),
  `amount_cents`/`currency` (opcionais — a cota pode ser permuta), `contract_id`
  (id solto ao ctr, opcional) + `contract_ref`, `status` (`active`/`archived`).
  RLS `enable`+`force`; sem DELETE; nasce ativo.
- **`sponsor.deliverables`** — o checklist de ativação: `sponsorship_id` (FK
  REAL dentro do próprio schema, por `(id, tenant_id)`), `description` (texto
  livre), `delivered` (boolean) + `delivered_at`/`delivered_by` carimbados pelo
  servidor. MUTÁVEL (marca-se/desmarca-se feito); sem DELETE.

---

## 2. OS FATOS

`sponsor.sponsorship.registered` · `sponsor.sponsorship.archived` ·
`sponsor.sponsorship.reopened`. O envelope leva o evento e o contrato pelo NOME
carimbado — quem escuta não faz join nem com o evt, nem com o ctr, nem com o
crm. ⭐ Os dois fatos de status (`archived`/`reopened`) são emitidos por
simetria: numa física simétrica (`active ↔ archived`), emitir um sem o outro
seria mentira na trilha (o padrão do mall).

O entregável NÃO emite fato — é checklist de acompanhamento, não livro de fatos
de negócio (o DIVERGE do `lease.report.recorded`).

---

## 3. AS TELAS

Território de outra frente. O motor (`@alsham/sponsor`) entrega a régua:
`validateNewSponsorship`, `validateNewDeliverable`, `canArchive`, `canReopen`,
`orderSponsorships`, `summarize`, `deliverableProgress`.

---

## 4. AS PERMISSÕES

- `sponsor.sponsorship.manage` — registrar o patrocínio (evento/contrato/
  contraparte por id solto, cota e valor) **e** arquivá-lo ou reabri-lo.
- `sponsor.deliverable.manage` — cadastrar os entregáveis de ativação e
  marcá-los como cumpridos.

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- **Cruzar com `ctr.contract.*`, `deal.*` ou `evt.*`** (ex.: arquivar o
  patrocínio quando o contrato rescinde, ou puxar o nome do evento por evento)
  — integração futura, `consumes` **VAZIO** nesta onda (Lei 7).
- **Cálculo de cota/comissão** — o `tier` e o `amount_cents` são registrados;
  o sistema não multiplica, não gera título a receber, não fatura.
- **Venda de ingresso / cortesia como documento com valor** — bilheteria é o
  `canta-siriema` (produto do império) e é obrigação fiscal (Lei 3): FORA.
- **Contrato, vigência, reajuste, rescisão** — são do `ctr`, por id solto.
- **Negociação / funil da cota** — é do `deal`, por id solto.
- **Cadastro do evento** — é do `evt`, por id solto.

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

✅ **CONSTRUÍDO na Onda Eventos** — **arquivo, ainda não aplicado**. A migration
`0111_sponsor.sql`, o pacote `@alsham/sponsor` e o teste
`101_sponsor_isolation.sql` existem no disco. `consumes` vazio. **Não aplicado
em produção** — aplicar é ato do dono.

⚠️ O **cartão no seed** (`0001_platform.sql`) e a ligação no CI são wiring do
parent da onda; até lá, os testes de seed do pacote ficam em modo de espera
(⏭), sem reprovar.

---

## 7. APPLY (dono)

Expor o schema `sponsor` na Data API. `consumes` vazio → **sem redeploy do
`apps/api`**. Vínculos por ID SOLTO (evt/ctr/crm) — o mapa SCHEMA_DE do CI
reprova a leitura de schema alheio; a FK `deliverables → sponsorships` é
INTRA-schema e permitida.
