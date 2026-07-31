-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0094_secincident.sql
-- Módulo 79: Resposta a Incidentes de Segurança. Schema `secincident`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §32, o
-- quinto módulo da Onda Dezenove (Fase 3). Nasce sob `domain_key='infosec'`.
--
-- Taxonomia: Domain 🔐 Segurança da Informação — capacidade *Resposta a
-- incidentes* (§5).
-- Spec: docs/canon/MODULO-SECINCIDENT-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ O DIVERGE ASSINADO — secincident × occ (Módulo 16, Operações)
-- -----------------------------------------------------------------------------
-- O `occ` (Ocorrências) JÁ EXISTE, e a pergunta foi: um incidente de segurança
-- é uma Ocorrência com categoria "segurança", ou é physics distinta? É
-- DISTINTA, por DUAS razões — e as duas estão assinadas:
--
--   1. ⭐ O CICLO DE VIDA. A ocorrência é FATO CONSUMADO com UMA transição
--      (open → closed): o vazamento aconteceu, registra-se, encerra-se. O
--      incidente de segurança tem uma TIMELINE DE RESPOSTA de VÁRIAS fases (o
--      ciclo NIST: detected → contained → eradicated → recovered → closed) —
--      não é um fato que se encerra, é uma OPERAÇÃO que se conduz. O `occ` tem 1
--      par de transição; este tem 5 estados.
--   2. ⭐ A MUTABILIDADE. O `occ` nasce IMUTÁVEL (o relato do fato não se
--      reescreve). O incidente NÃO: o entendimento EVOLUI durante a resposta —
--      o vetor de ataque se descobre investigando, o escopo dos dados
--      comprometidos cresce. Por isso é editável ENQUANTO ABERTO e CONGELA no
--      fechamento (a física do `risk`, não a do `occ`).
--
-- ⭐ OS CAMPOS PRÓPRIOS que o `occ` não tem: `attack_vector` (como entraram) e
-- `affected_data` (o que foi comprometido) — texto livre; `severity` 1–5 CHECK.
-- São eles, e a timeline, que provam que não é o `occ` com outro nome.
--
-- ⭐ A RESPOSTA é livro IMUTÁVEL de atos (a física da tratativa do `occ`): cada
-- passo da resposta é um fato carimbado — o que se manteve do `occ`, de propósito.
--
-- ⛔ FORA: SOAR/playbook automático (Engine futura); integração SIEM (é
-- plataforma); forense/coleta de evidência (Storage do Core). Vínculo do `vuln`
-- a este é por id solto, do lado do vuln. `consumes` VAZIO.
-- =============================================================================

create schema if not exists secincident;

comment on schema secincident is
  'Módulo Resposta a Incidentes de Segurança. Domain infosec da Taxonomia. O DIVERGE do occ: timeline de resposta NIST (detected → contained → eradicated → recovered → closed, 5 estados vs 1 par do occ) e editável-enquanto-aberto/congela-no-fim (a física do risk, não a imutabilidade do occ). Campos próprios: attack_vector, affected_data (texto livre), severity 1–5 CHECK. A resposta é livro imutável de atos (a tratativa do occ). Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA
-- =============================================================================

create or replace function secincident.emit_event(
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
  if p_event_type not like 'secincident.%' then
    raise exception 'secincident.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'secincident',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function secincident.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function secincident.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'secincident.incident.manage');
$$;

create or replace function secincident.touch_updated_at()
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
-- 2. INCIDENTS — o incidente de segurança (ciclo NIST, editável enquanto aberto)
-- =============================================================================

create table secincident.incidents (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references core.tenants (id) on delete cascade,
  title          text        not null check (length(btrim(title)) > 0),
  description    text        not null check (length(btrim(description)) > 0),
  -- ⭐ Os campos PRÓPRIOS (o DIVERGE do occ): como entraram, o que comprometeram.
  attack_vector  text        not null default '',
  affected_data  text        not null default '',
  -- ⭐ Severidade 1–5 CHECK (física do método).
  severity       int         not null check (severity between 1 and 5),
  -- Quando foi DETECTADO — passado permitido, futuro recusado (o eco do occ).
  detected_at    timestamptz not null default now(),
  status         text        not null default 'detected'
                 check (status in ('detected', 'contained', 'eradicated', 'recovered', 'closed')),
  close_note     text        not null default '',
  closed_at      timestamptz,
  closed_by      uuid        references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  created_by     uuid        references auth.users (id) on delete set null,
  updated_at     timestamptz not null default now(),
  constraint secincident_incidents_id_tenant unique (id, tenant_id),
  constraint secincident_incidents_not_future check (detected_at <= now()),
  constraint secincident_incidents_close_coherent check (
    (status = 'closed' and closed_at is not null and length(btrim(close_note)) > 0)
    or (status <> 'closed' and closed_at is null)
  )
);

create index secincident_incidents_open_idx
  on secincident.incidents (tenant_id, severity desc, detected_at desc)
  where status <> 'closed';

create trigger secincident_incidents_touch
  before update on secincident.incidents
  for each row execute function secincident.touch_updated_at();

alter table secincident.incidents enable row level security;
alter table secincident.incidents force row level security;

create policy secincident_incidents_select on secincident.incidents
  for select to authenticated
  using (secincident.can_access(tenant_id));

create policy secincident_incidents_insert on secincident.incidents
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'secincident.incident.manage'));

create policy secincident_incidents_update on secincident.incidents
  for update to authenticated
  using (secincident.can_access(tenant_id))
  with check (secincident.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Incidente de segurança é história.

create or replace function secincident.guard_incident_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'detected' then
    raise exception 'o incidente nasce detectado — conter, erradicar, recuperar e fechar são atos à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger secincident_incidents_stamp
  before insert on secincident.incidents
  for each row execute function secincident.guard_incident_insert();

-- ⭐ O ciclo NIST linear + o atalho de falso-positivo (detected→closed). closed
-- é TERMINAL: o que recorre é incidente novo.
create or replace function secincident.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('detected',   'contained'),
    ('detected',   'closed'),
    ('contained',  'eradicated'),
    ('eradicated', 'recovered'),
    ('recovered',  'closed')
  );
$$;

comment on function secincident.allowed_transition(text, text) is
  'Ciclo NIST do incidente. Espelho de ALLOWED_TRANSITIONS em @alsham/secincident. detected → contained → eradicated → recovered → closed, + detected → closed (falso positivo). closed é TERMINAL (5 estados — o DIVERGE do occ, que tem 1 par).';

create or replace function secincident.guard_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not secincident.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo NIST do incidente: o que recorre é incidente novo',
      old.status, new.status
      using errcode = '22023';
  end if;

  if not core.has_permission(new.tenant_id, 'secincident.incident.manage') then
    raise exception 'mover o incidente exige a permissão secincident.incident.manage'
      using errcode = '42501';
  end if;

  if new.status = 'closed' then
    if length(btrim(new.close_note)) = 0 then
      raise exception 'fechar o incidente exige a nota de encerramento (lições aprendidas / conclusão)'
        using errcode = '22023';
    end if;
    new.closed_at := now();
    new.closed_by := (select auth.uid());
  end if;

  return new;
end;
$$;

create trigger secincident_incidents_guard_status
  before update of status on secincident.incidents
  for each row execute function secincident.guard_status_transition();

-- ⭐ Editável enquanto aberto; CONGELA ao fechar (a física do risk, o DIVERGE do occ).
create or replace function secincident.guard_content_frozen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'closed'
     and (new.title is distinct from old.title
          or new.description is distinct from old.description
          or new.attack_vector is distinct from old.attack_vector
          or new.affected_data is distinct from old.affected_data
          or new.severity is distinct from old.severity
          or new.detected_at is distinct from old.detected_at) then
    raise exception 'o incidente já foi fechado: nada nele muda mais'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger secincident_incidents_content_frozen
  before update on secincident.incidents
  for each row execute function secincident.guard_content_frozen();

-- =============================================================================
-- 3. RESPONSE_ACTIONS — ⭐ a timeline de resposta, atos IMUTÁVEIS (a tratativa do occ)
-- =============================================================================

create table secincident.response_actions (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null,
  incident_id   uuid        not null,
  action_taken  text        not null check (length(btrim(action_taken)) > 0),
  occurred_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  actor_user_id uuid        references auth.users (id) on delete set null,
  constraint secincident_actions_incident_fk
    foreign key (incident_id, tenant_id)
    references secincident.incidents (id, tenant_id) on delete restrict
);

create index secincident_actions_timeline_idx
  on secincident.response_actions (tenant_id, incident_id, occurred_at);

alter table secincident.response_actions enable row level security;
alter table secincident.response_actions force row level security;

create policy secincident_actions_select on secincident.response_actions
  for select to authenticated
  using (secincident.can_access(tenant_id));

create policy secincident_actions_insert on secincident.response_actions
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'secincident.incident.manage'));

-- ⛔ SEM policy de UPDATE/DELETE — a timeline é fato consumado.

create or replace function secincident.guard_action_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.actor_user_id := (select auth.uid());
  return new;
end;
$$;

create trigger secincident_actions_stamp
  before insert on secincident.response_actions
  for each row execute function secincident.guard_action_insert();

create or replace function secincident.guard_action_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'a ação de resposta é fato consumado: não se edita nem se apaga. Registre outra.'
    using errcode = '42501';
end;
$$;

create trigger secincident_actions_immutable
  before update or delete on secincident.response_actions
  for each row execute function secincident.guard_action_immutable();

-- =============================================================================
-- 4. PAYLOAD + EVENTOS
-- =============================================================================

create or replace function secincident.incident_payload(p_incident_id uuid, p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_i secincident.incidents;
begin
  select * into v_i from secincident.incidents where id = p_incident_id and tenant_id = p_tenant_id;
  if not found then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'incidentId', v_i.id,
    'title',      v_i.title,
    'severity',   v_i.severity,
    'status',     v_i.status,
    'detectedAt', v_i.detected_at,
    'closedAt',   v_i.closed_at
  );
end;
$$;

comment on function secincident.incident_payload(uuid, uuid) is
  'Envelope AUTOSSUFICIENTE do incidente — SÓ metadado (nunca o vetor de ataque nem os dados comprometidos no correio). Quem escuta não faz join.';

create or replace function secincident.on_incident_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform secincident.emit_event(new.tenant_id, 'secincident.incident.registered', secincident.incident_payload(new.id, new.tenant_id));
  return new;
end;
$$;

create trigger secincident_incidents_emit_registered
  after insert on secincident.incidents
  for each row execute function secincident.on_incident_registered();

create or replace function secincident.on_incident_changed()
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
                when 'contained'  then 'secincident.incident.contained'
                when 'eradicated' then 'secincident.incident.eradicated'
                when 'recovered'  then 'secincident.incident.recovered'
                when 'closed'     then 'secincident.incident.closed'
                else null
              end;
    if v_type is not null then
      perform secincident.emit_event(new.tenant_id, v_type, secincident.incident_payload(new.id, new.tenant_id));
    end if;
  end if;
  return new;
end;
$$;

create trigger secincident_incidents_emit_changed
  after update of status on secincident.incidents
  for each row execute function secincident.on_incident_changed();

create or replace function secincident.on_action_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform secincident.emit_event(
    new.tenant_id, 'secincident.action.recorded',
    jsonb_build_object('incidentId', new.incident_id, 'actionId', new.id, 'occurredAt', new.occurred_at)
  );
  return new;
end;
$$;

create trigger secincident_actions_emit_recorded
  after insert on secincident.response_actions
  for each row execute function secincident.on_action_recorded();

-- =============================================================================
-- 5. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema secincident                  from public, anon, authenticated;
revoke all on all tables    in schema secincident from public, anon, authenticated;
revoke all on all functions in schema secincident from public, anon, authenticated;

grant usage on schema secincident to authenticated;

grant select, insert, update on secincident.incidents to authenticated;
-- ⛔ SÓ SELECT e INSERT na timeline: reescrever não existe.
grant select, insert on secincident.response_actions to authenticated;

grant execute on function secincident.can_access(uuid) to authenticated;

-- `secincident.emit_event` e os payloads NÃO são concedidos. `anon` nada.

-- =============================================================================
-- FIM. Ciclo NIST de 5 estados (o DIVERGE do occ). Campos próprios (vetor,
-- dados). Timeline imutável. O vetor/dados não passeiam no envelope. Nenhum
-- objeto fora de `secincident`. Nenhuma leitura de schema alheio. `consumes`
-- VAZIO.
-- =============================================================================
