-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0050_train.sql
-- Módulo 35: Treinamentos. Schema `train`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §21,
-- depois do `0049_shift.sql`. Missão Oito (Onda 5 — o BLOCO DE PESSOAS).
--
-- Taxonomia: Domain 👥 RH — capacidade *Treinamentos* (Taxonomia §5, "👥 RH
-- (14)": Recrutamento · Seleção · Currículos · Admissão · Demissão · Férias
-- · Ponto · Escalas · Benefícios · Folha · Treinamentos · Avaliação · OKRs ·
-- Plano de carreira). Spec: docs/canon/MODULO-TRAIN-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ O MANTIDO: A FÍSICA DO `evt` REAPROVEITADA PARA DENTRO DE CASA
-- -----------------------------------------------------------------------------
-- O `evt` (Módulo 11) provou a identidade do evento universal: nasce
-- rascunho; publicar abre a lista; a lotação recusa claro; a presença é ATO
-- CARIMBADO pelo servidor. Este módulo reaproveita a MESMA física para o
-- evento interno — a turma de treinamento — sem reescrever a regra:
--   • sessão (turma) nasce `draft`; `published` ABRE a inscrição;
--   • a lotação (capacidade opcional) recusa claro, nunca lista de espera
--     silenciosa;
--   • a presença (`attended`) é ATO IMUTÁVEL, carimbado pelo servidor —
--     quem marcou e quando, nunca o formulário.
--
-- ⭐ O DIVERGE assinado: O TREINAMENTO TEM UM FIM QUE A PRESENÇA NÃO TEM
-- -----------------------------------------------------------------------------
-- No `evt` a inscrição termina em `attended` — quem veio, veio; não há
-- "aproveitamento" do evento. Aqui a inscrição vai ALÉM da presença: depois
-- de `attended`, ela pode chegar a `completed` — o colaborador TERMINOU o
-- programa, com data e uma nota OPCIONAL (texto livre, nunca escala
-- numérica imposta — o método de avaliação é do tenant). É a diferença
-- entre COMPARECER a um evento e CONCLUIR um treinamento: presença é fato
-- de calendário; conclusão é fato de aprendizagem, e por isso ganha um
-- terceiro estado que o evt nunca precisou ter.
--
-- ⭐ TRÊS TABELAS, NÃO DUAS — a diferença estrutural com o `evt`
-- -----------------------------------------------------------------------------
-- O `evt` tem evento + inscrição. Aqui há um nível a mais: PROGRAMA (o curso,
-- ex.: "Integração de Novos Colaboradores") agrupa várias TURMAS (as edições
-- concretas, com data e vaga). Uma empresa RECICLA o mesmo programa em
-- turmas diferentes ao longo do ano — o evt não tinha essa necessidade
-- porque o evento universal (a feira, o workshop avulso) não se repete com
-- o mesmo conteúdo estruturado.
--
-- ⭐ `active ↔ archived` no PROGRAMA — a física do `spc` espaço, não do `hr`
-- -----------------------------------------------------------------------------
-- Um programa arquivado é o MESMO programa que pode voltar a rodar turmas
-- (a empresa reativa o treinamento de integração no ano seguinte) — a
-- física do `spc` ("a sala reformada que reabre é a MESMA sala"), NÃO a do
-- `hr` (`terminated` é terminal). Arquivar não apaga as turmas já dadas.
--
-- -----------------------------------------------------------------------------
-- ⚠️ DADO DE PESSOA — vínculo SOLTO, nome carimbado pela tela
-- -----------------------------------------------------------------------------
-- `trainee_id` é ID SOLTO (sem FK para `hr` ou qualquer outro schema — a Lei
-- do Lego: acoplamento por evento, nunca por tabela alheia). `trainee_name`
-- é texto livre carimbado pela tela no momento da inscrição, como o
-- `attendee_name` do evt. ⛔ Nenhum CPF, dado de saúde ou bancário existe
-- aqui — nem a nota (`grade`) é estruturada: é texto livre opcional, porque
-- o método de avaliação (nota 0-10, conceito A/B/C, aprovado/reprovado) é
-- do tenant, nunca do produto.
--
-- ⛔ **Certificado é Storage do Core — DECLARADO FORA (spec §5).** Emitir um
-- PDF de certificado exigiria armazenamento de arquivo, que não existe
-- nesta plataforma (Taxonomia §3, capacidade não construída). Este módulo
-- registra a conclusão; gerar e guardar o documento é peça futura.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA título/descrição de programa e turma TEXTO LIVRE — o catálogo
--      de treinamento é de cada empresa (integração, NR-35, atendimento,
--      liderança — o produto não sabe o nome de nenhum).
--   ✅ ENTRA nota (`grade`) TEXTO LIVRE OPCIONAL — o método de avaliação é
--      do tenant; congelar uma escala numérica envelheceria com a primeira
--      empresa que usa conceito, não nota.
--   ❌ NÃO ENTRA certificado/emissão de documento (Storage do Core, FORA).
--   ❌ NÃO ENTRA trilha de aprendizagem estruturada (módulos, quizzes,
--      LMS) — isto é cadastro de programa/turma/presença, não uma
--      plataforma de ensino à distância.
--   ❌ NÃO ENTRA CPF, dado de saúde, conta bancária do colaborador.
-- =============================================================================

create schema if not exists train;

comment on schema train is
  'Módulo Treinamentos. Domain hr da Taxonomia (RH). Programa (o curso) agrupa turmas (as edições); turma publicada abre inscrição, a física do evt; a presença é ato imutável carimbado pelo servidor; a conclusão do programa é um terceiro estado que a presença sozinha não tem, com nota opcional em texto livre. Colaborador por id solto + nome carimbado. Sem certificado (Storage do Core, declarado FORA). Não cria objeto em core nem lê schema alheio.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — trigésima quinta vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function train.emit_event(
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
  if p_event_type not like 'train.%' then
    raise exception 'train.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'train',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function train.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function train.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'train.setup.manage')
      or core.has_permission(p_tenant_id, 'train.enrollment.manage');
$$;

create or replace function train.touch_updated_at()
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
-- 2. PROGRAMS — o curso (agrupa turmas)
-- -----------------------------------------------------------------------------
-- `active ↔ archived` — a física do espaço do `spc`: o programa arquivado é
-- o MESMO programa e pode voltar a rodar turmas.
-- =============================================================================

create table train.programs (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references core.tenants (id) on delete cascade,
  name        text        not null check (length(btrim(name)) > 0),
  description text        not null default '',
  status      text        not null default 'active'
              check (status in ('active', 'archived')),
  created_at  timestamptz not null default now(),
  created_by  uuid        references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  constraint train_programs_id_tenant unique (id, tenant_id)
);

create index train_programs_roster_idx
  on train.programs (tenant_id, status, name);

create trigger train_programs_touch
  before update on train.programs
  for each row execute function train.touch_updated_at();

alter table train.programs enable row level security;
alter table train.programs force row level security;

create policy train_programs_select on train.programs
  for select to authenticated
  using (train.can_access(tenant_id));

create policy train_programs_insert on train.programs
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'train.setup.manage'));

create policy train_programs_update on train.programs
  for update to authenticated
  using (core.has_permission(tenant_id, 'train.setup.manage'))
  with check (core.has_permission(tenant_id, 'train.setup.manage'));

-- ⛔ Sem policy / grant de DELETE. Programa arquivado é história — as
-- turmas já dadas continuam contando a dele.

-- =============================================================================
-- 3. SESSIONS — a turma (a edição concreta do programa, com data e vaga)
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS:
--   ✅ ENTRA `capacity` OPCIONAL. Turma sem teto existe.
--   ❌ NÃO ENTRA local/instrutor estruturado nesta onda — o título/descrição
--      carrega o que for preciso (a física do evt: campo estruturado
--      demais envelhece com o primeiro formato que não serve).
-- =============================================================================

create table train.sessions (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references core.tenants (id) on delete cascade,
  program_id uuid        not null,
  title      text        not null check (length(btrim(title)) > 0),
  starts_at  timestamptz not null,
  capacity   integer     check (capacity is null or capacity > 0),
  status     text        not null default 'draft'
             check (status in ('draft', 'published', 'concluded', 'cancelled')),
  created_at timestamptz not null default now(),
  created_by uuid        references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint train_sessions_id_tenant unique (id, tenant_id),
  constraint train_sessions_program_fk
    foreign key (program_id, tenant_id)
    references train.programs (id, tenant_id) on delete restrict
);

create index train_sessions_upcoming_idx
  on train.sessions (tenant_id, starts_at)
  where status in ('draft', 'published');

create trigger train_sessions_touch
  before update on train.sessions
  for each row execute function train.touch_updated_at();

alter table train.sessions enable row level security;
alter table train.sessions force row level security;

create policy train_sessions_select on train.sessions
  for select to authenticated
  using (train.can_access(tenant_id));

create policy train_sessions_insert on train.sessions
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'train.setup.manage'));

create policy train_sessions_update on train.sessions
  for update to authenticated
  using (core.has_permission(tenant_id, 'train.setup.manage'))
  with check (core.has_permission(tenant_id, 'train.setup.manage'));

-- ⛔ Sem policy / grant de DELETE. Turma cancelada é história.

-- -----------------------------------------------------------------------------
-- 3.1 Transições da turma — espelho de SESSION_TRANSITIONS em @alsham/training
-- -----------------------------------------------------------------------------
-- ⭐ Igual ao evt: `concluded` e `cancelled` são TERMINAIS.

create or replace function train.allowed_session_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('draft',     'published'),
    ('draft',     'cancelled'),
    ('published', 'concluded'),
    ('published', 'cancelled')
  );
$$;

comment on function train.allowed_session_transition(text, text) is
  'Ciclo de vida da turma. Espelho de SESSION_TRANSITIONS em @alsham/training — há teste que lê este arquivo e compara. A mesma física do evt: publicar abre inscrição; concluded e cancelled são terminais.';

create or replace function train.guard_session_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not train.allowed_session_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida da turma', old.status, new.status
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger train_sessions_guard_status
  before update of status on train.sessions
  for each row execute function train.guard_session_transition();

-- =============================================================================
-- 4. ENROLLMENTS — a inscrição do colaborador na turma
-- -----------------------------------------------------------------------------
-- ⭐ `trainee_id` é ID SOLTO (sem FK para hr ou qualquer schema alheio) e
-- `trainee_name` é texto livre carimbado pela tela — como o attendee_name
-- do evt.
--
-- ⭐ A presença é ATO IMUTÁVEL, carimbado pelo servidor. A conclusão vai
-- ALÉM da presença — o terceiro estado que o evt nunca precisou ter.
-- =============================================================================

create table train.enrollments (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references core.tenants (id) on delete cascade,
  session_id     uuid        not null,
  -- ⭐ ID SOLTO — sem FK para hr.employees ou qualquer schema alheio.
  trainee_id     uuid        not null,
  trainee_name   text        not null check (length(btrim(trainee_name)) > 0),
  status         text        not null default 'registered'
                 check (status in ('registered', 'attended', 'completed', 'cancelled')),
  -- ⭐ O carimbo do ATO da presença. Do servidor, nunca da tela.
  attended_at    timestamptz,
  attended_by    uuid        references auth.users (id) on delete set null,
  -- ⭐ O carimbo do ATO da conclusão. Do servidor, nunca da tela.
  completed_at   timestamptz,
  completed_by   uuid        references auth.users (id) on delete set null,
  -- ⭐ Nota OPCIONAL, TEXTO LIVRE — o método de avaliação é do tenant.
  grade          text        not null default '',
  created_at     timestamptz not null default now(),
  created_by     uuid        references auth.users (id) on delete set null,
  updated_at     timestamptz not null default now(),
  constraint train_enrollments_session_fk
    foreign key (session_id, tenant_id)
    references train.sessions (id, tenant_id) on delete restrict,
  -- O estado e o carimbo da presença contam a mesma história.
  constraint train_enrollments_attended_coherent check (
    (status in ('attended', 'completed') and attended_at is not null) or
    (status not in ('attended', 'completed') and attended_at is null)
  ),
  -- O estado e o carimbo da conclusão contam a mesma história.
  constraint train_enrollments_completed_coherent check (
    (status = 'completed' and completed_at is not null) or
    (status <> 'completed' and completed_at is null)
  )
);

create index train_enrollments_session_idx
  on train.enrollments (tenant_id, session_id, status);

create trigger train_enrollments_touch
  before update on train.enrollments
  for each row execute function train.touch_updated_at();

alter table train.enrollments enable row level security;
alter table train.enrollments force row level security;

create policy train_enrollments_select on train.enrollments
  for select to authenticated
  using (train.can_access(tenant_id));

create policy train_enrollments_insert on train.enrollments
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'train.enrollment.manage'));

create policy train_enrollments_update on train.enrollments
  for update to authenticated
  using (core.has_permission(tenant_id, 'train.enrollment.manage'))
  with check (core.has_permission(tenant_id, 'train.enrollment.manage'));

-- ⛔ Sem policy / grant de DELETE. Quem cancelou a inscrição fica
-- registrado como quem cancelou — a lista de uma turma é história dela.

-- -----------------------------------------------------------------------------
-- 4.1 O porteiro da inscrição: só turma PUBLICADA recebe inscrição, e a
-- lotação é recusa clara — não silêncio (a física do evt).
-- -----------------------------------------------------------------------------

create or replace function train.guard_enrollment_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session train.sessions;
  v_ativos  integer;
begin
  select * into v_session
    from train.sessions
   where id = new.session_id and tenant_id = new.tenant_id;

  if v_session.status is distinct from 'published' then
    raise exception 'inscrição só em turma PUBLICADA (esta está %): publicar é justamente abrir a inscrição', coalesce(v_session.status, 'inexistente')
      using errcode = '22023';
  end if;

  -- ⭐ A LOTAÇÃO: cancelada não ocupa vaga; todo o resto ocupa.
  if v_session.capacity is not null then
    select count(*) into v_ativos
      from train.enrollments e
     where e.session_id = new.session_id
       and e.tenant_id = new.tenant_id
       and e.status <> 'cancelled';

    if v_ativos >= v_session.capacity then
      raise exception 'a turma está LOTADA (% de % vagas): lista de espera é capacidade futura — não aceite além do teto', v_ativos, v_session.capacity
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

create trigger train_enrollments_guard_insert
  before insert on train.enrollments
  for each row execute function train.guard_enrollment_insert();

-- -----------------------------------------------------------------------------
-- 4.2 Transições da inscrição — espelho de ENROLLMENT_TRANSITIONS
-- -----------------------------------------------------------------------------
-- ⭐ `completed` e `cancelled` são TERMINAIS. `attended → completed` é o
-- DIVERGE assinado do evt: a conclusão é um fato que a presença sozinha
-- não conta.

create or replace function train.allowed_enrollment_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('registered', 'attended'),
    ('registered', 'cancelled'),
    ('attended',   'completed'),
    ('attended',   'cancelled')
  );
$$;

comment on function train.allowed_enrollment_transition(text, text) is
  'Ciclo de vida da inscrição. Espelho de ENROLLMENT_TRANSITIONS em @alsham/training. completed e cancelled são terminais; attended → completed é o DIVERGE assinado do evt — a conclusão do treinamento é um fato além da presença.';

create or replace function train.guard_enrollment_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_status text;
begin
  if new.status = old.status then
    return new;
  end if;

  if not train.allowed_enrollment_transition(old.status, new.status) then
    raise exception 'transição % → % não existe: completed e cancelled são terminais', old.status, new.status
      using errcode = '22023';
  end if;

  -- ⭐ A PRESENÇA: só em turma publicada ou concluída, e o carimbo é do
  -- servidor — a tela não escolhe autor nem hora. (Uma turma ainda em
  -- rascunho não tem inscrição — a inscrição só nasce depois de publicada
  -- — então esta guarda cobre a turma que avançou para concluded também.)
  if new.status = 'attended' then
    select status into v_session_status
      from train.sessions
     where id = new.session_id and tenant_id = new.tenant_id;

    if v_session_status not in ('published', 'concluded') then
      raise exception 'presença só em turma publicada ou concluída (esta está %)', v_session_status
        using errcode = '22023';
    end if;

    new.attended_at := now();
    new.attended_by := (select auth.uid());
  end if;

  -- ⭐ A CONCLUSÃO: carimbo do servidor, nunca da tela.
  if new.status = 'completed' then
    new.completed_at := now();
    new.completed_by := (select auth.uid());
  end if;

  return new;
end;
$$;

create trigger train_enrollments_guard_status
  before update of status on train.enrollments
  for each row execute function train.guard_enrollment_transition();

-- =============================================================================
-- 5. PAYLOADS + EVENTOS DA CAIXA DE SAÍDA
-- -----------------------------------------------------------------------------
-- ⭐ Nem PROGRAMA nem a criação/edição de TURMA emitem evento — só as
-- transições de status da turma e da inscrição, exatamente os sete fatos
-- do manifesto (Lei 7: nada além do que está construído e provado).
-- =============================================================================

create or replace function train.session_payload(p train.sessions)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_program train.programs;
begin
  select * into v_program
    from train.programs
   where id = p.program_id and tenant_id = p.tenant_id;

  return jsonb_build_object(
    'sessionId',   p.id,
    'programId',   p.program_id,
    'programName', v_program.name,
    'title',       p.title,
    'startsAt',    p.starts_at,
    'capacity',    p.capacity,
    'status',      p.status
  );
end;
$$;

comment on function train.session_payload(train.sessions) is
  'O envelope de uma turma — AUTOSSUFICIENTE, com o programa pelo NOME. Quem escuta não faz join.';

create or replace function train.enrollment_payload(p train.enrollments)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session train.sessions;
begin
  select * into v_session
    from train.sessions
   where id = p.session_id and tenant_id = p.tenant_id;

  return jsonb_build_object(
    'enrollmentId', p.id,
    'sessionId',    p.session_id,
    'sessionTitle', v_session.title,
    'traineeId',    p.trainee_id,
    'traineeName',  p.trainee_name,
    'status',       p.status,
    'grade',        p.grade
  );
end;
$$;

comment on function train.enrollment_payload(train.enrollments) is
  'O envelope de uma inscrição — AUTOSSUFICIENTE, com a turma pelo NOME e o colaborador por id solto + nome. Quem escuta não faz join.';

-- 5.1 Fatos da turma
create or replace function train.on_session_changed()
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
                when 'published' then 'train.session.published'
                when 'concluded' then 'train.session.concluded'
                when 'cancelled' then 'train.session.cancelled'
                else null
              end;
    if v_type is not null then
      perform train.emit_event(new.tenant_id, v_type, train.session_payload(new));
    end if;
  end if;

  return new;
end;
$$;

create trigger train_sessions_emit_changed
  after update on train.sessions
  for each row execute function train.on_session_changed();

-- 5.2 Fatos da inscrição
create or replace function train.on_enrollment_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform train.emit_event(new.tenant_id, 'train.enrollment.registered', train.enrollment_payload(new));
  return new;
end;
$$;

create trigger train_enrollments_emit_registered
  after insert on train.enrollments
  for each row execute function train.on_enrollment_registered();

create or replace function train.on_enrollment_changed()
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
                when 'attended'  then 'train.attendance.recorded'
                when 'completed' then 'train.enrollment.completed'
                when 'cancelled' then 'train.enrollment.cancelled'
                else null
              end;
    if v_type is not null then
      perform train.emit_event(new.tenant_id, v_type, train.enrollment_payload(new));
    end if;
  end if;

  return new;
end;
$$;

create trigger train_enrollments_emit_changed
  after update on train.enrollments
  for each row execute function train.on_enrollment_changed();

-- =============================================================================
-- 6. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema train                  from public, anon, authenticated;
revoke all on all tables    in schema train from public, anon, authenticated;
revoke all on all functions in schema train from public, anon, authenticated;

grant usage on schema train to authenticated;

grant select, insert, update on train.programs    to authenticated;
grant select, insert, update on train.sessions    to authenticated;
grant select, insert, update on train.enrollments to authenticated;

grant execute on function train.can_access(uuid) to authenticated;

-- `train.emit_event` NÃO é concedida. `train.session_payload` e
-- `train.enrollment_payload` são encanamento dos gatilhos. `anon` não
-- recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum certificado, CPF, dado de saúde ou bancário.
-- Nenhum objeto fora de `train`. Nenhuma leitura de schema alheio.
-- `consumes` VAZIO — nenhum handler de Treinamentos nesta onda (Lei 7).
-- =============================================================================
