-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0113_professional.sql
-- Módulo 98: Profissionais. Schema `professional`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver o runbook. Módulo do Vertical
-- 💇 Beleza & Estética (`vertical_key='beauty'`, VerticalKey do `@alsham/core`).
--
-- Taxonomia: Vertical 💇 Beleza & Estética (§6, "vertical viva: Suprema
-- Beleza") — capacidade *Profissionais*.
-- Spec: docs/canon/MODULO-PROFESSIONAL-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ A DECISÃO DE CANON CENTRAL: `active ↔ archived` — o DIVERGE do `hr`
-- -----------------------------------------------------------------------------
-- Copiar o `hr` "por consistência" seria erro; copiar sem pensar e divergir sem
-- escrever são o mesmo erro (CLAUDE.md). Então a pergunta foi refeita: o
-- profissional do salão é GENTE CONTRATADA (a física do `hr`, onde
-- `terminated` é TERMINAL — quem retorna assina contrato novo) ou RELAÇÃO que
-- volta (a física do `vendor`/`mall`/`crm`)?
--
-- É relação que volta. O salão vive de cadeira-alugada: o(a) cabeleireiro(a)
-- autônomo(a) que sai e volta na temporada seguinte é a MESMA pessoa — e sequer
-- é empregado(a), então nem sempre existe no `hr`. Obrigá-lo(a) a renascer
-- partiria o histórico de comissão/agenda em dois. Por isso este é um ROSTER
-- PRÓPRIO, e não uma projeção do `hr`: `archived → active` EXISTE, arquivar
-- NÃO exige razão (é reversível), e a linha arquivada NÃO congela. O contraste
-- professional×hr fica assinado (o vendor já assina a mesma família contra o hr).
--
-- Quando o profissional TAMBÉM é colaborador registrado, o cadastro de gente
-- continua no `hr` — referenciado aqui por `hr_employee_id`, ID SOLTO (sem FK,
-- OPCIONAL). Um id inexistente insere sem erro: a integridade daquele dado é do
-- `hr`, não daqui. Este schema não lê `hr`.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outro salão de outro dono usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA nome (neutro) e especialidade TEXTO LIVRE — "cabeleireiro"/
--      "manicure"/"esteticista"/"barbeiro" é vocabulário de cada casa; um enum
--      congelaria a régua de um salão no schema de todos (a mesma Lei 3 do
--      segmento do vendor/mall).
--   ❌ NÃO ENTRA agenda/agendamento (é o `spc`/capacidade *Agendamento*, à parte).
--   ❌ NÃO ENTRA comissão (capacidade *Comissões*, à parte — id solto no futuro).
--   ❌ NÃO ENTRA folha/CPF/dado sensível (é do `hr` genérico, e nem isso —
--      o autônomo não tem vínculo trabalhista aqui).
-- =============================================================================

create schema if not exists professional;

comment on schema professional is
  'Módulo Profissionais. Vertical beauty da Taxonomia. O roster de profissionais do salão: nome (neutro) e especialidade TEXTO LIVRE (nunca enum). active ↔ archived existe (o profissional é relação que volta — o DIVERGE do hr, onde terminated é terminal). hr_employee_id é id solto OPCIONAL — não cria objeto em core nem lê o schema do hr. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — a única. É lei.
-- =============================================================================

create or replace function professional.emit_event(
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
  if p_event_type not like 'professional.%' then
    raise exception 'professional.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'professional',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function professional.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function professional.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'professional.professional.manage');
$$;

create or replace function professional.touch_updated_at()
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
-- 2. PROFESSIONALS — o roster do salão
-- =============================================================================

create table professional.professionals (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references core.tenants (id) on delete cascade,
  name            text        not null check (length(btrim(name)) > 0),
  -- ⭐ Especialidade TEXTO LIVRE — vocabulário de cada casa. OPCIONAL: um
  -- profissional sem especialidade é honesto, não um erro a chutar num enum.
  specialty       text        not null default '',
  -- ⭐ ID SOLTO ao hr — SEM FK, OPCIONAL. O profissional como colaborador do
  -- hr. O autônomo cadeira-alugada não tem vínculo trabalhista e fica nulo.
  hr_employee_id  uuid,
  status          text        not null default 'active'
                  check (status in ('active', 'archived')),
  created_at      timestamptz not null default now(),
  created_by      uuid        references auth.users (id) on delete set null,
  updated_at      timestamptz not null default now(),
  constraint professionals_id_tenant unique (id, tenant_id)
);

create index professionals_roster_idx
  on professional.professionals (tenant_id, status, name);
create index professionals_hr_idx
  on professional.professionals (tenant_id, hr_employee_id);

create trigger professionals_touch
  before update on professional.professionals
  for each row execute function professional.touch_updated_at();

alter table professional.professionals enable row level security;
alter table professional.professionals force row level security;

create policy professionals_select on professional.professionals
  for select to authenticated
  using (professional.can_access(tenant_id));

create policy professionals_insert on professional.professionals
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'professional.professional.manage'));

-- ⚠️ USING = can_access (a mesma permissão): assim quem edita/arquiva ALCANÇA a
-- linha e bate no gatilho da transição, em vez de a RLS filtrar e o UPDATE
-- afetar 0 linhas em silêncio.
create policy professionals_update on professional.professionals
  for update to authenticated
  using (professional.can_access(tenant_id))
  with check (professional.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Profissional que saiu é história do salão —
-- arquivar é status, e `archived → active` existe (a pessoa volta).

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre ATIVO, o autor carimbado pelo servidor
-- -----------------------------------------------------------------------------

create or replace function professional.guard_professional_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'active' then
    raise exception 'o profissional nasce ativo — arquivar é decisão à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger professionals_stamp
  before insert on professional.professionals
  for each row execute function professional.guard_professional_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/professional
-- -----------------------------------------------------------------------------
-- ⭐ active ↔ archived (o profissional volta — o DIVERGE do hr).

create or replace function professional.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('active',   'archived'),
    ('archived', 'active')
  );
$$;

comment on function professional.allowed_transition(text, text) is
  'Ciclo de vida do profissional. Espelho de ALLOWED_TRANSITIONS em @alsham/professional. active ↔ archived: o profissional é relação que volta (o DIVERGE do hr, onde terminated é terminal).';

create or replace function professional.guard_professional_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not professional.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida do profissional', old.status, new.status
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger professionals_guard_status
  before update of status on professional.professionals
  for each row execute function professional.guard_professional_transition();

-- =============================================================================
-- 2.3 OS FATOS DO PROFISSIONAL — payload autossuficiente
-- =============================================================================

create or replace function professional.professional_payload(p professional.professionals)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'professionalId', p.id,
    'name',           p.name,
    'specialty',      p.specialty,
    'hrEmployeeId',   p.hr_employee_id,
    'status',         p.status
  );
$$;

comment on function professional.professional_payload(professional.professionals) is
  'O envelope de um profissional — AUTOSSUFICIENTE. Quem escuta não faz join com o hr.';

create or replace function professional.on_professional_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform professional.emit_event(new.tenant_id, 'professional.professional.registered', professional.professional_payload(new));
  return new;
end;
$$;

create trigger professionals_emit_registered
  after insert on professional.professionals
  for each row execute function professional.on_professional_registered();

-- ⭐ active ↔ archived emite os DOIS fatos, por simetria: arquivar e reativar
-- são a mesma física de relação-que-volta (o padrão do vendor/mall).
create or replace function professional.on_professional_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform professional.emit_event(
      new.tenant_id,
      case when new.status = 'archived' then 'professional.professional.archived'
           else 'professional.professional.reactivated' end,
      professional.professional_payload(new)
    );
  end if;
  return new;
end;
$$;

create trigger professionals_emit_changed
  after update on professional.professionals
  for each row execute function professional.on_professional_changed();

-- =============================================================================
-- 3. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema professional                  from public, anon, authenticated;
revoke all on all tables    in schema professional from public, anon, authenticated;
revoke all on all functions in schema professional from public, anon, authenticated;

grant usage on schema professional to authenticated;

grant select, insert, update on professional.professionals to authenticated;

grant execute on function professional.can_access(uuid) to authenticated;

-- `professional.emit_event` NÃO é concedida. `professional.professional_payload`
-- é encanamento dos gatilhos. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT de dado. Nenhum enum de especialidade. Nenhuma leitura de
-- schema alheio (hr por id solto). Nenhum objeto fora de `professional`.
-- `consumes` VAZIO (Lei 7).
-- =============================================================================
