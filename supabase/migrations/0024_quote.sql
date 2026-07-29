-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0024_quote.sql
-- Módulo 9: Propostas / Orçamentos. Schema `quote`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §16,
-- depois do `0023_inv.sql`.
--
-- Taxonomia: Domain 🤝 Comercial & CRM — capacidades *Propostas* e
-- *Orçamentos* (o MESMO artefato com os dois nomes do mercado — ver a spec).
-- Spec: docs/canon/MODULO-QUOTE-SPEC.md
--
-- -----------------------------------------------------------------------------
-- POR QUE O `module_id` É `quote`
-- -----------------------------------------------------------------------------
-- Cinto de emit_event: eventos `quote.*` ⇒ id `quote`. Pacote @alsham/quotes.
-- `crm` já é o Módulo 4 — dois módulos no mesmo prefixo fariam
-- `crm.emit_event()` aceitar o fato do vizinho, e a revogação em bloco
-- derrubaria dois módulos ao desinstalar um. `proposal` colidiria com o
-- vocabulário de governança ("proposta de decisão") que o canon usa em prosa.
-- `quote.` foi conferido por grep com fronteira de palavra: zero colisões.
--
-- -----------------------------------------------------------------------------
-- ⭐ A DECISÃO DE CANON: A PROPOSTA TEM IDENTIDADE POR DOCUMENTO
-- -----------------------------------------------------------------------------
-- O `ops` reabre a OS concluída (trabalho tem identidade por serviço). AQUI
-- NÃO: aceita, recusada, expirada e cancelada são TERMINAIS. O cliente
-- aceitou ou recusou UMA proposta específica, com valores específicos, num
-- momento específico — renegociar é DOCUMENTO NOVO, com referência nova.
-- Reabrir uma proposta recusada reescreveria o que foi posto na mesa, e a
-- resposta da contraparte perderia o objeto. É a régua do `ap` ("dinheiro tem
-- identidade por documento"), e aqui o documento é a promessa de preço.
--
-- ESPELHO CONSCIENTE (po/ap/ar) — MANTIDO × DIVERGE
--   MANTIDO do po: nasce `draft`; external_ref única por tenant; itens texto
--     livre sem catálogo; total é soma das linhas por trigger; DELETE de
--     linha só em rascunho; 3ª permissão separada; currency sem default.
--   MANTIDO do ap: terminal é terminal — sem reabertura.
--   ⭐ DIVERGE do po: aceite e recusa REGISTRAM QUEM E QUANDO no próprio
--     título (decided_by/decided_at) — o po não guarda quem recebeu; aqui o
--     ATO da contraparte é o fato central do módulo, e um aceite sem autor é
--     um aceite que não se defende.
--   ⭐ DIVERGE do po: `expired` existe, e SÓ com validade vencida — marcar
--     expirada uma proposta dentro do prazo seria mentir sobre o calendário.
-- =============================================================================

create schema if not exists quote;

comment on schema quote is
  'Módulo Propostas/Orçamentos. Domain crm da Taxonomia. Não cria objeto em core nem lê schema alheio; fala só por core.event_outbox.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — nona vez que este bloco aparece. O padrão é lei.
-- =============================================================================

create or replace function quote.emit_event(
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
  if p_event_type not like 'quote.%' then
    raise exception 'quote.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'quote',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function quote.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function quote.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'quote.proposal.manage')
      or core.has_permission(p_tenant_id, 'quote.proposal.decide')
      or core.has_permission(p_tenant_id, 'quote.proposal.cancel');
$$;

create or replace function quote.touch_updated_at()
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
-- 2. PROPOSALS — a proposta
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS:
--   ✅ ENTRA `prospect_name` — a contraparte NEUTRA. Quem recebe a proposta
--      pode NÃO ser cliente ainda; amarrar a proposta a um cadastro do crm
--      (lead_id NOT NULL, como na pedreira 360° PRIMA) obrigaria a cadastrar
--      antes de propor — e a proposta perdida viraria cadastro-lixo.
--   ✅ ENTRA `counterparty_tax_id` — o MESMO nome do recon, ap, ar e po.
--   ✅ ENTRA `valid_until` OPCIONAL. Proposta sem validade existe.
--   ❌ NÃO ENTRA template, PDF, assinatura eletrônica, numeração automática.
--      Formato de proposta é convenção de cada casa; PDF é capacidade
--      futura declarada; numeração é `external_ref`, do tenant.
--   ❌ NÃO ENTRA estágio/funil/probabilidade — isso é o Módulo 10 (`deal`).
--   ❌ NÃO ENTRA desconto estruturado, imposto, condição de pagamento.
--      O item de texto livre carrega o que a casa negociar.
-- =============================================================================

create table quote.proposals (
  id                  uuid        primary key default gen_random_uuid(),
  tenant_id           uuid        not null references core.tenants (id) on delete cascade,
  external_ref        text        not null check (length(btrim(external_ref)) > 0),
  currency            char(3)     not null check (currency ~ '^[A-Z]{3}$'),
  prospect_name       text,
  counterparty_tax_id text,
  description         text        not null default '',
  valid_until         date,
  -- Soma das linhas. Mantida por trigger em proposal_items.
  total_cents         bigint      not null default 0 check (total_cents >= 0),
  status              text        not null default 'draft'
                      check (status in (
                        'draft', 'sent', 'accepted', 'declined', 'expired', 'cancelled'
                      )),
  -- ⭐ O ATO: quem registrou o aceite/recusa, e quando. Carimbado pelo
  -- porteiro (§2.2), nunca vindo da tela.
  decided_at          timestamptz,
  decided_by          uuid        references auth.users (id) on delete set null,
  -- O que a contraparte disse, nas palavras de quem registrou. Opcional.
  decision_note       text        not null default '',
  created_at          timestamptz not null default now(),
  created_by          uuid        references auth.users (id) on delete set null,
  updated_at          timestamptz not null default now(),
  constraint proposals_unique_ref unique (tenant_id, external_ref),
  constraint proposals_id_tenant unique (id, tenant_id),
  -- O estado e o carimbo contam a mesma história, ou um dos dois mente.
  constraint proposals_decision_coherent check (
    (status in ('accepted', 'declined') and decided_at is not null) or
    (status not in ('accepted', 'declined'))
  )
);

create index proposals_open_idx
  on quote.proposals (tenant_id, created_at desc)
  where status in ('draft', 'sent');
create index proposals_validity_idx
  on quote.proposals (tenant_id, valid_until)
  where status = 'sent' and valid_until is not null;

create trigger proposals_touch
  before update on quote.proposals
  for each row execute function quote.touch_updated_at();

alter table quote.proposals enable row level security;
alter table quote.proposals force row level security;

create policy proposals_select on quote.proposals
  for select to authenticated
  using (quote.can_access(tenant_id));

create policy proposals_insert on quote.proposals
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'quote.proposal.manage'));

create policy proposals_update on quote.proposals
  for update to authenticated
  using (
    core.has_permission(tenant_id, 'quote.proposal.manage')
    or core.has_permission(tenant_id, 'quote.proposal.decide')
    or core.has_permission(tenant_id, 'quote.proposal.cancel')
  )
  with check (
    core.has_permission(tenant_id, 'quote.proposal.manage')
    or core.has_permission(tenant_id, 'quote.proposal.decide')
    or core.has_permission(tenant_id, 'quote.proposal.cancel')
  );

-- ⛔ Sem policy / grant de DELETE. Proposta recusada é história comercial.

-- -----------------------------------------------------------------------------
-- 2.1 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/quotes
-- -----------------------------------------------------------------------------

create or replace function quote.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('draft', 'sent'),
    ('draft', 'cancelled'),
    ('sent',  'accepted'),
    ('sent',  'declined'),
    ('sent',  'expired'),
    ('sent',  'cancelled')
  );
$$;

comment on function quote.allowed_transition(text, text) is
  'Ciclo de vida da proposta. Espelho de ALLOWED_TRANSITIONS em @alsham/quotes — há teste que lê este arquivo e compara. Os quatro fins são TERMINAIS: renegociar é documento novo.';

-- -----------------------------------------------------------------------------
-- 2.2 O PORTEIRO DO ESTADO — e o carimbo do ATO
-- -----------------------------------------------------------------------------

create or replace function quote.guard_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not quote.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida da proposta: renegociar é documento novo',
      old.status, new.status
      using errcode = '22023';
  end if;

  -- ⭐ Aceite e recusa são ATOS de fé pública: exigem `decide`, e o carimbo
  -- de quem/quando é do SERVIDOR — a tela não escolhe autor nem hora.
  if new.status in ('accepted', 'declined') then
    if not core.has_permission(new.tenant_id, 'quote.proposal.decide') then
      raise exception 'registrar aceite ou recusa exige a permissão quote.proposal.decide'
        using errcode = '42501';
    end if;
    new.decided_at := now();
    new.decided_by := (select auth.uid());
  end if;

  -- Cancelar (retirar a proposta) é a ação destrutiva: permissão própria.
  if new.status = 'cancelled'
     and not core.has_permission(new.tenant_id, 'quote.proposal.cancel') then
    raise exception 'retirar a proposta exige a permissão quote.proposal.cancel'
      using errcode = '42501';
  end if;

  -- ⭐ Expirar é registro de CALENDÁRIO, não decisão — mas só com validade
  -- VENCIDA. Marcar expirada uma proposta no prazo mentiria sobre a data; e
  -- proposta sem validade não expira nunca.
  if new.status = 'expired' then
    if old.valid_until is null then
      raise exception 'proposta sem validade não expira: recuse-a ou retire-a'
        using errcode = '22023';
    end if;
    if old.valid_until >= current_date then
      raise exception 'a validade (%) ainda não venceu: expirar agora mentiria sobre o calendário', old.valid_until
        using errcode = '22023';
    end if;
  end if;

  -- Enviar exige conteúdo: proposta vazia não vai à mesa.
  if new.status = 'sent' and old.status = 'draft' then
    if not exists (
      select 1 from quote.proposal_items i
       where i.proposal_id = new.id and i.tenant_id = new.tenant_id
    ) then
      raise exception 'enviar a proposta exige ao menos um item'
        using errcode = '22023';
    end if;
    if new.total_cents <= 0 then
      raise exception 'enviar a proposta exige total maior que zero'
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

create trigger proposals_guard_status
  before update of status on quote.proposals
  for each row execute function quote.guard_status_transition();

-- =============================================================================
-- 3. PROPOSAL_ITEMS — linhas da proposta (molde do po: texto, sem catálogo)
-- =============================================================================

create table quote.proposal_items (
  id                uuid           primary key default gen_random_uuid(),
  tenant_id         uuid           not null,
  proposal_id       uuid           not null,
  line_no           integer        not null check (line_no > 0),
  description       text           not null check (length(btrim(description)) > 0),
  quantity          numeric(18, 4) not null check (quantity > 0),
  unit_amount_cents bigint         not null check (unit_amount_cents > 0),
  line_total_cents  bigint         generated always as
                      ((round(quantity * unit_amount_cents))::bigint) stored,
  created_at        timestamptz    not null default now(),
  constraint proposal_items_line unique (proposal_id, line_no),
  constraint proposal_items_proposal_fk
    foreign key (proposal_id, tenant_id)
    references quote.proposals (id, tenant_id) on delete cascade
);

create index proposal_items_proposal_idx on quote.proposal_items (proposal_id);

alter table quote.proposal_items enable row level security;
alter table quote.proposal_items force row level security;

create policy proposal_items_select on quote.proposal_items
  for select to authenticated
  using (quote.can_access(tenant_id));

create policy proposal_items_insert on quote.proposal_items
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'quote.proposal.manage'));

create policy proposal_items_update on quote.proposal_items
  for update to authenticated
  using (core.has_permission(tenant_id, 'quote.proposal.manage'))
  with check (core.has_permission(tenant_id, 'quote.proposal.manage'));

-- Linha sai SÓ do rascunho: o que foi posto na mesa não se apaga.
create policy proposal_items_delete on quote.proposal_items
  for delete to authenticated
  using (
    core.has_permission(tenant_id, 'quote.proposal.manage')
    and exists (
      select 1 from quote.proposals p
       where p.id = proposal_id and p.tenant_id = tenant_id and p.status = 'draft'
    )
  );

-- ⭐ E a linha de proposta ENVIADA não muda: mudar o valor depois de posto na
-- mesa reescreveria a promessa. O porteiro recusa fora do rascunho.
create or replace function quote.guard_item_frozen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status
    from quote.proposals
   where id = coalesce(new.proposal_id, old.proposal_id)
     and tenant_id = coalesce(new.tenant_id, old.tenant_id);

  if v_status is distinct from 'draft' then
    raise exception 'a proposta já foi posta na mesa (%): o conteúdo não muda mais — renegociar é documento novo', v_status
      using errcode = '22023';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger proposal_items_frozen
  before insert or update or delete on quote.proposal_items
  for each row execute function quote.guard_item_frozen();

create or replace function quote.sync_proposal_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proposal_id uuid;
  v_tenant      uuid;
  v_total       bigint;
begin
  v_proposal_id := coalesce(new.proposal_id, old.proposal_id);
  v_tenant      := coalesce(new.tenant_id, old.tenant_id);

  select coalesce(sum(i.line_total_cents), 0)
    into v_total
    from quote.proposal_items i
   where i.proposal_id = v_proposal_id
     and i.tenant_id = v_tenant;

  update quote.proposals
     set total_cents = v_total,
         updated_at  = now()
   where id = v_proposal_id
     and tenant_id = v_tenant;

  return coalesce(new, old);
end;
$$;

create trigger proposal_items_sync_total
  after insert or update of quantity, unit_amount_cents or delete
  on quote.proposal_items
  for each row execute function quote.sync_proposal_total();

-- =============================================================================
-- 4. PAYLOAD + EVENTOS
-- -----------------------------------------------------------------------------
-- ⭐ O PAYLOAD É AUTOSSUFICIENTE — inclui os itens e o carimbo da decisão.
-- Quem escuta (um dia, o faturamento) não faz join.
-- =============================================================================

create or replace function quote.proposal_payload(p_proposal_id uuid, p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_proposal quote.proposals;
  v_items    jsonb;
begin
  select * into v_proposal
    from quote.proposals
   where id = p_proposal_id and tenant_id = p_tenant_id;

  if not found then
    return '{}'::jsonb;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'lineNo',          i.line_no,
      'description',     i.description,
      'quantity',        i.quantity,
      'unitAmountCents', i.unit_amount_cents,
      'lineTotalCents',  i.line_total_cents
    ) order by i.line_no
  ), '[]'::jsonb)
    into v_items
    from quote.proposal_items i
   where i.proposal_id = p_proposal_id
     and i.tenant_id = p_tenant_id;

  return jsonb_build_object(
    'externalRef',       v_proposal.external_ref,
    'currency',          v_proposal.currency,
    'prospectName',      v_proposal.prospect_name,
    'counterpartyTaxId', v_proposal.counterparty_tax_id,
    'description',       v_proposal.description,
    'validUntil',        v_proposal.valid_until,
    'totalCents',        v_proposal.total_cents,
    'status',            v_proposal.status,
    'decidedAt',         v_proposal.decided_at,
    'decisionNote',      v_proposal.decision_note,
    'items',             v_items
  );
end;
$$;

comment on function quote.proposal_payload(uuid, uuid) is
  'Envelope AUTOSSUFICIENTE da proposta — itens e carimbo da decisão inclusos. Quem escuta não faz join.';

create or replace function quote.on_proposal_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform quote.emit_event(
    new.tenant_id,
    'quote.proposal.registered',
    quote.proposal_payload(new.id, new.tenant_id)
  );
  return new;
end;
$$;

create trigger proposals_emit_registered
  after insert on quote.proposals
  for each row execute function quote.on_proposal_registered();

-- Cada fim de linha tem fato próprio; `updated` cobre a edição do rascunho.
create or replace function quote.on_proposal_changed()
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
                when 'sent'      then 'quote.proposal.sent'
                when 'accepted'  then 'quote.proposal.accepted'
                when 'declined'  then 'quote.proposal.declined'
                when 'expired'   then 'quote.proposal.expired'
                when 'cancelled' then 'quote.proposal.cancelled'
                else null
              end;
    if v_type is not null then
      perform quote.emit_event(new.tenant_id, v_type, quote.proposal_payload(new.id, new.tenant_id));
    end if;
    return new;
  end if;

  -- Sem mudança de status: emite `updated` só quando muda O FATO.
  if new.total_cents          is distinct from old.total_cents
     or new.currency          is distinct from old.currency
     or new.valid_until       is distinct from old.valid_until
     or new.prospect_name     is distinct from old.prospect_name
     or new.counterparty_tax_id is distinct from old.counterparty_tax_id then
    perform quote.emit_event(new.tenant_id, 'quote.proposal.updated',
                             quote.proposal_payload(new.id, new.tenant_id));
  end if;

  return new;
end;
$$;

create trigger proposals_emit_changed
  after update on quote.proposals
  for each row execute function quote.on_proposal_changed();

-- Itens mudam o fato do total → `updated` no cabeçalho (só em rascunho, pelo
-- porteiro de §3; fora dele o INSERT/UPDATE/DELETE nem acontece).
create or replace function quote.on_item_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proposal_id uuid := coalesce(new.proposal_id, old.proposal_id);
  v_tenant      uuid := coalesce(new.tenant_id, old.tenant_id);
begin
  perform quote.emit_event(
    v_tenant,
    'quote.proposal.updated',
    quote.proposal_payload(v_proposal_id, v_tenant)
  );
  return coalesce(new, old);
end;
$$;

create trigger proposal_items_emit_updated
  after insert or update of quantity, unit_amount_cents, description or delete
  on quote.proposal_items
  for each row execute function quote.on_item_changed();

-- =============================================================================
-- 5. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema quote                  from public, anon, authenticated;
revoke all on all tables    in schema quote from public, anon, authenticated;
revoke all on all functions in schema quote from public, anon, authenticated;

grant usage on schema quote to authenticated;

grant select, insert, update on quote.proposals to authenticated;
grant select, insert, update, delete on quote.proposal_items to authenticated;

grant execute on function quote.can_access(uuid) to authenticated;

-- `quote.emit_event` NÃO é concedida: ninguém emite evento à mão.
-- `quote.proposal_payload` NÃO é concedida: é encanamento dos gatilhos —
-- e função SECURITY DEFINER que recebe uuid só seria concedida conferindo o
-- vínculo POR DENTRO, o que ela não precisa fazer porque nenhuma tela a chama.
-- `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum objeto fora de `quote`. Nenhuma leitura de
-- schema alheio.
-- =============================================================================
