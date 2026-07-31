-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0092_whistle.sql
-- Módulo 77: Canal de Denúncias. Schema `whistle`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §32, o
-- terceiro módulo da Onda Dezenove (Fase 3). Nasce sob `domain_key='grc'`.
--
-- Taxonomia: Domain 🏛 GRC — capacidade *Canal de denúncias* (§5).
-- Spec: docs/canon/MODULO-WHISTLE-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ A FÍSICA CENTRAL — O ANONIMATO, E POR QUE NÃO É `occ` NEM `care`
-- -----------------------------------------------------------------------------
-- A denúncia é um relato de fato consumado (a física do `occ`: nasce imutável).
-- Mas tem uma regra que NENHUM módulo anterior tem, e é o coração deste:
--
-- ⭐⭐ SE A DENÚNCIA É ANÔNIMA, O SISTEMA NUNCA REGISTRA QUEM DENUNCIOU. Não é
-- "não mostra" — é NÃO GRAVA. O denunciante está autenticado (é um membro do
-- tenant), mas o gatilho DESCARTA `auth.uid()` quando `is_anonymous`, e a coluna
-- `reporter_id` fica NULL para sempre. Guardar quem denunciou anonimamente e só
-- "esconder na tela" seria uma bomba: um vazamento, uma ordem judicial, um admin
-- curioso — e a proteção que a lei (e a decência) exige teria sido uma mentira.
-- A única forma de nunca vazar é NUNCA TER. Há teste que prova: denúncia anônima
-- tem `reporter_id` NULL mesmo com um usuário autenticado a submetendo.
--
-- ⭐ A CONFIDENCIALIDADE mora na RLS: só quem tem `whistle.report.handle` (o
-- comitê de ética) lê TODAS as denúncias. Quem só tem `whistle.report.submit`
-- pode DENUNCIAR, e vê apenas a PRÓPRIA denúncia NÃO-anônima (para acompanhar) —
-- a anônima, nem o próprio autor reencontra, porque não há identidade a casar.
--
-- ⭐ O relato CONGELA no registro (fato consumado); só o TRATAMENTO anda:
-- open → under_review → resolved/dismissed, terminais, com desfecho escrito.
--
-- ⛔ FORA: anexo/evidência (Storage do Core, não construído); notificação ao
-- denunciante (Engine de Notificações); júri/votação de comitê estruturado.
-- `consumes` VAZIO.
-- =============================================================================

create schema if not exists whistle;

comment on schema whistle is
  'Módulo Canal de Denúncias. Domain grc da Taxonomia. O relato nasce imutável (a física do occ); o tratamento anda (open → under_review → resolved/dismissed). ⭐⭐ ANONIMATO: se is_anonymous, o gatilho DESCARTA auth.uid() e reporter_id fica NULL para sempre — nunca se grava quem denunciou. Confidencialidade na RLS (só report.handle lê tudo). Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA
-- =============================================================================

create or replace function whistle.emit_event(
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
  if p_event_type not like 'whistle.%' then
    raise exception 'whistle.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'whistle',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function whistle.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

-- Quem TRATA (comitê): lê tudo, move o status.
create or replace function whistle.can_handle(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'whistle.report.handle');
$$;

create or replace function whistle.touch_updated_at()
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
-- 2. REPORTS — o livro de denúncias
-- =============================================================================

create table whistle.reports (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references core.tenants (id) on delete cascade,
  category      text        not null default '',
  subject       text        not null check (length(btrim(subject)) > 0),
  description   text        not null check (length(btrim(description)) > 0),
  is_anonymous  boolean     not null default false,
  -- ⭐⭐ O denunciante — NULL para sempre quando anônimo (o gatilho descarta).
  reporter_id   uuid        references auth.users (id) on delete set null,
  status        text        not null default 'open'
                check (status in ('open', 'under_review', 'resolved', 'dismissed')),
  resolution    text        not null default '',
  resolved_at   timestamptz,
  resolved_by   uuid        references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint whistle_reports_id_tenant unique (id, tenant_id),
  -- ⭐⭐ A LEI DO ANONIMATO NA CONSTRAINT: anônima ⇒ sem denunciante. Além do
  -- gatilho, a própria tabela recusa uma denúncia anônima COM reporter.
  constraint whistle_reports_anon_has_no_reporter check (
    not is_anonymous or reporter_id is null
  ),
  -- Encerrada (resolved/dismissed) ⇒ tem desfecho e carimbo.
  constraint whistle_reports_closure_coherent check (
    (status in ('resolved', 'dismissed') and resolved_at is not null and length(btrim(resolution)) > 0)
    or (status in ('open', 'under_review') and resolved_at is null)
  )
);

create index whistle_reports_queue_idx
  on whistle.reports (tenant_id, status, created_at desc);

create trigger whistle_reports_touch
  before update on whistle.reports
  for each row execute function whistle.touch_updated_at();

alter table whistle.reports enable row level security;
alter table whistle.reports force row level security;

-- ⭐ SELECT: o comitê (handle) vê TUDO; o denunciante NÃO-anônimo vê a PRÓPRIA.
-- A anônima não casa com ninguém (reporter_id null) — nem o autor a reencontra.
create policy whistle_reports_select on whistle.reports
  for select to authenticated
  using (
    whistle.can_handle(tenant_id)
    or reporter_id = (select auth.uid())
  );

-- ⭐ INSERT: qualquer um com submit pode denunciar.
create policy whistle_reports_insert on whistle.reports
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'whistle.report.submit'));

-- ⭐ UPDATE: só o comitê (handle) trata.
create policy whistle_reports_update on whistle.reports
  for update to authenticated
  using (whistle.can_handle(tenant_id))
  with check (whistle.can_handle(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Denúncia é registro eterno.

-- -----------------------------------------------------------------------------
-- 2.1 ⭐⭐ O NASCIMENTO: o anonimato DESCARTA a identidade, no servidor
-- -----------------------------------------------------------------------------

create or replace function whistle.guard_report_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'open' then
    raise exception 'a denúncia nasce aberta — tratar é decisão à parte'
      using errcode = '22023';
  end if;

  -- ⭐⭐ A LEI: anônima NÃO grava o denunciante (descarta auth.uid()); com
  -- identidade, o servidor carimba (o valor mentido no formulário é descartado).
  if new.is_anonymous then
    new.reporter_id := null;
  else
    new.reporter_id := (select auth.uid());
  end if;

  new.resolution := '';
  new.resolved_at := null;
  new.resolved_by := null;
  return new;
end;
$$;

create trigger whistle_reports_stamp
  before insert on whistle.reports
  for each row execute function whistle.guard_report_insert();

-- -----------------------------------------------------------------------------
-- 2.2 O relato CONGELA; só o tratamento anda
-- -----------------------------------------------------------------------------

create or replace function whistle.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('open',         'under_review'),
    ('open',         'dismissed'),
    ('under_review', 'resolved'),
    ('under_review', 'dismissed')
  );
$$;

comment on function whistle.allowed_transition(text, text) is
  'Ciclo de vida da denúncia. Espelho de ALLOWED_TRANSITIONS em @alsham/whistle. resolved/dismissed são TERMINAIS, com desfecho escrito obrigatório.';

create or replace function whistle.guard_report_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- ⭐ O relato é fato consumado: nada do conteúdo muda depois de registrado.
  if new.subject is distinct from old.subject
     or new.description is distinct from old.description
     or new.category is distinct from old.category
     or new.is_anonymous is distinct from old.is_anonymous
     or new.reporter_id is distinct from old.reporter_id then
    raise exception 'a denúncia é fato consumado: o relato não se reescreve. O tratamento vai no status/desfecho.'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if not whistle.allowed_transition(old.status, new.status) then
      raise exception 'transição % → % não existe no ciclo da denúncia', old.status, new.status
        using errcode = '22023';
    end if;

    if not core.has_permission(new.tenant_id, 'whistle.report.handle') then
      raise exception 'tratar a denúncia exige a permissão whistle.report.handle'
        using errcode = '42501';
    end if;

    if new.status in ('resolved', 'dismissed') then
      if length(btrim(new.resolution)) = 0 then
        raise exception 'encerrar a denúncia exige o desfecho escrito'
          using errcode = '22023';
      end if;
      new.resolved_at := now();
      new.resolved_by := (select auth.uid());
    end if;
  end if;

  return new;
end;
$$;

create trigger whistle_reports_guard_update
  before update on whistle.reports
  for each row execute function whistle.guard_report_update();

-- =============================================================================
-- 3. PAYLOAD + EVENTOS
-- ⚠️ O relato e a identidade NUNCA passeiam no envelope — o fato carrega só o
-- que é seguro (categoria, status, se é anônima), nunca o texto nem o autor.
-- =============================================================================

create or replace function whistle.report_payload(p whistle.reports)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'reportId',    p.id,
    'category',    p.category,
    'isAnonymous', p.is_anonymous,
    'status',      p.status
  );
$$;

comment on function whistle.report_payload(whistle.reports) is
  'Envelope de uma denúncia — SÓ metadado seguro (categoria/status/anônima). NUNCA o relato nem o denunciante.';

create or replace function whistle.on_report_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform whistle.emit_event(new.tenant_id, 'whistle.report.registered', whistle.report_payload(new));
  return new;
end;
$$;

create trigger whistle_reports_emit_registered
  after insert on whistle.reports
  for each row execute function whistle.on_report_registered();

create or replace function whistle.on_report_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform whistle.emit_event(
      new.tenant_id,
      case new.status
        when 'under_review' then 'whistle.report.reviewed'
        when 'resolved'     then 'whistle.report.resolved'
        when 'dismissed'    then 'whistle.report.dismissed'
        else 'whistle.report.reviewed'
      end,
      whistle.report_payload(new)
    );
  end if;
  return new;
end;
$$;

create trigger whistle_reports_emit_changed
  after update of status on whistle.reports
  for each row execute function whistle.on_report_changed();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema whistle                  from public, anon, authenticated;
revoke all on all tables    in schema whistle from public, anon, authenticated;
revoke all on all functions in schema whistle from public, anon, authenticated;

grant usage on schema whistle to authenticated;

grant select, insert, update on whistle.reports to authenticated;

grant execute on function whistle.can_handle(uuid) to authenticated;

-- `whistle.emit_event` e `whistle.report_payload` NÃO são concedidas. `anon` nada.

-- =============================================================================
-- FIM. ⭐⭐ Anônima nunca grava o denunciante (gatilho + constraint). O relato
-- não passeia no envelope. Nenhum objeto fora de `whistle`. Nenhuma leitura de
-- schema alheio. `consumes` VAZIO.
-- =============================================================================
