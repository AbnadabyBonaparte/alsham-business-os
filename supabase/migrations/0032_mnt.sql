-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0032_mnt.sql
-- Módulo 17: Manutenção. Schema `mnt`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §17,
-- depois do `0031_occ.sql`.
--
-- Taxonomia: Domain 🏭 Operações — capacidade *Manutenção*.
-- Spec: docs/canon/MODULO-MNT-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ POR QUE `corrective`/`preventive` PODE SER CHECK — argumentado, não copiado
-- -----------------------------------------------------------------------------
-- A Lei das Etapas proíbe congelar VOCABULÁRIO DE CASA em schema. O tipo da
-- manutenção não é vocabulário de casa — é FÍSICA DO DOMÍNIO: toda manutenção
-- do mundo ou responde a uma falha que JÁ aconteceu (corretiva) ou antecipa
-- uma que ainda NÃO aconteceu (preventiva). A oficina, o shopping, a usina e
-- a escola usam as duas palavras com o MESMO sentido, e não existe um
-- terceiro caso em setor nenhum — "preditiva" é preventiva com outro
-- instrumento de decisão. O teste anti-viés passa: outra empresa de outro
-- setor usaria exatamente assim. Quem discordar, refute AQUI, por escrito.
--
-- -----------------------------------------------------------------------------
-- ⭐ O CICLO — o ops RE-PERGUNTADO para a manutenção, e a resposta é MANTIDA
-- -----------------------------------------------------------------------------
-- `done → in_progress` EXISTE. Manutenção é TRABALHO (a física do ops:
-- identidade por serviço): a vistoria de entrega que reprova o reparo
-- devolve O MESMO serviço à bancada — obrigar ordem nova partiria o custo e
-- a história do mesmo conserto em dois. A falha NOVA, semanas depois, é
-- ordem nova (corretiva). `cancelled` continua terminal — copiar ali também
-- foi decisão. A volta de `done` LIMPA o carimbo da conclusão (o padrão da
-- reabertura do care): o fato `completed` anterior fica na trilha.
--
-- -----------------------------------------------------------------------------
-- ⭐ A RECORRÊNCIA DA PREVENTIVA É DESENHO DO TENANT — sem cron fingido
-- -----------------------------------------------------------------------------
-- "A cada N dias após a conclusão" mora NA ORDEM (recurrence_days, só na
-- preventiva). A PRÓXIMA DEVIDA é VIEW calculada por data (o padrão da
-- dun.queue): concluída + N dias, com o atraso à vista. **GERAR a ordem
-- automática por relógio é DECLARADO FUTURO** (cron é decisão à parte);
-- quem abre a próxima é gente, com a fila honesta na frente. A identidade
-- da rotina é (título, alvo) — carimbada, sem cadastro de plano: plano de
-- manutenção por equipamento vem com Patrimônio (Onda 2), e a ponte está
-- declarada na spec.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA `target` TEXTO LIVRE obrigatório ("elevador 2", "ar da sala 5",
--      "empilhadeira 03") + `asset_id` uuid SOLTO opcional — o Patrimônio é
--      a Onda 2, e o nome já fica carimbado no alvo desde já.
--   ✅ ENTRA prioridade como DADO DO TENANT (posição 0 = mais urgente).
--   ✅ ENTRA custo REGISTRADO opcional (valor+moeda juntos — constraint do
--      deal) — o que se gastou, nas mãos de quem concluiu. Custeio, rateio
--      e orçamento de manutenção são capacidades próprias.
--   ❌ NÃO ENTRA histórico técnico por equipamento (vem com Patrimônio),
--      peças/estoque consumido (integração futura com o inv, DECLARADA —
--      consumes vazio), SLA automático, horímetro/hodômetro (ofício do
--      vertical de frota).
-- =============================================================================

create schema if not exists mnt;

comment on schema mnt is
  'Módulo Manutenção. Domain operations da Taxonomia. Ordens corretivas e preventivas; done volta (trabalho tem identidade por serviço); recorrência do tenant com a próxima devida calculada por data. Não cria objeto em core nem lê schema alheio.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — décima sétima vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function mnt.emit_event(
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
  if p_event_type not like 'mnt.%' then
    raise exception 'mnt.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'mnt',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function mnt.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function mnt.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'mnt.order.manage')
      or core.has_permission(p_tenant_id, 'mnt.order.complete')
      or core.has_permission(p_tenant_id, 'mnt.setup.manage');
$$;

create or replace function mnt.touch_updated_at()
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
-- 2. PRIORITIES — a régua de urgência que o tenant desenha
-- =============================================================================

create table mnt.priorities (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references core.tenants (id) on delete cascade,
  name       text        not null check (length(btrim(name)) > 0),
  position   integer     not null check (position >= 0),
  status     text        not null default 'active'
             check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mnt_priorities_id_tenant unique (id, tenant_id),
  constraint mnt_priorities_position_unique unique (tenant_id, position)
    deferrable initially deferred
);

create trigger mnt_priorities_touch
  before update on mnt.priorities
  for each row execute function mnt.touch_updated_at();

alter table mnt.priorities enable row level security;
alter table mnt.priorities force row level security;

create policy mnt_priorities_select on mnt.priorities
  for select to authenticated using (mnt.can_access(tenant_id));
create policy mnt_priorities_insert on mnt.priorities
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'mnt.setup.manage'));
create policy mnt_priorities_update on mnt.priorities
  for update to authenticated
  using (core.has_permission(tenant_id, 'mnt.setup.manage'))
  with check (core.has_permission(tenant_id, 'mnt.setup.manage'));

-- ⛔ Sem DELETE: régua com ordens é história; arquivar é status.

-- =============================================================================
-- 3. ORDERS — a ordem de manutenção
-- =============================================================================

create table mnt.orders (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid        not null references core.tenants (id) on delete cascade,
  title            text        not null check (length(btrim(title)) > 0),
  description      text        not null default '',
  -- ⭐ FÍSICA DO DOMÍNIO, não vocabulário de casa — ver o cabeçalho.
  kind             text        not null check (kind in ('corrective', 'preventive')),
  -- ⭐ O ALVO em texto livre + vínculo SOLTO para o Patrimônio (Onda 2).
  target           text        not null check (length(btrim(target)) > 0),
  asset_id         uuid,
  priority_id      uuid,
  assignee_user_id uuid,
  -- ⭐ "a cada N dias após a conclusão" — só na preventiva.
  recurrence_days  integer,
  -- O que se gastou — registrado, opcional, valor e moeda JUNTOS.
  cost_cents       bigint      check (cost_cents is null or cost_cents >= 0),
  currency         char(3)     check (currency is null or currency ~ '^[A-Z]{3}$'),
  status           text        not null default 'open'
                   check (status in ('open', 'in_progress', 'done', 'cancelled')),
  -- ⭐ O ATO da conclusão: quem, quando e O QUE FOI FEITO. A volta limpa.
  completed_at     timestamptz,
  completed_by     uuid        references auth.users (id) on delete set null,
  completion_note  text        not null default '',
  created_at       timestamptz not null default now(),
  created_by       uuid        references auth.users (id) on delete set null,
  updated_at       timestamptz not null default now(),
  constraint mnt_orders_id_tenant unique (id, tenant_id),
  constraint mnt_orders_priority_fk
    foreign key (priority_id, tenant_id)
    references mnt.priorities (id, tenant_id) on delete restrict,
  constraint mnt_orders_assignee_fk
    foreign key (tenant_id, assignee_user_id)
    references core.memberships (tenant_id, user_id)
    on delete set null (assignee_user_id),
  constraint mnt_orders_recurrence_preventive check (
    recurrence_days is null or (kind = 'preventive' and recurrence_days > 0)
  ),
  constraint mnt_orders_cost_currency check (
    (cost_cents is null and currency is null) or
    (cost_cents is not null and currency is not null)
  ),
  -- Concluída tem carimbo e relato; as demais não têm nenhum dos dois.
  constraint mnt_orders_completion_coherent check (
    (status = 'done' and completed_at is not null and length(btrim(completion_note)) > 0)
    or (status <> 'done' and completed_at is null)
  )
);

create index mnt_orders_board_idx
  on mnt.orders (tenant_id, status, created_at desc);
create index mnt_orders_preventive_idx
  on mnt.orders (tenant_id, completed_at)
  where kind = 'preventive' and recurrence_days is not null and status = 'done';

create trigger mnt_orders_touch
  before update on mnt.orders
  for each row execute function mnt.touch_updated_at();

alter table mnt.orders enable row level security;
alter table mnt.orders force row level security;

create policy mnt_orders_select on mnt.orders
  for select to authenticated
  using (mnt.can_access(tenant_id));

create policy mnt_orders_insert on mnt.orders
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'mnt.order.manage'));

create policy mnt_orders_update on mnt.orders
  for update to authenticated
  using (
    core.has_permission(tenant_id, 'mnt.order.manage')
    or core.has_permission(tenant_id, 'mnt.order.complete')
  )
  with check (
    core.has_permission(tenant_id, 'mnt.order.manage')
    or core.has_permission(tenant_id, 'mnt.order.complete')
  );

-- ⛔ Sem policy / grant de DELETE. Ordem cancelada é história de manutenção.

-- -----------------------------------------------------------------------------
-- 3.1 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/maintenance
-- -----------------------------------------------------------------------------

create or replace function mnt.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('open',        'in_progress'),
    ('in_progress', 'open'),
    ('open',        'done'),
    ('in_progress', 'done'),
    ('open',        'cancelled'),
    ('in_progress', 'cancelled'),
    ('done',        'in_progress')
  );
$$;

comment on function mnt.allowed_transition(text, text) is
  'Ciclo de vida da ordem. Espelho de ALLOWED_TRANSITIONS em @alsham/maintenance. done → in_progress EXISTE (trabalho tem identidade por serviço — o ops re-perguntado e MANTIDO); cancelled é terminal. open → done existe: o pequeno reparo se registra depois de feito.';

-- -----------------------------------------------------------------------------
-- 3.2 O PORTEIRO — concluir exige o relato; a volta limpa o carimbo
-- -----------------------------------------------------------------------------

create or replace function mnt.guard_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not mnt.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe: cancelada é terminal — a falha nova é ordem nova',
      old.status, new.status
      using errcode = '22023';
  end if;

  -- Concluir e cancelar exigem a permissão do ATO.
  if new.status in ('done', 'cancelled')
     and not core.has_permission(new.tenant_id, 'mnt.order.complete') then
    raise exception 'concluir ou cancelar a ordem exige a permissão mnt.order.complete'
      using errcode = '42501';
  end if;

  if new.status = 'done' then
    if length(btrim(new.completion_note)) = 0 then
      raise exception 'concluir exige o relato do que foi feito: conserto sem relato é conserto que ninguém confere'
        using errcode = '22023';
    end if;
    new.completed_at := now();
    new.completed_by := (select auth.uid());
  end if;

  -- ⭐ A volta de done: o MESMO serviço à bancada; o carimbo limpa. O fato
  -- `completed` anterior fica na trilha do correio.
  if old.status = 'done' and new.status = 'in_progress' then
    new.completed_at := null;
    new.completed_by := null;
    new.completion_note := '';
  end if;

  return new;
end;
$$;

create trigger mnt_orders_guard_status
  before update of status on mnt.orders
  for each row execute function mnt.guard_status_transition();

-- Ordem encerrada (done/cancelled) congela o conteúdo: mexer de novo é
-- reabrir (done volta) ou abrir ordem nova.
create or replace function mnt.guard_order_frozen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('open', 'in_progress') then
    return new;
  end if;

  if new.status is distinct from old.status then
    return new;   -- transição é com o porteiro acima.
  end if;

  if new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.kind is distinct from old.kind
     or new.target is distinct from old.target
     or new.asset_id is distinct from old.asset_id
     or new.priority_id is distinct from old.priority_id
     or new.assignee_user_id is distinct from old.assignee_user_id
     or new.recurrence_days is distinct from old.recurrence_days
     or new.cost_cents is distinct from old.cost_cents
     or new.currency is distinct from old.currency then
    raise exception 'ordem encerrada não se edita: reabra-a (se concluída) ou abra ordem nova'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger mnt_orders_frozen
  before update on mnt.orders
  for each row execute function mnt.guard_order_frozen();

-- =============================================================================
-- 4. ORDER_EVENTS — ⭐ A TRILHA, ESCRITA PELO SERVIDOR (três camadas)
-- -----------------------------------------------------------------------------
-- Cada mudança de estado vira linha eterna — escrita pelo GATILHO, nunca
-- pela aplicação: trilha que a aplicação escreve direto é trilha que a
-- aplicação pode escrever errado.
-- =============================================================================

create table mnt.order_events (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references core.tenants (id) on delete cascade,
  order_id      uuid        not null,
  from_status   text,
  to_status     text        not null,
  note          text        not null default '',
  occurred_at   timestamptz not null default now(),
  actor_user_id uuid        references auth.users (id) on delete set null,
  constraint mnt_order_events_fk
    foreign key (order_id, tenant_id)
    references mnt.orders (id, tenant_id)
    on delete restrict
);

create index mnt_order_events_idx
  on mnt.order_events (tenant_id, order_id, occurred_at);

alter table mnt.order_events enable row level security;
alter table mnt.order_events force row level security;

create policy mnt_order_events_select on mnt.order_events
  for select to authenticated
  using (mnt.can_access(tenant_id));

-- ⚠️ Sem policy de INSERT: quem escreve é o gatilho.

create or replace function mnt.guard_trail_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'a trilha da ordem é registro de fato consumado: não se edita nem se apaga.'
    using errcode = '42501';
end;
$$;

create trigger mnt_order_events_immutable
  before update or delete on mnt.order_events
  for each row execute function mnt.guard_trail_immutable();

-- =============================================================================
-- 5. A PRÓXIMA DEVIDA — consequência calculada, sem cron fingido
-- =============================================================================

create view mnt.preventive_queue
  with (security_invoker = true)
as
select o.*,
       (o.completed_at::date + o.recurrence_days)                  as next_due_on,
       ((o.completed_at::date + o.recurrence_days) - current_date) as days_until_due
  from mnt.orders o
 where o.kind = 'preventive'
   and o.status = 'done'
   and o.recurrence_days is not null;

comment on view mnt.preventive_queue is
  'As preventivas concluídas com recorrência: a PRÓXIMA DEVIDA calculada por data (negativo = atrasada). Quem abre a próxima é gente — gerar por relógio é futuro declarado. security_invoker: a RLS de orders decide.';

-- =============================================================================
-- 6. OS FATOS — payload autossuficiente (prioridade pelo NOME)
-- =============================================================================

create or replace function mnt.order_payload(p mnt.orders)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_priority text;
begin
  select name into v_priority from mnt.priorities where id = p.priority_id;

  return jsonb_build_object(
    'orderId',        p.id,
    'title',          p.title,
    'kind',           p.kind,
    'target',         p.target,
    'assetId',        p.asset_id,
    'priorityId',     p.priority_id,
    'priorityName',   v_priority,
    'assigneeId',     p.assignee_user_id,
    'recurrenceDays', p.recurrence_days,
    'costCents',      p.cost_cents,
    'currency',       p.currency,
    'status',         p.status,
    'completedAt',    p.completed_at,
    'completionNote', p.completion_note
  );
end;
$$;

comment on function mnt.order_payload(mnt.orders) is
  'O envelope de uma ordem — AUTOSSUFICIENTE, com a prioridade pelo NOME e o alvo em texto. Quem escuta não faz join.';

create or replace function mnt.on_order_opened()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into mnt.order_events (tenant_id, order_id, from_status, to_status, actor_user_id)
  values (new.tenant_id, new.id, null, new.status, (select auth.uid()));

  perform mnt.emit_event(new.tenant_id, 'mnt.order.opened', mnt.order_payload(new));
  return new;
end;
$$;

create trigger mnt_orders_emit_opened
  after insert on mnt.orders
  for each row execute function mnt.on_order_opened();

create or replace function mnt.on_order_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
begin
  if new.status is distinct from old.status then
    insert into mnt.order_events (tenant_id, order_id, from_status, to_status, note, actor_user_id)
    values (new.tenant_id, new.id, old.status, new.status,
            case when new.status = 'done' then new.completion_note else '' end,
            (select auth.uid()));

    v_type := case
                when new.status = 'done' then 'mnt.order.completed'
                when new.status = 'cancelled' then 'mnt.order.cancelled'
                when old.status = 'done' and new.status = 'in_progress' then 'mnt.order.reopened'
                else 'mnt.order.updated'
              end;
    perform mnt.emit_event(new.tenant_id, v_type, mnt.order_payload(new));
    return new;
  end if;

  if new.title is distinct from old.title
     or new.target is distinct from old.target
     or new.priority_id is distinct from old.priority_id
     or new.assignee_user_id is distinct from old.assignee_user_id
     or new.recurrence_days is distinct from old.recurrence_days
     or new.cost_cents is distinct from old.cost_cents then
    perform mnt.emit_event(new.tenant_id, 'mnt.order.updated', mnt.order_payload(new));
  end if;

  return new;
end;
$$;

create trigger mnt_orders_emit_changed
  after update on mnt.orders
  for each row execute function mnt.on_order_changed();

-- =============================================================================
-- 7. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema mnt                  from public, anon, authenticated;
revoke all on all tables    in schema mnt from public, anon, authenticated;
revoke all on all functions in schema mnt from public, anon, authenticated;

grant usage on schema mnt to authenticated;

grant select, insert, update on mnt.priorities to authenticated;
grant select, insert, update on mnt.orders     to authenticated;

-- ⛔ SÓ SELECT: a trilha é do gatilho.
grant select on mnt.order_events to authenticated;

grant select on mnt.preventive_queue to authenticated;

grant execute on function mnt.can_access(uuid) to authenticated;

-- `mnt.emit_event` NÃO é concedida. `mnt.order_payload` é encanamento dos
-- gatilhos. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum cron. Nenhum plano por equipamento. Nenhuma
-- peça consumida. Nenhum objeto fora de `mnt`. Nenhuma leitura de schema
-- alheio — nem do inv, nem do futuro Patrimônio: o vínculo é solto.
-- =============================================================================
