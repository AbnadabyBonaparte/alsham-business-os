-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0060_recv.sql
-- Módulo 45: Recebimento (Goods Receipt). Schema `recv`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md, na Onda
-- Dez (Fase 2 — completar o Domain Compras), depois do `0058_vendor.sql`.
--
-- Taxonomia: Domain 📦 Compras — capacidade *Recebimento* (§5, na linha de
-- Compras ao lado de *Fornecedores* e *Pedidos*). A Store o exibe na galeria
-- "Domínios Universais", na seção Compras, ao lado do `po` e do `vendor`.
-- Spec: docs/canon/MODULO-RECV-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ O QUE ESTE MÓDULO É — O LIVRO DE RECEBIMENTOS, ATO PONTUAL IMUTÁVEL
-- -----------------------------------------------------------------------------
-- Cada recebimento é um FATO CONSUMADO: a mercadoria chegou, alguém registrou
-- o que chegou e quanto, e o registro nasce pronto — para sempre. É a mesma
-- física do `sec` (a ronda) e do `perf` (a avaliação): NÃO TEM COLUNA DE
-- STATUS, não tem ciclo de vida, não tem transição. Não existe "recebimento
-- aberto" nem "recebimento em andamento" — o recebimento ACONTECE e vira linha.
--
-- ⭐ Consequência direta: `recv.receipts` **NÃO TEM `allowed_transition`** e
-- **NÃO TEM `updated_at`** (não há o que tocar num fato que não muda). O
-- cliente não tem NENHUMA porta de UPDATE nem DELETE (nem policy, nem grant);
-- e mesmo assim o gatilho abaixo recusa a reescrita até para o dono do banco
-- — a mesma física do `occ`/`sec`/`perf`. Corrigir é registrar OUTRO
-- recebimento, com nota.
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ A DECISÃO DE CANON — O RECEBIMENTO ACEITA A SOBRA (o paralelo recv × ar)
-- -----------------------------------------------------------------------------
-- Copiar sem pensar e divergir sem escrever são o mesmo erro (CLAUDE.md). A
-- pergunta foi feita: o recebimento pode registrar MAIS do que foi pedido?
--
-- **SIM — receber a maior é PERMITIDO.** A sobra/excedente que o fornecedor
-- entregou é um FATO do mundo real. Recusá-la obrigaria o operador a MENTIR
-- sobre o que fisicamente chegou na doca — registrar menos do que recebeu para
-- caber numa trave. Um sistema que obriga o operador a mentir para funcionar é
-- pior do que um sistema que aceita a verdade e a mostra.
--
-- É EXATAMENTE a mesma física que o `ar` (Módulo 5) já decidiu para o dinheiro
-- em `0010_ar.sql §2.1` — lá, **RECEBER A MAIOR É PERMITIDO** (não há
-- `payables_no_overpay` do lado do crédito; `received_amount_cents` pode passar
-- de `amount_cents`). O `ar` recebe dinheiro a mais; o `recv` recebe mercadoria
-- a mais. Nos dois casos: o schema recusa o que o SISTEMA controla e aceita o
-- que o MUNDO impõe.
--
-- ⭐ E há uma razão estrutural que torna a sobra silenciosa aqui: pela Lei do
-- Lego, o `recv` **NÃO LÊ o `po`** — não conhece o módulo de Pedidos, não lê o
-- schema dele, não importa nada. Então NÃO EXISTE, no schema do `recv`, uma
-- "quantidade pedida" contra a qual comparar. O `order_id` é ID SOLTO (sem FK
-- cruzada) e o `order_ref` é o número/nome do pedido carimbado pela TELA. A
-- sobra não é recusada porque não há como — e não deve haver: é fato.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA o item recebido TEXTO LIVRE (o que chegou), a quantidade (> 0), o
--      dia do recebimento e a nota TEXTO LIVRE opcional ("caixa amassada",
--      "faltou 1 volume"). O vínculo com o pedido é OPCIONAL (id solto + ref):
--      um recebimento pode existir sem pedido nenhum (doação, brinde, amostra).
--   ❌ NÃO ENTRA a conciliação recebimento→pedido (mudaria o motor do Módulo 1,
--      que recusa linha de crédito) nem recebimento→AP: declarado NÃO
--      CONSTRUÍDO (precisa de handler real, Lei 7). Sem SKU/catálogo (é `po`
--      Sol Único / capacidade futura), sem inspeção de qualidade (é `chk`
--      genérico, por id solto). `consumes` VAZIO.
-- =============================================================================

create schema if not exists recv;

comment on schema recv is
  'Módulo Recebimento (Goods Receipt). Domain procurement (Compras) da Taxonomia. O livro de recebimentos: cada recebimento é ATO PONTUAL IMUTÁVEL, sem ciclo de vida, sem status. Receber a maior é PERMITIDO (a sobra é fato — a mesma física do overpay do ar); o recv não lê o po, então não há quantidade pedida para comparar. Vínculo com o pedido por ID SOLTO (order_id) + order_ref carimbado pela tela. Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — a única porta do módulo para o mundo. É lei.
-- =============================================================================

create or replace function recv.emit_event(
  p_tenant_id      uuid,
  p_event_type     text,
  p_payload        jsonb,
  p_correlation_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
begin
  if p_event_type not like 'recv.%' then
    raise exception 'recv.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'recv',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function recv.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function recv.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'recv.receipt.record');
$$;

-- =============================================================================
-- 2. RECEIPTS — ⭐⭐ O RECEBIMENTO: ATO PONTUAL, SEM CICLO, IMUTÁVEL DESDE O 1º
-- -----------------------------------------------------------------------------
-- NENHUMA coluna de status. NENHUMA função allowed_transition. NENHUM
-- updated_at. O registro nasce pronto — e nunca mais muda. O cliente não tem
-- NENHUMA porta de UPDATE nem DELETE (nem policy, nem grant); e mesmo assim o
-- gatilho da §2.2 recusa a reescrita até para o dono do banco — física do occ.
-- =============================================================================

create table recv.receipts (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    uuid        not null references core.tenants (id) on delete cascade,
  -- ⭐ ID SOLTO ao pedido (po) — SEM FK cruzada (Lei do Lego). Opcional: um
  -- recebimento pode não ter pedido (doação, amostra, brinde).
  order_id     uuid,
  -- O número/nome do pedido carimbado pela TELA — sobrevive ao redesenho do po.
  order_ref    text        not null default '',
  -- ⭐ O que chegou — TEXTO LIVRE, obrigatório. Sem SKU/catálogo.
  item         text        not null check (length(btrim(item)) > 0),
  -- ⭐ Quanto chegou. > 0 — e SEM teto: a sobra é fato (o paralelo recv × ar).
  quantity     numeric     not null check (quantity > 0),
  -- O dia que a mercadoria chegou.
  received_on  date        not null,
  note         text        not null default '',
  -- ⭐ Os carimbos do FATO — sempre do servidor, nunca do formulário.
  received_at  timestamptz not null default now(),
  received_by  uuid        references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint recv_receipts_id_tenant unique (id, tenant_id)
);

create index recv_receipts_book_idx
  on recv.receipts (tenant_id, received_on desc, created_at desc);
create index recv_receipts_order_idx
  on recv.receipts (tenant_id, order_id)
  where order_id is not null;

alter table recv.receipts enable row level security;
alter table recv.receipts force row level security;

create policy recv_receipts_select on recv.receipts
  for select to authenticated
  using (recv.can_access(tenant_id));

create policy recv_receipts_insert on recv.receipts
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'recv.receipt.record'));

-- ⛔ SEM policy de UPDATE e SEM policy de DELETE — o recebimento registrado é
-- fato consumado; não existe porta para reescrevê-lo.

-- -----------------------------------------------------------------------------
-- 2.1 O carimbo é do servidor — o que o cliente mandar de quem/quando é descartado
-- -----------------------------------------------------------------------------

create or replace function recv.guard_receipt_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.received_at := now();
  new.received_by := (select auth.uid());
  return new;
end;
$$;

create trigger recv_receipts_stamp
  before insert on recv.receipts
  for each row execute function recv.guard_receipt_insert();

-- -----------------------------------------------------------------------------
-- 2.2 ⭐⭐ IMUTÁVEL — nem o dono do banco reescreve o recebimento registrado
-- -----------------------------------------------------------------------------

create or replace function recv.guard_receipt_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'o recebimento é fato consumado: não se edita nem se apaga. Corrigir é registrar outro, com nota.'
    using errcode = '42501';
end;
$$;

create trigger recv_receipts_immutable
  before update or delete on recv.receipts
  for each row execute function recv.guard_receipt_immutable();

-- =============================================================================
-- 3. OS FATOS — payload AUTOSSUFICIENTE (o pedido pelo ref carimbado, id solto)
-- =============================================================================

create or replace function recv.receipt_payload(p recv.receipts)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'receiptId',  p.id,
    'orderId',    p.order_id,
    'orderRef',   p.order_ref,
    'item',       p.item,
    'quantity',   p.quantity,
    'receivedOn', p.received_on
  );
$$;

comment on function recv.receipt_payload(recv.receipts) is
  'O envelope de um recebimento — AUTOSSUFICIENTE, com o pedido pelo ref carimbado (id solto). Quem escuta não faz join.';

create or replace function recv.on_receipt_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform recv.emit_event(new.tenant_id, 'recv.receipt.recorded', recv.receipt_payload(new));
  return new;
end;
$$;

create trigger recv_receipts_emit_recorded
  after insert on recv.receipts
  for each row execute function recv.on_receipt_recorded();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema recv                  from public, anon, authenticated;
revoke all on all tables    in schema recv from public, anon, authenticated;
revoke all on all functions in schema recv from public, anon, authenticated;

grant usage on schema recv to authenticated;

-- ⛔ SÓ SELECT e INSERT: reescrever/apagar não existe (o recebimento é fato).
grant select, insert on recv.receipts to authenticated;

grant execute on function recv.can_access(uuid) to authenticated;

-- `recv.emit_event` NÃO é concedida. `recv.receipt_payload` é encanamento do
-- gatilho. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhuma coluna de status. Nenhuma allowed_transition. Nenhum
-- updated_at. Nenhum teto de quantidade (a sobra é fato — recv × ar). Nenhum
-- SKU/catálogo. Nenhum objeto fora de `recv`. Nenhuma leitura de schema alheio.
-- `consumes` VAZIO (Lei 7).
-- =============================================================================
