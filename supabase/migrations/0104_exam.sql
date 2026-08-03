-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0104_exam.sql
-- Módulo — Exames. Schema `exam`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — runbook §34, a Onda Vinte e Um (Fase 3
-- — o Vertical 🏥 Saúde). Nasce sob `vertical_key='health'`.
--
-- Taxonomia: Vertical 🏥 Saúde (§6) — capacidade *Exames*.
-- Spec/decisões: docs/canon/ONDA-VINTE-E-UM-DECISOES.md · MODULO-EXAM-SPEC.md
--
-- ⚠️⚠️ DADO SENSÍVEL DE SAÚDE (LGPD Art. 5º, II). É o terceiro módulo clínico
-- com a camada a mais: TRILHA DE LEITURA.
--
-- -----------------------------------------------------------------------------
-- ⭐ PEDIDO → RESULTADO — duas fases, a física do `chk`
-- -----------------------------------------------------------------------------
-- O exame é DUAS coisas no tempo: o PEDIDO nasce (`requested`), e o RESULTADO é
-- um ATO IMUTÁVEL apenso depois. É a física do `chk`: o modelo congela na
-- abertura, a resposta não se rasura. Anexar o resultado leva o pedido a
-- `resulted` (terminal). Um pedido pode ser `cancelled` antes de sair o
-- resultado (com razão). Resultado ERRADO não se reescreve — o certo é um
-- exame NOVO (o pedido guarda a história, inclusive a do erro).
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ A TRILHA DE LEITURA — o RESULTADO (conteúdo clínico) só por porta que LOGA
-- -----------------------------------------------------------------------------
-- O cabeçalho do pedido (paciente, tipo, status) é metadata legível. O que é
-- PHI é o RESULTADO (o laudo/achado): `exam.results` NÃO concede SELECT ao
-- cliente. A única porta é `exam.read_result()` (security definer), que INSERE
-- em `exam.access_log` ANTES de devolver. Não há como ler o resultado sem
-- rastro (o DIVERGE consciente do record, igual ao prescription).
--
-- ANTI-VIÉS: o tipo do exame é TEXTO LIVRE — nunca enum. Paciente por ID SOLTO
-- ao patient. ⛔ Laudo/imagem em Storage (capacidade do Core não construída)
-- FORA: o resultado é TEXTO (`result_content`), como o `reference` do ops.
-- =============================================================================

create schema if not exists exam;

comment on schema exam is
  'Módulo Exames. Vertical health (Saúde). ⚠️ DADO SENSÍVEL. Duas fases: o pedido (requested, tipo TEXTO LIVRE, paciente id solto) e o resultado (ato IMUTÁVEL apenso — a física do chk); requested → resulted | cancelled, terminais. ⭐⭐ TRILHA DE LEITURA do RESULTADO: results não concede SELECT; a única porta é exam.read_result() (security definer), que loga em exam.access_log antes de devolver. Laudo/imagem em Storage FORA (result é texto). Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA + acesso
-- =============================================================================

create or replace function exam.emit_event(
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
  if p_event_type not like 'exam.%' then
    raise exception 'exam.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'exam',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function exam.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function exam.can_write(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select core.has_permission(p_tenant_id, 'exam.exam.write');
$$;

create or replace function exam.can_read(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select core.has_permission(p_tenant_id, 'exam.exam.read');
$$;

create or replace function exam.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =============================================================================
-- 2. REQUESTS — o pedido: METADATA legível, ciclo requested → resulted|cancelled
-- =============================================================================

create table exam.requests (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references core.tenants (id) on delete cascade,
  patient_id     uuid        not null,
  patient_name   text        not null default '',
  -- ⭐ Tipo do exame — TEXTO LIVRE (hemograma, raio-x, ressonância…), não vazio.
  exam_type      text        not null check (length(btrim(exam_type)) > 0),
  requester_name text        not null default '',
  notes          text        not null default '',
  status         text        not null default 'requested'
                 check (status in ('requested', 'resulted', 'cancelled')),
  cancel_reason  text        not null default '',
  constraint exam_cancel_reason_ck check (
    (status = 'cancelled' and length(btrim(cancel_reason)) > 0)
    or (status <> 'cancelled' and cancel_reason = '')
  ),
  requested_at   timestamptz not null default now(),
  requested_by   uuid        references auth.users (id) on delete set null,
  updated_at     timestamptz not null default now(),
  constraint exam_requests_id_tenant unique (id, tenant_id)
);

create index exam_requests_by_patient_idx
  on exam.requests (tenant_id, patient_id, requested_at desc);

create trigger exam_requests_touch
  before update on exam.requests
  for each row execute function exam.touch_updated_at();

alter table exam.requests enable row level security;
alter table exam.requests force row level security;

-- Cabeçalho legível (metadata). O RESULTADO é que fica atrás da porta que loga.
create policy exam_requests_select on exam.requests
  for select to authenticated
  using (core.has_permission(tenant_id, 'exam.exam.read')
      or core.has_permission(tenant_id, 'exam.exam.write'));

create policy exam_requests_insert on exam.requests
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'exam.exam.write'));

create policy exam_requests_update on exam.requests
  for update to authenticated
  using (core.has_permission(tenant_id, 'exam.exam.write'))
  with check (core.has_permission(tenant_id, 'exam.exam.write'));

-- ⛔ Sem DELETE. Pedido é história.

create or replace function exam.guard_request_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'requested' then
    raise exception 'o exame nasce como pedido — o resultado é ato à parte' using errcode = '22023';
  end if;
  new.requested_by := (select auth.uid());
  return new;
end;
$$;

create trigger exam_requests_stamp
  before insert on exam.requests
  for each row execute function exam.guard_request_insert();

create or replace function exam.allowed_transition(p_from text, p_to text)
returns boolean language sql immutable as $$
  select (p_from, p_to) in (
    ('requested', 'resulted'),
    ('requested', 'cancelled')
  );
$$;

comment on function exam.allowed_transition(text, text) is
  'Ciclo do pedido de exame. requested → resulted | cancelled, terminais. Resultado errado é exame NOVO (a física do chk).';

create or replace function exam.guard_request_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = old.status then
    -- edição do pedido: só enquanto PENDENTE.
    if old.status <> 'requested' then
      raise exception 'pedido com desfecho não se edita: o exame refeito é outro pedido' using errcode = '42501';
    end if;
    return new;
  end if;

  if not exam.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo do exame', old.status, new.status using errcode = '22023';
  end if;

  if not core.has_permission(new.tenant_id, 'exam.exam.write') then
    raise exception 'anexar resultado ou cancelar um exame exige a permissão exam.exam.write' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger exam_requests_guard_transition
  before update on exam.requests
  for each row execute function exam.guard_request_transition();

-- =============================================================================
-- 3. RESULTS — o resultado: ATO IMUTÁVEL apenso, 1:1, e SEM SELECT ao cliente
-- -----------------------------------------------------------------------------
-- Anexar um resultado leva o pedido a `resulted` (o gatilho AFTER). O conteúdo
-- (laudo/achado) é TEXTO e não tem SELECT: lê-se por exam.read_result(), que loga.
-- =============================================================================

create table exam.results (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references core.tenants (id) on delete cascade,
  request_id     uuid        not null,
  -- ⭐ O conteúdo do resultado — TEXTO (Storage FORA). Não vazio.
  result_content text        not null check (length(btrim(result_content)) > 0),
  resulted_at    timestamptz not null default now(),
  resulted_by    uuid        references auth.users (id) on delete set null,
  -- 1:1 com o pedido — um pedido, um resultado.
  constraint exam_results_request_unique unique (request_id, tenant_id),
  constraint exam_results_request_fk
    foreign key (request_id, tenant_id)
    references exam.requests (id, tenant_id) on delete cascade
);

alter table exam.results enable row level security;
alter table exam.results force row level security;

-- ⛔ SEM SELECT: a leitura do resultado é só pela função que loga.
create policy exam_results_insert on exam.results
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'exam.exam.write'));

-- ⛔ SEM UPDATE e SEM DELETE — o resultado é ato consumado.

create or replace function exam.guard_result_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
begin
  select status into v_status
    from exam.requests
   where id = new.request_id and tenant_id = new.tenant_id;

  if v_status is null then
    raise exception 'pedido de exame não existe neste tenant' using errcode = 'foreign_key_violation';
  end if;
  if v_status <> 'requested' then
    raise exception 'só se anexa resultado a pedido PENDENTE (o pedido está %)', v_status using errcode = '42501';
  end if;

  new.resulted_at := now();
  new.resulted_by := (select auth.uid());
  return new;
end;
$$;

create trigger exam_results_stamp
  before insert on exam.results
  for each row execute function exam.guard_result_insert();

create or replace function exam.guard_result_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'o resultado do exame é ato consumado: não se edita nem se apaga. Corrigir é um exame NOVO.' using errcode = '42501';
end;
$$;

create trigger exam_results_immutable
  before update or delete on exam.results
  for each row execute function exam.guard_result_immutable();

-- Anexar o resultado leva o pedido a `resulted`.
create or replace function exam.on_result_recorded()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update exam.requests
     set status = 'resulted'
   where id = new.request_id and tenant_id = new.tenant_id;
  return new;
end;
$$;

create trigger exam_results_advance_request
  after insert on exam.results
  for each row execute function exam.on_result_recorded();

-- =============================================================================
-- 4. ⭐⭐ ACCESS_LOG + read_result — a trilha de LEITURA do resultado
-- =============================================================================

create table exam.access_log (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references core.tenants (id) on delete cascade,
  patient_id  uuid        not null,
  request_id  uuid        not null,
  accessed_by uuid        references auth.users (id) on delete set null,
  accessed_at timestamptz not null default now()
);

create index exam_access_log_by_patient_idx
  on exam.access_log (tenant_id, patient_id, accessed_at desc);

alter table exam.access_log enable row level security;
alter table exam.access_log force row level security;

create policy exam_access_log_select on exam.access_log
  for select to authenticated
  using (core.has_permission(tenant_id, 'exam.access.read'));

-- ⛔ SEM INSERT/UPDATE/DELETE ao cliente: só read_result escreve (definer).
create or replace function exam.guard_access_log_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'a trilha de acesso é append-only: não se edita nem se apaga.' using errcode = '42501';
end;
$$;

create trigger exam_access_log_immutable
  before update or delete on exam.access_log
  for each row execute function exam.guard_access_log_immutable();

create or replace function exam.read_result(p_tenant_id uuid, p_request_id uuid)
returns setof exam.results
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient uuid;
begin
  if not core.has_permission(p_tenant_id, 'exam.exam.read') then
    raise exception 'sem permissão para ler o resultado do exame' using errcode = '42501';
  end if;

  select patient_id into v_patient
    from exam.requests
   where id = p_request_id and tenant_id = p_tenant_id;

  if v_patient is null then
    raise exception 'pedido de exame não encontrado neste tenant' using errcode = 'no_data_found';
  end if;

  -- ⭐⭐ LOGA O ACESSO antes de devolver o resultado.
  insert into exam.access_log (tenant_id, patient_id, request_id, accessed_by)
  values (p_tenant_id, v_patient, p_request_id, (select auth.uid()));

  return query
    select r.* from exam.results r
     where r.tenant_id = p_tenant_id and r.request_id = p_request_id;
end;
$$;

comment on function exam.read_result(uuid, uuid) is
  'A ÚNICA porta de leitura do resultado (o laudo — conteúdo clínico). Registra o acesso em exam.access_log ANTES de devolver. Não há leitura do resultado sem log.';

-- =============================================================================
-- 5. OS FATOS — o envelope NÃO carrega o resultado (dado sensível)
-- =============================================================================

create or replace function exam.request_payload(p exam.requests)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'examId',      p.id,
    'patientId',   p.patient_id,
    'patientName', p.patient_name,
    'examType',    p.exam_type,
    'status',      p.status
  );
$$;

comment on function exam.request_payload(exam.requests) is
  'O envelope de um exame — AUTOSSUFICIENTE e SEM o resultado (dado sensível não passeia). Quem escuta não faz join.';

create or replace function exam.on_request_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform exam.emit_event(new.tenant_id, 'exam.request.requested', exam.request_payload(new));
    return new;
  end if;

  if new.status is distinct from old.status then
    perform exam.emit_event(
      new.tenant_id,
      case new.status
        when 'resulted'  then 'exam.request.resulted'
        when 'cancelled' then 'exam.request.cancelled'
      end,
      exam.request_payload(new)
    );
  end if;

  return new;
end;
$$;

create trigger exam_requests_emit
  after insert or update on exam.requests
  for each row execute function exam.on_request_changed();

-- =============================================================================
-- 6. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022: o revoke vem DEPOIS de toda função; função nasce aberta a
-- PUBLIC — revogar de novo antes de conceder.
-- =============================================================================

revoke all on schema exam                  from public, anon, authenticated;
revoke all on all tables    in schema exam from public, anon, authenticated;
revoke all on all functions in schema exam from public, anon, authenticated;

grant usage on schema exam to authenticated;

grant select, insert, update on exam.requests to authenticated;
-- results: só INSERT (anexar); NADA de SELECT (a leitura loga); sem update/delete.
grant insert on exam.results to authenticated;
grant select on exam.access_log to authenticated;

grant execute on function exam.can_write(uuid) to authenticated;
grant execute on function exam.can_read(uuid) to authenticated;
grant execute on function exam.read_result(uuid, uuid) to authenticated;

-- `exam.emit_event`, `exam.request_payload` são encanamento. `anon` nada.

-- =============================================================================
-- FIM. Pedido → resultado (duas fases). Resultado imutável apenso, 1:1, sem
-- SELECT direto (a leitura loga). Trilha de acesso imutável. Resultado fora do
-- envelope. Tipo texto livre. Paciente por id solto. `consumes` VAZIO.
-- =============================================================================
