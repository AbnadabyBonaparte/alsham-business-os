-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0028_ctr.sql
-- Módulo 13: Contratos. Schema `ctr`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §17,
-- depois do `0027_dun.sql`.
--
-- Taxonomia: Domain ⚖ Jurídico — capacidade *Contratos*.
-- Spec: docs/canon/MODULO-CTR-SPEC.md
--
-- -----------------------------------------------------------------------------
-- POR QUE O `module_id` É `ctr`
-- -----------------------------------------------------------------------------
-- Cinto de emit_event: eventos `ctr.*` ⇒ id `ctr`. Pacote @alsham/contracts.
-- `contract` não entra pelo MESMO argumento que derrubou `event` no Módulo 11:
-- "contrato" já é vocabulário do CORAÇÃO do canon — o CORE-SPEC é "o CONTRATO
-- do Lego", `packages/core` é "contrato puro", e o acoplamento entre módulos é
-- "com o tipo do evento, que é contrato público". Sol Único: uma palavra não
-- quer dizer duas coisas. `ctr` é curto, greppável e foi conferido por grep
-- com fronteira de palavra: zero colisões.
--
-- -----------------------------------------------------------------------------
-- ⭐ A DECISÃO DE CANON CENTRAL: O TERMO VIGENTE NÃO É COLUNA
-- -----------------------------------------------------------------------------
-- O saldo do `inv` (0023), re-perguntado para os termos do contrato — e a
-- resposta é a mesma: **um número editável esquece como chegou lá.**
--
-- O contrato guarda os termos ORIGINAIS (valor, moeda, fim de vigência) e eles
-- CONGELAM quando o contrato entra em vigor. O que muda depois muda por ATO
-- REGISTRADO e imutável: o REAJUSTE (§4) muda o valor; a RENOVAÇÃO (§5) muda o
-- fim. O termo VIGENTE é consequência calculada na leitura (`ctr.contract_terms`,
-- §6): o documento original + o último ato de cada livro. Editar o valor de um
-- contrato em vigor direto na coluna apagaria a história de COMO ele chegou lá
-- — que é exatamente o que uma auditoria pergunta.
--
-- -----------------------------------------------------------------------------
-- ⭐ RENOVAÇÃO: ATO NO MESMO CONTRATO — o DIVERGE consciente do quote
-- -----------------------------------------------------------------------------
-- O `quote` decidiu "renegociar é documento novo" porque a contraparte aceitou
-- UMA proposta congelada — identidade por documento. Re-perguntado aqui, a
-- resposta DIVERGE: o contrato em vigor é uma RELAÇÃO CONTÍNUA — a locação
-- renovada da mesma sala com a mesma parte é O MESMO contrato aos olhos do
-- mundo (mesmo número, mesmo livro de reajustes). Obrigar um documento novo a
-- cada renovação partiria o histórico de reajustes em dois (o argumento do
-- `crm`: a contraparte que volta é a MESMA pessoa). Renovar é ATO imutável que
-- ESTENDE a vigência: quem, quando, de que fim para que fim. Encurtar prazo
-- não é renovação — é rescisão, e rescisão tem ato próprio.
--
-- -----------------------------------------------------------------------------
-- CICLO DE VIDA — re-perguntando os irmãos, decisão escrita
-- -----------------------------------------------------------------------------
--   draft → active | cancelled          active → ended | terminated
--
-- MANTIDO do quote/ap: os fins são TERMINAIS — identidade por documento. O
--   contrato que "volta" é renovação (ato no mesmo) ou documento novo.
-- ⭐ ENCERRAR ≠ RESCINDIR, e são dois estados: `ended` é o fim NATURAL do
--   prazo — e é registro de CALENDÁRIO, não vontade: só com a vigência
--   VENCIDA (a régua do quote.expired). Contrato sem fim não "acaba" —
--   rescinde-se. `terminated` é ATO unilateral ou distrato: exige RAZÃO
--   (a lição do deal.lost: o livro existe para se aprender por que se rompe)
--   e permissão própria de decisão.
-- ⭐ ENTRAR EM VIGOR exige contraparte E início de vigência — como o quote
--   não põe na mesa proposta vazia. Rascunho pode nascer incompleto; vigor
--   não.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA `contract_type` TEXTO LIVRE opcional — "locação", "prestação",
--      "fornecimento" é vocabulário de cada casa; um enum congelaria o
--      dicionário de um setor no schema de todos. Não é tabela do tenant
--      porque o tipo não agrega nem decide NADA neste módulo — cadastro para
--      etiqueta seria cerimônia; quando um agregado por tipo existir,
--      re-pergunta-se.
--   ✅ ENTRA contraparte NEUTRA (`counterparty_name` + `counterparty_tax_id`,
--      os nomes dos irmãos) + vínculo com o crm por ID SOLTO — nunca FK
--      (padrão deal; a guarda da matriz reprovaria `references crm.`).
--   ✅ ENTRA índice de reajuste TEXTO LIVRE ("IGP-M", "IPCA", "acordo") —
--      e o sistema NUNCA calcula o índice: índice econômico é ofício de
--      gente (a Lei 3 vizinha). O módulo REGISTRA o reajuste decidido.
--   ❌ NÃO ENTRA assinatura digital (Engine da Taxonomia §4), upload do PDF
--      (Storage & Arquivos é capacidade do Core, NÃO CONSTRUÍDA — como no
--      ops), aditivos estruturados além de reajuste/renovação, garantias,
--      aviso automático de vencimento (envio é integração; a VIEW por data
--      §6 serve o honesto sem cron fingido).
-- =============================================================================

create schema if not exists ctr;

comment on schema ctr is
  'Módulo Contratos. Domain legal da Taxonomia. Termos originais congelados em vigor; o termo vigente é calculado dos atos (reajuste, renovação). Não cria objeto em core nem lê schema alheio; fala só por core.event_outbox.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — décima terceira vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function ctr.emit_event(
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
  if p_event_type not like 'ctr.%' then
    raise exception 'ctr.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'ctr',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function ctr.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function ctr.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'ctr.contract.manage')
      or core.has_permission(p_tenant_id, 'ctr.contract.amend')
      or core.has_permission(p_tenant_id, 'ctr.contract.decide');
$$;

create or replace function ctr.touch_updated_at()
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
-- 2. CONTRACTS — o documento
-- =============================================================================

create table ctr.contracts (
  id                  uuid        primary key default gen_random_uuid(),
  tenant_id           uuid        not null references core.tenants (id) on delete cascade,
  external_ref        text        not null check (length(btrim(external_ref)) > 0),
  -- O objeto do contrato, nas palavras do tenant.
  title               text        not null check (length(btrim(title)) > 0),
  description         text        not null default '',
  -- TEXTO LIVRE opcional — ver o anti-viés do cabeçalho.
  contract_type       text,
  -- Contraparte NEUTRA. Obrigatória só para ENTRAR EM VIGOR (§2.2).
  counterparty_name   text,
  counterparty_tax_id text,
  -- ⭐ ID SOLTO + nome carimbado acima — nunca FK para crm (padrão deal).
  party_id            uuid,
  -- Vigência ORIGINAL. `starts_on` obrigatório para entrar em vigor;
  -- `ends_on` opcional SEMPRE: prazo indeterminado existe.
  starts_on           date,
  ends_on             date,
  -- Valor ORIGINAL, opcional — contrato sem valor econômico direto existe
  -- (comodato, parceria). Valor e moeda andam juntos (constraint do deal).
  value_cents         bigint      check (value_cents is null or value_cents > 0),
  currency            char(3)     check (currency is null or currency ~ '^[A-Z]{3}$'),
  status              text        not null default 'draft'
                      check (status in ('draft', 'active', 'ended', 'terminated', 'cancelled')),
  -- A razão do desfecho. Obrigatória na rescisão (§2.2).
  outcome_reason      text        not null default '',
  -- ⭐ O ATO do desfecho, carimbado pelo SERVIDOR (padrão quote.decided_*).
  decided_at          timestamptz,
  decided_by          uuid        references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  created_by          uuid        references auth.users (id) on delete set null,
  updated_at          timestamptz not null default now(),
  constraint contracts_unique_ref unique (tenant_id, external_ref),
  constraint contracts_id_tenant unique (id, tenant_id),
  constraint contracts_type_not_blank check (
    contract_type is null or length(btrim(contract_type)) > 0
  ),
  constraint contracts_counterparty_not_blank check (
    counterparty_name is null or length(btrim(counterparty_name)) > 0
  ),
  constraint contracts_period_coherent check (
    ends_on is null or starts_on is null or ends_on >= starts_on
  ),
  constraint contracts_value_currency check (
    (value_cents is null and currency is null) or
    (value_cents is not null and currency is not null)
  ),
  -- O estado e o carimbo contam a mesma história (padrão quote).
  constraint contracts_decision_coherent check (
    (status in ('ended', 'terminated') and decided_at is not null) or
    (status not in ('ended', 'terminated'))
  )
);

create index contracts_book_idx
  on ctr.contracts (tenant_id, status, created_at desc);
create index contracts_party_idx
  on ctr.contracts (tenant_id, party_id)
  where party_id is not null;

create trigger contracts_touch
  before update on ctr.contracts
  for each row execute function ctr.touch_updated_at();

alter table ctr.contracts enable row level security;
alter table ctr.contracts force row level security;

create policy contracts_select on ctr.contracts
  for select to authenticated
  using (ctr.can_access(tenant_id));

create policy contracts_insert on ctr.contracts
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'ctr.contract.manage'));

create policy contracts_update on ctr.contracts
  for update to authenticated
  using (
    core.has_permission(tenant_id, 'ctr.contract.manage')
    or core.has_permission(tenant_id, 'ctr.contract.decide')
  )
  with check (
    core.has_permission(tenant_id, 'ctr.contract.manage')
    or core.has_permission(tenant_id, 'ctr.contract.decide')
  );

-- ⛔ Sem policy / grant de DELETE. Contrato encerrado é história jurídica.

-- -----------------------------------------------------------------------------
-- 2.1 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/contracts
-- -----------------------------------------------------------------------------

create or replace function ctr.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('draft',  'active'),
    ('draft',  'cancelled'),
    ('active', 'ended'),
    ('active', 'terminated')
  );
$$;

comment on function ctr.allowed_transition(text, text) is
  'Ciclo de vida do contrato. Espelho de ALLOWED_TRANSITIONS em @alsham/contracts — há teste que lê este arquivo e compara. Os três fins são TERMINAIS: o contrato que continua é renovação (ato no mesmo); o que recomeça é documento novo.';

-- -----------------------------------------------------------------------------
-- 2.2 O PORTEIRO DO ESTADO — vigor exige conteúdo; fim natural exige
--     calendário; rescisão exige razão. Carimbo sempre do SERVIDOR.
-- -----------------------------------------------------------------------------

create or replace function ctr.guard_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_end date;
begin
  if new.status = old.status then
    return new;
  end if;

  if not ctr.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida do contrato: o que continua é renovação; o que recomeça é documento novo',
      old.status, new.status
      using errcode = '22023';
  end if;

  -- Entrar em vigor exige o essencial: com quem e desde quando.
  if new.status = 'active' then
    if new.counterparty_name is null then
      raise exception 'entrar em vigor exige a contraparte: contrato sem a outra parte é rascunho'
        using errcode = '22023';
    end if;
    if new.starts_on is null then
      raise exception 'entrar em vigor exige o início da vigência'
        using errcode = '22023';
    end if;
  end if;

  -- ⭐ `ended` é registro de CALENDÁRIO, nunca vontade (a régua do quote):
  -- só com a vigência VIGENTE vencida — e a vigente considera as renovações.
  if new.status = 'ended' then
    if not core.has_permission(new.tenant_id, 'ctr.contract.decide') then
      raise exception 'encerrar o contrato exige a permissão ctr.contract.decide'
        using errcode = '42501';
    end if;
    select coalesce(
             (select r.new_ends_on
                from ctr.renewals r
               where r.contract_id = new.id and r.tenant_id = new.tenant_id
               order by r.renewed_at desc limit 1),
             old.ends_on
           )
      into v_current_end;
    if v_current_end is null then
      raise exception 'contrato sem fim de vigência não se encerra por prazo: rescinda-o com a razão'
        using errcode = '22023';
    end if;
    if v_current_end >= current_date then
      raise exception 'a vigência (até %) ainda não venceu: encerrar agora mentiria sobre o calendário', v_current_end
        using errcode = '22023';
    end if;
    new.decided_at := now();
    new.decided_by := (select auth.uid());
  end if;

  -- ⭐ Rescindir é DECISÃO com razão — o livro existe para se aprender por
  -- que se rompe (a lição do deal.lost).
  if new.status = 'terminated' then
    if not core.has_permission(new.tenant_id, 'ctr.contract.decide') then
      raise exception 'rescindir o contrato exige a permissão ctr.contract.decide'
        using errcode = '42501';
    end if;
    if length(btrim(new.outcome_reason)) = 0 then
      raise exception 'rescindir exige a razão: rescisão sem motivo é história que ninguém consegue ler depois'
        using errcode = '22023';
    end if;
    new.decided_at := now();
    new.decided_by := (select auth.uid());
  end if;

  return new;
end;
$$;

create trigger contracts_guard_status
  before update of status on ctr.contracts
  for each row execute function ctr.guard_status_transition();

-- -----------------------------------------------------------------------------
-- 2.3 ⭐ OS TERMOS ORIGINAIS CONGELAM FORA DO RASCUNHO
-- -----------------------------------------------------------------------------
-- Depois de em vigor, valor muda SÓ por reajuste (§4) e fim de vigência SÓ
-- por renovação (§5) — e os dois escrevem no LIVRO, nunca nesta linha. A
-- contraparte e o início não mudam nunca mais: trocar a parte de um contrato
-- em vigor é documento novo. `description` continua editável — anotação não
-- é termo.
-- -----------------------------------------------------------------------------

create or replace function ctr.guard_terms_frozen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'draft' then
    return new;
  end if;

  if new.external_ref        is distinct from old.external_ref
     or new.counterparty_name   is distinct from old.counterparty_name
     or new.counterparty_tax_id is distinct from old.counterparty_tax_id
     or new.party_id            is distinct from old.party_id
     or new.starts_on           is distinct from old.starts_on
     or new.ends_on             is distinct from old.ends_on
     or new.value_cents         is distinct from old.value_cents
     or new.currency            is distinct from old.currency
     or new.contract_type       is distinct from old.contract_type then
    raise exception 'os termos de um contrato em vigor não se editam: valor muda por REAJUSTE, prazo por RENOVAÇÃO, parte por documento novo'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger contracts_terms_frozen
  before update on ctr.contracts
  for each row execute function ctr.guard_terms_frozen();

-- =============================================================================
-- 3. PAYLOAD — autossuficiente, com o TERMO VIGENTE calculado
-- =============================================================================

create or replace function ctr.contract_payload(p ctr.contracts)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_value_cents bigint;
  v_ends_on     date;
begin
  select coalesce(
           (select a.new_value_cents
              from ctr.adjustments a
             where a.contract_id = p.id and a.tenant_id = p.tenant_id
             order by a.adjusted_on desc, a.registered_at desc limit 1),
           p.value_cents
         ),
         coalesce(
           (select r.new_ends_on
              from ctr.renewals r
             where r.contract_id = p.id and r.tenant_id = p.tenant_id
             order by r.renewed_at desc limit 1),
           p.ends_on
         )
    into v_value_cents, v_ends_on;

  return jsonb_build_object(
    'contractId',         p.id,
    'externalRef',        p.external_ref,
    'title',              p.title,
    'contractType',       p.contract_type,
    'counterpartyName',   p.counterparty_name,
    'counterpartyTaxId',  p.counterparty_tax_id,
    'partyId',            p.party_id,
    'startsOn',           p.starts_on,
    'originalEndsOn',     p.ends_on,
    'currentEndsOn',      v_ends_on,
    'originalValueCents', p.value_cents,
    'currentValueCents',  v_value_cents,
    'currency',           p.currency,
    'status',             p.status,
    'outcomeReason',      p.outcome_reason,
    'decidedAt',          p.decided_at
  );
end;
$$;

comment on function ctr.contract_payload(ctr.contracts) is
  'O envelope de um contrato — AUTOSSUFICIENTE, com as partes pelo NOME e o termo VIGENTE calculado dos atos. Quem escuta não faz join.';

-- =============================================================================
-- 4. ADJUSTMENTS — ⭐ O REAJUSTE É REGISTRO IMUTÁVEL (três camadas)
-- -----------------------------------------------------------------------------
-- O sistema REGISTRA o reajuste que gente decidiu; calcular índice econômico
-- é ofício (Lei 3 vizinha) e NUNCA entra aqui. `index_name` é TEXTO LIVRE e
-- OBRIGATÓRIO — reajuste sem índice/motivo é a linha muda do inv.
-- =============================================================================

create table ctr.adjustments (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid        not null references core.tenants (id) on delete cascade,
  contract_id      uuid        not null,
  -- Quando o reajuste PASSA A VALER. Aceita passado — fato consumado
  -- registrado depois (padrão inv.occurred_at).
  adjusted_on      date        not null,
  index_name       text        not null check (length(btrim(index_name)) > 0),
  previous_value_cents bigint  not null check (previous_value_cents > 0),
  new_value_cents  bigint      not null check (new_value_cents > 0),
  note             text        not null default '',
  registered_at    timestamptz not null default now(),
  actor_user_id    uuid        references auth.users (id) on delete set null,
  constraint adjustments_contract_fk
    foreign key (contract_id, tenant_id)
    references ctr.contracts (id, tenant_id)
    on delete restrict
);

create index adjustments_book_idx
  on ctr.adjustments (tenant_id, contract_id, adjusted_on desc, registered_at desc);

alter table ctr.adjustments enable row level security;
alter table ctr.adjustments force row level security;

create policy adjustments_select on ctr.adjustments
  for select to authenticated
  using (ctr.can_access(tenant_id));

-- ⚠️ Sem policy de INSERT: quem escreve é `ctr.register_adjustment()` (§4.1),
-- que confere a permissão do ato ANTES.

create or replace function ctr.guard_adjustment_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'o reajuste é registro de fato consumado: não se edita nem se apaga. Corrigir é registrar outro reajuste.'
    using errcode = '42501';
end;
$$;

create trigger adjustments_immutable
  before update or delete on ctr.adjustments
  for each row execute function ctr.guard_adjustment_immutable();

-- -----------------------------------------------------------------------------
-- 4.1 ⭐ REGISTRAR O REAJUSTE — o ato
-- -----------------------------------------------------------------------------

create or replace function ctr.register_adjustment(
  p_contract_id     uuid,
  p_adjusted_on     date,
  p_index_name      text,
  p_new_value_cents bigint,
  p_note            text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract ctr.contracts;
  v_previous bigint;
  v_adj_id   uuid;
begin
  -- SECURITY DEFINER confere o vínculo POR DENTRO: o tenant vem do CONTRATO,
  -- nunca de parâmetro (a observação do po.order_payload não se repete).
  select * into v_contract from ctr.contracts where id = p_contract_id;
  if v_contract.id is null then
    raise exception 'contrato não encontrado' using errcode = 'P0002';
  end if;

  if not ctr.can_access(v_contract.tenant_id) then
    raise exception 'sem acesso a este tenant' using errcode = '42501';
  end if;

  if not core.has_permission(v_contract.tenant_id, 'ctr.contract.amend') then
    raise exception 'registrar reajuste exige a permissão ctr.contract.amend'
      using errcode = '42501';
  end if;

  if v_contract.status <> 'active' then
    raise exception 'só se reajusta contrato EM VIGOR: este está %', v_contract.status
      using errcode = '22023';
  end if;

  if v_contract.value_cents is null then
    raise exception 'contrato sem valor não se reajusta: reajuste muda um valor que existe'
      using errcode = '22023';
  end if;

  if p_index_name is null or length(btrim(p_index_name)) = 0 then
    raise exception 'reajuste sem índice é a linha muda: escreva o índice ou o acordo que o justifica'
      using errcode = '22023';
  end if;

  if p_new_value_cents is null or p_new_value_cents <= 0 then
    raise exception 'o valor reajustado precisa ser maior que zero' using errcode = '22023';
  end if;

  -- O valor anterior é o VIGENTE — original ou último reajuste.
  select coalesce(
           (select a.new_value_cents
              from ctr.adjustments a
             where a.contract_id = v_contract.id and a.tenant_id = v_contract.tenant_id
             order by a.adjusted_on desc, a.registered_at desc limit 1),
           v_contract.value_cents
         )
    into v_previous;

  insert into ctr.adjustments (
    tenant_id, contract_id, adjusted_on, index_name,
    previous_value_cents, new_value_cents, note, actor_user_id
  ) values (
    v_contract.tenant_id, v_contract.id, p_adjusted_on, btrim(p_index_name),
    v_previous, p_new_value_cents, coalesce(p_note, ''), (select auth.uid())
  )
  returning id into v_adj_id;

  perform ctr.emit_event(
    v_contract.tenant_id,
    'ctr.contract.adjusted',
    ctr.contract_payload(v_contract) || jsonb_build_object(
      'adjustmentId',       v_adj_id,
      'adjustedOn',         p_adjusted_on,
      'indexName',          btrim(p_index_name),
      'previousValueCents', v_previous,
      'newValueCents',      p_new_value_cents,
      'note',               coalesce(p_note, '')
    )
  );

  return v_adj_id;
end;
$$;

comment on function ctr.register_adjustment(uuid, date, text, bigint, text) is
  'Registra o reajuste DECIDIDO POR GENTE: índice em texto livre, valor novo, anotação. O sistema não calcula índice (Lei 3). Só em contrato em vigor, com valor. Imutável.';

-- =============================================================================
-- 5. RENEWALS — ⭐ A RENOVAÇÃO É ATO NO MESMO CONTRATO (três camadas)
-- =============================================================================

create table ctr.renewals (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid        not null references core.tenants (id) on delete cascade,
  contract_id      uuid        not null,
  previous_ends_on date        not null,
  new_ends_on      date        not null,
  note             text        not null default '',
  renewed_at       timestamptz not null default now(),
  actor_user_id    uuid        references auth.users (id) on delete set null,
  constraint renewals_contract_fk
    foreign key (contract_id, tenant_id)
    references ctr.contracts (id, tenant_id)
    on delete restrict,
  -- Renovar ESTENDE. Encurtar não é renovação — é rescisão, que tem ato próprio.
  constraint renewals_extends check (new_ends_on > previous_ends_on)
);

create index renewals_book_idx
  on ctr.renewals (tenant_id, contract_id, renewed_at desc);

alter table ctr.renewals enable row level security;
alter table ctr.renewals force row level security;

create policy renewals_select on ctr.renewals
  for select to authenticated
  using (ctr.can_access(tenant_id));

-- ⚠️ Sem policy de INSERT: quem escreve é `ctr.renew_contract()` (§5.1).

create or replace function ctr.guard_renewal_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'a renovação é registro de fato consumado: não se edita nem se apaga. Corrigir é renovar de novo ou rescindir.'
    using errcode = '42501';
end;
$$;

create trigger renewals_immutable
  before update or delete on ctr.renewals
  for each row execute function ctr.guard_renewal_immutable();

-- -----------------------------------------------------------------------------
-- 5.1 ⭐ RENOVAR — o ato que estende a vigência do MESMO contrato
-- -----------------------------------------------------------------------------

create or replace function ctr.renew_contract(
  p_contract_id uuid,
  p_new_ends_on date,
  p_note        text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract    ctr.contracts;
  v_current_end date;
  v_ren_id      uuid;
begin
  select * into v_contract from ctr.contracts where id = p_contract_id;
  if v_contract.id is null then
    raise exception 'contrato não encontrado' using errcode = 'P0002';
  end if;

  if not ctr.can_access(v_contract.tenant_id) then
    raise exception 'sem acesso a este tenant' using errcode = '42501';
  end if;

  if not core.has_permission(v_contract.tenant_id, 'ctr.contract.amend') then
    raise exception 'renovar exige a permissão ctr.contract.amend'
      using errcode = '42501';
  end if;

  if v_contract.status <> 'active' then
    raise exception 'só se renova contrato EM VIGOR: este está %. Contrato encerrado que volta é documento novo', v_contract.status
      using errcode = '22023';
  end if;

  select coalesce(
           (select r.new_ends_on
              from ctr.renewals r
             where r.contract_id = v_contract.id and r.tenant_id = v_contract.tenant_id
             order by r.renewed_at desc limit 1),
           v_contract.ends_on
         )
    into v_current_end;

  if v_current_end is null then
    raise exception 'contrato sem fim de vigência não se renova: não há prazo a estender'
      using errcode = '22023';
  end if;

  if p_new_ends_on is null or p_new_ends_on <= v_current_end then
    raise exception 'renovar ESTENDE a vigência: o novo fim (%) precisa ser posterior ao vigente (%)', p_new_ends_on, v_current_end
      using errcode = '22023';
  end if;

  insert into ctr.renewals (
    tenant_id, contract_id, previous_ends_on, new_ends_on, note, actor_user_id
  ) values (
    v_contract.tenant_id, v_contract.id, v_current_end, p_new_ends_on,
    coalesce(p_note, ''), (select auth.uid())
  )
  returning id into v_ren_id;

  perform ctr.emit_event(
    v_contract.tenant_id,
    'ctr.contract.renewed',
    ctr.contract_payload(v_contract) || jsonb_build_object(
      'renewalId',      v_ren_id,
      'previousEndsOn', v_current_end,
      'newEndsOn',      p_new_ends_on,
      'note',           coalesce(p_note, '')
    )
  );

  return v_ren_id;
end;
$$;

comment on function ctr.renew_contract(uuid, date, text) is
  'Estende a vigência do MESMO contrato — a relação contratual é contínua (DIVERGE consciente do quote). Registro imutável: de que fim para que fim, quem, quando.';

-- =============================================================================
-- 6. O TERMO VIGENTE E OS VENCIMENTOS — consequência calculada
-- -----------------------------------------------------------------------------
-- ⚠️ `security_invoker = true` NÃO é detalhe: sem ela a view atravessaria a
-- RLS e mostraria a carteira de todos os tenants.
-- =============================================================================

create view ctr.contract_terms
  with (security_invoker = true)
as
select c.*,
       coalesce(
         (select a.new_value_cents
            from ctr.adjustments a
           where a.contract_id = c.id and a.tenant_id = c.tenant_id
           order by a.adjusted_on desc, a.registered_at desc limit 1),
         c.value_cents
       ) as current_value_cents,
       coalesce(
         (select r.new_ends_on
            from ctr.renewals r
           where r.contract_id = c.id and r.tenant_id = c.tenant_id
           order by r.renewed_at desc limit 1),
         c.ends_on
       ) as current_ends_on
  from ctr.contracts c;

comment on view ctr.contract_terms is
  'O contrato com o termo VIGENTE calculado: documento original + último ato de cada livro. Consequência calculada, nunca coluna. security_invoker: a RLS de contracts decide.';

create view ctr.expiring
  with (security_invoker = true)
as
select t.*,
       (t.current_ends_on - current_date) as days_to_end
  from ctr.contract_terms t
 where t.status = 'active'
   and t.current_ends_on is not null;

comment on view ctr.expiring is
  'Os contratos EM VIGOR com prazo: quantos dias faltam (negativo = vencido e ainda ativo — a decisão de encerrar ou renovar está atrasada). Calculada por data, sem cron fingido: a tela nunca mente.';

-- =============================================================================
-- 7. OS FATOS
-- =============================================================================

create or replace function ctr.on_contract_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform ctr.emit_event(new.tenant_id, 'ctr.contract.registered', ctr.contract_payload(new));
  return new;
end;
$$;

create trigger contracts_emit_registered
  after insert on ctr.contracts
  for each row execute function ctr.on_contract_registered();

create or replace function ctr.on_contract_changed()
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
                when 'active'     then 'ctr.contract.activated'
                when 'ended'      then 'ctr.contract.ended'
                when 'terminated' then 'ctr.contract.terminated'
                when 'cancelled'  then 'ctr.contract.cancelled'
                else null
              end;
    if v_type is not null then
      perform ctr.emit_event(new.tenant_id, v_type, ctr.contract_payload(new));
    end if;
    return new;
  end if;

  -- Sem mudança de status: `updated` só quando muda O FATO (edição de rascunho).
  if new.external_ref           is distinct from old.external_ref
     or new.title               is distinct from old.title
     or new.counterparty_name   is distinct from old.counterparty_name
     or new.counterparty_tax_id is distinct from old.counterparty_tax_id
     or new.starts_on           is distinct from old.starts_on
     or new.ends_on             is distinct from old.ends_on
     or new.value_cents         is distinct from old.value_cents
     or new.currency            is distinct from old.currency
     or new.contract_type       is distinct from old.contract_type then
    perform ctr.emit_event(new.tenant_id, 'ctr.contract.updated', ctr.contract_payload(new));
  end if;

  return new;
end;
$$;

create trigger contracts_emit_changed
  after update on ctr.contracts
  for each row execute function ctr.on_contract_changed();

-- =============================================================================
-- 8. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema ctr                  from public, anon, authenticated;
revoke all on all tables    in schema ctr from public, anon, authenticated;
revoke all on all functions in schema ctr from public, anon, authenticated;

grant usage on schema ctr to authenticated;

grant select, insert, update on ctr.contracts to authenticated;

-- ⛔ SÓ SELECT nos dois livros: o ato entra pela função, que confere antes.
grant select on ctr.adjustments to authenticated;
grant select on ctr.renewals    to authenticated;

grant select on ctr.contract_terms to authenticated;
grant select on ctr.expiring       to authenticated;

grant execute on function ctr.can_access(uuid)                                   to authenticated;
grant execute on function ctr.register_adjustment(uuid, date, text, bigint, text) to authenticated;
grant execute on function ctr.renew_contract(uuid, date, text)                    to authenticated;

-- `ctr.emit_event` NÃO é concedida. `ctr.contract_payload` é encanamento dos
-- gatilhos, não API de tela. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum enum de tipo ou de índice. Nenhum cálculo de
-- índice econômico. Nenhum objeto fora de `ctr`. Nenhuma leitura de schema
-- alheio — nem do crm: o vínculo é solto.
-- =============================================================================
