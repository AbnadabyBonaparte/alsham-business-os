-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0066_disp.sql
-- Módulo 51: Distribuição / Despacho (Dispatch). Schema `disp`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md, na Onda
-- Onze (Fase 2 — o Domain Supply Chain), ao lado do `0063_dem.sql`.
--
-- Taxonomia: Domain 🔗 Supply Chain — capacidade *Distribuição* (§5, na linha
-- de Supply Chain ao lado de *Planejamento de demanda* e *Performance
-- logística*). Território SEPARADO de Compras. A Store o exibe na galeria
-- "Domínios Universais", na seção Supply Chain, ao lado do `dem`.
-- Spec: docs/canon/MODULO-DISP-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ O QUE ESTE MÓDULO É — O LIVRO DE DESPACHOS, ATO PONTUAL IMUTÁVEL
-- -----------------------------------------------------------------------------
-- Cada despacho é um FATO CONSUMADO: a mercadoria SAIU, alguém registrou o que
-- saiu, para onde e quanto, e o registro nasce pronto — para sempre. É a mesma
-- física do `recv` (o Módulo 45 — o livro de RECEBIMENTOS), do `sec` (a ronda)
-- e do `perf` (a avaliação): NÃO TEM COLUNA DE STATUS, não tem ciclo de vida,
-- não tem transição. Não existe "despacho aberto" nem "despacho em andamento"
-- — o despacho ACONTECE e vira linha.
--
-- ⭐ É o ESPELHO INVERTIDO do `recv`. O `recv` é a CHEGADA (a doca de entrada);
-- o `disp` é a SAÍDA (a doca de expedição). Mesma física do ATO PONTUAL
-- IMUTÁVEL; o que muda é o sentido do fluxo. Onde o `recv` guarda o pedido de
-- compra (id solto ao po), o `disp` guarda o centro de distribuição de onde a
-- carga partiu (id solto) e o destino para onde foi.
--
-- ⭐ Consequência direta: `disp.dispatches` **NÃO TEM `allowed_transition`** e
-- **NÃO TEM `updated_at`** (não há o que tocar num fato que não muda). O
-- cliente não tem NENHUMA porta de UPDATE nem DELETE (nem policy, nem grant);
-- e mesmo assim o gatilho abaixo recusa a reescrita até para o dono do banco
-- — a mesma física do `recv`/`occ`/`sec`/`perf`. Corrigir é registrar OUTRO
-- despacho, com nota.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA o destino TEXTO LIVRE (para onde a carga foi), a transportadora
--      TEXTO LIVRE (opcional), a quantidade (> 0), o dia do despacho e a nota
--      TEXTO LIVRE opcional. O vínculo com o centro de distribuição é OPCIONAL
--      (id solto + nome carimbado pela tela): um despacho pode existir sem
--      centro nenhum (retirada direta, brinde, amostra).
--   ❌ NÃO ENTRA roteirização/otimização de rota (é Engine/capacidade futura),
--      rastreio de transportadora (integração externa), nem conciliação
--      despacho→pedido/estoque (precisaria de handler real, Lei 7). Sem
--      SKU/catálogo (é `po` Sol Único). `consumes` VAZIO.
--   ❌ NÃO ENTRA FK ao módulo de centros de distribuição — o vínculo é id solto
--      + nome carimbado. Este arquivo NÃO conhece o schema de ninguém.
-- =============================================================================

create schema if not exists disp;

comment on schema disp is
  'Módulo Distribuição / Despacho (Dispatch). Domain supply-chain (Supply Chain) da Taxonomia — separado de Compras. O livro de despachos: cada despacho é ATO PONTUAL IMUTÁVEL, sem ciclo de vida, sem status. É o espelho INVERTIDO do recv (a saída, onde o recv é a chegada). O vínculo com o centro de distribuição é por ID SOLTO (dc_center_id) + nome carimbado pela tela — sem FK cruzada. Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — a única porta do módulo para o mundo. É lei.
-- =============================================================================

create or replace function disp.emit_event(
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
  if p_event_type not like 'disp.%' then
    raise exception 'disp.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'disp',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function disp.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function disp.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'disp.dispatch.record');
$$;

-- =============================================================================
-- 2. DISPATCHES — ⭐⭐ O DESPACHO: ATO PONTUAL, SEM CICLO, IMUTÁVEL DESDE O 1º
-- -----------------------------------------------------------------------------
-- NENHUMA coluna de status. NENHUMA função allowed_transition. NENHUM
-- updated_at. O registro nasce pronto — e nunca mais muda. O cliente não tem
-- NENHUMA porta de UPDATE nem DELETE (nem policy, nem grant); e mesmo assim o
-- gatilho da §2.2 recusa a reescrita até para o dono do banco — física do recv.
-- =============================================================================

create table disp.dispatches (
  id             uuid           primary key default gen_random_uuid(),
  tenant_id      uuid           not null references core.tenants (id) on delete cascade,
  -- ⭐ ID SOLTO ao centro de distribuição — SEM FK cruzada (Lei do Lego).
  -- Opcional: um despacho pode não ter centro (retirada direta, amostra).
  dc_center_id   uuid,
  -- O nome do centro carimbado pela TELA — sobrevive ao redesenho do cadastro.
  dc_center_name text           not null default '',
  -- ⭐ Para onde a carga foi — TEXTO LIVRE, obrigatório.
  destination    text           not null check (length(btrim(destination)) > 0),
  -- A transportadora — TEXTO LIVRE, opcional.
  carrier        text           not null default '',
  -- ⭐ Quanto saiu. > 0 — não se despacha quantidade nula nem negativa.
  quantity       numeric(18, 4) not null check (quantity > 0),
  -- O dia que a carga partiu.
  dispatched_on  date           not null,
  note           text           not null default '',
  -- ⭐ Os carimbos do FATO — sempre do servidor, nunca do formulário.
  dispatched_at  timestamptz    not null default now(),
  dispatched_by  uuid           references auth.users (id) on delete set null,
  created_at     timestamptz    not null default now(),
  constraint disp_dispatches_id_tenant unique (id, tenant_id)
);

create index disp_dispatches_book_idx
  on disp.dispatches (tenant_id, dispatched_on desc, created_at desc);
create index disp_dispatches_center_idx
  on disp.dispatches (tenant_id, dc_center_id)
  where dc_center_id is not null;

alter table disp.dispatches enable row level security;
alter table disp.dispatches force row level security;

create policy disp_dispatches_select on disp.dispatches
  for select to authenticated
  using (disp.can_access(tenant_id));

create policy disp_dispatches_insert on disp.dispatches
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'disp.dispatch.record'));

-- ⛔ SEM policy de UPDATE e SEM policy de DELETE — o despacho registrado é fato
-- consumado; não existe porta para reescrevê-lo.

-- -----------------------------------------------------------------------------
-- 2.1 O carimbo é do servidor — o que o cliente mandar de quem/quando é descartado
-- -----------------------------------------------------------------------------

create or replace function disp.guard_dispatch_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.dispatched_at := now();
  new.dispatched_by := (select auth.uid());
  return new;
end;
$$;

create trigger disp_dispatches_stamp
  before insert on disp.dispatches
  for each row execute function disp.guard_dispatch_insert();

-- -----------------------------------------------------------------------------
-- 2.2 ⭐⭐ IMUTÁVEL — nem o dono do banco reescreve o despacho registrado
-- -----------------------------------------------------------------------------

create or replace function disp.guard_dispatch_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'o despacho é fato consumado: não se edita nem se apaga. Corrigir é registrar outro, com nota.'
    using errcode = '42501';
end;
$$;

create trigger disp_dispatches_immutable
  before update or delete on disp.dispatches
  for each row execute function disp.guard_dispatch_immutable();

-- =============================================================================
-- 3. OS FATOS — payload AUTOSSUFICIENTE (o centro pelo nome carimbado, id solto)
-- =============================================================================

create or replace function disp.dispatch_payload(p disp.dispatches)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'dispatchId',   p.id,
    'dcCenterId',   p.dc_center_id,
    'dcCenterName', p.dc_center_name,
    'destination',  p.destination,
    'carrier',      p.carrier,
    'quantity',     p.quantity,
    'dispatchedOn', p.dispatched_on
  );
$$;

comment on function disp.dispatch_payload(disp.dispatches) is
  'O envelope de um despacho — AUTOSSUFICIENTE, com o centro pelo nome carimbado (id solto). Quem escuta não faz join.';

create or replace function disp.on_dispatch_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform disp.emit_event(new.tenant_id, 'disp.dispatch.recorded', disp.dispatch_payload(new));
  return new;
end;
$$;

create trigger disp_dispatches_emit_recorded
  after insert on disp.dispatches
  for each row execute function disp.on_dispatch_recorded();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema disp                  from public, anon, authenticated;
revoke all on all tables    in schema disp from public, anon, authenticated;
revoke all on all functions in schema disp from public, anon, authenticated;

grant usage on schema disp to authenticated;

-- ⛔ SÓ SELECT e INSERT: reescrever/apagar não existe (o despacho é fato).
grant select, insert on disp.dispatches to authenticated;

grant execute on function disp.can_access(uuid) to authenticated;

-- `disp.emit_event` NÃO é concedida. `disp.dispatch_payload` é encanamento do
-- gatilho. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhuma coluna de status. Nenhuma allowed_transition. Nenhum
-- updated_at. Nenhum SKU/catálogo. Nenhum vínculo com FK ao centro (id solto +
-- nome carimbado). Nenhum objeto fora de `disp`. Nenhuma leitura de schema
-- alheio. `consumes` VAZIO (Lei 7).
-- =============================================================================
