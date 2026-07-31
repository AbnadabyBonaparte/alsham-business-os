-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0079_audit.sql
-- Módulo 64: Auditorias. Schema `audit`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §27, o
-- SEGUNDO módulo da Onda Quatorze (Fase 2). Domain 🧪 Qualidade.
-- Nasce sob `domain_key='quality'`.
--
-- Taxonomia: Domain 🧪 Qualidade — capacidade *Auditorias* (§5).
-- Spec: docs/canon/MODULO-AUDIT-SPEC.md
--
-- ⚠️ `module_id` é `audit`, e este é o schema do MÓDULO da Qualidade. NÃO
-- confundir com a *Auditoria* do Core (Taxonomia §3 — a trilha de acesso da
-- plataforma, `core.audit.read`), nem com a *Auditoria jurídica* do Legal, nem
-- com as *Auditorias* de GRC (homônimos declarados — Sol Único). Aqui é a
-- auditoria de QUALIDADE: a empresa planeja e conduz auditorias (internas,
-- externas, de certificação) e registra os achados.
--
-- -----------------------------------------------------------------------------
-- ⭐ A FÍSICA — duas peças, dois vínculos DIFERENTES (o ponto do módulo)
-- -----------------------------------------------------------------------------
--   • `audit.audits`   — a auditoria: tipo/escopo TEXTO LIVRE, data agendada.
--     Ciclo `planned → completed`/`cancelled`, os dois fins TERMINAIS (a física
--     do `proj`/`bud`: auditoria encerrada não reabre — a próxima é auditoria
--     nova). Cancelar exige RAZÃO (a assimetria do `proj`).
--   • `audit.findings` — o achado: vínculo à auditoria por **FK COMPOSTA
--     INTRA-SCHEMA** `(audit_id, tenant_id) → audit.audits(id, tenant_id)` — peça
--     do PRÓPRIO módulo, permitida. O achado é IMUTÁVEL (fato constatado, a
--     física da Qualidade). Vínculo OPCIONAL ao `nc` (Módulo 63) por **ID SOLTO**
--     (`nc_entry_id`, sem FK cross-schema) — um achado pode virar uma Não
--     Conformidade formal, ou não. Os dois vínculos são de NATUREZA diferente de
--     propósito: intra-schema com FK, cross-module com id solto.
--
-- ANTI-VIÉS: tipo/escopo TEXTO LIVRE — "interna/externa/certificação" é dado do
-- tenant, nunca enum (a auditoria de um laboratório clínico não é a de uma
-- transportadora). ❌ NÃO ENTRA: checklist de auditoria estruturado (é o `chk`,
-- Checklists, já publicado), anexo de evidência (Storage do Core, NÃO CONSTRUÍDA),
-- não conformidade formal (é o `nc`), plano de ação (é o `capa`). `consumes` VAZIO.
-- =============================================================================

create schema if not exists audit;

comment on schema audit is
  'Módulo Auditorias (de qualidade). Domain quality da Taxonomia. A auditoria tem ciclo planned → completed/cancelled (terminais, a física do proj); tipo/escopo TEXTO LIVRE. O achado (finding) liga-se à auditoria por FK composta INTRA-schema e é imutável; vínculo OPCIONAL ao nc por id solto. Não é a Auditoria do Core nem a de GRC (homônimos). Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — sexagésima quarta vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function audit.emit_event(
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
  if p_event_type not like 'audit.%' then
    raise exception 'audit.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'audit',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function audit.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function audit.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'audit.audit.manage')
      or core.has_permission(p_tenant_id, 'audit.finding.record');
$$;

create or replace function audit.touch_updated_at()
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
-- 2. AUDITS — a auditoria (planned → completed/cancelled, terminais)
-- =============================================================================

create table audit.audits (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references core.tenants (id) on delete cascade,
  audit_type    text        not null check (length(btrim(audit_type)) > 0),
  scope         text        not null check (length(btrim(scope)) > 0),
  scheduled_for date,
  status        text        not null default 'planned'
                check (status in ('planned', 'completed', 'cancelled')),
  -- Cancelar exige RAZÃO (a assimetria do proj); concluir tem nota opcional.
  cancel_reason text        not null default '',
  outcome_note  text        not null default '',
  created_at    timestamptz not null default now(),
  created_by    uuid        references auth.users (id) on delete set null,
  updated_at    timestamptz not null default now(),
  constraint audits_id_tenant unique (id, tenant_id),
  constraint audits_cancel_reason_coherent check (
    status <> 'cancelled' or length(btrim(cancel_reason)) > 0
  )
);

create index audits_agenda_idx
  on audit.audits (tenant_id, status, scheduled_for);

create trigger audits_touch
  before update on audit.audits
  for each row execute function audit.touch_updated_at();

alter table audit.audits enable row level security;
alter table audit.audits force row level security;

create policy audits_select on audit.audits
  for select to authenticated
  using (audit.can_access(tenant_id));

create policy audits_insert on audit.audits
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'audit.audit.manage'));

create policy audits_update on audit.audits
  for update to authenticated
  using (core.has_permission(tenant_id, 'audit.audit.manage'))
  with check (core.has_permission(tenant_id, 'audit.audit.manage'));

-- ⛔ Sem policy / grant de DELETE: auditoria é história (cancelar é status).

create or replace function audit.guard_audit_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'planned' then
    raise exception 'a auditoria nasce planejada — concluir ou cancelar é ato à parte'
      using errcode = '22023';
  end if;
  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger audits_stamp
  before insert on audit.audits
  for each row execute function audit.guard_audit_insert();

-- -----------------------------------------------------------------------------
-- 2.1 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/audits
-- -----------------------------------------------------------------------------
-- ⭐ planned → completed | cancelled. Os dois fins são TERMINAIS (física do proj).

create or replace function audit.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('planned', 'completed'),
    ('planned', 'cancelled')
  );
$$;

comment on function audit.allowed_transition(text, text) is
  'Ciclo de vida da auditoria. Espelho de ALLOWED_TRANSITIONS em @alsham/audits. planned → completed/cancelled, os dois TERMINAIS (a física do proj): auditoria encerrada não reabre — a próxima é auditoria nova.';

create or replace function audit.guard_audit_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not audit.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida da auditoria', old.status, new.status
      using errcode = '22023';
  end if;

  if not core.has_permission(new.tenant_id, 'audit.audit.manage') then
    raise exception 'mover a auditoria exige a permissão audit.audit.manage'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger audits_guard_status
  before update of status on audit.audits
  for each row execute function audit.guard_audit_status();

-- =============================================================================
-- 3. FINDINGS — ⭐ o achado (FK composta intra-schema; IMUTÁVEL; id solto ao nc)
-- =============================================================================

create table audit.findings (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references core.tenants (id) on delete cascade,
  audit_id    uuid        not null,
  description text        not null check (length(btrim(description)) > 0),
  -- ⭐ Vínculo OPCIONAL ao nc (Módulo 63) por ID SOLTO — um achado pode virar uma
  -- Não Conformidade formal. Sem FK cross-schema.
  nc_entry_id uuid,
  created_at  timestamptz not null default now(),
  created_by  uuid        references auth.users (id) on delete set null,
  -- ⭐ FK COMPOSTA e INTRA-SCHEMA à auditoria: peça do PRÓPRIO módulo, mantém a
  -- integridade de tenant e barra auditoria inexistente ou de outro tenant.
  constraint findings_audit_fk
    foreign key (audit_id, tenant_id)
    references audit.audits (id, tenant_id) on delete restrict
);

create index findings_audit_idx
  on audit.findings (tenant_id, audit_id, created_at);

alter table audit.findings enable row level security;
alter table audit.findings force row level security;

create policy findings_select on audit.findings
  for select to authenticated
  using (audit.can_access(tenant_id));

create policy findings_insert on audit.findings
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'audit.finding.record'));

-- ⛔ SEM policy de UPDATE/DELETE — o achado é fato constatado, imutável.

create or replace function audit.guard_finding_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  -- Achado só entra em auditoria que NÃO foi cancelada.
  select status into v_status
    from audit.audits
   where id = new.audit_id and tenant_id = new.tenant_id;

  if v_status = 'cancelled' then
    raise exception 'auditoria cancelada não recebe achado'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger findings_stamp
  before insert on audit.findings
  for each row execute function audit.guard_finding_insert();

create or replace function audit.guard_finding_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'o achado de auditoria é fato constatado: não se edita nem se apaga. Registre outro.'
    using errcode = '42501';
end;
$$;

create trigger findings_immutable
  before update or delete on audit.findings
  for each row execute function audit.guard_finding_immutable();

-- =============================================================================
-- 4. PAYLOADS + FATOS
-- =============================================================================

create or replace function audit.audit_payload(p audit.audits)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'auditId',      p.id,
    'auditType',    p.audit_type,
    'scope',        p.scope,
    'scheduledFor', p.scheduled_for,
    'status',       p.status,
    'cancelReason', p.cancel_reason,
    'outcomeNote',  p.outcome_note
  );
$$;

comment on function audit.audit_payload(audit.audits) is
  'O envelope de uma auditoria — AUTOSSUFICIENTE. Quem escuta não faz join.';

create or replace function audit.finding_payload(p audit.findings)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'findingId',   p.id,
    'auditId',     p.audit_id,
    'description', p.description,
    'ncEntryId',   p.nc_entry_id
  );
$$;

comment on function audit.finding_payload(audit.findings) is
  'O envelope de um achado — AUTOSSUFICIENTE, com o nc por id solto. Quem escuta não faz join.';

create or replace function audit.on_audit_scheduled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform audit.emit_event(new.tenant_id, 'audit.audit.scheduled', audit.audit_payload(new));
  return new;
end;
$$;

create trigger audits_emit_scheduled
  after insert on audit.audits
  for each row execute function audit.on_audit_scheduled();

create or replace function audit.on_audit_decided()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform audit.emit_event(
      new.tenant_id,
      case when new.status = 'completed' then 'audit.audit.completed'
           else 'audit.audit.cancelled' end,
      audit.audit_payload(new)
    );
  end if;
  return new;
end;
$$;

create trigger audits_emit_decided
  after update of status on audit.audits
  for each row execute function audit.on_audit_decided();

create or replace function audit.on_finding_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform audit.emit_event(new.tenant_id, 'audit.finding.recorded', audit.finding_payload(new));
  return new;
end;
$$;

create trigger findings_emit_recorded
  after insert on audit.findings
  for each row execute function audit.on_finding_recorded();

-- =============================================================================
-- 5. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema audit                  from public, anon, authenticated;
revoke all on all tables    in schema audit from public, anon, authenticated;
revoke all on all functions in schema audit from public, anon, authenticated;

grant usage on schema audit to authenticated;

grant select, insert, update on audit.audits   to authenticated;
-- ⛔ SÓ SELECT e INSERT no achado — imutável (fato constatado).
grant select, insert on audit.findings to authenticated;

grant execute on function audit.can_access(uuid) to authenticated;

-- `audit.emit_event` NÃO é concedida. Os `*_payload` são encanamento dos
-- gatilhos. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum enum de tipo. Nenhum checklist estruturado. Nenhum
-- anexo. Nenhum objeto fora de `audit`. Nenhuma leitura de schema alheio (o
-- achado liga-se ao nc por id solto; à auditoria por FK intra-schema).
-- `consumes` VAZIO.
-- =============================================================================
