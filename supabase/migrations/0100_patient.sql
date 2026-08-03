-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0100_patient.sql
-- Módulo — Pacientes. Schema `patient`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — runbook §34, a Onda Vinte e Um (Fase 3
-- — o Vertical 🏥 Saúde). Nasce sob `vertical_key='health'`.
--
-- Taxonomia: Vertical 🏥 Saúde (§6) — capacidade *Pacientes*.
-- Spec/decisões: docs/canon/ONDA-VINTE-E-UM-DECISOES.md · MODULO-PATIENT-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ NÃO CONSOLIDA NO `crm` — a proibição de misturar dado sensível com comum
-- -----------------------------------------------------------------------------
-- O paciente NÃO é o `crm` com campos a mais: fundir PHI (dado de saúde) com o
-- contato comercial na mesma vala é a mistura que a LGPD proíbe. `patient` é
-- vala própria — cadastro demográfico, isolado. Ele NÃO carrega conteúdo
-- clínico (isso é `record`/`exam`/`prescription`), então fica no padrão de
-- ESCRITA (a trilha de leitura é só dos três módulos clínicos).
--
-- -----------------------------------------------------------------------------
-- ⭐ `active ↔ archived` — a física do `crm`/`catalog`, re-perguntada
-- -----------------------------------------------------------------------------
-- Copiar sem pensar e divergir sem escrever são o mesmo erro (CLAUDE.md). O
-- paciente é GENTE que volta (a física do `hr`, `terminated` terminal) ou
-- CADASTRO que volta (a física do `crm`/`catalog`)? É cadastro: o paciente que
-- retorna à clínica anos depois é o MESMO paciente — obrigá-lo a renascer
-- partiria o prontuário em dois (e o `record`/`appointment` carimbam o
-- `patient_name`, então a história antiga segue legível). Então
-- `archived → active` EXISTE.
--
-- ANTI-VIÉS: o nº de prontuário e o plano/convênio são TEXTO LIVRE — nunca
-- enum. O plano do paciente vive aqui (o convênio da operadora é o `ctr`).
-- =============================================================================

create schema if not exists patient;

comment on schema patient is
  'Módulo Pacientes. Vertical health (Saúde). Cadastro demográfico — vala PRÓPRIA, isolada do crm (proibição LGPD de misturar dado sensível com contato comercial). NÃO carrega conteúdo clínico (fica na trilha de ESCRITA). nº de prontuário e plano TEXTO LIVRE. active ↔ archived (o paciente que volta é o MESMO — a física do crm/catalog). Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA + acesso
-- =============================================================================

create or replace function patient.emit_event(
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
  if p_event_type not like 'patient.%' then
    raise exception 'patient.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'patient',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function patient.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function patient.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'patient.patient.manage')
      or core.has_permission(p_tenant_id, 'patient.patient.decide');
$$;

create or replace function patient.touch_updated_at()
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
-- 2. PATIENTS — o cadastro demográfico
-- =============================================================================

create table patient.patients (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references core.tenants (id) on delete cascade,
  -- ⭐ Nome NEUTRO — texto livre. Não vazio.
  name           text        not null check (length(btrim(name)) > 0),
  -- ⭐ Nº de prontuário — TEXTO LIVRE, OPCIONAL (nem toda casa numera; a lição
  -- do SKU do catalog). Não é a chave: a chave é o id do sistema.
  record_number  text        not null default '',
  -- Nascimento — data pura, opcional (cadastro em fluxo pode não ter ainda).
  birth_date     date,
  -- ⭐ Plano/convênio do paciente — TEXTO LIVRE (o CONTRATO com a operadora é o
  -- ctr, por fora). Um paciente particular sem plano é honesto.
  health_plan    text        not null default '',
  status         text        not null default 'active'
                 check (status in ('active', 'archived')),
  created_at     timestamptz not null default now(),
  created_by     uuid        references auth.users (id) on delete set null,
  updated_at     timestamptz not null default now(),
  constraint patient_patients_id_tenant unique (id, tenant_id)
);

create index patient_patients_roster_idx
  on patient.patients (tenant_id, status, name);

create trigger patient_patients_touch
  before update on patient.patients
  for each row execute function patient.touch_updated_at();

alter table patient.patients enable row level security;
alter table patient.patients force row level security;

create policy patient_patients_select on patient.patients
  for select to authenticated
  using (patient.can_access(tenant_id));

create policy patient_patients_insert on patient.patients
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'patient.patient.manage'));

-- ⚠️ USING = can_access (não patient.decide): quem só arquiva ALCANÇA a linha e
-- bate no gatilho, que decide — em vez de a RLS filtrar e o UPDATE afetar 0
-- linhas em silêncio. A decisão vive no gatilho (o padrão do catalog/vendor).
create policy patient_patients_update on patient.patients
  for update to authenticated
  using (patient.can_access(tenant_id))
  with check (patient.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Paciente com história é história; arquivar é
-- status, e `archived → active` existe (o paciente volta).

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre ATIVO, o autor carimbado pelo servidor
-- -----------------------------------------------------------------------------

create or replace function patient.guard_patient_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'active' then
    raise exception 'o paciente nasce ativo — arquivar é decisão à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger patient_patients_stamp
  before insert on patient.patients
  for each row execute function patient.guard_patient_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/patient
-- -----------------------------------------------------------------------------

create or replace function patient.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('active',   'archived'),
    ('archived', 'active')
  );
$$;

comment on function patient.allowed_transition(text, text) is
  'Ciclo de vida do paciente. active ↔ archived: o paciente que volta é o MESMO (a física do crm/catalog, o DIVERGE do hr onde terminated é terminal).';

create or replace function patient.guard_patient_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not patient.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida do paciente', old.status, new.status
      using errcode = '22023';
  end if;

  if not core.has_permission(new.tenant_id, 'patient.patient.decide') then
    raise exception 'arquivar ou reativar um paciente exige a permissão patient.patient.decide'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger patient_patients_guard_status
  before update of status on patient.patients
  for each row execute function patient.guard_patient_transition();

-- =============================================================================
-- 3. OS FATOS — o envelope carrega SÓ a identidade demográfica mínima
-- ⚠️ Sem birth_date e sem health_plan no correio: o fato diz QUEM é o paciente
-- (para listas de quem escuta), nunca o detalhe. Ninguém consome, e o mínimo é
-- a postura conservadora com dado de saúde.
-- =============================================================================

create or replace function patient.patient_payload(p patient.patients)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'patientId',    p.id,
    'name',         p.name,
    'recordNumber', p.record_number,
    'status',       p.status
  );
$$;

comment on function patient.patient_payload(patient.patients) is
  'O envelope de um paciente — AUTOSSUFICIENTE e MÍNIMO. Sem nascimento e sem plano (dado sensível não passeia). Quem escuta não faz join.';

create or replace function patient.on_patient_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform patient.emit_event(new.tenant_id, 'patient.patient.registered', patient.patient_payload(new));
  return new;
end;
$$;

create trigger patient_patients_emit_registered
  after insert on patient.patients
  for each row execute function patient.on_patient_registered();

create or replace function patient.on_patient_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform patient.emit_event(
      new.tenant_id,
      case when new.status = 'archived' then 'patient.patient.archived'
           else 'patient.patient.reactivated' end,
      patient.patient_payload(new)
    );
    return new;
  end if;

  if new.name is distinct from old.name
     or new.record_number is distinct from old.record_number
     or new.birth_date is distinct from old.birth_date
     or new.health_plan is distinct from old.health_plan then
    perform patient.emit_event(new.tenant_id, 'patient.patient.updated', patient.patient_payload(new));
  end if;

  return new;
end;
$$;

create trigger patient_patients_emit_changed
  after update on patient.patients
  for each row execute function patient.on_patient_changed();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função; e
-- função nasce aberta a PUBLIC — por isso o revoke de funções vem aqui, no fim.
-- =============================================================================

revoke all on schema patient                  from public, anon, authenticated;
revoke all on all tables    in schema patient from public, anon, authenticated;
revoke all on all functions in schema patient from public, anon, authenticated;

grant usage on schema patient to authenticated;

grant select, insert, update on patient.patients to authenticated;

grant execute on function patient.can_access(uuid) to authenticated;

-- `patient.emit_event` NÃO é concedida. `patient.patient_payload` é encanamento
-- dos gatilhos. `anon` não recebe nada.

-- =============================================================================
-- FIM. Cadastro demográfico, vala própria (não o crm). nº de prontuário e plano
-- TEXTO LIVRE. active ↔ archived. Sem conteúdo clínico (trilha de ESCRITA).
-- Nenhum objeto fora de `patient`. Nenhuma leitura de schema alheio. `consumes`
-- VAZIO.
-- =============================================================================
