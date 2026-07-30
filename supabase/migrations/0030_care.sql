-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0030_care.sql
-- Módulo 15: Atendimento. Schema `care`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §17,
-- depois do `0029_cash.sql`.
--
-- Taxonomia: Domain 💬 Atendimento ao Cliente (CX) — capacidade *SAC*.
-- Spec: docs/canon/MODULO-CARE-SPEC.md
--
-- -----------------------------------------------------------------------------
-- POR QUE O `module_id` É `care`
-- -----------------------------------------------------------------------------
-- Cinto de emit_event: eventos `care.*` ⇒ id `care`. Pacote @alsham/care.
-- `cx` é o DOMAIN inteiro (oito capacidades — usar o nome do Domain num
-- módulo é a armadilha do `finance`); `sac` é sigla de um país e de uma
-- década; `ticket` é vocabulário do VERTICAL de eventos (ingresso — o
-- `evt` declarou ingresso fora de escopo justamente para o vertical). `care`
-- é curto, greppável e foi conferido por grep: zero colisões.
--
-- -----------------------------------------------------------------------------
-- ⭐ A DECISÃO DE CANON: O ATENDIMENTO QUE VOLTA É O MESMO CASO
-- -----------------------------------------------------------------------------
-- A pergunta do canon, re-perguntada dos dois lados:
--
--   · o `ops` reabre a OS (trabalho tem identidade por serviço);
--   · o `quote` não reabre nada (proposta tem identidade por documento).
--
-- Aqui: **o caso tem identidade pelo PEDIDO do solicitante.** O cliente que
-- responde "não resolveu" está falando DO MESMO caso — abrir um novo
-- partiria a conversa (as interações imutáveis) em duas e o histórico
-- mentiria. Logo `resolved → open` EXISTE (reabrir limpa o carimbo da
-- resolução e emite fato próprio, `care.ticket.reopened` — o fato anterior
-- `resolved` fica na trilha do correio, e a conversa fica nas interações).
--
-- ⭐ MAS `closed` É TERMINAL: fechado é o fim confirmado do caso. Quem volta
-- semanas depois de fechado é CASO NOVO — com referência ao antigo na
-- conversa, não com o cadáver reaberto. Meio ops, meio quote — de propósito,
-- e escrito.
--
-- -----------------------------------------------------------------------------
-- ⭐ CATEGORIA **E** PRIORIDADE SÃO DADO DO TENANT
-- -----------------------------------------------------------------------------
-- Duas tabelas (`care.categories`, `care.priorities`), nome LIVRE — nunca
-- enum: "reclamação/dúvida/urgente" é o vocabulário de UMA casa. A
-- prioridade tem POSIÇÃO (ordenar a fila é o ofício dela); a categoria é
-- plana. As duas com `archived → active` (a série que volta é a mesma).
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA solicitante NEUTRO: `requester_name` + `requester_contact`
--      TEXTO LIVRE — quem reclama pode não ser contraparte do crm; o vínculo
--      é `party_id` SOLTO e opcional (padrão deal/ctr, nunca FK).
--   ✅ ENTRA `assignee_user_id` amarrado a `core.memberships` (padrão ops).
--   ✅ ENTRA `due_at` OPCIONAL — e o ATRASO é view calculada por data
--      (padrão dun.queue), sem cron fingido.
--   ❌ NÃO ENTRA omnichannel (e-mail/WhatsApp/telefone estruturados) — o
--      canal da interação é TEXTO LIVRE (a lição do crm); integração de
--      canal é capacidade própria (*Omnichannel*).
--   ❌ NÃO ENTRA SLA automático com escalonamento — relógio que age sozinho
--      exige cron (declarado futuro); a view honesta mostra o atrasado.
--   ❌ NÃO ENTRA pesquisa de satisfação/nota — *Pesquisas NPS/CSAT* é
--      capacidade própria do Domain.
--   ❌ NÃO ENTRA base de conhecimento — Engine Wiki da Taxonomia §4.
-- =============================================================================

create schema if not exists care;

comment on schema care is
  'Módulo Atendimento. Domain cx da Taxonomia. O caso tem identidade pelo pedido (reabre de resolved; closed é terminal); categoria e prioridade são dado do tenant; interações imutáveis. Não cria objeto em core nem lê schema alheio.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — décima quinta vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function care.emit_event(
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
  if p_event_type not like 'care.%' then
    raise exception 'care.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'care',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function care.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function care.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'care.ticket.manage')
      or core.has_permission(p_tenant_id, 'care.ticket.resolve')
      or core.has_permission(p_tenant_id, 'care.setup.manage');
$$;

create or replace function care.touch_updated_at()
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
-- 2. CATEGORIES + PRIORITIES — o vocabulário que o tenant desenha
-- =============================================================================

create table care.categories (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references core.tenants (id) on delete cascade,
  name       text        not null check (length(btrim(name)) > 0),
  status     text        not null default 'active'
             check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint care_categories_id_tenant unique (id, tenant_id)
);

create unique index care_categories_unique_active_name
  on care.categories (tenant_id, lower(name))
  where status = 'active';

create trigger care_categories_touch
  before update on care.categories
  for each row execute function care.touch_updated_at();

-- ⭐ A prioridade tem POSIÇÃO: ordenar a fila é o ofício dela. `deferrable`
-- para reordenar (a decisão do ops/deal/dun, mesma razão).
create table care.priorities (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references core.tenants (id) on delete cascade,
  name       text        not null check (length(btrim(name)) > 0),
  position   integer     not null check (position >= 0),
  status     text        not null default 'active'
             check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint priorities_id_tenant unique (id, tenant_id),
  constraint priorities_position_unique unique (tenant_id, position)
    deferrable initially deferred
);

create trigger priorities_touch
  before update on care.priorities
  for each row execute function care.touch_updated_at();

alter table care.categories enable row level security;
alter table care.categories force row level security;
alter table care.priorities enable row level security;
alter table care.priorities force row level security;

create policy care_categories_select on care.categories
  for select to authenticated using (care.can_access(tenant_id));
create policy care_categories_insert on care.categories
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'care.setup.manage'));
create policy care_categories_update on care.categories
  for update to authenticated
  using (core.has_permission(tenant_id, 'care.setup.manage'))
  with check (core.has_permission(tenant_id, 'care.setup.manage'));

create policy priorities_select on care.priorities
  for select to authenticated using (care.can_access(tenant_id));
create policy priorities_insert on care.priorities
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'care.setup.manage'));
create policy priorities_update on care.priorities
  for update to authenticated
  using (core.has_permission(tenant_id, 'care.setup.manage'))
  with check (core.has_permission(tenant_id, 'care.setup.manage'));

-- ⛔ Sem DELETE nas duas: classificação com casos é história; arquivar é status.

-- =============================================================================
-- 3. TICKETS — o caso
-- =============================================================================

create table care.tickets (
  id                uuid        primary key default gen_random_uuid(),
  tenant_id         uuid        not null references core.tenants (id) on delete cascade,
  subject           text        not null check (length(btrim(subject)) > 0),
  description       text        not null default '',
  -- Solicitante NEUTRO — pode não ser contraparte do crm.
  requester_name    text        not null check (length(btrim(requester_name)) > 0),
  requester_contact text,
  -- ⭐ ID SOLTO opcional para o crm — nunca FK (padrão deal/ctr).
  party_id          uuid,
  category_id       uuid,
  priority_id       uuid,
  assignee_user_id  uuid,
  due_at            timestamptz,
  status            text        not null default 'open'
                    check (status in ('open', 'in_progress', 'resolved', 'closed')),
  -- ⭐ O ATO da resolução, carimbado pelo SERVIDOR (padrão quote.decided_*).
  -- Reabrir LIMPA o carimbo — o fato `resolved` anterior fica no correio.
  resolved_at       timestamptz,
  resolved_by       uuid        references auth.users (id) on delete set null,
  resolution_note   text        not null default '',
  created_at        timestamptz not null default now(),
  created_by        uuid        references auth.users (id) on delete set null,
  updated_at        timestamptz not null default now(),
  constraint tickets_id_tenant unique (id, tenant_id),
  constraint tickets_category_fk
    foreign key (category_id, tenant_id)
    references care.categories (id, tenant_id) on delete restrict,
  constraint tickets_priority_fk
    foreign key (priority_id, tenant_id)
    references care.priorities (id, tenant_id) on delete restrict,
  -- ⚠️ `set null (assignee_user_id)` com a coluna explícita (padrão ops).
  constraint tickets_assignee_fk
    foreign key (tenant_id, assignee_user_id)
    references core.memberships (tenant_id, user_id)
    on delete set null (assignee_user_id),
  constraint tickets_contact_not_blank check (
    requester_contact is null or length(btrim(requester_contact)) > 0
  ),
  -- O estado e o carimbo contam a mesma história.
  constraint tickets_resolution_coherent check (
    (status in ('resolved', 'closed') and resolved_at is not null)
    or status in ('open', 'in_progress')
  )
);

create index tickets_queue_idx
  on care.tickets (tenant_id, status, created_at desc);
create index tickets_assignee_idx
  on care.tickets (tenant_id, assignee_user_id)
  where assignee_user_id is not null;

create trigger tickets_touch
  before update on care.tickets
  for each row execute function care.touch_updated_at();

alter table care.tickets enable row level security;
alter table care.tickets force row level security;

create policy tickets_select on care.tickets
  for select to authenticated
  using (care.can_access(tenant_id));

create policy tickets_insert on care.tickets
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'care.ticket.manage'));

create policy tickets_update on care.tickets
  for update to authenticated
  using (
    core.has_permission(tenant_id, 'care.ticket.manage')
    or core.has_permission(tenant_id, 'care.ticket.resolve')
  )
  with check (
    core.has_permission(tenant_id, 'care.ticket.manage')
    or core.has_permission(tenant_id, 'care.ticket.resolve')
  );

-- ⛔ Sem policy / grant de DELETE. Caso fechado é história de atendimento.

-- -----------------------------------------------------------------------------
-- 3.1 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/care
-- -----------------------------------------------------------------------------

create or replace function care.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('open',        'in_progress'),
    ('in_progress', 'open'),
    ('open',        'resolved'),
    ('in_progress', 'resolved'),
    ('open',        'closed'),
    ('in_progress', 'closed'),
    ('resolved',    'closed'),
    ('resolved',    'open')
  );
$$;

comment on function care.allowed_transition(text, text) is
  'Ciclo de vida do caso. Espelho de ALLOWED_TRANSITIONS em @alsham/care — há teste que lê este arquivo e compara. resolved → open EXISTE (o caso que volta é o MESMO caso); closed é TERMINAL (quem volta depois de fechado é caso novo).';

-- -----------------------------------------------------------------------------
-- 3.2 O PORTEIRO — resolver e fechar são ATOS; reabrir limpa o carimbo
-- -----------------------------------------------------------------------------

create or replace function care.guard_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not care.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe: fechado é terminal — o caso que volta depois de fechado é caso novo',
      old.status, new.status
      using errcode = '22023';
  end if;

  -- Resolver e fechar exigem a permissão do ATO.
  if new.status in ('resolved', 'closed')
     and not core.has_permission(new.tenant_id, 'care.ticket.resolve') then
    raise exception 'resolver ou fechar o caso exige a permissão care.ticket.resolve'
      using errcode = '42501';
  end if;

  if new.status = 'resolved' then
    new.resolved_at := now();
    new.resolved_by := (select auth.uid());
  end if;

  -- Fechar direto (sem objeto: spam, duplicado) também carimba — fechado
  -- sem carimbo violaria a constraint, e um fim sem autor não se defende.
  if new.status = 'closed' and old.status <> 'resolved' then
    new.resolved_at := now();
    new.resolved_by := (select auth.uid());
  end if;

  -- ⭐ REABRIR: o MESMO caso volta; o carimbo limpa. O fato `resolved`
  -- anterior fica na trilha do correio, e a conversa nas interações.
  if old.status = 'resolved' and new.status = 'open' then
    new.resolved_at := null;
    new.resolved_by := null;
    new.resolution_note := '';
  end if;

  return new;
end;
$$;

create trigger tickets_guard_status
  before update of status on care.tickets
  for each row execute function care.guard_status_transition();

-- O caso encerrado congela o conteúdo: resolved/closed não se editam — o
-- que se quer dizer depois vai na conversa (se reaberto) ou num caso novo.
create or replace function care.guard_ticket_frozen()
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

  if new.subject is distinct from old.subject
     or new.description is distinct from old.description
     or new.requester_name is distinct from old.requester_name
     or new.requester_contact is distinct from old.requester_contact
     or new.party_id is distinct from old.party_id
     or new.category_id is distinct from old.category_id
     or new.priority_id is distinct from old.priority_id
     or new.assignee_user_id is distinct from old.assignee_user_id
     or new.due_at is distinct from old.due_at then
    raise exception 'caso resolvido ou fechado não se edita: reabra-o (se resolvido) ou abra caso novo'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger tickets_frozen
  before update on care.tickets
  for each row execute function care.guard_ticket_frozen();

-- =============================================================================
-- 4. INTERACTIONS — ⭐ A CONVERSA, E ELA É IMUTÁVEL (três camadas)
-- -----------------------------------------------------------------------------
-- O padrão do crm.interactions: cada resposta/anotação é linha eterna com
-- autor. INSERT direto permitido (o fato É o dado); canal TEXTO LIVRE.
-- =============================================================================

create table care.interactions (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references core.tenants (id) on delete cascade,
  ticket_id     uuid        not null,
  body          text        not null check (length(btrim(body)) > 0),
  -- TEXTO LIVRE: "telefone", "balcão", "e-mail" — a lição do canal do crm.
  channel       text,
  occurred_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  actor_user_id uuid        references auth.users (id) on delete set null,
  constraint interactions_ticket_fk
    foreign key (ticket_id, tenant_id)
    references care.tickets (id, tenant_id)
    on delete restrict,
  constraint interactions_channel_not_blank check (
    channel is null or length(btrim(channel)) > 0
  )
);

create index interactions_ticket_idx
  on care.interactions (tenant_id, ticket_id, occurred_at desc);

alter table care.interactions enable row level security;
alter table care.interactions force row level security;

create policy interactions_select on care.interactions
  for select to authenticated
  using (care.can_access(tenant_id));

create policy interactions_insert on care.interactions
  for insert to authenticated
  with check (
    core.has_permission(tenant_id, 'care.ticket.manage')
    or core.has_permission(tenant_id, 'care.ticket.resolve')
  );

-- ⛔ Sem policy de UPDATE/DELETE — camada 1.

create or replace function care.guard_interaction_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'a conversa do caso é registro de fato consumado: não se edita nem se apaga. Registre outra interação.'
    using errcode = '42501';
end;
$$;

create trigger interactions_immutable
  before update or delete on care.interactions
  for each row execute function care.guard_interaction_immutable();

-- Caso fechado não conversa: a conversa de um caso novo é do caso novo.
create or replace function care.guard_ticket_open_for_talk()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status
    from care.tickets
   where id = new.ticket_id and tenant_id = new.tenant_id;

  if v_status = 'closed' then
    raise exception 'caso fechado não recebe interação: abra caso novo com referência a este'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger interactions_guard_open
  before insert on care.interactions
  for each row execute function care.guard_ticket_open_for_talk();

-- =============================================================================
-- 5. O ATRASO — consequência calculada, sem relógio fingido
-- =============================================================================

create view care.overdue
  with (security_invoker = true)
as
select t.*,
       (extract(epoch from (now() - t.due_at)) / 86400)::int as days_overdue
  from care.tickets t
 where t.status in ('open', 'in_progress')
   and t.due_at is not null
   and t.due_at < now();

comment on view care.overdue is
  'Os casos ABERTOS com prazo vencido, calculados por data — sem cron, sem SLA fingido. security_invoker: a RLS de tickets decide.';

-- =============================================================================
-- 6. OS FATOS — payload autossuficiente (classificação pelo NOME)
-- =============================================================================

create or replace function care.ticket_payload(p care.tickets)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_category text;
  v_priority text;
begin
  select name into v_category from care.categories where id = p.category_id;
  select name into v_priority from care.priorities where id = p.priority_id;

  return jsonb_build_object(
    'ticketId',        p.id,
    'subject',         p.subject,
    'requesterName',   p.requester_name,
    'requesterContact', p.requester_contact,
    'partyId',         p.party_id,
    'categoryId',      p.category_id,
    'categoryName',    v_category,
    'priorityId',      p.priority_id,
    'priorityName',    v_priority,
    'assigneeId',      p.assignee_user_id,
    'dueAt',           p.due_at,
    'status',          p.status,
    'resolvedAt',      p.resolved_at,
    'resolutionNote',  p.resolution_note
  );
end;
$$;

comment on function care.ticket_payload(care.tickets) is
  'O envelope de um caso — AUTOSSUFICIENTE, com categoria e prioridade pelo NOME. Quem escuta não faz join.';

create or replace function care.on_ticket_opened()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform care.emit_event(new.tenant_id, 'care.ticket.opened', care.ticket_payload(new));
  return new;
end;
$$;

create trigger tickets_emit_opened
  after insert on care.tickets
  for each row execute function care.on_ticket_opened();

create or replace function care.on_ticket_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'resolved' then
      perform care.emit_event(new.tenant_id, 'care.ticket.resolved', care.ticket_payload(new));
    elsif new.status = 'closed' then
      perform care.emit_event(new.tenant_id, 'care.ticket.closed', care.ticket_payload(new));
    elsif old.status = 'resolved' and new.status = 'open' then
      perform care.emit_event(new.tenant_id, 'care.ticket.reopened', care.ticket_payload(new));
    else
      perform care.emit_event(new.tenant_id, 'care.ticket.updated', care.ticket_payload(new));
    end if;
    return new;
  end if;

  if new.subject is distinct from old.subject
     or new.category_id is distinct from old.category_id
     or new.priority_id is distinct from old.priority_id
     or new.assignee_user_id is distinct from old.assignee_user_id
     or new.due_at is distinct from old.due_at then
    perform care.emit_event(new.tenant_id, 'care.ticket.updated', care.ticket_payload(new));
  end if;

  return new;
end;
$$;

create trigger tickets_emit_changed
  after update on care.tickets
  for each row execute function care.on_ticket_changed();

create or replace function care.on_interaction_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket care.tickets;
begin
  select * into v_ticket from care.tickets where id = new.ticket_id;

  perform care.emit_event(
    new.tenant_id,
    'care.interaction.recorded',
    care.ticket_payload(v_ticket) || jsonb_build_object(
      'interactionId', new.id,
      'body',          new.body,
      'channel',       new.channel,
      'occurredAt',    new.occurred_at
    )
  );
  return new;
end;
$$;

create trigger interactions_emit_recorded
  after insert on care.interactions
  for each row execute function care.on_interaction_recorded();

-- =============================================================================
-- 7. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema care                  from public, anon, authenticated;
revoke all on all tables    in schema care from public, anon, authenticated;
revoke all on all functions in schema care from public, anon, authenticated;

grant usage on schema care to authenticated;

grant select, insert, update on care.categories to authenticated;
grant select, insert, update on care.priorities to authenticated;
grant select, insert, update on care.tickets    to authenticated;

-- ⛔ SÓ SELECT e INSERT na conversa. Editar e apagar não existem — camada 2.
grant select, insert on care.interactions to authenticated;

grant select on care.overdue to authenticated;

grant execute on function care.can_access(uuid) to authenticated;

-- `care.emit_event` NÃO é concedida. `care.ticket_payload` é encanamento
-- dos gatilhos, não API de tela. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum enum de categoria ou prioridade. Nenhum canal
-- estruturado. Nenhum SLA de relógio. Nenhum objeto fora de `care`. Nenhuma
-- leitura de schema alheio — nem do crm: o vínculo é solto.
-- =============================================================================
