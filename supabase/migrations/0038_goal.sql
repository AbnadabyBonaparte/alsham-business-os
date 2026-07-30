-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0038_goal.sql
-- Módulo 23: Metas. Schema `goal`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §19,
-- depois do `0037_lead.sql`.
--
-- Taxonomia: Domain 📊 BI — capacidade *Metas*.
-- Spec: docs/canon/MODULO-GOAL-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ POR QUE O DOMAIN É `bi` — e os HOMÔNIMOS declarados
-- -----------------------------------------------------------------------------
-- "Metas" aparece na Taxonomia em TRÊS lugares. O do 📊 BI é o bloco da
-- LEITURA do negócio (Dashboards · KPIs · Indicadores · METAS · Relatórios)
-- — e a meta é exatamente isso: o número DECLARADO e ACOMPANHADO. Este
-- módulo é a peça de ESCRITA desse bloco: o alvo e o livro de check-ins;
-- o painel lê. A *Metas* do CRM é o recorte comercial do mesmo ofício
-- (uma meta com métrica "vendas" — nenhuma coluna a mais); os *OKRs* do
-- RH são a cascata de gente — ofício próprio, declarado FUTURO (§ NÃO
-- ENTRA). Sol Único: uma palavra, um dono; os recortes ficam escritos.
--
-- -----------------------------------------------------------------------------
-- ⭐ O PROGRESSO É O ÚLTIMO CHECK-IN — CALCULADO, nunca coluna
-- -----------------------------------------------------------------------------
-- O padrão do termo vigente do ctr e do lugar do pat, re-perguntado para a
-- AMBIÇÃO: a meta congela o ALVO; o andamento é um LIVRO de check-ins
-- imutáveis (valor reportado + nota + carimbo do servidor), e o progresso
-- vigente é o ÚLTIMO check-in — view com security_invoker, ordenada por
-- seq identity (a lição do pat: dois atos na mesma transação têm o mesmo
-- now(), e desempatar por uuid seria loteria). Uma coluna de progresso
-- seria um placar editável — e placar editável não constrange ninguém.
--
-- ⭐ O SISTEMA NÃO MEDE NADA SOZINHO: quem reporta é GENTE. Medir
-- automático seria consumir eventos de outros módulos — handler que esta
-- onda não constrói (Lei 7). `consumes` é VAZIO e a spec declara.
--
-- -----------------------------------------------------------------------------
-- ⭐ O CICLO — re-perguntado, e cada resposta escrita
-- -----------------------------------------------------------------------------
-- draft → active → achieved | missed | cancelled (e draft → cancelled: o
-- rascunho que morre, morre com razão).
--
-- • Em DRAFT edita-se tudo: a meta ainda não corre.
-- • ATIVAR CONGELA alvo, métrica e período — mover a trave no meio do jogo
--   desmoraliza o placar. Descrição e dono seguem vivos (gente muda).
-- • achieved/missed é DECISÃO DE GENTE, carimbada pelo servidor: o alvo
--   INFORMA, o dono DECIDE — o número não fecha meta sozinho (a métrica é
--   texto livre; só o dono sabe se "faturamento" com imposto conta).
--   ⭐ Fechar como achieved/missed EXIGE ao menos UM check-in no livro:
--   fechar meta sem número na mesa é achismo.
-- • cancelled exige a razão escrita.
-- • Os TRÊS fins são TERMINAIS: a identidade da meta é o PERÍODO + o alvo
--   declarado — a meta do trimestre que vem é meta NOVA. Reabrir misturaria
--   épocas do placar, e placar que mistura épocas não diz nada.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA métrica TEXTO LIVRE ("faturamento", "NPS da praça", "lojas
--      ocupadas") — congelar as métricas de uma casa envelheceria todas.
--   ✅ ENTRA alvo numérico OPCIONAL (a unidade é da métrica); quando o
--      alvo é DINHEIRO, moeda junto (moeda declarada exige valor).
--   ✅ ENTRA dono opcional via core.memberships (padrão ops).
--   ❌ NÃO ENTRA cascata/árvore de OKR (futuro declarado — RH), percentual
--      mágico de progresso (sem direção declarada, % é número decorativo —
--      o pacote mostra último × alvo e o dono lê), vínculo automático com
--      cash/dre (Lei 7 — seria consumo sem handler).
-- =============================================================================

create schema if not exists goal;

comment on schema goal is
  'Módulo Metas. Domain bi da Taxonomia. O alvo declarado e o livro de check-ins imutáveis; o progresso é o último check-in — view calculada, nunca coluna; achieved/missed é decisão de gente carimbada; os fins são terminais — a meta do próximo período é meta nova. Não cria objeto em core nem lê schema alheio.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — vigésima terceira vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function goal.emit_event(
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
  if p_event_type not like 'goal.%' then
    raise exception 'goal.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'goal',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function goal.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function goal.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'goal.goal.manage')
      or core.has_permission(p_tenant_id, 'goal.goal.report')
      or core.has_permission(p_tenant_id, 'goal.goal.decide');
$$;

create or replace function goal.touch_updated_at()
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
-- 2. GOALS — a ambição declarada
-- =============================================================================

create table goal.goals (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid        not null references core.tenants (id) on delete cascade,
  title            text        not null check (length(btrim(title)) > 0),
  description      text        not null default '',
  -- ⭐ A métrica é TEXTO LIVRE — a unidade mora nela.
  metric           text        not null check (length(btrim(metric)) > 0),
  -- O alvo é OPCIONAL; quando é dinheiro, a moeda vem junto.
  target_value     numeric(18,4),
  currency         char(3)     check (currency is null or currency ~ '^[A-Z]{3}$'),
  starts_on        date        not null,
  ends_on          date        not null,
  assignee_user_id uuid,
  status           text        not null default 'draft'
                   check (status in ('draft', 'active', 'achieved', 'missed', 'cancelled')),
  -- ⭐ O ATO do desfecho: quem, quando — do servidor. Terminal.
  decided_at       timestamptz,
  decided_by       uuid        references auth.users (id) on delete set null,
  cancel_reason    text        not null default '',
  created_at       timestamptz not null default now(),
  created_by       uuid        references auth.users (id) on delete set null,
  updated_at       timestamptz not null default now(),
  constraint goal_goals_id_tenant unique (id, tenant_id),
  constraint goal_goals_assignee_fk
    foreign key (tenant_id, assignee_user_id)
    references core.memberships (tenant_id, user_id)
    on delete set null (assignee_user_id),
  constraint goal_goals_period check (ends_on >= starts_on),
  -- Moeda declarada exige o valor — dinheiro sem número é promessa.
  constraint goal_goals_money_pair check (
    currency is null or target_value is not null
  ),
  -- Desfecho tem carimbo; a razão é do cancelamento.
  constraint goal_goals_decision_coherent check (
    (status in ('achieved', 'missed') and decided_at is not null and cancel_reason = '')
    or (status = 'cancelled' and decided_at is not null
        and length(btrim(cancel_reason)) > 0)
    or (status in ('draft', 'active') and decided_at is null and cancel_reason = '')
  )
);

create index goal_goals_board_idx
  on goal.goals (tenant_id, status, ends_on);

create trigger goal_goals_touch
  before update on goal.goals
  for each row execute function goal.touch_updated_at();

alter table goal.goals enable row level security;
alter table goal.goals force row level security;

create policy goal_goals_select on goal.goals
  for select to authenticated
  using (goal.can_access(tenant_id));

create policy goal_goals_insert on goal.goals
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'goal.goal.manage'));

create policy goal_goals_update on goal.goals
  for update to authenticated
  using (goal.can_access(tenant_id))
  with check (goal.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Meta desistida é cancelamento com razão.

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre no rascunho
-- -----------------------------------------------------------------------------

create or replace function goal.guard_goal_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'draft' then
    raise exception 'a meta nasce no rascunho — ativar é decisão à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger goal_goals_stamp
  before insert on goal.goals
  for each row execute function goal.guard_goal_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/goals
-- -----------------------------------------------------------------------------

create or replace function goal.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('draft',  'active'),
    ('draft',  'cancelled'),
    ('active', 'achieved'),
    ('active', 'missed'),
    ('active', 'cancelled')
  );
$$;

comment on function goal.allowed_transition(text, text) is
  'Ciclo de vida da meta. Espelho de ALLOWED_TRANSITIONS em @alsham/goals. CINCO pares; os três fins TERMINAIS — a identidade da meta é o período + o alvo declarado: a meta do próximo trimestre é meta nova. Reabrir misturaria épocas do placar.';

create or replace function goal.guard_goal_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_checkins integer;
begin
  if new.status = old.status then
    -- ⭐ ATIVA congela alvo, métrica e período — mover a trave no meio do
    -- jogo desmoraliza o placar. Descrição e dono seguem vivos.
    if old.status = 'active'
       and (new.metric is distinct from old.metric
            or new.target_value is distinct from old.target_value
            or new.currency is distinct from old.currency
            or new.starts_on is distinct from old.starts_on
            or new.ends_on is distinct from old.ends_on) then
      raise exception 'meta ativa não muda de trave: alvo, métrica e período congelam na ativação — a meta diferente é meta nova'
        using errcode = '22023';
    end if;
    -- Desfecho dado, registro congelado.
    if old.status in ('achieved', 'missed', 'cancelled')
       and (new.title is distinct from old.title
            or new.description is distinct from old.description
            or new.metric is distinct from old.metric
            or new.target_value is distinct from old.target_value
            or new.currency is distinct from old.currency
            or new.starts_on is distinct from old.starts_on
            or new.ends_on is distinct from old.ends_on
            or new.assignee_user_id is distinct from old.assignee_user_id
            or new.cancel_reason is distinct from old.cancel_reason) then
      raise exception 'meta com desfecho não se edita: a época fechou — o placar novo é meta nova'
        using errcode = '22023';
    end if;
    return new;
  end if;

  if not goal.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe: o desfecho é terminal — a meta do próximo período é meta nova',
      old.status, new.status
      using errcode = '22023';
  end if;

  if new.status in ('achieved', 'missed', 'cancelled') then
    if not core.has_permission(new.tenant_id, 'goal.goal.decide') then
      raise exception 'fechar a meta exige a permissão goal.goal.decide'
        using errcode = '42501';
    end if;

    -- ⭐ achieved/missed com o número na mesa: sem check-in é achismo.
    if new.status in ('achieved', 'missed') then
      select count(*) into v_checkins
        from goal.checkins
       where goal_id = new.id and tenant_id = new.tenant_id;
      if v_checkins = 0 then
        raise exception 'fechar a meta sem check-in é achismo: registre o número na mesa primeiro'
          using errcode = '22023';
      end if;
    end if;

    if new.status = 'cancelled' and length(btrim(new.cancel_reason)) = 0 then
      raise exception 'cancelar exige a razão escrita: a ambição desistida também é história'
        using errcode = '22023';
    end if;

    new.decided_at := now();
    new.decided_by := (select auth.uid());
  end if;

  return new;
end;
$$;

create trigger goal_goals_guard_status
  before update on goal.goals
  for each row execute function goal.guard_goal_transition();

-- =============================================================================
-- 3. CHECKINS — ⭐ o livro do andamento: ato imutável, reportado por gente
-- =============================================================================

create table goal.checkins (
  id             uuid        primary key default gen_random_uuid(),
  -- ⭐ A ordem do livro (a lição do pat): seq identity, nunca uuid.
  seq            bigint      generated always as identity,
  tenant_id      uuid        not null references core.tenants (id) on delete cascade,
  goal_id        uuid        not null,
  reported_value numeric(18,4) not null,
  note           text        not null default '',
  reported_at    timestamptz not null default now(),
  reported_by    uuid        references auth.users (id) on delete set null,
  constraint goal_checkins_goal_fk
    foreign key (goal_id, tenant_id)
    references goal.goals (id, tenant_id)
    on delete restrict
);

create index goal_checkins_idx
  on goal.checkins (tenant_id, goal_id, seq desc);

alter table goal.checkins enable row level security;
alter table goal.checkins force row level security;

create policy goal_checkins_select on goal.checkins
  for select to authenticated
  using (goal.can_access(tenant_id));

create policy goal_checkins_insert on goal.checkins
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'goal.goal.report'));

create or replace function goal.guard_checkin_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status
    from goal.goals
   where id = new.goal_id and tenant_id = new.tenant_id;

  if v_status is null then
    raise exception 'a meta não existe neste tenant' using errcode = '22023';
  end if;

  -- ⭐ O livro só corre com a meta correndo: rascunho ainda não corre;
  -- fechada e cancelada não recebem número novo.
  if v_status <> 'active' then
    raise exception 'check-in só em meta ativa: o rascunho ainda não corre, e a época fechada não recebe número novo'
      using errcode = '22023';
  end if;

  new.reported_at := now();
  new.reported_by := (select auth.uid());

  return new;
end;
$$;

create trigger goal_checkins_stamp
  before insert on goal.checkins
  for each row execute function goal.guard_checkin_insert();

create or replace function goal.guard_checkins_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'o livro de check-ins é registro de fato consumado: não se edita nem se apaga.'
    using errcode = '42501';
end;
$$;

create trigger goal_checkins_immutable
  before update or delete on goal.checkins
  for each row execute function goal.guard_checkins_immutable();

-- =============================================================================
-- 4. O PROGRESSO VIGENTE — consequência calculada, nunca coluna
-- =============================================================================

create view goal.goal_progress
  with (security_invoker = true)
as
select g.id                as goal_id,
       g.tenant_id,
       c.reported_value    as last_value,
       c.reported_at       as last_reported_at,
       (select count(*) from goal.checkins cc
         where cc.goal_id = g.id and cc.tenant_id = g.tenant_id) as checkin_count
  from goal.goals g
  left join lateral (
    select ci.reported_value, ci.reported_at
      from goal.checkins ci
     where ci.goal_id = g.id and ci.tenant_id = g.tenant_id
     order by ci.seq desc
     limit 1
  ) c on true;

comment on view goal.goal_progress is
  'O progresso VIGENTE de cada meta: o último check-in do livro — calculado, nunca coluna (placar editável não constrange ninguém). security_invoker: a RLS de goals/checkins decide.';

-- =============================================================================
-- 5. OS FATOS — payload autossuficiente
-- =============================================================================

create or replace function goal.goal_payload(p goal.goals)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return jsonb_build_object(
    'goalId',       p.id,
    'title',        p.title,
    'metric',       p.metric,
    'targetValue',  p.target_value,
    'currency',     p.currency,
    'startsOn',     p.starts_on,
    'endsOn',       p.ends_on,
    'assigneeId',   p.assignee_user_id,
    'status',       p.status,
    'decidedAt',    p.decided_at,
    'cancelReason', p.cancel_reason
  );
end;
$$;

comment on function goal.goal_payload(goal.goals) is
  'O envelope de uma meta — AUTOSSUFICIENTE, com métrica e alvo dentro. Quem escuta não faz join.';

create or replace function goal.on_goal_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform goal.emit_event(new.tenant_id, 'goal.goal.opened', goal.goal_payload(new));
  return new;
end;
$$;

create trigger goal_goals_emit_created
  after insert on goal.goals
  for each row execute function goal.on_goal_created();

create or replace function goal.on_goal_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform goal.emit_event(
      new.tenant_id,
      case new.status
        when 'active'    then 'goal.goal.activated'
        when 'achieved'  then 'goal.goal.achieved'
        when 'missed'    then 'goal.goal.missed'
        else 'goal.goal.cancelled'
      end,
      goal.goal_payload(new)
    );
    return new;
  end if;

  if new.title is distinct from old.title
     or new.metric is distinct from old.metric
     or new.target_value is distinct from old.target_value
     or new.assignee_user_id is distinct from old.assignee_user_id
     or new.ends_on is distinct from old.ends_on then
    perform goal.emit_event(new.tenant_id, 'goal.goal.updated', goal.goal_payload(new));
  end if;

  return new;
end;
$$;

create trigger goal_goals_emit_changed
  after update on goal.goals
  for each row execute function goal.on_goal_changed();

create or replace function goal.on_checkin_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title  text;
  v_metric text;
begin
  select title, metric into v_title, v_metric
    from goal.goals where id = new.goal_id and tenant_id = new.tenant_id;

  perform goal.emit_event(new.tenant_id, 'goal.goal.reported', jsonb_build_object(
    'goalId',        new.goal_id,
    'goalTitle',     v_title,
    'metric',        v_metric,
    'reportedValue', new.reported_value,
    'note',          new.note,
    'reportedAt',    new.reported_at
  ));
  return new;
end;
$$;

create trigger goal_checkins_emit
  after insert on goal.checkins
  for each row execute function goal.on_checkin_recorded();

-- =============================================================================
-- 6. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema goal                  from public, anon, authenticated;
revoke all on all tables    in schema goal from public, anon, authenticated;
revoke all on all functions in schema goal from public, anon, authenticated;

grant usage on schema goal to authenticated;

grant select, insert, update on goal.goals to authenticated;

-- ⭐ SÓ INSERT+SELECT: o livro do andamento não se reescreve.
grant select, insert on goal.checkins to authenticated;

grant select on goal.goal_progress to authenticated;

grant execute on function goal.can_access(uuid) to authenticated;

-- `goal.emit_event` NÃO é concedida. `goal.goal_payload` é encanamento dos
-- gatilhos. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhuma coluna de progresso. Nenhum percentual mágico.
-- Nenhuma cascata de OKR. Nenhuma medição automática. Nenhum objeto fora de
-- `goal`. Nenhuma leitura de schema alheio.
-- =============================================================================
