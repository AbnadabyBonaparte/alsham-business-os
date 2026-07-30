-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0051_perf.sql
-- Módulo 36: Avaliação de Desempenho. Schema `perf`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §21,
-- quarto módulo da Missão Oito (Onda 5 — o BLOCO DE PESSOAS).
--
-- Taxonomia: Domain 👥 RH — capacidade *Avaliação* (RH tem 14 capacidades;
-- esta é uma delas, distinta de *OKRs*, que segue NÃO CONSTRUÍDA).
-- Spec: docs/canon/MODULO-PERF-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⚠️ `perf` NÃO É `goal` — o contraste é a lei desta migration
-- -----------------------------------------------------------------------------
-- `goal` (Módulo 23) mede a PRÓPRIA ambição declarada: o alvo é do dono da
-- meta, o check-in é reportado por quem persegue o próprio número, e o
-- veredito (achieved/missed) é do mesmo lado da mesa. `perf` é outra física:
-- é o JULGAMENTO de um AVALIADOR sobre o trabalho de um AVALIADO — dois
-- papéis, NUNCA a mesma coisa. Não existe "auto-avaliação estruturada"
-- aqui; se um dia existir, é capacidade nova, com o mesmo cuidado que
-- separou `goal` de `perf` desta vez. Por isso `perf.reviews` carrega
-- `reviewee_id` (quem foi avaliado, ID SOLTO — vínculo com o `hr`, sem FK
-- cruzada) E `reviewer_id` (quem avaliou, carimbado pelo SERVIDOR): a
-- pessoa que escreve nunca é digitada, é auth.uid() do ato.
--
-- -----------------------------------------------------------------------------
-- ⭐ A AVALIAÇÃO É FATO CONSUMADO — imutável em duas camadas
-- -----------------------------------------------------------------------------
-- A física do `crm` (interação) e do `vis` (visita): uma avaliação registrada
-- é história, não rascunho. Sem policy de UPDATE/DELETE em `perf.reviews` e,
-- por trás, um gatilho `before update or delete` que recusa até para o dono
-- do banco. Corrigir uma nota errada é registrar OUTRA avaliação — nunca
-- rasurar a anterior.
--
-- -----------------------------------------------------------------------------
-- ⭐ O CICLO — UM PAR SÓ, E `closed` É TERMINAL
-- -----------------------------------------------------------------------------
-- `open → closed`. O ciclo (trimestral, anual, semestral — TEXTO LIVRE, dado
-- do tenant) nasce aberto e só tem um caminho: fechar. Fechado CONGELA
-- inteiro (nome incluso) e NÃO reabre — reabrir misturaria avaliações de
-- duas épocas sob o mesmo rótulo, e o placar de RH que mistura épocas não
-- serve para decisão nenhuma. O próximo ciclo é ciclo NOVO. Fechar exige a
-- permissão `perf.cycle.manage` — quem registra avaliação (`perf.review.
-- manage`) não fecha ciclo sozinho.
--
-- ⭐ Avaliação só nasce em ciclo ABERTO: ciclo fechado não recebe avaliação
-- nova (o gatilho de `perf.reviews` confere o status do ciclo antes de
-- aceitar o INSERT).
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA nome do ciclo TEXTO LIVRE — "1º trimestre 2026", "Anual 2026",
--      "Avaliação de estágio" são todos o mesmo dado do tenant.
--   ✅ ENTRA nota (`rating`) OPCIONAL, escala 0–100 — quem não usa nota
--      numérica registra só o texto do parecer (`summary`), que é
--      obrigatório em toda avaliação.
--   ❌ NÃO ENTRA OKRs estruturados/cascata de metas de RH (capacidade
--      *OKRs* da Taxonomia — ofício próprio, `goal` já cobre a leitura
--      genérica de ambição; ver spec §5), 360°/calibração de comitê
--      (fluxo de aprovação em cadeia — futuro declarado), vínculo
--      automático com Folha/bônus (dado sensível, fora por lei do `hr`).
-- =============================================================================

create schema if not exists perf;

comment on schema perf is
  'Módulo Avaliação de Desempenho. Domain hr da Taxonomia. O julgamento de um avaliador sobre o trabalho de um avaliado — dois papéis, nunca a mesma coisa (o contraste com goal, que mede a própria ambição). Ciclo TEXTO LIVRE nasce aberto; fechar é terminal e congela o ciclo inteiro. A avaliação é fato consumado: imutável em duas camadas, só nasce em ciclo aberto, com o avaliador carimbado pelo servidor. Não cria objeto em core nem lê schema alheio.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — trigésima sexta vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function perf.emit_event(
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
  if p_event_type not like 'perf.%' then
    raise exception 'perf.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'perf',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function perf.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function perf.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'perf.cycle.manage')
      or core.has_permission(p_tenant_id, 'perf.review.manage');
$$;

create or replace function perf.touch_updated_at()
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
-- 2. CYCLES — o período de avaliação. Nasce aberto; fechar é terminal.
-- =============================================================================

create table perf.cycles (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references core.tenants (id) on delete cascade,
  -- ⭐ O ciclo é TEXTO LIVRE — trimestral, anual, o que o tenant chamar.
  name       text        not null check (length(btrim(name)) > 0),
  status     text        not null default 'open'
             check (status in ('open', 'closed')),
  -- ⭐ O ATO do fechamento: quem, quando — do servidor. Terminal.
  closed_at  timestamptz,
  closed_by  uuid        references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid        references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint perf_cycles_id_tenant unique (id, tenant_id),
  -- Fechado tem carimbo; aberto não tem nenhum.
  constraint perf_cycles_closure_coherent check (
    (status = 'closed' and closed_at is not null)
    or (status = 'open' and closed_at is null)
  )
);

create index perf_cycles_board_idx
  on perf.cycles (tenant_id, status, name);

create trigger perf_cycles_touch
  before update on perf.cycles
  for each row execute function perf.touch_updated_at();

alter table perf.cycles enable row level security;
alter table perf.cycles force row level security;

create policy perf_cycles_select on perf.cycles
  for select to authenticated
  using (perf.can_access(tenant_id));

create policy perf_cycles_insert on perf.cycles
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'perf.cycle.manage'));

create policy perf_cycles_update on perf.cycles
  for update to authenticated
  using (perf.can_access(tenant_id))
  with check (perf.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Um ciclo fechado é história de RH.

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre ABERTO
-- -----------------------------------------------------------------------------

create or replace function perf.guard_cycle_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'open' then
    raise exception 'o ciclo nasce aberto — fechar é decisão à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger perf_cycles_stamp
  before insert on perf.cycles
  for each row execute function perf.guard_cycle_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de CYCLE_TRANSITIONS em @alsham/performance
-- -----------------------------------------------------------------------------
-- ⭐ UM par só: open → closed. closed é TERMINAL.

create or replace function perf.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('open', 'closed')
  );
$$;

comment on function perf.allowed_transition(text, text) is
  'Ciclo de vida do ciclo de avaliação. Espelho de CYCLE_TRANSITIONS em @alsham/performance. UM par: open → closed. closed é TERMINAL — reabrir misturaria avaliações de duas épocas sob o mesmo rótulo; o próximo ciclo é ciclo novo.';

create or replace function perf.guard_cycle_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    -- Fechado congela: a época encerrou.
    if old.status = 'closed'
       and (new.name is distinct from old.name) then
      raise exception 'ciclo fechado não se edita: a época encerrou — o ciclo novo é ciclo novo'
        using errcode = '22023';
    end if;
    return new;
  end if;

  if not perf.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe: closed é terminal — o próximo é ciclo novo',
      old.status, new.status
      using errcode = '22023';
  end if;

  if new.status = 'closed' then
    if not core.has_permission(new.tenant_id, 'perf.cycle.manage') then
      raise exception 'fechar o ciclo exige a permissão perf.cycle.manage'
        using errcode = '42501';
    end if;
    new.closed_at := now();
    new.closed_by := (select auth.uid());
  end if;

  return new;
end;
$$;

create trigger perf_cycles_guard_status
  before update on perf.cycles
  for each row execute function perf.guard_cycle_transition();

-- =============================================================================
-- 3. REVIEWS — ⭐ o julgamento: ato imutável, avaliador carimbado pelo servidor
-- =============================================================================

create table perf.reviews (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references core.tenants (id) on delete cascade,
  cycle_id       uuid        not null,
  -- ⭐ ID SOLTO ao hr — sem FK cruzada. O vínculo é o dado + o nome carimbado.
  reviewee_id    uuid        not null,
  reviewee_name  text        not null check (length(btrim(reviewee_name)) > 0),
  -- ⭐ Carimbado pelo SERVIDOR (auth.uid()) no INSERT — nunca do formulário.
  reviewer_id    uuid        references auth.users (id) on delete set null,
  -- Nota OPCIONAL, escala 0–100. Quem não usa número registra só o parecer.
  rating         numeric(5,2) check (rating is null or (rating >= 0 and rating <= 100)),
  summary        text        not null check (length(btrim(summary)) > 0),
  recorded_at    timestamptz not null default now(),
  recorded_by    uuid        references auth.users (id) on delete set null,
  constraint perf_reviews_cycle_fk
    foreign key (cycle_id, tenant_id)
    references perf.cycles (id, tenant_id)
    on delete restrict
);

create index perf_reviews_idx
  on perf.reviews (tenant_id, cycle_id, recorded_at desc);

alter table perf.reviews enable row level security;
alter table perf.reviews force row level security;

create policy perf_reviews_select on perf.reviews
  for select to authenticated
  using (perf.can_access(tenant_id));

create policy perf_reviews_insert on perf.reviews
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'perf.review.manage'));

-- ⛔ Sem policy / grant de UPDATE ou DELETE. A avaliação não se rasura:
-- corrigir é registrar outra.

create or replace function perf.guard_review_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status
    from perf.cycles
   where id = new.cycle_id and tenant_id = new.tenant_id;

  if v_status is null then
    raise exception 'o ciclo não existe neste tenant' using errcode = '22023';
  end if;

  -- ⭐ Avaliação só nasce em ciclo ABERTO.
  if v_status <> 'open' then
    raise exception 'ciclo fechado não recebe avaliação nova: a época encerrou'
      using errcode = '22023';
  end if;

  -- ⭐ O avaliador é SEMPRE quem está agindo — nunca o que o formulário mandar.
  new.reviewer_id := (select auth.uid());
  new.recorded_at := now();
  new.recorded_by := (select auth.uid());

  return new;
end;
$$;

create trigger perf_reviews_stamp
  before insert on perf.reviews
  for each row execute function perf.guard_review_insert();

create or replace function perf.guard_reviews_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'avaliação é registro de fato consumado: não se edita nem se apaga — corrigir é registrar outra.'
    using errcode = '42501';
end;
$$;

create trigger perf_reviews_immutable
  before update or delete on perf.reviews
  for each row execute function perf.guard_reviews_immutable();

-- =============================================================================
-- 4. OS FATOS — payload autossuficiente
-- =============================================================================

create or replace function perf.cycle_payload(p perf.cycles)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'cycleId',  p.id,
    'name',     p.name,
    'status',   p.status,
    'closedAt', p.closed_at
  );
$$;

comment on function perf.cycle_payload(perf.cycles) is
  'O envelope de um ciclo de avaliação — AUTOSSUFICIENTE, com o nome (dado do tenant).';

create or replace function perf.on_cycle_opened()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform perf.emit_event(new.tenant_id, 'perf.cycle.opened', perf.cycle_payload(new));
  return new;
end;
$$;

create trigger perf_cycles_emit_opened
  after insert on perf.cycles
  for each row execute function perf.on_cycle_opened();

create or replace function perf.on_cycle_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status = 'closed' then
    perform perf.emit_event(new.tenant_id, 'perf.cycle.closed', perf.cycle_payload(new));
  end if;
  return new;
end;
$$;

create trigger perf_cycles_emit_changed
  after update on perf.cycles
  for each row execute function perf.on_cycle_changed();

create or replace function perf.review_payload(p perf.reviews)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cycle_name text;
begin
  select name into v_cycle_name
    from perf.cycles
   where id = p.cycle_id and tenant_id = p.tenant_id;

  return jsonb_build_object(
    'reviewId',     p.id,
    'cycleId',      p.cycle_id,
    'cycleName',    v_cycle_name,
    'revieweeId',   p.reviewee_id,
    'revieweeName', p.reviewee_name,
    'reviewerId',   p.reviewer_id,
    'rating',       p.rating,
    'recordedAt',   p.recorded_at
  );
end;
$$;

comment on function perf.review_payload(perf.reviews) is
  'O envelope de uma avaliação — AUTOSSUFICIENTE, com o nome do ciclo e o avaliado (id solto + nome) dentro. Quem escuta não faz join. O texto do parecer (summary) NÃO passeia no correio.';

create or replace function perf.on_review_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform perf.emit_event(new.tenant_id, 'perf.review.recorded', perf.review_payload(new));
  return new;
end;
$$;

create trigger perf_reviews_emit_recorded
  after insert on perf.reviews
  for each row execute function perf.on_review_recorded();

-- =============================================================================
-- 5. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema perf                  from public, anon, authenticated;
revoke all on all tables    in schema perf from public, anon, authenticated;
revoke all on all functions in schema perf from public, anon, authenticated;

grant usage on schema perf to authenticated;

grant select, insert, update on perf.cycles  to authenticated;
-- ⭐ SÓ INSERT+SELECT: a avaliação não se rasura.
grant select, insert         on perf.reviews to authenticated;

grant execute on function perf.can_access(uuid) to authenticated;

-- `perf.emit_event`, `perf.cycle_payload` e `perf.review_payload` NÃO são
-- concedidas — são encanamento dos gatilhos. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhuma auto-avaliação. Nenhum OKR estruturado. Nenhum
-- comitê de calibração. Nenhum objeto fora de `perf`. Nenhuma leitura de
-- schema alheio. `consumes` VAZIO — nenhum handler de RH nesta onda (Lei 7).
-- =============================================================================
