-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0040_edcal.sql
-- Módulo 25: Calendário Editorial. Schema `edcal`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §19,
-- depois do `0039_comm.sql`.
--
-- Taxonomia: Domain 📢 Marketing — capacidade *Calendário* (a linha do
-- Marketing na Taxonomia §5; este módulo é a leitura EDITORIAL dela: a
-- pauta que vira peça, a peça que vai ao ar). O `module_id` é `edcal`,
-- não `cal`: `cal` é abreviação ambígua demais (caloria, cálculo) e
-- "calendário" é prosa constante do canon — o nome da peça precisa ser
-- greppável com fronteira.
-- Spec: docs/canon/MODULO-EDCAL-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ O CANAL É TABELA DO TENANT — o anti-viés na veia (a lição do crm)
-- -----------------------------------------------------------------------------
-- Congelar o canal de um país e de uma década numa coluna faria o produto
-- envelhecer junto com ele: a rede da moda muda de nome mais rápido que
-- schema em produção. `edcal.channels` é DADO DO TENANT: nasce, arquiva,
-- VOLTA do arquivo (o argumento do crm/spc — o canal que volta é o MESMO
-- canal, e o histórico dele continua inteiro). Canal arquivado não recebe
-- pauta NOVA — as peças antigas ficam.
--
-- -----------------------------------------------------------------------------
-- ⭐ A LEI DAS ETAPAS — QUARTA APLICAÇÃO (ops, deal, dun — agora edcal)
-- -----------------------------------------------------------------------------
-- O fluxo editorial (pauta → redação → revisão → arte → fila) é DESENHO DO
-- TENANT: `edcal.stages`, jamais enum do produto. Movimento LIVRE entre as
-- etapas com TRILHA imutável — id solto + NOME CARIMBADO, a única coisa que
-- faz a história sobreviver ao redesenho (regra do ops, mantida).
-- ⭐ RE-PERGUNTADO do ops: `requires_approval` NÃO veio. Aprovação
-- multi-nível está FORA deste módulo por decisão de canon (ver spec §5) —
-- a única mão especial aqui é a de DECIDIR o fim (publicou / morreu).
-- Copiar a flag do ops "por consistência" seria o erro que o canon proíbe.
--
-- -----------------------------------------------------------------------------
-- ⭐ PUBLICADA/DESCARTADA É FÍSICA — À PARTE DO DESENHO
-- -----------------------------------------------------------------------------
-- As etapas são do tenant; o FIM é do produto: `published` e `dropped` são
-- física do domínio (CHECK argumentado — toda pauta do mundo ou vai ao ar
-- ou morre), não vocabulário de casa. REGISTRAR a publicação carimba a
-- DATA REAL (servidor) AO LADO da planejada — o módulo não publica nada
-- (Lei 3): registra o ATO, feito por gente. Descartar exige a razão.
-- Os dois fins são TERMINAIS: a pauta que revive é pauta nova.
--
-- -----------------------------------------------------------------------------
-- ⭐ A RE-PERGUNTA DO REAGENDAMENTO — decidida e escrita
-- -----------------------------------------------------------------------------
-- Reagendar ANTES de publicar é UPDATE honesto ou trilha? **UPDATE
-- HONESTO, sem trilha.** O calendário é PLANO, não fato: trilha de plano
-- viraria ruído que soterra a trilha dos FATOS (movimento, fim). A
-- honestidade mora no PAR de datas: ao publicar, a peça CONGELA com a
-- última `planned_on` E a `published_at` real — o desvio plano × fato fica
-- gravado para sempre, peça a peça. Quem quer a história do replanejamento
-- terá o Orçamento editorial no dia em que ele existir; hoje não se finge.
--
-- ⭐ E PUBLICADA CONGELA (título, canal, data planejada) — registro de
-- fato não se reescreve (a física do quote/comm, re-perguntada): corrigir
-- o plano é pauta nova.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA canal como TABELA do tenant; etapas como DESENHO do tenant;
--      pauta com título, texto de trabalho e data planejada.
--   ❌ NÃO ENTRA auto-publicação (Lei 3 — integração declarada), preview/
--      arquivo de arte (Storage do Core, não construído), aprovação
--      multi-nível (fora por decisão — ver spec §5), métricas de
--      engajamento (integração futura de leitura).
-- =============================================================================

create schema if not exists edcal;

comment on schema edcal is
  'Módulo Calendário Editorial. Domain marketing da Taxonomia (capacidade Calendário — a leitura editorial). Canal é tabela do tenant; o fluxo é desenho do tenant (Lei das Etapas, 4ª aplicação); published/dropped são física terminal com data real carimbada ao lado da planejada. Não cria objeto em core nem lê schema alheio.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — vigésima quinta vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function edcal.emit_event(
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
  if p_event_type not like 'edcal.%' then
    raise exception 'edcal.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'edcal',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function edcal.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function edcal.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'edcal.design.manage')
      or core.has_permission(p_tenant_id, 'edcal.piece.manage')
      or core.has_permission(p_tenant_id, 'edcal.piece.decide');
$$;

create or replace function edcal.touch_updated_at()
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
-- 2. CHANNELS — ⭐ o canal é DADO DO TENANT, e volta do arquivo
-- =============================================================================

create table edcal.channels (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references core.tenants (id) on delete cascade,
  name       text        not null check (length(btrim(name)) > 0),
  status     text        not null default 'active'
             check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  created_by uuid        references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint edcal_channels_id_tenant unique (id, tenant_id)
);

-- Dois canais ATIVOS com o mesmo nome confundiriam a pauta; o arquivo
-- pode guardar homônimos de eras diferentes.
create unique index edcal_channels_active_name
  on edcal.channels (tenant_id, lower(btrim(name)))
  where status = 'active';

create trigger edcal_channels_touch
  before update on edcal.channels
  for each row execute function edcal.touch_updated_at();

alter table edcal.channels enable row level security;
alter table edcal.channels force row level security;

create policy edcal_channels_select on edcal.channels
  for select to authenticated
  using (edcal.can_access(tenant_id));

create policy edcal_channels_insert on edcal.channels
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'edcal.design.manage'));

create policy edcal_channels_update on edcal.channels
  for update to authenticated
  using (core.has_permission(tenant_id, 'edcal.design.manage'))
  with check (core.has_permission(tenant_id, 'edcal.design.manage'));

-- ⛔ Sem DELETE: canal com história não se apaga — arquiva-se. E o canal
-- que volta é o MESMO canal (active ↔ archived, o argumento do crm).

-- =============================================================================
-- 3. STAGES — ⭐ a Lei das Etapas: o fluxo editorial é DESENHO DO TENANT
-- =============================================================================

create table edcal.stages (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references core.tenants (id) on delete cascade,
  name       text        not null check (length(btrim(name)) > 0),
  position   integer     not null check (position >= 0),
  created_at timestamptz not null default now(),
  constraint edcal_stages_id_tenant unique (id, tenant_id),
  constraint edcal_stages_position_unique unique (tenant_id, position)
);

alter table edcal.stages enable row level security;
alter table edcal.stages force row level security;

create policy edcal_stages_select on edcal.stages
  for select to authenticated
  using (edcal.can_access(tenant_id));

create policy edcal_stages_write on edcal.stages
  for all to authenticated
  using (core.has_permission(tenant_id, 'edcal.design.manage'))
  with check (core.has_permission(tenant_id, 'edcal.design.manage'));

-- ⚠️ Etapa TEM porta de DELETE (a única do schema): o desenho é do tenant,
-- e redesenhar inclui apagar. O contrapeso é a FK `restrict` das peças
-- vivas — etapa com pauta parada nela não sai — e a trilha, que carimba o
-- NOME e sobrevive ao redesenho (regra do ops/deal, mantida).

-- =============================================================================
-- 4. PIECES — a pauta no calendário
-- =============================================================================

create table edcal.pieces (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    uuid        not null references core.tenants (id) on delete cascade,
  title        text        not null check (length(btrim(title)) > 0),
  -- O texto de trabalho da pauta — e ele NÃO passeia no envelope.
  brief        text        not null default '',
  channel_id   uuid        not null,
  current_stage_id uuid,
  -- ⭐ O PAR das datas: a planejada é PLANO (muda livre até publicar);
  -- a real é carimbo do servidor no ato de registrar. O desvio entre as
  -- duas é a honestidade do calendário, peça a peça.
  planned_on   date        not null,
  status       text        not null default 'planned'
               check (status in ('planned', 'published', 'dropped')),
  published_at timestamptz,
  published_by uuid        references auth.users (id) on delete set null,
  drop_reason  text        not null default '',
  created_at   timestamptz not null default now(),
  created_by   uuid        references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now(),
  constraint edcal_pieces_id_tenant unique (id, tenant_id),
  constraint edcal_pieces_channel_fk
    foreign key (channel_id, tenant_id)
    references edcal.channels (id, tenant_id)
    on delete restrict,
  -- ⚠️ `restrict`: a etapa onde há pauta parada não se apaga — o
  -- contrapeso da porta de DELETE das etapas, como no ops e no deal.
  constraint edcal_pieces_stage_fk
    foreign key (current_stage_id, tenant_id)
    references edcal.stages (id, tenant_id)
    on delete restrict,
  -- Planejada está numa etapa; o fim saiu do fluxo (a etapa do fim vive
  -- na trilha, pelo nome carimbado).
  constraint edcal_pieces_stage_coherent check (
    (status = 'planned' and current_stage_id is not null) or
    (status in ('published', 'dropped'))
  ),
  -- Publicada tem a data real; as demais não.
  constraint edcal_pieces_published_coherent check (
    (status = 'published' and published_at is not null) or
    (status in ('planned', 'dropped') and published_at is null)
  )
);

create index edcal_pieces_calendar_idx
  on edcal.pieces (tenant_id, planned_on, status);
create index edcal_pieces_board_idx
  on edcal.pieces (tenant_id, current_stage_id)
  where status = 'planned';

create trigger edcal_pieces_touch
  before update on edcal.pieces
  for each row execute function edcal.touch_updated_at();

alter table edcal.pieces enable row level security;
alter table edcal.pieces force row level security;

create policy edcal_pieces_select on edcal.pieces
  for select to authenticated
  using (edcal.can_access(tenant_id));

create policy edcal_pieces_insert on edcal.pieces
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'edcal.piece.manage'));

create policy edcal_pieces_update on edcal.pieces
  for update to authenticated
  using (
    core.has_permission(tenant_id, 'edcal.piece.manage')
    or core.has_permission(tenant_id, 'edcal.piece.decide')
  )
  with check (
    core.has_permission(tenant_id, 'edcal.piece.manage')
    or core.has_permission(tenant_id, 'edcal.piece.decide')
  );

-- ⛔ Sem policy de DELETE. Pauta que morreu é aula registrada (dropped).

-- -----------------------------------------------------------------------------
-- 4.1 O nascimento: planejada, num canal VIVO, numa etapa do tenant
-- -----------------------------------------------------------------------------

create or replace function edcal.guard_piece_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_channel edcal.channels;
begin
  if new.status <> 'planned' then
    raise exception 'a pauta nasce planejada: o fim — publicada ou descartada — é ATO registrado depois'
      using errcode = '22023';
  end if;

  select * into v_channel
    from edcal.channels
   where id = new.channel_id and tenant_id = new.tenant_id;

  -- (a FK composta já garante que existe; aqui é a VIDA que se confere)
  if v_channel.status = 'archived' then
    raise exception 'canal arquivado não recebe pauta nova: devolva-o ao ativo ou escolha outro'
      using errcode = '22023';
  end if;

  new.published_at := null;
  new.published_by := null;
  new.drop_reason  := '';
  new.created_by   := (select auth.uid());
  return new;
end;
$$;

create trigger edcal_pieces_stamp
  before insert on edcal.pieces
  for each row execute function edcal.guard_piece_insert();

-- -----------------------------------------------------------------------------
-- 4.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/editorial
-- -----------------------------------------------------------------------------

create or replace function edcal.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('planned', 'published'),
    ('planned', 'dropped')
  );
$$;

comment on function edcal.allowed_transition(text, text) is
  'Ciclo de vida da pauta. Espelho de ALLOWED_TRANSITIONS em @alsham/editorial. DOIS pares e DOIS fins TERMINAIS: toda pauta ou vai ao ar (published) ou morre (dropped) — e a pauta que revive é pauta nova. As ETAPAS do meio são desenho do tenant e vivem fora deste ciclo.';

create or replace function edcal.guard_piece_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    -- ⭐ O fim CONGELA: registro de fato não se reescreve. (Enquanto
    -- planejada, TUDO é plano — inclusive a data, que muda sem trilha:
    -- ver o cabeçalho.)
    if old.status <> 'planned'
       and (new.title is distinct from old.title
            or new.brief is distinct from old.brief
            or new.channel_id is distinct from old.channel_id
            or new.current_stage_id is distinct from old.current_stage_id
            or new.planned_on is distinct from old.planned_on
            or new.drop_reason is distinct from old.drop_reason
            or new.published_at is distinct from old.published_at) then
      raise exception 'o fim da pauta é registro de fato: não se reescreve — corrigir o plano é pauta nova'
        using errcode = '22023';
    end if;
    return new;
  end if;

  if not edcal.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe: o fim da pauta é terminal — a pauta que revive é pauta nova',
      old.status, new.status
      using errcode = '22023';
  end if;

  if not core.has_permission(new.tenant_id, 'edcal.piece.decide') then
    raise exception 'registrar o fim da pauta é decisão: exige a permissão edcal.piece.decide'
      using errcode = '42501';
  end if;

  if new.status = 'published' then
    -- ⭐ A DATA REAL é do servidor — ao lado da planejada, para sempre.
    new.published_at := now();
    new.published_by := (select auth.uid());
  end if;

  if new.status = 'dropped' then
    if length(btrim(new.drop_reason)) = 0 then
      raise exception 'descartar exige a razão: a pauta que morre ensina a que nasce'
        using errcode = '22023';
    end if;
    new.drop_reason := btrim(new.drop_reason);
  end if;

  -- O fim sai do fluxo; a etapa do fim fica na TRILHA, pelo nome.
  new.current_stage_id := null;

  return new;
end;
$$;

create trigger edcal_pieces_guard_update
  before update on edcal.pieces
  for each row execute function edcal.guard_piece_update();

-- =============================================================================
-- 5. PIECE_EVENTS — ⭐ a trilha dos FATOS, e ela é imutável (três camadas)
-- -----------------------------------------------------------------------------
-- `from_stage_id`/`to_stage_id` SOLTOS + NOME CARIMBADO: a etapa é dado
-- vivo do tenant — renomeia, reordena, some — e a trilha de 2026 tem de
-- ser legível em 2028 com o vocabulário de 2026. Regra do ops, mantida.
-- ⭐ E REAGENDAR NÃO ESCREVE AQUI — a trilha é dos fatos, não dos planos.
-- =============================================================================

create table edcal.piece_events (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references core.tenants (id) on delete cascade,
  piece_id        uuid        not null,
  kind            text        not null check (kind in ('planned', 'moved', 'published', 'dropped')),
  from_stage_id   uuid,
  from_stage_name text,
  to_stage_id     uuid,
  to_stage_name   text,
  note            text        not null default '',
  occurred_at     timestamptz not null default now(),
  actor_user_id   uuid        references auth.users (id) on delete set null,
  constraint edcal_piece_events_fk
    foreign key (piece_id, tenant_id)
    references edcal.pieces (id, tenant_id)
    on delete restrict
);

create index edcal_piece_events_timeline_idx
  on edcal.piece_events (tenant_id, piece_id, occurred_at desc);

alter table edcal.piece_events enable row level security;
alter table edcal.piece_events force row level security;

create policy edcal_piece_events_select on edcal.piece_events
  for select to authenticated
  using (edcal.can_access(tenant_id));

-- ⚠️ Sem policy de INSERT: quem escreve são a função de mover e os
-- gatilhos — trilha que a aplicação escreve direto é trilha que a
-- aplicação pode escrever errado.

create or replace function edcal.guard_trail_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'a trilha da pauta é registro de fato consumado: não se edita nem se apaga. Registre outro movimento.'
    using errcode = '42501';
end;
$$;

create trigger edcal_piece_events_immutable
  before update or delete on edcal.piece_events
  for each row execute function edcal.guard_trail_immutable();

-- =============================================================================
-- 6. OS ATOS E OS FATOS
-- =============================================================================

create or replace function edcal.piece_payload(p edcal.pieces)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  -- ⚠️ SEM o texto de trabalho — de propósito: o envelope entrega o fato
  -- (o quê, onde, quando planejado, quando de verdade), não a redação.
  select jsonb_build_object(
    'pieceId',     p.id,
    'title',       p.title,
    'status',      p.status,
    'channelId',   p.channel_id,
    'channelName', (select c.name from edcal.channels c where c.id = p.channel_id),
    'stageId',     p.current_stage_id,
    'stageName',   (select s.name from edcal.stages s where s.id = p.current_stage_id),
    'plannedOn',   p.planned_on,
    'publishedAt', p.published_at,
    'dropReason',  p.drop_reason
  );
$$;

comment on function edcal.piece_payload(edcal.pieces) is
  'O envelope de uma pauta — AUTOSSUFICIENTE: canal e etapa pelo NOME; o par plannedOn × publishedAt é a honestidade do calendário. Sem o texto de trabalho.';

-- ⭐ MOVER — livre entre as etapas do tenant, sempre com linha na trilha.
create or replace function edcal.move_piece(
  p_piece_id    uuid,
  p_to_stage_id uuid,
  p_note        text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_piece    edcal.pieces;
  v_de       edcal.stages;
  v_para     edcal.stages;
  v_event_id uuid;
begin
  select * into v_piece from edcal.pieces where id = p_piece_id;
  if v_piece.id is null then
    raise exception 'pauta não encontrada' using errcode = 'P0002';
  end if;

  if not edcal.can_access(v_piece.tenant_id) then
    raise exception 'sem acesso a este tenant' using errcode = '42501';
  end if;

  if not core.has_permission(v_piece.tenant_id, 'edcal.piece.manage') then
    raise exception 'mover a pauta exige a permissão edcal.piece.manage'
      using errcode = '42501';
  end if;

  if v_piece.status <> 'planned' then
    raise exception 'pauta com fim registrado não se move: o fluxo acabou'
      using errcode = '22023';
  end if;

  select * into v_para
    from edcal.stages
   where id = p_to_stage_id and tenant_id = v_piece.tenant_id;

  if v_para.id is null then
    raise exception 'a etapa de destino não pertence ao fluxo deste tenant'
      using errcode = '22023';
  end if;

  if v_para.id = v_piece.current_stage_id then
    raise exception 'a pauta já está nesta etapa' using errcode = '22023';
  end if;

  select * into v_de from edcal.stages where id = v_piece.current_stage_id;

  insert into edcal.piece_events (
    tenant_id, piece_id, kind,
    from_stage_id, from_stage_name, to_stage_id, to_stage_name,
    note, actor_user_id
  ) values (
    v_piece.tenant_id, v_piece.id, 'moved',
    v_de.id, v_de.name, v_para.id, v_para.name,
    coalesce(p_note, ''), (select auth.uid())
  )
  returning id into v_event_id;

  update edcal.pieces
     set current_stage_id = v_para.id
   where id = v_piece.id;

  return v_event_id;
end;
$$;

comment on function edcal.move_piece(uuid, uuid, text) is
  'Move a pauta para QUALQUER etapa do fluxo do tenant — o movimento é livre; a trilha é obrigatória.';

-- ⭐ O FIM — publicou (registro do ato, com a data real) ou morreu (com razão).
create or replace function edcal.close_piece(
  p_piece_id uuid,
  p_outcome  text,
  p_reason   text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_piece    edcal.pieces;
  v_stage    edcal.stages;
  v_event_id uuid;
begin
  if p_outcome not in ('published', 'dropped') then
    raise exception 'fim % não existe: a pauta ou vai ao ar ou morre', p_outcome
      using errcode = '22023';
  end if;

  select * into v_piece from edcal.pieces where id = p_piece_id;
  if v_piece.id is null then
    raise exception 'pauta não encontrada' using errcode = 'P0002';
  end if;

  if not edcal.can_access(v_piece.tenant_id) then
    raise exception 'sem acesso a este tenant' using errcode = '42501';
  end if;

  -- O nome da etapa se lê ANTES do update — depois dele a pauta já saiu
  -- do fluxo e o carimbo se perderia.
  select * into v_stage from edcal.stages where id = v_piece.current_stage_id;

  -- O UPDATE vem PRIMEIRO (e passa pelo porteiro de §4.2, que confere a
  -- permissão, a transição e a razão): a trilha nasce depois, para o fato
  -- emitido por ela sair com o fim JÁ GRAVADO.
  update edcal.pieces
     set status = p_outcome,
         drop_reason = case when p_outcome = 'dropped'
                            then btrim(coalesce(p_reason, '')) else '' end
   where id = v_piece.id;

  insert into edcal.piece_events (
    tenant_id, piece_id, kind,
    from_stage_id, from_stage_name, note, actor_user_id
  ) values (
    v_piece.tenant_id, v_piece.id, p_outcome,
    v_stage.id, v_stage.name, btrim(coalesce(p_reason, '')), (select auth.uid())
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

comment on function edcal.close_piece(uuid, text, text) is
  'Registra o fim: published (o ATO de ter ido ao ar — a data real é do servidor) ou dropped (com a razão). Terminal — a pauta que revive é pauta nova.';

-- 6.1 `edcal.piece.planned` — nasce com a primeira linha da trilha.
create or replace function edcal.on_piece_planned()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage_name text;
begin
  select name into v_stage_name
    from edcal.stages where id = new.current_stage_id;

  insert into edcal.piece_events (
    tenant_id, piece_id, kind, to_stage_id, to_stage_name, note, actor_user_id
  ) values (
    new.tenant_id, new.id, 'planned', new.current_stage_id, v_stage_name, '', (select auth.uid())
  );

  perform edcal.emit_event(new.tenant_id, 'edcal.piece.planned', edcal.piece_payload(new));
  return new;
end;
$$;

create trigger edcal_pieces_emit_planned
  after insert on edcal.pieces
  for each row execute function edcal.on_piece_planned();

-- 6.2 Os fatos de movimento e fim — emitidos a partir da TRILHA, com o
-- estado da pauta JÁ GRAVADO (o insert na trilha vem depois do update).
create or replace function edcal.on_trail_written()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_piece edcal.pieces;
begin
  if new.kind = 'planned' then
    return new;   -- o nascimento tem fato próprio (6.1).
  end if;

  select * into v_piece from edcal.pieces where id = new.piece_id;

  perform edcal.emit_event(
    new.tenant_id,
    case new.kind
      when 'moved'     then 'edcal.piece.moved'
      when 'published' then 'edcal.piece.published'
      else                  'edcal.piece.dropped'
    end,
    edcal.piece_payload(v_piece) || jsonb_build_object(
      'fromStageName', coalesce(new.from_stage_name, ''),
      'toStageName',   coalesce(new.to_stage_name, ''),
      'note',          new.note
    )
  );

  return new;
end;
$$;

create trigger edcal_piece_events_emit
  after insert on edcal.piece_events
  for each row execute function edcal.on_trail_written();

-- =============================================================================
-- 7. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema edcal                  from public, anon, authenticated;
revoke all on all tables    in schema edcal from public, anon, authenticated;
revoke all on all functions in schema edcal from public, anon, authenticated;

grant usage on schema edcal to authenticated;

grant select, insert, update on edcal.channels to authenticated;

-- ⚠️ A ÚNICA porta de DELETE do schema: o desenho do fluxo é do tenant
-- (contrapeso: FK restrict das peças + trilha com nome carimbado).
grant select, insert, update, delete on edcal.stages to authenticated;

grant select, insert, update on edcal.pieces to authenticated;

-- A trilha só se lê: quem a escreve são a função de mover e os gatilhos.
grant select on edcal.piece_events to authenticated;

grant execute on function edcal.can_access(uuid)              to authenticated;
grant execute on function edcal.move_piece(uuid, uuid, text)  to authenticated;
grant execute on function edcal.close_piece(uuid, text, text) to authenticated;

-- `edcal.emit_event` NÃO é concedida. `edcal.piece_payload` é encanamento.
-- `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhuma auto-publicação. Nenhum arquivo de arte.
-- Nenhuma aprovação multi-nível. Nenhuma métrica de engajamento. Nenhum
-- objeto fora de `edcal`. Nenhuma leitura de schema alheio.
-- =============================================================================
