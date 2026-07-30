-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0037_lead.sql
-- Módulo 22: Leads. Schema `lead`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §18,
-- depois do `0036_vis.sql`.
--
-- Taxonomia: Domain 🤝 Comercial & CRM — capacidade *Leads* (a fila de
-- ENTRADA, antes do funil: o deal é o mapa dos negócios em andamento; o
-- lead é a triagem do interesse que acabou de chegar).
-- Spec: docs/canon/MODULO-LEAD-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ A QUINTA IDENTIDADE — o lead é a MANIFESTAÇÃO DE INTERESSE, e não volta
-- -----------------------------------------------------------------------------
-- A régua das identidades, re-perguntada mais uma vez: a pessoa volta
-- (crm), o pedido volta (care), o documento não (quote), a passagem não
-- (vis). O lead responde uma QUINTA coisa: ele é o INTERESSE MANIFESTADO —
-- um evento comercial datado, com origem própria. `qualified` e `discarded`
-- são TERMINAIS: quem volta seis meses depois manifestou interesse NOVO,
-- com origem nova ("da outra vez veio pelo stand; agora veio pelo
-- instagram") — e reciclar o lead antigo apagaria exatamente o dado que a
-- fila existe para guardar: DE ONDE as pessoas chegam. O ciclo é CURTO de
-- propósito: new → in_contact → qualified | discarded, com a volta à fila
-- (in_contact → new) permitida — atender e devolver não é desfecho.
--
-- -----------------------------------------------------------------------------
-- ⭐ QUALIFICAR CARIMBA VÍNCULOS SOLTOS — pela TELA, nunca por evento
-- -----------------------------------------------------------------------------
-- Qualificar pode carimbar `party_id` (a contraparte criada no crm) e
-- `opportunity_id` (o negócio aberto no deal) — ID SOLTO + NOME CARIMBADO,
-- como a lei manda: sem FK cruzada (a matriz do CI reprovaria), sem
-- consumo de evento (Lei 7: seria handler sem ofício). Quem cria a
-- contraparte e abre o negócio é o OPERADOR, nas telas dos módulos donos;
-- o lead só guarda o rastro de para onde o interesse foi.
--
-- -----------------------------------------------------------------------------
-- ⭐ A ORIGEM É TEXTO LIVRE — a lição do canal do crm, na porta de entrada
-- -----------------------------------------------------------------------------
-- "instagram", "indicação", "stand da feira", "passou na porta" — congelar
-- o instrumento de um país e de uma década numa coluna faria o produto
-- envelhecer junto com ele (o argumento do canal do crm, que vale dobrado
-- aqui: a origem É o dado que a fila existe para guardar). Sem tabela de
-- vocabulário e sem setup: texto livre, sempre.
--
-- -----------------------------------------------------------------------------
-- ⭐ O CONTATO NÃO PASSEIA PELO CORREIO — a prudência do vis, na fila
-- -----------------------------------------------------------------------------
-- O envelope leva nome, origem e interesse; o CONTATO fica na fila, sob
-- RLS. Dado pessoal não viaja em evento.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA lead com nome, contato neutro TEXTO LIVRE, origem TEXTO LIVRE,
--      interesse TEXTO LIVRE, responsável via core.memberships (padrão ops).
--   ✅ ENTRA descartar com RAZÃO escrita (a lição do deal.lost) e carimbo.
--   ❌ NÃO ENTRA captura automática de formulário/site (integração
--      declarada), scoring (capacidade futura), dedupe automático (decisão
--      de gente — dois "João Silva" podem ser duas pessoas), distribuição
--      round-robin (capacidade futura declarada).
-- =============================================================================

create schema if not exists lead;

comment on schema lead is
  'Módulo Leads. Domain crm da Taxonomia. A fila de entrada do comercial: origem TEXTO LIVRE (o dado que a fila existe para guardar), ciclo curto com desfechos terminais — o lead é a MANIFESTAÇÃO DE INTERESSE: quem volta é lead novo. Vínculos com crm/deal por ID SOLTO + nome carimbado, pela tela. Não cria objeto em core nem lê schema alheio.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — vigésima segunda vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function lead.emit_event(
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
  if p_event_type not like 'lead.%' then
    raise exception 'lead.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'lead',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function lead.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function lead.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'lead.lead.manage')
      or core.has_permission(p_tenant_id, 'lead.lead.decide');
$$;

create or replace function lead.touch_updated_at()
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
-- 2. LEADS — a fila de entrada
-- =============================================================================

create table lead.leads (
  id                uuid        primary key default gen_random_uuid(),
  tenant_id         uuid        not null references core.tenants (id) on delete cascade,
  name              text        not null check (length(btrim(name)) > 0),
  -- O contato NEUTRO — e ele NUNCA sai no envelope.
  contact           text        not null default '',
  -- ⭐ DE ONDE veio — o dado que a fila existe para guardar. Texto livre.
  source            text        not null default '',
  interest          text        not null default '',
  assignee_user_id  uuid,
  status            text        not null default 'new'
                    check (status in ('new', 'in_contact', 'qualified', 'discarded')),
  -- ⭐ O ATO do desfecho: quem, quando — do servidor. Terminal.
  decided_at        timestamptz,
  decided_by        uuid        references auth.users (id) on delete set null,
  discard_reason    text        not null default '',
  -- ⭐ Os vínculos SOLTOS do qualificado — id + nome carimbado, pela TELA.
  party_id          uuid,
  party_name        text        not null default '',
  opportunity_id    uuid,
  opportunity_title text        not null default '',
  created_at        timestamptz not null default now(),
  created_by        uuid        references auth.users (id) on delete set null,
  updated_at        timestamptz not null default now(),
  constraint lead_leads_id_tenant unique (id, tenant_id),
  constraint lead_leads_assignee_fk
    foreign key (tenant_id, assignee_user_id)
    references core.memberships (tenant_id, user_id)
    on delete set null (assignee_user_id),
  -- Desfecho tem carimbo; a fila viva não tem; a razão é do descarte.
  constraint lead_leads_decision_coherent check (
    (status = 'qualified' and decided_at is not null and discard_reason = '')
    or (status = 'discarded' and decided_at is not null
        and length(btrim(discard_reason)) > 0)
    or (status in ('new', 'in_contact') and decided_at is null
        and discard_reason = '')
  ),
  -- Vínculo é rastro do QUALIFICADO — a fila viva não aponta para lugar nenhum.
  constraint lead_leads_links_on_qualified check (
    status = 'qualified'
    or (party_id is null and party_name = ''
        and opportunity_id is null and opportunity_title = '')
  )
);

create index lead_leads_queue_idx
  on lead.leads (tenant_id, status, created_at);

create trigger lead_leads_touch
  before update on lead.leads
  for each row execute function lead.touch_updated_at();

alter table lead.leads enable row level security;
alter table lead.leads force row level security;

create policy lead_leads_select on lead.leads
  for select to authenticated
  using (lead.can_access(tenant_id));

create policy lead_leads_insert on lead.leads
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'lead.lead.manage'));

create policy lead_leads_update on lead.leads
  for update to authenticated
  using (lead.can_access(tenant_id))
  with check (lead.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Lead descartado é história com razão.

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre no começo da fila
-- -----------------------------------------------------------------------------

create or replace function lead.guard_lead_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'new' then
    raise exception 'o lead nasce na fila — o resto é transição'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger lead_leads_stamp
  before insert on lead.leads
  for each row execute function lead.guard_lead_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/leads
-- -----------------------------------------------------------------------------

create or replace function lead.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('new',        'in_contact'),
    ('in_contact', 'new'),
    ('new',        'qualified'),
    ('in_contact', 'qualified'),
    ('new',        'discarded'),
    ('in_contact', 'discarded')
  );
$$;

comment on function lead.allowed_transition(text, text) is
  'Ciclo de vida do lead. Espelho de ALLOWED_TRANSITIONS em @alsham/leads. SEIS pares, ciclo curto: a volta à fila existe (atender e devolver não é desfecho); qualified e discarded são TERMINAIS — o lead é a MANIFESTAÇÃO DE INTERESSE: quem volta é lead novo, com origem nova.';

create or replace function lead.guard_lead_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    -- Desfecho dado, registro congelado — inclusive os vínculos.
    if old.status in ('qualified', 'discarded')
       and (new.name is distinct from old.name
            or new.contact is distinct from old.contact
            or new.source is distinct from old.source
            or new.interest is distinct from old.interest
            or new.assignee_user_id is distinct from old.assignee_user_id
            or new.discard_reason is distinct from old.discard_reason
            or new.party_id is distinct from old.party_id
            or new.party_name is distinct from old.party_name
            or new.opportunity_id is distinct from old.opportunity_id
            or new.opportunity_title is distinct from old.opportunity_title) then
      raise exception 'lead com desfecho não se edita: quem volta é lead novo, com origem nova'
        using errcode = '22023';
    end if;
    return new;
  end if;

  if not lead.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe: o desfecho é terminal — quem volta é lead novo, com origem nova',
      old.status, new.status
      using errcode = '22023';
  end if;

  -- O DESFECHO é ato com mão própria.
  if new.status in ('qualified', 'discarded') then
    if not core.has_permission(new.tenant_id, 'lead.lead.decide') then
      raise exception 'qualificar ou descartar exige a permissão lead.lead.decide'
        using errcode = '42501';
    end if;

    if new.status = 'discarded' and length(btrim(new.discard_reason)) = 0 then
      raise exception 'descartar exige a razão escrita: fila que apaga em silêncio esconde o próprio funil'
        using errcode = '22023';
    end if;

    new.decided_at := now();
    new.decided_by := (select auth.uid());
  end if;

  return new;
end;
$$;

create trigger lead_leads_guard_status
  before update on lead.leads
  for each row execute function lead.guard_lead_transition();

-- =============================================================================
-- 3. OS FATOS — o envelope leva nome, origem e interesse; o contato fica
-- =============================================================================

create or replace function lead.lead_payload(p lead.leads)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- ⭐ SEM o contato — de propósito (cabeçalho). O rastro do qualificado vai.
  return jsonb_build_object(
    'leadId',           p.id,
    'name',             p.name,
    'source',           p.source,
    'interest',         p.interest,
    'assigneeId',       p.assignee_user_id,
    'status',           p.status,
    'decidedAt',        p.decided_at,
    'discardReason',    p.discard_reason,
    'partyId',          p.party_id,
    'partyName',        p.party_name,
    'opportunityId',    p.opportunity_id,
    'opportunityTitle', p.opportunity_title
  );
end;
$$;

comment on function lead.lead_payload(lead.leads) is
  'O envelope de um lead — AUTOSSUFICIENTE e SEM o contato: dado pessoal fica na fila, sob RLS. A origem e o rastro do qualificado (ids soltos + nomes carimbados) viajam.';

create or replace function lead.on_lead_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform lead.emit_event(new.tenant_id, 'lead.lead.created', lead.lead_payload(new));
  return new;
end;
$$;

create trigger lead_leads_emit_created
  after insert on lead.leads
  for each row execute function lead.on_lead_created();

create or replace function lead.on_lead_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform lead.emit_event(
      new.tenant_id,
      case new.status
        when 'qualified' then 'lead.lead.qualified'
        when 'discarded' then 'lead.lead.discarded'
        else 'lead.lead.updated'
      end,
      lead.lead_payload(new)
    );
    return new;
  end if;

  if new.name is distinct from old.name
     or new.source is distinct from old.source
     or new.interest is distinct from old.interest
     or new.assignee_user_id is distinct from old.assignee_user_id then
    perform lead.emit_event(new.tenant_id, 'lead.lead.updated', lead.lead_payload(new));
  end if;

  return new;
end;
$$;

create trigger lead_leads_emit_changed
  after update on lead.leads
  for each row execute function lead.on_lead_changed();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema lead                  from public, anon, authenticated;
revoke all on all tables    in schema lead from public, anon, authenticated;
revoke all on all functions in schema lead from public, anon, authenticated;

grant usage on schema lead to authenticated;

grant select, insert, update on lead.leads to authenticated;

grant execute on function lead.can_access(uuid) to authenticated;

-- `lead.emit_event` NÃO é concedida. `lead.lead_payload` é encanamento dos
-- gatilhos. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhuma captura automática. Nenhum score. Nenhum
-- dedupe. Nenhuma FK para crm ou deal — o vínculo é solto, carimbado pela
-- tela. Nenhum objeto fora de `lead`. Nenhuma leitura de schema alheio.
-- =============================================================================
