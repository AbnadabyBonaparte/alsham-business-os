# 💇 MÓDULO 97 — AGENDAMENTO

## ALSHAM Business OS™ · Especificação do módulo · Vertical `beauty`

> `module_id` = `booking`. Módulo do Vertical 💇 Beleza & Estética — um dos
> cartões VERTICAL do catálogo. Migration `0112_booking.sql` · pacote
> `@alsham/booking` · teste `102_booking_isolation.sql`. **ARQUIVO — apply é ato
> do dono. NÃO MERGEIE — o merge é do dono.**

---

## 0. AS DECISÕES DE CANON

- ⭐ **REAPROVEITA a física do no-show do `appointment` (Módulo da Saúde).** A
  agenda precisa registrar QUE O CLIENTE FALTOU — some a falta e a agenda mente
  sobre a ocupação da cadeira e o histórico do cliente. O ciclo é
  `scheduled → attended | no_show | cancelled`, os **três fins TERMINAIS** (o
  agendamento é evento no tempo; quem remarca abre OUTRO). Enquanto `scheduled`,
  o horário se remarca (`manage`); marcar o desfecho é decisão (`decide`),
  carimbada pelo servidor.
- ⭐⭐ **O DIVERGE ASSINADO do `appointment` — escrito de propósito:**
  1. **o cliente é a contraparte do `crm` por ID SOLTO (`client_id`), NÃO um
     `patient` e NÃO PHI.** Agendar um corte não é ato de saúde. Por isso este
     módulo **NÃO tem a trilha de LEITURA clínica** (`access_log`/`read_*()`) do
     `record`/`exam`/`prescription`: fica no write-trail simples do
     `appointment`. O `client_id` é OPCIONAL (o encaixe/walk-in não tem
     cadastro), com o nome carimbado pela tela.
  2. **o serviço é `service` TEXTO LIVRE** ("corte"/"coloração"/"limpeza de
     pele") — NUNCA enum. O salão de bairro e a clínica estética avançada usam o
     mesmo módulo sem uma linha diferente (a Lei 3 / anti-viés, como o registro
     profissional texto livre do `appointment`).
  3. **o profissional é ID SOLTO (`professional_id`)** ao módulo `professional`
     — sem FK, sem ler aquele schema (Lei do Lego).
- ⚠️ **O status `no_show`, o fato `.missed`.** O status obedece ao vocabulário
  do domínio; o FATO emitido é `booking.booking.missed` — o outbox recusa `_` no
  verbo. Exatamente como o `appointment` mapeia `no_show → .missed`.
- ⭐ **Duas permissões, o par manage/decide.** `booking.booking.manage` cria e
  remarca enquanto agendado; `booking.booking.decide` marca o desfecho
  (comparecer/faltar/cancelar). Cancelar exige razão escrita (check); os demais
  desfechos não.
- ⛔ **Comissões, pacotes, fidelidade e estoque de produtos FORA nesta onda.**
  As outras capacidades da Beleza (§6 da Taxonomia) são módulos à parte — o
  `booking` é só a agenda.

---

## 1. AS PEÇAS

- **`booking.bookings`** — o agendamento: `client_id` (id solto ao crm,
  **opcional**) + `client_name` (texto livre, obrigatório), `professional_id`
  (id solto ao módulo professional, opcional), `service` (texto livre,
  obrigatório), `scheduled_at` (timestamptz, obrigatório), `status`
  (`scheduled`/`attended`/`no_show`/`cancelled`), `cancel_reason` (obrigatório
  só quando `cancelled`), `decided_at`/`decided_by` carimbados pelo servidor no
  desfecho. RLS `enable`+`force`; sem DELETE; nasce `scheduled`.

---

## 2. OS FATOS

`booking.booking.scheduled` · `booking.booking.attended` ·
`booking.booking.missed` (o no-show) · `booking.booking.cancelled`. O envelope
leva o cliente/profissional pelo id solto (+ nome do cliente) e o serviço —
nunca a razão do cancelamento. Quem escuta não faz join. ⚠️ A remarcação
(mudança de horário/profissional enquanto agendado) **não emite fato**: não está
no manifesto (Tudo pelo manifesto) — o calendário é plano, o fato é o desfecho.

---

## 3. AS TELAS

Território de outra frente. O motor (`@alsham/booking`) entrega a régua:
`validateNewBooking`, `canReschedule`, `isTerminal`, `requiresReason`,
`orderBookings`, `summarize`.

---

## 4. AS PERMISSÕES

- `booking.booking.manage` — criar um agendamento e remarcá-lo enquanto ainda
  está agendado.
- `booking.booking.decide` — marcar o desfecho: comparecimento, falta (no-show)
  ou cancelamento.

---

## 5. ⛔ NÃO CONSTRUÍDO — declarado peça a peça

- **Cruzar com `crm.*` ou `professional.*`** (ex.: puxar o nome do cliente ou do
  profissional por evento) — integração futura, `consumes` **VAZIO** nesta onda
  (Lei 7).
- **Comissão do profissional / faturamento do serviço** — o `service` é texto;
  o sistema não multiplica, não gera título a receber, não fatura. É a
  capacidade *Comissões* da Beleza, módulo à parte.
- **Pacotes, fidelidade, estoque de produtos** — as demais capacidades da
  Beleza (§6), módulos à parte.
- **Confirmação/lembrete por WhatsApp/SMS** — o módulo NÃO envia nada (a lição
  do `dun`); integração futura.
- **Trilha de leitura clínica** — o `booking` NÃO é PHI; agendar um corte não é
  ato de saúde. FORA por natureza.

---

## 6. ESTADO DA OBRA — o que existe e o que não existe

✅ **CONSTRUÍDO** — **arquivo no disco, ainda não aplicado**. A migration
`0112_booking.sql`, o pacote `@alsham/booking` (manifesto, tipos, motor e os três
testes de pacote) e o teste `102_booking_isolation.sql` existem no disco.
`consumes` vazio. **Não aplicado em produção** — aplicar é ato do dono.

---

## 7. APPLY (dono)

Expor o schema `booking` na Data API. `consumes` vazio → **sem redeploy do
`apps/api`**. Vínculos por ID SOLTO (crm/professional) — o mapa SCHEMA_DE do CI
reprova a leitura de schema alheio.
