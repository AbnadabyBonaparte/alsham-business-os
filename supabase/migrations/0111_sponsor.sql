-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0111_sponsor.sql
-- Módulo 96: Patrocínios. Schema `sponsor`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/canon/ONDA-EVENTOS-DECISOES.md
-- e o runbook. Terceiro e ÚLTIMO módulo da Onda Eventos (Fase 3), Vertical
-- 🎪 Eventos (`vertical_key='events'`, VerticalKey do `@alsham/core`).
--
-- Taxonomia: Vertical 🎪 Eventos (§6, "vertical viva: Events OS™") —
-- capacidade *Patrocínios*.
-- Spec: docs/canon/MODULO-SPONSOR-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ A DECISÃO DE CANON CENTRAL: NÃO REESCREVE O CTR NEM O DEAL — é a camada
--     de patrocínio sobre eles, como o `lease` é a camada comercial sobre o ctr
-- -----------------------------------------------------------------------------
-- O contrato JURÍDICO do patrocínio (vigência, reajuste, rescisão) é o `ctr`
-- (Módulo 13); a NEGOCIAÇÃO que fechou a cota é o `deal` (Módulo 10); o EVENTO
-- patrocinado é o `evt` (Módulo 11). Este módulo NÃO reimplementa nenhum dos
-- três — referencia cada um por ID SOLTO (sem FK cruzada) + nome carimbado pela
-- tela. O que É do ofício de EVENTO, e só isso mora aqui:
--   1. a COTA de patrocínio (`tier`, TEXTO LIVRE — "ouro"/"prata"/"apoio" é
--      vocabulário de cada evento; um enum congelaria a régua de um congresso
--      no schema de todos — a mesma Lei 3 do índice do ctr e do segmento do mall);
--   2. o valor da cota (`amount_cents`, opcional — a cota pode ser permuta);
--   3. os ENTREGÁVEIS DE ATIVAÇÃO por evento (logo no palco, 10 cortesias,
--      ativação no foyer) — a física de EVENTO que o `ctr`/`deal` não modelam.
--      É este checklist de ativação, e não o contrato, que distingue o
--      `sponsor` de um `ctr` qualquer.
--
-- `event_id` é NOT NULL: um patrocínio sem evento não é patrocínio — é o que
-- este módulo existe para amarrar. `party_id` (o patrocinador como contraparte
-- do crm) e `contract_id` (o contrato jurídico no ctr) são OPCIONAIS: o
-- patrocínio pode ser registrado antes de o CNPJ virar contraparte ou de o
-- contrato ser assinado. Todos são SOLTOS (sem FK cruzada): o vínculo é com o
-- TIPO de entidade (um evento, uma contraparte, um contrato), nunca com uma
-- linha que este schema possa policiar ou fazer join. Um `event_id` inexistente
-- insere sem erro — a integridade daquele dado é do `evt`, não daqui.
--
-- -----------------------------------------------------------------------------
-- CICLO DE VIDA — `active ↔ archived` (a física do mall/vendor, re-perguntada)
-- -----------------------------------------------------------------------------
--   active ↔ archived  (reversível)
--
-- ⭐ O DIVERGE ASSINADO do `lease`: o `lease` (a outra camada-sobre-ctr do
-- império) tem `active → ended` TERMINAL, porque a locação é a camada FINA
-- entre o ctr (que já tem rescisão) e o mall (que já volta), e não inventa
-- física própria. O patrocínio é OUTRA coisa: é a RELAÇÃO com o patrocinador —
-- mais perto do `mall.stores`/`vendor` do que do `lease`. Um patrocinador que
-- volta no evento do ano seguinte (ou noutra edição) é a MESMA relação
-- comercial; obrigá-lo a nascer de novo partiria o histórico de patrocínio em
-- dois. Então `archived → active` EXISTE, e — como no mall — arquivar NÃO exige
-- razão (é reversível; só o encerramento terminal do lease/ctr exige razão) e a
-- linha arquivada NÃO congela (pode voltar e ser editada). O contraste
-- sponsor×lease está assinado no teste de pacote.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outro evento de outro dono usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA `tier` TEXTO LIVRE — "ouro"/"prata"/"apoio"/"naming rights" é
--      vocabulário de cada evento; enum ou tabela fixa congelaria a régua.
--   ✅ ENTRA o checklist de ativação (`deliverables`) — a física de EVENTO.
--   ❌ NÃO ENTRA contrato/vigência/rescisão (é do ctr — id solto).
--   ❌ NÃO ENTRA a negociação/funil que fechou a cota (é do deal — id solto).
--   ❌ NÃO ENTRA o cadastro do evento (é do evt — id solto).
--   ❌ NÃO ENTRA venda de ingresso/cortesia com pagamento (Lei 3 — é bilheteria,
--      declarada FORA da onda; a "10 cortesias" mora como TEXTO no entregável,
--      não como emissão de ingresso).
-- =============================================================================

create schema if not exists sponsor;

comment on schema sponsor is
  'Módulo Patrocínios. Vertical events da Taxonomia. NÃO reescreve o ctr (contrato jurídico), o deal (negociação) nem o evt (evento) — os três por id solto. Aqui mora só a cota de patrocínio (tier TEXTO LIVRE), o valor opcional e o checklist de entregáveis de ativação por evento. active ↔ archived (o patrocinador volta — o DIVERGE do lease terminal). Não cria objeto em core nem lê schema alheio.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — nonagésima sexta vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function sponsor.emit_event(
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
  if p_event_type not like 'sponsor.%' then
    raise exception 'sponsor.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'sponsor',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function sponsor.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function sponsor.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'sponsor.sponsorship.manage')
      or core.has_permission(p_tenant_id, 'sponsor.deliverable.manage');
$$;

create or replace function sponsor.touch_updated_at()
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
-- 2. SPONSORSHIPS — o patrocínio (a cota, não o contrato nem o evento)
-- =============================================================================

create table sponsor.sponsorships (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references core.tenants (id) on delete cascade,
  -- ⭐ ID SOLTO ao evt — SEM FK. O cadastro do evento é do evt. NOT NULL:
  -- patrocínio sem evento não existe.
  event_id      uuid        not null,
  event_ref     text        not null default '',
  -- O patrocinador — TEXTO LIVRE (a razão social/marca, dado do tenant).
  sponsor_name  text        not null check (length(btrim(sponsor_name)) > 0),
  -- ⭐ ID SOLTO ao crm — SEM FK, OPCIONAL. O patrocinador como contraparte.
  party_id      uuid,
  -- ⭐ A COTA — TEXTO LIVRE (ouro/prata/apoio), NUNCA enum (Lei 3 / anti-viés).
  tier          text        not null default '',
  -- O valor da cota — OPCIONAL (a cota pode ser permuta). Sem cálculo.
  amount_cents  bigint      check (amount_cents is null or amount_cents >= 0),
  currency      char(3)     check (currency is null or currency ~ '^[A-Z]{3}$'),
  -- ⭐ ID SOLTO ao ctr — SEM FK, OPCIONAL. O contrato jurídico vive no ctr.
  contract_id   uuid,
  contract_ref  text        not null default '',
  status        text        not null default 'active'
              check (status in ('active', 'archived')),
  created_at    timestamptz not null default now(),
  created_by    uuid        references auth.users (id) on delete set null,
  updated_at    timestamptz not null default now(),
  constraint sponsorships_id_tenant unique (id, tenant_id)
);

create index sponsorships_book_idx
  on sponsor.sponsorships (tenant_id, status, created_at desc);
create index sponsorships_event_idx
  on sponsor.sponsorships (tenant_id, event_id);
create index sponsorships_party_idx
  on sponsor.sponsorships (tenant_id, party_id);

create trigger sponsorships_touch
  before update on sponsor.sponsorships
  for each row execute function sponsor.touch_updated_at();

alter table sponsor.sponsorships enable row level security;
alter table sponsor.sponsorships force row level security;

create policy sponsorships_select on sponsor.sponsorships
  for select to authenticated
  using (sponsor.can_access(tenant_id));

create policy sponsorships_insert on sponsor.sponsorships
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'sponsor.sponsorship.manage'));

-- ⚠️ Largo por padrão (can_access — o mesmo do mall): quem tem QUALQUER das
-- duas permissões passa pela RLS de UPDATE; a permissão ESPECÍFICA
-- (`sponsor.sponsorship.manage`) é exigida pelo GATILHO da transição (§2.2),
-- não pela RLS — igual ao mall.store.decide sobre mall.can_access.
create policy sponsorships_update on sponsor.sponsorships
  for update to authenticated
  using (sponsor.can_access(tenant_id))
  with check (sponsor.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Patrocínio que saiu é histórico comercial —
-- arquivar é status, e `archived → active` existe (a relação volta).

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre ATIVO
-- -----------------------------------------------------------------------------

create or replace function sponsor.guard_sponsorship_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'active' then
    raise exception 'o patrocínio nasce ativo — arquivar é decisão à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger sponsorships_stamp
  before insert on sponsor.sponsorships
  for each row execute function sponsor.guard_sponsorship_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/sponsor
-- -----------------------------------------------------------------------------
-- ⭐ active ↔ archived (o patrocinador volta — o DIVERGE do lease terminal).

create or replace function sponsor.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('active',   'archived'),
    ('archived', 'active')
  );
$$;

comment on function sponsor.allowed_transition(text, text) is
  'Ciclo de vida do patrocínio. Espelho de ALLOWED_TRANSITIONS em @alsham/sponsor. active ↔ archived: o patrocinador é relação comercial que volta (o DIVERGE do lease, onde active → ended é terminal).';

create or replace function sponsor.guard_sponsorship_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not sponsor.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida do patrocínio', old.status, new.status
      using errcode = '22023';
  end if;

  -- Arquivar e reabrir são DECISÕES (tiram/põem o patrocínio no mapa). Uma
  -- única permissão cobre registrar E arquivar/reabrir — o patrocínio não tem
  -- o par manage/decide do mall: registrar a cota e movê-la no arquivo são o
  -- mesmo ofício comercial. `sponsor.deliverable.manage` (§3) é o do checklist,
  -- à parte — a divisão de permissão é por TABELA, como no lease.
  if not core.has_permission(new.tenant_id, 'sponsor.sponsorship.manage') then
    raise exception 'arquivar ou reabrir um patrocínio exige a permissão sponsor.sponsorship.manage'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger sponsorships_guard_status
  before update of status on sponsor.sponsorships
  for each row execute function sponsor.guard_sponsorship_transition();

-- =============================================================================
-- 2.3 OS FATOS DO PATROCÍNIO — payload autossuficiente (evento/contrato pelo NOME)
-- =============================================================================

create or replace function sponsor.sponsorship_payload(p sponsor.sponsorships)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'sponsorshipId', p.id,
    'eventId',       p.event_id,
    'eventRef',      p.event_ref,
    'sponsorName',   p.sponsor_name,
    'partyId',       p.party_id,
    'tier',          p.tier,
    'amountCents',   p.amount_cents,
    'currency',      p.currency,
    'contractId',    p.contract_id,
    'contractRef',   p.contract_ref,
    'status',        p.status
  );
$$;

comment on function sponsor.sponsorship_payload(sponsor.sponsorships) is
  'O envelope de um patrocínio — AUTOSSUFICIENTE, com o evento e o contrato pelo NOME carimbado. Quem escuta não faz join nem com o evt, nem com o ctr, nem com o crm.';

create or replace function sponsor.on_sponsorship_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform sponsor.emit_event(new.tenant_id, 'sponsor.sponsorship.registered', sponsor.sponsorship_payload(new));
  return new;
end;
$$;

create trigger sponsorships_emit_registered
  after insert on sponsor.sponsorships
  for each row execute function sponsor.on_sponsorship_registered();

-- ⭐ active ↔ archived emite os DOIS fatos, por simetria: arquivar sem reabrir
-- (ou vice-versa) numa física simétrica seria mentira sutil na trilha. É o
-- padrão do mall (a physics irmã de relação-que-volta).
create or replace function sponsor.on_sponsorship_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform sponsor.emit_event(
      new.tenant_id,
      case when new.status = 'archived' then 'sponsor.sponsorship.archived'
           else 'sponsor.sponsorship.reopened' end,
      sponsor.sponsorship_payload(new)
    );
  end if;
  return new;
end;
$$;

create trigger sponsorships_emit_changed
  after update on sponsor.sponsorships
  for each row execute function sponsor.on_sponsorship_changed();

-- =============================================================================
-- 3. DELIVERABLES — ⭐ o checklist de ativação por evento
-- -----------------------------------------------------------------------------
-- É o que distingue o `sponsor` de um `ctr` qualquer: os entregáveis que o
-- patrocinador é DEVIDO (logo no palco, 10 cortesias, ativação no foyer). O
-- entregável é MUTÁVEL de propósito — o DIVERGE do livro imutável do `lease`
-- (sales_reports): um relatório de vendas é fato consumado; um item de
-- checklist é uma PROMESSA que se acompanha (marca-se feito, desmarca-se se
-- não foi). Por ser checklist, e não livro de fatos, NÃO emite evento próprio.
-- FK INTRA-schema (permitida — é o próprio módulo).
-- =============================================================================

create table sponsor.deliverables (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references core.tenants (id) on delete cascade,
  sponsorship_id  uuid        not null,
  -- O entregável — TEXTO LIVRE (dado do tenant, vocabulário de cada evento).
  description     text        not null check (length(btrim(description)) > 0),
  delivered       boolean     not null default false,
  -- ⭐ O carimbo de entrega é do SERVIDOR — a hora/autor que o cliente mandar
  -- é descartada (§3.1).
  delivered_at    timestamptz,
  delivered_by    uuid        references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  created_by      uuid        references auth.users (id) on delete set null,
  updated_at      timestamptz not null default now(),
  constraint deliverables_sponsorship_fk
    foreign key (sponsorship_id, tenant_id)
    references sponsor.sponsorships (id, tenant_id)
    on delete restrict,
  -- O carimbo e o estado contam a mesma história: entregue tem carimbo,
  -- pendente não tem.
  constraint deliverables_delivered_coherent check (
    (delivered     and delivered_at is not null) or
    (not delivered and delivered_at is null)
  )
);

create index deliverables_book_idx
  on sponsor.deliverables (tenant_id, sponsorship_id, created_at);

create trigger deliverables_touch
  before update on sponsor.deliverables
  for each row execute function sponsor.touch_updated_at();

alter table sponsor.deliverables enable row level security;
alter table sponsor.deliverables force row level security;

create policy deliverables_select on sponsor.deliverables
  for select to authenticated
  using (sponsor.can_access(tenant_id));

-- ⭐ Escrever o checklist exige a permissão PRÓPRIA (deliverable.manage). Quem
-- só registra a cota (sponsorship.manage) lê o checklist mas não o mexe — a
-- assimetria testável, como no lease (agreement.manage × report.manage).
create policy deliverables_insert on sponsor.deliverables
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'sponsor.deliverable.manage'));

create policy deliverables_update on sponsor.deliverables
  for update to authenticated
  using (core.has_permission(tenant_id, 'sponsor.deliverable.manage'))
  with check (core.has_permission(tenant_id, 'sponsor.deliverable.manage'));

-- ⛔ Sem policy / grant de DELETE. Um entregável não se apaga — some do
-- checklist só se a descrição estava errada, e aí corrige-se a descrição.

-- -----------------------------------------------------------------------------
-- 3.1 O carimbo do servidor — quem entregou e quando, nunca do formulário
-- -----------------------------------------------------------------------------

create or replace function sponsor.guard_deliverable_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_by := (select auth.uid());
  -- Nasce entregue? o servidor carimba. Nasce pendente? sem carimbo.
  if new.delivered then
    new.delivered_at := now();
    new.delivered_by := (select auth.uid());
  else
    new.delivered_at := null;
    new.delivered_by := null;
  end if;
  return new;
end;
$$;

create trigger deliverables_stamp_insert
  before insert on sponsor.deliverables
  for each row execute function sponsor.guard_deliverable_insert();

create or replace function sponsor.guard_deliverable_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- ⭐ Marcar como entregue carimba o servidor; desmarcar limpa o carimbo. A
  -- hora/autor que vierem no UPDATE são sempre descartados.
  if new.delivered and not old.delivered then
    new.delivered_at := now();
    new.delivered_by := (select auth.uid());
  elsif not new.delivered and old.delivered then
    new.delivered_at := null;
    new.delivered_by := null;
  else
    -- Sem mudança de estado: o carimbo antigo permanece, imexível pelo cliente.
    new.delivered_at := old.delivered_at;
    new.delivered_by := old.delivered_by;
  end if;
  return new;
end;
$$;

create trigger deliverables_stamp_update
  before update on sponsor.deliverables
  for each row execute function sponsor.guard_deliverable_update();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema sponsor                  from public, anon, authenticated;
revoke all on all tables    in schema sponsor from public, anon, authenticated;
revoke all on all functions in schema sponsor from public, anon, authenticated;

grant usage on schema sponsor to authenticated;

grant select, insert, update on sponsor.sponsorships to authenticated;
grant select, insert, update on sponsor.deliverables to authenticated;

grant execute on function sponsor.can_access(uuid) to authenticated;

-- `sponsor.emit_event` NÃO é concedida. `sponsor.sponsorship_payload` é
-- encanamento dos gatilhos, não API de tela. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT de dado. Nenhum contrato/vigência/rescisão reimplementado
-- (é do ctr, por id solto). Nenhuma negociação/funil (é do deal, por id solto).
-- Nenhum cadastro de evento (é do evt, por id solto). Nenhum enum de cota.
-- Nenhuma venda de ingresso (Lei 3 — FORA). Nenhum objeto fora de `sponsor`.
-- Nenhuma leitura de schema alheio. `consumes` VAZIO (Lei 7).
-- =============================================================================
