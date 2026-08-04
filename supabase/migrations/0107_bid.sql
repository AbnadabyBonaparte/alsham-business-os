-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0107_bid.sql
-- Módulo 87: Licitações (Bid). Schema `bid`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md, o terceiro
-- módulo da Onda Governo (Fase 3 — o Vertical 🏛 Governo). Nasce ao lado do
-- `proc` (protocolo), do `ombuds` (ouvidoria) e do `fisc` (fiscalização) sob
-- `vertical_key='government'`.
--
-- Taxonomia: Vertical 🏛 Governo — capacidade *Licitações* (§6). A Store o exibe
-- na galeria de Verticais, na pill de Governo.
-- Spec: docs/canon/MODULO-BID-SPEC.md
-- Decisões: docs/canon/ONDA-GOVERNO-DECISOES.md (capacidade #3)
--
-- -----------------------------------------------------------------------------
-- ⭐ A IDENTIDADE É A DO `rfq` — RE-PERGUNTADA — E O DIVERGE ASSINADO
-- -----------------------------------------------------------------------------
-- Copiar sem pensar e divergir sem escrever são o mesmo erro (CLAUDE.md). A
-- licitação REUSA a física do `rfq` (que já reusava a do `quote`): nasce
-- `draft`, PUBLICAR O EDITAL CONGELA o conteúdo (título, edital, modalidade e
-- itens não mudam mais depois de ir a mercado), e os fins são TERMINAIS (uma
-- licitação decidida é aquele edital, com aquelas linhas — refazer é licitação
-- nova). Quem DECIDE o fim é quem CONDUZ (o órgão), não o fornecedor.
--
-- ⭐ O DIVERGE do `rfq` (assinado no `lifecycle.test.ts`): o terminal do `rfq` é
-- `awarded` — o comprador PREMIA (ato comercial neutro). O terminal da
-- licitação é `homologated` — a HOMOLOGAÇÃO/ADJUDICAÇÃO, o ato PÚBLICO mais
-- SOLENE da Lei 14.133 (publicar edital → receber propostas → julgar →
-- homologar). O nome é a decisão: `awarded` seria o vocabulário privado; o
-- Estado homologa. O contraste é assinado no teste: o `rfq` tem `open→awarded`;
-- a licitação tem `open→homologated`.
--
-- ⭐ O `bid.proposals` é a peça que a licitação tem e o `rfq` deixou FORA: no
-- `rfq` a coleta estruturada de preços por fornecedor foi declarada capacidade
-- futura; na compra PÚBLICA a proposta recebida é PARTE do rito. É um livro
-- IMUTÁVEL (o fato consumado do `occ`/`recv`): proposta registrada não se rasura
-- (corrigir é registrar outra). Só se recebe proposta na JANELA ABERTA do edital.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outro município/órgão de outro porte usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA título, edital e itens em TEXTO LIVRE (item + quantidade + unidade),
--      e a MODALIDADE em TEXTO LIVRE ("pregão eletrônico", "concorrência",
--      "dispensa"…). O que se licita e como se licita é vocabulário de cada
--      órgão e de cada versão da lei — enum envelheceria com a norma.
--   ❌ NÃO ENTRA catálogo/SKU/NCM, preço-alvo estruturado, julgamento automático
--      de propostas (ato de comissão, não de máquina).
--   ❌ NÃO ENTRA vínculo FK a `vendor` — o vencedor e o licitante são ID SOLTO +
--      nome carimbado (o padrão do `rfq`/`deal`): a licitação não conhece o
--      schema do fornecedor.
--   ⛔ NÃO ENTRA a PUBLICAÇÃO NO PNCP (Portal Nacional de Contratações Públicas):
--      é integração certificada com o Estado — o "NF-e da compra pública" — e
--      cai na Lei 3. Nenhuma linha deste arquivo fala com o PNCP.
-- =============================================================================

create schema if not exists bid;

comment on schema bid is
  'Módulo Licitações (Bid). Vertical government (🏛 Governo) da Taxonomia. A licitação nasce draft, PUBLICAR o edital (draft→open) CONGELA título/edital/modalidade e itens, recebe propostas dos licitantes (livro imutável), e o órgão HOMOLOGA um vencedor (homologated, id solto) ou CANCELA — os dois fins são terminais. O DIVERGE do rfq: lá o comprador premia (awarded); aqui o Estado homologa (homologated, Lei 14.133). PNCP FORA (Lei 3). Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — a única forma de o módulo falar com o mundo. É lei.
-- =============================================================================

create or replace function bid.emit_event(
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
  if p_event_type not like 'bid.%' then
    raise exception 'bid.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'bid',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function bid.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function bid.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'bid.tender.manage')
      or core.has_permission(p_tenant_id, 'bid.tender.homologate');
$$;

create or replace function bid.touch_updated_at()
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
-- 2. TENDERS — o cabeçalho da licitação, ancorado no EDITAL
-- =============================================================================

create table bid.tenders (
  id                       uuid        primary key default gen_random_uuid(),
  tenant_id                uuid        not null references core.tenants (id) on delete cascade,
  title                    text        not null check (length(btrim(title)) > 0),
  -- A descrição do edital — texto livre, opcional.
  description              text        not null default '',
  -- ⭐ A MODALIDADE em TEXTO LIVRE ("pregão eletrônico", "concorrência"…) — nunca
  -- enum: a lei muda e cada órgão nomeia à sua maneira.
  modality                 text        not null default '',
  status                   text        not null default 'draft'
                           check (status in ('draft', 'open', 'homologated', 'cancelled')),
  -- ⭐ O VENCEDOR HOMOLOGADO — ID SOLTO (sem FK): a licitação não conhece o
  -- schema do fornecedor. O nome é carimbado pela tela (o padrão do rfq/deal); o
  -- carimbo de quando/quem é do SERVIDOR (§3.1).
  homologated_bidder_id    uuid,
  homologated_bidder_name  text        not null default '',
  homologated_at           timestamptz,
  homologated_by           uuid        references auth.users (id) on delete set null,
  cancel_reason            text        not null default '',
  created_at               timestamptz not null default now(),
  created_by               uuid        references auth.users (id) on delete set null,
  updated_at               timestamptz not null default now(),
  constraint bid_tenders_id_tenant unique (id, tenant_id),
  -- ⭐ O estado e o carimbo da homologação contam a MESMA história, ou um mente:
  -- homologated ⇔ tem vencedor homologado E carimbo de quando. Fora de
  -- homologated, não há vencedor.
  constraint bid_tenders_homologation_coherent check (
    (status = 'homologated'
       and homologated_bidder_id is not null
       and homologated_at is not null)
    or
    (status <> 'homologated'
       and homologated_bidder_id is null
       and homologated_at is null)
  )
);

create index bid_tenders_open_idx
  on bid.tenders (tenant_id, created_at desc)
  where status in ('draft', 'open');

create trigger bid_tenders_touch
  before update on bid.tenders
  for each row execute function bid.touch_updated_at();

alter table bid.tenders enable row level security;
alter table bid.tenders force row level security;

create policy bid_tenders_select on bid.tenders
  for select to authenticated
  using (bid.can_access(tenant_id));

create policy bid_tenders_insert on bid.tenders
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'bid.tender.manage'));

-- ⚠️ USING = can_access (não homologate): assim quem só homologa ALCANÇA a linha
-- e bate no gatilho, que decide — em vez de a RLS filtrar e o UPDATE afetar 0
-- linhas em silêncio. A decisão de cada transição vive no gatilho (§3.1).
create policy bid_tenders_update on bid.tenders
  for update to authenticated
  using (bid.can_access(tenant_id))
  with check (bid.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Licitação decidida é história pública.

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre RASCUNHO, o autor carimbado pelo servidor
-- -----------------------------------------------------------------------------

create or replace function bid.guard_tender_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'draft' then
    raise exception 'a licitação nasce em rascunho — publicar o edital é decisão à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger bid_tenders_stamp
  before insert on bid.tenders
  for each row execute function bid.guard_tender_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/bid
-- -----------------------------------------------------------------------------
-- ⭐ draft→open (publicar), draft→cancelled, open→homologated, open→cancelled.
-- homologated e cancelled são TERMINAIS (a identidade do rfq/quote). O DIVERGE
-- do rfq: aqui o terminal é a HOMOLOGAÇÃO do órgão (homologated, Lei 14.133),
-- não o prêmio neutro do comprador (awarded).

create or replace function bid.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('draft', 'open'),
    ('draft', 'cancelled'),
    ('open',  'homologated'),
    ('open',  'cancelled')
  );
$$;

comment on function bid.allowed_transition(text, text) is
  'Ciclo de vida da licitação. Espelho de ALLOWED_TRANSITIONS em @alsham/bid — há teste que lê este arquivo e compara. homologated e cancelled são TERMINAIS: refazer é licitação nova. O DIVERGE do rfq: o terminal é a HOMOLOGAÇÃO do órgão (homologated, Lei 14.133), não o prêmio do comprador (awarded).';

-- O porteiro que lê bid.lines nasce DEPOIS da tabela de linhas (§3).

-- =============================================================================
-- 3. LINES — os itens licitados (texto livre, sem catálogo — molde do rfq)
-- =============================================================================

create table bid.lines (
  id          uuid           primary key default gen_random_uuid(),
  tenant_id   uuid           not null,
  tender_id   uuid           not null,
  line_no     integer        not null check (line_no > 0),
  item        text           not null check (length(btrim(item)) > 0),
  quantity    numeric(18, 4) not null check (quantity > 0),
  -- Unidade em TEXTO LIVRE ("kg", "t", "un", "m³") — opcional.
  unit        text           not null default '',
  created_at  timestamptz    not null default now(),
  constraint bid_lines_line unique (tender_id, line_no),
  constraint bid_lines_tender_fk
    foreign key (tender_id, tenant_id)
    references bid.tenders (id, tenant_id) on delete cascade
);

create index bid_lines_tender_idx on bid.lines (tender_id);

alter table bid.lines enable row level security;
alter table bid.lines force row level security;

create policy bid_lines_select on bid.lines
  for select to authenticated
  using (bid.can_access(tenant_id));

create policy bid_lines_insert on bid.lines
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'bid.tender.manage'));

create policy bid_lines_update on bid.lines
  for update to authenticated
  using (core.has_permission(tenant_id, 'bid.tender.manage'))
  with check (core.has_permission(tenant_id, 'bid.tender.manage'));

-- Linha sai SÓ do rascunho: o que foi publicado no edital não se apaga.
create policy bid_lines_delete on bid.lines
  for delete to authenticated
  using (
    core.has_permission(tenant_id, 'bid.tender.manage')
    and exists (
      select 1 from bid.tenders t
       where t.id = tender_id and t.tenant_id = tenant_id and t.status = 'draft'
    )
  );

-- ⭐ E a linha da licitação PUBLICADA não muda: mudar o item ou a quantidade
-- depois de o edital ir a mercado reescreveria o que foi licitado. O porteiro
-- recusa INSERT/UPDATE/DELETE fora do rascunho.
create or replace function bid.guard_line_frozen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status
    from bid.tenders
   where id = coalesce(new.tender_id, old.tender_id)
     and tenant_id = coalesce(new.tenant_id, old.tenant_id);

  if v_status is distinct from 'draft' then
    raise exception 'o edital já foi publicado (%): os itens não mudam mais — refazer é licitação nova', v_status
      using errcode = '22023';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger bid_lines_frozen
  before insert or update or delete on bid.lines
  for each row execute function bid.guard_line_frozen();

-- =============================================================================
-- 3.0 PROPOSALS — as propostas dos licitantes (livro IMUTÁVEL)
-- -----------------------------------------------------------------------------
-- ⭐ A peça que a licitação tem e o rfq deixou FORA. É um FATO CONSUMADO (a
-- física do occ/recv): a proposta recebida não se rasura — corrigir é registrar
-- outra. E só se recebe proposta na JANELA ABERTA do edital (status='open').
-- O licitante é ID SOLTO + nome carimbado; o valor em centavos (>= 0).
-- =============================================================================

create table bid.proposals (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null,
  tender_id     uuid        not null,
  -- O licitante — ID SOLTO (sem FK): opcional (pode não ter cadastro).
  bidder_id     uuid,
  bidder_name   text        not null check (length(btrim(bidder_name)) > 0),
  -- O valor proposto, em centavos (>= 0).
  amount_cents  bigint      not null check (amount_cents >= 0),
  currency      text        not null default 'BRL' check (length(btrim(currency)) > 0),
  note          text        not null default '',
  created_at    timestamptz not null default now(),
  created_by    uuid        references auth.users (id) on delete set null,
  constraint bid_proposals_tender_fk
    foreign key (tender_id, tenant_id)
    references bid.tenders (id, tenant_id) on delete cascade
);

create index bid_proposals_tender_idx on bid.proposals (tender_id);

alter table bid.proposals enable row level security;
alter table bid.proposals force row level security;

create policy bid_proposals_select on bid.proposals
  for select to authenticated
  using (bid.can_access(tenant_id));

create policy bid_proposals_insert on bid.proposals
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'bid.tender.manage'));

-- ⛔ Sem policy de UPDATE nem de DELETE: proposta recebida é fato consumado.

-- ⭐ O porteiro da proposta: só entra na JANELA ABERTA (status='open'), o autor
-- é carimbado pelo servidor, e — segunda camada — UPDATE/DELETE são recusados
-- até para o dono do banco (a imutabilidade do occ/recv).
create or replace function bid.guard_proposal_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if tg_op = 'INSERT' then
    select status into v_status
      from bid.tenders
     where id = new.tender_id and tenant_id = new.tenant_id;

    if v_status is distinct from 'open' then
      raise exception 'proposta só se recebe com o edital ABERTO (status atual: %)', coalesce(v_status, 'inexistente')
        using errcode = '22023';
    end if;

    new.created_by := (select auth.uid());
    return new;
  end if;

  -- UPDATE / DELETE: recusado sempre — proposta recebida não se rasura.
  raise exception 'a proposta é um fato consumado: não se edita nem se apaga — corrigir é registrar outra'
    using errcode = '22023';
end;
$$;

create trigger bid_proposals_guard
  before insert or update or delete on bid.proposals
  for each row execute function bid.guard_proposal_immutable();

-- =============================================================================
-- 3.1 O PORTEIRO DO ESTADO — e o carimbo da homologação (depois de bid.lines)
-- =============================================================================

create or replace function bid.guard_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not bid.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida da licitação: refazer é licitação nova',
      old.status, new.status
      using errcode = '22023';
  end if;

  -- Publicar o edital exige conteúdo: licitação sem item não vai a mercado.
  -- (manage basta — a policy de UPDATE já garante can_access; publicar é ato de
  -- quem gere.)
  if new.status = 'open' and old.status = 'draft' then
    if not core.has_permission(new.tenant_id, 'bid.tender.manage') then
      raise exception 'publicar o edital exige a permissão bid.tender.manage'
        using errcode = '42501';
    end if;
    if not exists (
      select 1 from bid.lines l
       where l.tender_id = new.id and l.tenant_id = new.tenant_id
    ) then
      raise exception 'publicar o edital exige ao menos um item'
        using errcode = '22023';
    end if;
  end if;

  -- ⭐ HOMOLOGAR é o ato de decisão do órgão: exige `homologate`, o licitante
  -- vencedor (id solto) NÃO pode ser nulo, e o carimbo de quem/quando é do
  -- SERVIDOR — a tela não escolhe autor nem hora.
  if new.status = 'homologated' then
    if not core.has_permission(new.tenant_id, 'bid.tender.homologate') then
      raise exception 'homologar um vencedor exige a permissão bid.tender.homologate'
        using errcode = '42501';
    end if;
    if new.homologated_bidder_id is null then
      raise exception 'homologar exige escolher o licitante vencedor (homologated_bidder_id)'
        using errcode = '22023';
    end if;
    new.homologated_at := now();
    new.homologated_by := (select auth.uid());
  end if;

  -- Cancelar (encerrar sem vencedor) exige razão — e é a ação de quem gere.
  if new.status = 'cancelled' then
    if not core.has_permission(new.tenant_id, 'bid.tender.manage') then
      raise exception 'cancelar a licitação exige a permissão bid.tender.manage'
        using errcode = '42501';
    end if;
    if length(btrim(new.cancel_reason)) = 0 then
      raise exception 'cancelar a licitação exige uma razão'
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

create trigger bid_tenders_guard_status
  before update of status on bid.tenders
  for each row execute function bid.guard_status_transition();

-- ⭐ E o conteúdo (título/edital/modalidade) CONGELA quando a licitação sai do
-- rascunho: só editável enquanto draft. O status muda por caminho próprio
-- (§3.1); aqui barra-se a mudança de identidade fora da mesa.
create or replace function bid.guard_content_frozen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'draft'
     and (new.title is distinct from old.title
          or new.description is distinct from old.description
          or new.modality is distinct from old.modality) then
    raise exception 'o edital já foi publicado (%): título, edital e modalidade não mudam mais', old.status
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger bid_tenders_content_frozen
  before update on bid.tenders
  for each row execute function bid.guard_content_frozen();

-- =============================================================================
-- 4. PAYLOAD + EVENTOS
-- -----------------------------------------------------------------------------
-- ⭐ O PAYLOAD É AUTOSSUFICIENTE — inclui os itens e o carimbo da homologação.
-- Quem escuta (um dia, um módulo de contratos) não faz join. ⛔ As propostas
-- NÃO entram no envelope: valor de licitante é dado sensível de disputa; quem
-- precisar delas consulta o módulo, não o correio.
-- =============================================================================

create or replace function bid.tender_payload(p_tender_id uuid, p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tender bid.tenders;
  v_lines  jsonb;
begin
  select * into v_tender
    from bid.tenders
   where id = p_tender_id and tenant_id = p_tenant_id;

  if not found then
    return '{}'::jsonb;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'lineNo',   l.line_no,
      'item',     l.item,
      'quantity', l.quantity,
      'unit',     l.unit
    ) order by l.line_no
  ), '[]'::jsonb)
    into v_lines
    from bid.lines l
   where l.tender_id = p_tender_id
     and l.tenant_id = p_tenant_id;

  return jsonb_build_object(
    'title',                  v_tender.title,
    'description',            v_tender.description,
    'modality',               v_tender.modality,
    'status',                 v_tender.status,
    'homologatedBidderId',    v_tender.homologated_bidder_id,
    'homologatedBidderName',  v_tender.homologated_bidder_name,
    'homologatedAt',          v_tender.homologated_at,
    'cancelReason',           v_tender.cancel_reason,
    'lines',                  v_lines
  );
end;
$$;

comment on function bid.tender_payload(uuid, uuid) is
  'Envelope AUTOSSUFICIENTE da licitação — inclui os itens e o carimbo da homologação. NÃO inclui as propostas (dado de disputa). Quem escuta não faz join.';

create or replace function bid.on_tender_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Itens ainda podem não existir no INSERT do cabeçalho; a publicação emite o
  -- payload completo depois.
  perform bid.emit_event(
    new.tenant_id,
    'bid.tender.registered',
    bid.tender_payload(new.id, new.tenant_id)
  );
  return new;
end;
$$;

create trigger bid_tenders_emit_registered
  after insert on bid.tenders
  for each row execute function bid.on_tender_registered();

-- Cada fim de linha tem fato próprio. Não há evento de edição de rascunho nem de
-- recebimento de proposta: só os quatro fatos declarados no manifesto (Lei 7 —
-- sem consumidor, sem excesso).
create or replace function bid.on_tender_changed()
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
                when 'open'         then 'bid.tender.opened'
                when 'homologated'  then 'bid.tender.homologated'
                when 'cancelled'    then 'bid.tender.cancelled'
                else null
              end;
    if v_type is not null then
      perform bid.emit_event(new.tenant_id, v_type, bid.tender_payload(new.id, new.tenant_id));
    end if;
  end if;

  return new;
end;
$$;

create trigger bid_tenders_emit_changed
  after update of status on bid.tenders
  for each row execute function bid.on_tender_changed();

-- =============================================================================
-- 5. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema bid                  from public, anon, authenticated;
revoke all on all tables    in schema bid from public, anon, authenticated;
revoke all on all functions in schema bid from public, anon, authenticated;

grant usage on schema bid to authenticated;

grant select, insert, update on bid.tenders to authenticated;
grant select, insert, update, delete on bid.lines to authenticated;
-- ⛔ proposals: só SELECT e INSERT — o livro é imutável (sem update/delete).
grant select, insert on bid.proposals to authenticated;

grant execute on function bid.can_access(uuid) to authenticated;

-- `bid.emit_event` NÃO é concedida: ninguém emite evento à mão.
-- `bid.tender_payload` NÃO é concedida: é encanamento dos gatilhos.
-- `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum enum de item nem de modalidade. Nenhum nome de
-- cliente. Nenhum objeto fora de `bid`. Nenhuma leitura de schema alheio.
-- Nenhuma fala com o PNCP (Lei 3). `consumes` VAZIO.
-- =============================================================================
