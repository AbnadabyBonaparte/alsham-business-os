-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0048_hr.sql
-- Módulo 33: Cadastro de Colaboradores. Schema `hr`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §21,
-- depois do `0047_dre.sql`. Primeiro módulo da Missão Oito (Onda 5 — o
-- BLOCO DE PESSOAS).
--
-- Taxonomia: Domain 👥 RH — capacidade *Admissão/Demissão* (o cadastro de
-- quem trabalha na empresa; o Domain RH tem 14 capacidades, esta onda
-- constrói 5). Spec: docs/canon/MODULO-HR-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⚠️ SENSIBILIDADE DE DADO DE PESSOA FÍSICA (lei desta onda)
-- -----------------------------------------------------------------------------
-- O NOME do colaborador é neutro (texto livre, como o visitante do vis e a
-- contraparte do crm). ⛔ NUNCA CPF, NUNCA dado de saúde, NUNCA dado
-- bancário: se uma capacidade (Folha, Benefícios) exigir dado sensível para
-- funcionar, ela fica DECLARADA FORA — é matéria de RH/jurídico de verdade,
-- não se constrói por atalho (spec §5).
--
-- -----------------------------------------------------------------------------
-- ⭐ `terminated` É TERMINAL — re-perguntado, e a resposta está escrita
-- -----------------------------------------------------------------------------
-- No crm e no pat-de-localização a volta é o MESMO registro (a contraparte
-- que retorna é a mesma pessoa; a sala reaberta é a mesma sala). Aqui a
-- física é OUTRA: um ex-colaborador que retorna assina um CONTRATO NOVO de
-- trabalho — outra admissão, outra data, outro vínculo. Então `terminated`
-- é TERMINAL (a linhagem do pat: "a baixa que volta é aquisição nova"), e
-- quem retorna NASCE como registro novo, com o vínculo SOLTO ao anterior
-- (`previous_employee_id` — id solto, sem FK) para quem quiser a história.
--
-- ⭐ DOIS TIPOS DE "PARAR", UMA SÓ DEFINITIVA — contraste interno assinado:
-- `on_leave` (afastamento) é REVERSÍVEL (volta a `active` — férias, licença,
-- afastamento voltam); só `terminated` não volta. O desligamento EXIGE
-- RAZÃO escrita (a física do deal.lost / ctr.terminated — nunca apagar em
-- silêncio) e carimbo do servidor.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA cargo TEXTO LIVRE — o organograma é de cada empresa; enum de
--      cargo congelaria a estrutura de uma casa e envelheceria todas.
--   ✅ ENTRA departamento TEXTO LIVRE (opcional).
--   ❌ NÃO ENTRA Folha, Benefícios (dado sensível — DECLARADO FORA),
--      Recrutamento/Seleção/Currículos (o funil de contratação é ofício à
--      parte), Plano de carreira (capacidade futura declarada), CPF, RG,
--      dado de saúde, conta bancária — nada disso passa por aqui.
-- =============================================================================

create schema if not exists hr;

comment on schema hr is
  'Módulo Cadastro de Colaboradores. Domain hr da Taxonomia (RH). Quem trabalha na empresa: cargo/departamento TEXTO LIVRE (nunca enum); on_leave é reversível, terminated é TERMINAL (quem volta é admissão nova, com vínculo solto ao anterior); desligar exige razão e carimbo do servidor. Sem dado sensível (Folha/Benefícios declarados FORA). Não cria objeto em core nem lê schema alheio.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — trigésima terceira vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function hr.emit_event(
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
  if p_event_type not like 'hr.%' then
    raise exception 'hr.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'hr',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function hr.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function hr.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'hr.employee.manage')
      or core.has_permission(p_tenant_id, 'hr.employee.decide');
$$;

create or replace function hr.touch_updated_at()
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
-- 2. EMPLOYEES — quem trabalha na empresa
-- =============================================================================

create table hr.employees (
  id                   uuid        primary key default gen_random_uuid(),
  tenant_id            uuid        not null references core.tenants (id) on delete cascade,
  full_name            text        not null check (length(btrim(full_name)) > 0),
  -- ⭐ Cargo e departamento TEXTO LIVRE — o organograma é de cada empresa.
  role_title           text        not null check (length(btrim(role_title)) > 0),
  department           text        not null default '',
  hired_on             date        not null,
  status               text        not null default 'active'
                       check (status in ('active', 'on_leave', 'terminated')),
  -- ⭐ O ATO do desligamento: quem, quando e POR QUÊ. Terminal.
  termination_reason   text        not null default '',
  terminated_at        timestamptz,
  terminated_by        uuid        references auth.users (id) on delete set null,
  -- ⭐ Vínculo SOLTO ao registro anterior de quem retornou (id solto, sem FK):
  -- a admissão é nova, mas a história pode ser rastreada.
  previous_employee_id uuid,
  created_at           timestamptz not null default now(),
  created_by           uuid        references auth.users (id) on delete set null,
  updated_at           timestamptz not null default now(),
  constraint hr_employees_id_tenant unique (id, tenant_id),
  -- Desligado tem carimbo e razão; ativo e afastado não têm nenhum dos dois.
  constraint hr_employees_termination_coherent check (
    (status = 'terminated' and terminated_at is not null
      and length(btrim(termination_reason)) > 0)
    or (status in ('active', 'on_leave')
      and terminated_at is null and termination_reason = '')
  )
);

create index hr_employees_roster_idx
  on hr.employees (tenant_id, status, full_name);

create trigger hr_employees_touch
  before update on hr.employees
  for each row execute function hr.touch_updated_at();

alter table hr.employees enable row level security;
alter table hr.employees force row level security;

create policy hr_employees_select on hr.employees
  for select to authenticated
  using (hr.can_access(tenant_id));

create policy hr_employees_insert on hr.employees
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'hr.employee.manage'));

create policy hr_employees_update on hr.employees
  for update to authenticated
  using (hr.can_access(tenant_id))
  with check (hr.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Colaborador desligado é história — o
-- roster de um tenant conta quem passou por ele.

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre ATIVO (admitir é o ato de entrada)
-- -----------------------------------------------------------------------------

create or replace function hr.guard_employee_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'active' then
    raise exception 'o colaborador nasce ativo — afastar ou desligar é decisão à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger hr_employees_stamp
  before insert on hr.employees
  for each row execute function hr.guard_employee_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/hr
-- -----------------------------------------------------------------------------
-- ⭐ on_leave ↔ active (o afastamento VOLTA); terminated é TERMINAL.

create or replace function hr.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('active',   'on_leave'),
    ('on_leave', 'active'),
    ('active',   'terminated'),
    ('on_leave', 'terminated')
  );
$$;

comment on function hr.allowed_transition(text, text) is
  'Ciclo de vida do colaborador. Espelho de ALLOWED_TRANSITIONS em @alsham/hr. on_leave ↔ active (o afastamento volta); terminated é TERMINAL — quem retorna assina contrato novo (admissão nova, registro novo).';

create or replace function hr.guard_employee_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    -- Desligado congela: o registro fechou.
    if old.status = 'terminated'
       and (new.full_name is distinct from old.full_name
            or new.role_title is distinct from old.role_title
            or new.department is distinct from old.department
            or new.hired_on is distinct from old.hired_on
            or new.termination_reason is distinct from old.termination_reason
            or new.previous_employee_id is distinct from old.previous_employee_id) then
      raise exception 'colaborador desligado não se edita: quem retorna é admissão nova'
        using errcode = '22023';
    end if;
    return new;
  end if;

  if not hr.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe: terminated é terminal — quem volta é admissão nova',
      old.status, new.status
      using errcode = '22023';
  end if;

  if new.status = 'terminated' then
    if not core.has_permission(new.tenant_id, 'hr.employee.decide') then
      raise exception 'desligar um colaborador exige a permissão hr.employee.decide'
        using errcode = '42501';
    end if;
    if length(btrim(new.termination_reason)) = 0 then
      raise exception 'desligar exige a razão escrita: nunca desligar em silêncio'
        using errcode = '22023';
    end if;
    new.terminated_at := now();
    new.terminated_by := (select auth.uid());
  end if;

  return new;
end;
$$;

create trigger hr_employees_guard_status
  before update on hr.employees
  for each row execute function hr.guard_employee_transition();

-- =============================================================================
-- 3. OS FATOS — payload autossuficiente (o nome vai; nenhum dado sensível)
-- =============================================================================

create or replace function hr.employee_payload(p hr.employees)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'employeeId',         p.id,
    'fullName',           p.full_name,
    'roleTitle',          p.role_title,
    'department',         p.department,
    'hiredOn',            p.hired_on,
    'status',             p.status,
    'terminationReason',  p.termination_reason,
    'previousEmployeeId', p.previous_employee_id
  );
$$;

comment on function hr.employee_payload(hr.employees) is
  'O envelope de um colaborador — AUTOSSUFICIENTE, com o NOME (dado neutro) e o cargo. Nenhum CPF, dado de saúde ou bancário passeia no correio.';

create or replace function hr.on_employee_hired()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform hr.emit_event(new.tenant_id, 'hr.employee.hired', hr.employee_payload(new));
  return new;
end;
$$;

create trigger hr_employees_emit_hired
  after insert on hr.employees
  for each row execute function hr.on_employee_hired();

create or replace function hr.on_employee_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform hr.emit_event(
      new.tenant_id,
      case
        when new.status = 'on_leave'   then 'hr.employee.suspended'
        when new.status = 'active'     then 'hr.employee.reinstated'
        else 'hr.employee.terminated'
      end,
      hr.employee_payload(new)
    );
    return new;
  end if;

  if new.full_name is distinct from old.full_name
     or new.role_title is distinct from old.role_title
     or new.department is distinct from old.department
     or new.hired_on is distinct from old.hired_on then
    perform hr.emit_event(new.tenant_id, 'hr.employee.updated', hr.employee_payload(new));
  end if;

  return new;
end;
$$;

create trigger hr_employees_emit_changed
  after update on hr.employees
  for each row execute function hr.on_employee_changed();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema hr                  from public, anon, authenticated;
revoke all on all tables    in schema hr from public, anon, authenticated;
revoke all on all functions in schema hr from public, anon, authenticated;

grant usage on schema hr to authenticated;

grant select, insert, update on hr.employees to authenticated;

grant execute on function hr.can_access(uuid) to authenticated;

-- `hr.emit_event` NÃO é concedida. `hr.employee_payload` é encanamento dos
-- gatilhos. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum CPF, dado de saúde ou bancário. Nenhuma Folha.
-- Nenhum enum de cargo. Nenhum objeto fora de `hr`. Nenhuma leitura de schema
-- alheio. `consumes` VAZIO — nenhum handler de RH nesta onda (Lei 7).
-- =============================================================================
