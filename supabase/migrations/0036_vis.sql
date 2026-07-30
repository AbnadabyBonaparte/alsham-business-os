-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0036_vis.sql
-- Módulo 21: Visitas. Schema `vis`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §18,
-- depois do `0035_spc.sql`.
--
-- Taxonomia: Domain 🏭 Operações — capacidade *Visitas* (a portaria é
-- OPERAÇÃO; a *Visitas* do Domain CRM é outra coisa — a visita comercial do
-- vendedor. Sol Único: uma palavra, dois ofícios — ver a spec §0).
-- Spec: docs/canon/MODULO-VIS-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ A QUARTA IDENTIDADE — a visita é o EVENTO DE PRESENÇA, e não volta
-- -----------------------------------------------------------------------------
-- O crm reativa a contraparte (é a MESMA pessoa); o care reabre o caso (é o
-- MESMO pedido); o occ nem edita (é o FATO). A visita re-pergunta as três e
-- responde uma QUARTA coisa: a identidade é a PASSAGEM PELA PORTARIA — um
-- fato datado, como o occ, mas com dois carimbos (entrou, saiu). Quem volta
-- amanhã é visita NOVA: não existe "reabrir visita", porque a pessoa que
-- volta é a mesma (isso é ofício do crm), mas a PASSAGEM é outra. Todos os
-- fins são terminais.
--
-- -----------------------------------------------------------------------------
-- ⭐ O QUE A PORTARIA VIU NÃO SE RASURA — e o carimbo é do SERVIDOR
-- -----------------------------------------------------------------------------
-- A entrada é carimbada por now()/auth.uid() no ATO — o que o cliente
-- mandar de hora é descartado (hora digitada é livro que mente). Depois do
-- check-in, a identidade do registro (quem, documento, destino, motivo)
-- CONGELA — a física do occ: corrigir é REGISTRO NOVO apontando o errado
-- (`corrects_visit_id`), nunca rasura. Enquanto AGENDADA, edita-se à
-- vontade: agendamento é plano, não fato.
--
-- -----------------------------------------------------------------------------
-- ⭐ O DOCUMENTO NÃO PASSEIA PELO CORREIO
-- -----------------------------------------------------------------------------
-- O envelope do fato carrega o NOME e o DESTINO — nunca o documento nem o
-- contato do visitante. Dado pessoal fica na portaria, sob RLS; o correio
-- entrega o fato, não a ficha (a mesma prudência do prompt da Forja).
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA visitante NEUTRO (nome obrigatório; documento e contato TEXTO
--      LIVRE opcionais — RG, passaporte, crachá de obra: vocabulário de
--      casa), destino/anfitrião TEXTO LIVRE, motivo opcional.
--   ✅ ENTRA o agendamento OPCIONAL antes (scheduled → checked_in | no_show
--      | cancelled) — e o walk-in DIRETO, que é o caso comum da portaria.
--   ✅ ENTRA duas mãos: quem AGENDA (a recepção, o anfitrião) não é quem
--      opera a CANCELA (registrar entrada e saída).
--   ❌ NÃO ENTRA crachá/QR/catraca/foto (integração declarada), lista negra
--      (decisão jurídica — LGPD — fora POR LEI, não por preguiça),
--      recorrência de visita, credenciamento de prestador (vertical).
-- =============================================================================

create schema if not exists vis;

comment on schema vis is
  'Módulo Visitas. Domain operations da Taxonomia (a portaria é operação). O livro da portaria: entrada carimbada pelo servidor, fato consumado que não se rasura (correção é registro novo), todos os fins terminais — quem volta amanhã é visita nova. O documento não passeia pelo correio. Não cria objeto em core nem lê schema alheio.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — vigésima primeira vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function vis.emit_event(
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
  if p_event_type not like 'vis.%' then
    raise exception 'vis.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'vis',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function vis.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function vis.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'vis.visit.register')
      or core.has_permission(p_tenant_id, 'vis.visit.schedule');
$$;

create or replace function vis.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =============================================================================
-- 2. VISITS — o livro da portaria
-- =============================================================================

create table vis.visits (
  id                uuid        primary key default gen_random_uuid(),
  tenant_id         uuid        not null references core.tenants (id) on delete cascade,
  -- O visitante NEUTRO: nome obrigatório; documento e contato são opcionais
  -- e NUNCA saem no envelope.
  visitor_name      text        not null check (length(btrim(visitor_name)) > 0),
  visitor_document  text        not null default '',
  visitor_contact   text        not null default '',
  -- Para quem / para onde — texto livre: "compras", "dr. Silva", "obra 2".
  host              text        not null check (length(btrim(host)) > 0),
  reason            text        not null default '',
  status            text        not null default 'checked_in'
                    check (status in ('scheduled', 'checked_in', 'checked_out',
                                      'no_show', 'cancelled')),
  -- O agendamento (plano), quando houver.
  expected_at       timestamptz,
  -- ⭐ Os DOIS carimbos do fato — sempre do servidor.
  checked_in_at     timestamptz,
  checked_out_at    timestamptz,
  cancel_reason     text        not null default '',
  -- ⭐ Corrigir é registro NOVO apontando o errado — nunca rasura.
  corrects_visit_id uuid,
  created_at        timestamptz not null default now(),
  created_by        uuid        references auth.users (id) on delete set null,
  updated_at        timestamptz not null default now(),
  constraint vis_visits_id_tenant unique (id, tenant_id),
  constraint vis_visits_corrects_fk
    foreign key (corrects_visit_id, tenant_id)
    references vis.visits (id, tenant_id) on delete restrict,
  -- Cada estado com os carimbos que o definem — nem um a mais.
  constraint vis_visits_stamps_coherent check (
    (status = 'scheduled'   and expected_at is not null
      and checked_in_at is null and checked_out_at is null and cancel_reason = '')
    or (status = 'checked_in'  and checked_in_at is not null
      and checked_out_at is null and cancel_reason = '')
    or (status = 'checked_out' and checked_in_at is not null
      and checked_out_at is not null and cancel_reason = '')
    or (status = 'no_show'     and expected_at is not null
      and checked_in_at is null and checked_out_at is null and cancel_reason = '')
    or (status = 'cancelled'   and expected_at is not null
      and checked_in_at is null and checked_out_at is null
      and length(btrim(cancel_reason)) > 0)
  )
);

create index vis_visits_gate_idx
  on vis.visits (tenant_id, status, checked_in_at desc);

create trigger vis_visits_touch
  before update on vis.visits
  for each row execute function vis.touch_updated_at();

alter table vis.visits enable row level security;
alter table vis.visits force row level security;

create policy vis_visits_select on vis.visits
  for select to authenticated
  using (vis.can_access(tenant_id));

-- Walk-in nasce pela mão da CANCELA; agendamento nasce pela mão da AGENDA.
create policy vis_visits_insert on vis.visits
  for insert to authenticated
  with check (
    (status = 'checked_in' and core.has_permission(tenant_id, 'vis.visit.register'))
    or (status = 'scheduled' and core.has_permission(tenant_id, 'vis.visit.schedule'))
  );

create policy vis_visits_update on vis.visits
  for update to authenticated
  using (vis.can_access(tenant_id))
  with check (vis.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. O livro da portaria não se apaga.

-- -----------------------------------------------------------------------------
-- 2.1 O NASCIMENTO — só agendada ou entrando agora; o carimbo é do servidor
-- -----------------------------------------------------------------------------

create or replace function vis.guard_visit_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status not in ('scheduled', 'checked_in') then
    raise exception 'a visita nasce agendada ou entrando agora — o resto é transição'
      using errcode = '22023';
  end if;

  if new.status = 'checked_in' then
    -- ⭐ O carimbo é do servidor — a hora que o cliente mandou é descartada.
    new.checked_in_at := now();
  end if;

  new.checked_out_at := null;
  new.created_by     := (select auth.uid());

  return new;
end;
$$;

create trigger vis_visits_stamp
  before insert on vis.visits
  for each row execute function vis.guard_visit_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/visits
-- -----------------------------------------------------------------------------

create or replace function vis.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('scheduled',  'checked_in'),
    ('scheduled',  'no_show'),
    ('scheduled',  'cancelled'),
    ('checked_in', 'checked_out')
  );
$$;

comment on function vis.allowed_transition(text, text) is
  'Ciclo de vida da visita. Espelho de ALLOWED_TRANSITIONS em @alsham/visits. QUATRO pares; todos os fins terminais — a visita é o EVENTO DE PRESENÇA: quem volta amanhã é visita nova. Check-out sem check-in não existe: saída sem entrada é livro que mente.';

create or replace function vis.guard_visit_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    -- ⭐ Depois do check-in, a identidade do registro CONGELA (física do
    -- occ): o que a portaria viu não se rasura — corrigir é registro novo.
    if old.status <> 'scheduled'
       and (new.visitor_name is distinct from old.visitor_name
            or new.visitor_document is distinct from old.visitor_document
            or new.visitor_contact is distinct from old.visitor_contact
            or new.host is distinct from old.host
            or new.reason is distinct from old.reason
            or new.expected_at is distinct from old.expected_at
            or new.corrects_visit_id is distinct from old.corrects_visit_id) then
      raise exception 'o que a portaria viu não se rasura: corrigir é registrar de novo, apontando o registro errado'
        using errcode = '22023';
    end if;
    return new;
  end if;

  if not vis.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe: a visita é o evento de presença — quem volta amanhã é visita nova',
      old.status, new.status
      using errcode = '22023';
  end if;

  -- A CANCELA (entrada, saída, não veio) e a AGENDA (cancelar) são mãos
  -- distintas — a permissão é do ATO, não da tela.
  if new.status in ('checked_in', 'checked_out', 'no_show')
     and not core.has_permission(new.tenant_id, 'vis.visit.register') then
    raise exception 'operar a cancela exige a permissão vis.visit.register'
      using errcode = '42501';
  end if;

  if new.status = 'cancelled' then
    if not core.has_permission(new.tenant_id, 'vis.visit.schedule') then
      raise exception 'desmarcar a visita exige a permissão vis.visit.schedule'
        using errcode = '42501';
    end if;
    if length(btrim(new.cancel_reason)) = 0 then
      raise exception 'desmarcar exige a razão escrita: agenda que se apaga em silêncio é agenda que mente'
        using errcode = '22023';
    end if;
  end if;

  -- ⭐ Os carimbos são do servidor, no ATO.
  if new.status = 'checked_in' then
    new.checked_in_at := now();
  elsif new.status = 'checked_out' then
    new.checked_out_at := now();
  end if;

  return new;
end;
$$;

create trigger vis_visits_guard_status
  before update on vis.visits
  for each row execute function vis.guard_visit_transition();

-- =============================================================================
-- 3. OS FATOS — o envelope leva o nome e o destino; o documento fica
-- =============================================================================

create or replace function vis.visit_payload(p vis.visits)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- ⭐ SEM visitor_document e SEM visitor_contact — de propósito (cabeçalho).
  return jsonb_build_object(
    'visitId',       p.id,
    'visitorName',   p.visitor_name,
    'host',          p.host,
    'reason',        p.reason,
    'status',        p.status,
    'expectedAt',    p.expected_at,
    'checkedInAt',   p.checked_in_at,
    'checkedOutAt',  p.checked_out_at,
    'cancelReason',  p.cancel_reason,
    'correctsVisitId', p.corrects_visit_id
  );
end;
$$;

comment on function vis.visit_payload(vis.visits) is
  'O envelope de uma visita — AUTOSSUFICIENTE e SEM o documento/contato do visitante: dado pessoal fica na portaria, sob RLS; o correio entrega o fato, não a ficha.';

create or replace function vis.on_visit_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform vis.emit_event(
    new.tenant_id,
    case when new.status = 'scheduled' then 'vis.visit.scheduled'
         else 'vis.visit.arrived' end,
    vis.visit_payload(new)
  );
  return new;
end;
$$;

create trigger vis_visits_emit_created
  after insert on vis.visits
  for each row execute function vis.on_visit_created();

create or replace function vis.on_visit_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
begin
  if new.status is distinct from old.status then
    v_type := case new.status
                when 'checked_in'  then 'vis.visit.arrived'
                when 'checked_out' then 'vis.visit.departed'
                when 'no_show'     then 'vis.visit.missed'
                else 'vis.visit.cancelled'
              end;
    perform vis.emit_event(new.tenant_id, v_type, vis.visit_payload(new));
  end if;
  return new;
end;
$$;

create trigger vis_visits_emit_changed
  after update on vis.visits
  for each row execute function vis.on_visit_changed();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema vis                  from public, anon, authenticated;
revoke all on all tables    in schema vis from public, anon, authenticated;
revoke all on all functions in schema vis from public, anon, authenticated;

grant usage on schema vis to authenticated;

grant select, insert, update on vis.visits to authenticated;

grant execute on function vis.can_access(uuid) to authenticated;

-- `vis.emit_event` NÃO é concedida. `vis.visit_payload` é encanamento dos
-- gatilhos. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum crachá. Nenhuma lista negra — POR LEI. Nenhuma
-- hora digitada. Nenhum objeto fora de `vis`. Nenhuma leitura de schema
-- alheio.
-- =============================================================================
