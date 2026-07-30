-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0039_comm.sql
-- Módulo 24: Comunicados. Schema `comm`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §19,
-- depois do `0038_goal.sql`.
--
-- Taxonomia: Domain 👥 RH — capacidade *Comunicados* (a leitura universal
-- da comunicação interna; o vertical Condomínios nomeia o recorte —
-- "Comunicados" na linha dele — como o spc fez com "Reserva de áreas
-- comuns"). O mural fala com MEMBROS do tenant: gente é ofício do RH.
-- Spec: docs/canon/MODULO-COMM-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ PUBLICAR CONGELA — a física do quote, re-perguntada para a PALAVRA DADA
-- -----------------------------------------------------------------------------
-- O rascunho edita-se à vontade (é plano). PUBLICAR é dar a palavra: o
-- título, o corpo e a audiência CONGELAM — comunicado editado depois de
-- lido é duas verdades com a mesma assinatura. Corrigir é PUBLICAR
-- COMUNICADO NOVO referenciando o antigo (`corrects_notice_id` + título
-- carimbado pelo SERVIDOR no ato — o padrão da correção do vis).
-- ARQUIVAR tira do mural, não da história: o texto e as ciências ficam.
-- E `archived` é TERMINAL: devolver ao mural faria ciências antigas
-- parecerem novas — o aviso que volta todo ano é comunicado novo, com
-- ciências novas.
--
-- -----------------------------------------------------------------------------
-- ⭐ A CIÊNCIA É ATO PRÓPRIO, ÚNICO E ETERNO
-- -----------------------------------------------------------------------------
-- Quem leu, leu: a ciência carimba QUEM (o gatilho FORÇA auth.uid() — não
-- se dá ciência POR outro, nem mandando outro user_id no INSERT) e QUANDO
-- (servidor). UNIQUE (comunicado, membro): ciência não se dá duas vezes.
-- Imutável em 3 camadas: não se retira — o que foi lido foi lido.
--
-- ⭐ RE-PERGUNTADO: comunicado ARQUIVADO aceita ciência? NÃO — a física do
-- spc (o espaço arquivado não recebe reserva nova): arquivado saiu do
-- mural, e a ciência tardia mentiria a COBERTURA — o número que diz quem
-- foi alcançado enquanto a palavra esteve de pé. Rascunho tampouco: o que
-- ainda não comunicou não se acusa de lido.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA audiência TEXTO LIVRE ("todos", "lojistas", "equipe de
--      limpeza") — quem ENTREGA ao destinatário é gente ou integração
--      futura; o módulo registra o ATO de comunicar, não o transporte.
--   ✅ ENTRA o corpo em texto — e PUBLICAR exige corpo (comunicado sem
--      corpo não comunica; o rascunho pode nascer só com o título).
--   ❌ NÃO ENTRA envio por e-mail/WhatsApp/push (integração declarada —
--      Lei 3), segmentação automática de audiência (seria ler memberships
--      com régua própria — capacidade futura), agendamento de publicação
--      (cron fingido — quem publica é gente), anexos (Storage do Core,
--      não construído).
-- =============================================================================

create schema if not exists comm;

comment on schema comm is
  'Módulo Comunicados. Domain hr da Taxonomia (comunicação interna — o mural fala com membros). Publicar congela a palavra dada; corrigir é comunicado novo referenciando o antigo; a ciência é ato próprio, único e eterno; arquivado é terminal e não aceita ciência. Não cria objeto em core nem lê schema alheio.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — vigésima quarta vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function comm.emit_event(
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
  if p_event_type not like 'comm.%' then
    raise exception 'comm.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'comm',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function comm.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function comm.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'comm.notice.manage')
      or core.has_permission(p_tenant_id, 'comm.notice.ack');
$$;

create or replace function comm.touch_updated_at()
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
-- 2. NOTICES — o mural
-- =============================================================================

create table comm.notices (
  id                 uuid        primary key default gen_random_uuid(),
  tenant_id          uuid        not null references core.tenants (id) on delete cascade,
  title              text        not null check (length(btrim(title)) > 0),
  body               text        not null default '',
  -- Para quem se fala — texto livre; a entrega é de gente.
  audience           text        not null check (length(btrim(audience)) > 0),
  status             text        not null default 'draft'
                     check (status in ('draft', 'published', 'archived')),
  -- ⭐ O ATO de publicar: quem e quando — do servidor.
  published_at       timestamptz,
  published_by       uuid        references auth.users (id) on delete set null,
  -- ⭐ Corrigir é comunicado NOVO referenciando o antigo — com o título
  -- carimbado pelo servidor no ato.
  corrects_notice_id uuid,
  corrects_title     text        not null default '',
  created_at         timestamptz not null default now(),
  created_by         uuid        references auth.users (id) on delete set null,
  updated_at         timestamptz not null default now(),
  constraint comm_notices_id_tenant unique (id, tenant_id),
  constraint comm_notices_corrects_fk
    foreign key (corrects_notice_id, tenant_id)
    references comm.notices (id, tenant_id) on delete restrict,
  -- Publicado (e arquivado) tem carimbo; rascunho não tem.
  constraint comm_notices_publish_coherent check (
    (status = 'draft' and published_at is null)
    or (status in ('published', 'archived') and published_at is not null)
  )
);

create index comm_notices_board_idx
  on comm.notices (tenant_id, status, published_at desc);

create trigger comm_notices_touch
  before update on comm.notices
  for each row execute function comm.touch_updated_at();

alter table comm.notices enable row level security;
alter table comm.notices force row level security;

create policy comm_notices_select on comm.notices
  for select to authenticated
  using (comm.can_access(tenant_id));

create policy comm_notices_insert on comm.notices
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'comm.notice.manage'));

create policy comm_notices_update on comm.notices
  for update to authenticated
  using (core.has_permission(tenant_id, 'comm.notice.manage'))
  with check (core.has_permission(tenant_id, 'comm.notice.manage'));

-- ⛔ Sem policy / grant de DELETE. O mural não apaga a própria história.

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: no rascunho — e a correção carimbada pelo servidor
-- -----------------------------------------------------------------------------

create or replace function comm.guard_notice_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
begin
  if new.status <> 'draft' then
    raise exception 'o comunicado nasce no rascunho — publicar é dar a palavra, e é decisão à parte'
      using errcode = '22023';
  end if;

  -- ⭐ O título do corrigido é carimbo do servidor — nunca do formulário.
  if new.corrects_notice_id is not null then
    select title into v_title
      from comm.notices
     where id = new.corrects_notice_id and tenant_id = new.tenant_id;
    new.corrects_title := coalesce(v_title, '');
  else
    new.corrects_title := '';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger comm_notices_stamp
  before insert on comm.notices
  for each row execute function comm.guard_notice_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/comms
-- -----------------------------------------------------------------------------

create or replace function comm.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('draft',     'published'),
    ('published', 'archived')
  );
$$;

comment on function comm.allowed_transition(text, text) is
  'Ciclo de vida do comunicado. Espelho de ALLOWED_TRANSITIONS em @alsham/comms. DOIS pares: publicar é dar a palavra (congela); arquivar tira do mural, não da história — e é TERMINAL: devolver ao mural faria ciências antigas parecerem novas. O aviso que volta é comunicado novo.';

create or replace function comm.guard_notice_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    -- ⭐ Publicado (e arquivado) CONGELA: a palavra dada não muda.
    if old.status <> 'draft'
       and (new.title is distinct from old.title
            or new.body is distinct from old.body
            or new.audience is distinct from old.audience
            or new.corrects_notice_id is distinct from old.corrects_notice_id
            or new.corrects_title is distinct from old.corrects_title) then
      raise exception 'a palavra dada não se edita: corrigir é publicar comunicado novo, apontando este'
        using errcode = '22023';
    end if;
    return new;
  end if;

  if not comm.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe: o arquivado é terminal — o aviso que volta é comunicado novo',
      old.status, new.status
      using errcode = '22023';
  end if;

  if new.status = 'published' then
    if length(btrim(new.body)) = 0 then
      raise exception 'comunicado sem corpo não comunica: escreva antes de dar a palavra'
        using errcode = '22023';
    end if;
    new.published_at := now();
    new.published_by := (select auth.uid());
  end if;

  return new;
end;
$$;

create trigger comm_notices_guard_status
  before update on comm.notices
  for each row execute function comm.guard_notice_transition();

-- =============================================================================
-- 3. ACKS — ⭐ a ciência: ato próprio, único e eterno
-- =============================================================================

create table comm.acks (
  id        uuid        primary key default gen_random_uuid(),
  tenant_id uuid        not null references core.tenants (id) on delete cascade,
  notice_id uuid        not null,
  user_id   uuid        not null,
  acked_at  timestamptz not null default now(),
  constraint comm_acks_notice_fk
    foreign key (notice_id, tenant_id)
    references comm.notices (id, tenant_id)
    on delete restrict,
  -- A ciência prende o membro à história: membro com ciências não se apaga.
  constraint comm_acks_member_fk
    foreign key (tenant_id, user_id)
    references core.memberships (tenant_id, user_id)
    on delete restrict,
  -- ⭐ Ciência não se dá duas vezes.
  constraint comm_acks_once unique (notice_id, user_id)
);

create index comm_acks_idx
  on comm.acks (tenant_id, notice_id);

alter table comm.acks enable row level security;
alter table comm.acks force row level security;

create policy comm_acks_select on comm.acks
  for select to authenticated
  using (comm.can_access(tenant_id));

create policy comm_acks_insert on comm.acks
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'comm.notice.ack'));

create or replace function comm.guard_ack_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status
    from comm.notices
   where id = new.notice_id and tenant_id = new.tenant_id;

  if v_status is null then
    raise exception 'o comunicado não existe neste tenant' using errcode = '22023';
  end if;

  -- ⭐ Só o que está NO MURAL recebe ciência (ver o cabeçalho).
  if v_status = 'draft' then
    raise exception 'o rascunho ainda não comunicou: não há o que acusar de lido'
      using errcode = '22023';
  end if;
  if v_status = 'archived' then
    raise exception 'fora do mural não há ciência nova: a cobertura conta quem leu enquanto a palavra esteve de pé'
      using errcode = '22023';
  end if;

  -- ⭐ A ciência é PRÓPRIA: o gatilho força quem assina — não se dá
  -- ciência por outro, nem mandando outro user_id no INSERT.
  new.user_id  := (select auth.uid());
  new.acked_at := now();

  return new;
end;
$$;

create trigger comm_acks_stamp
  before insert on comm.acks
  for each row execute function comm.guard_ack_insert();

create or replace function comm.guard_acks_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'a ciência é registro de fato consumado: o que foi lido foi lido — não se edita nem se retira.'
    using errcode = '42501';
end;
$$;

create trigger comm_acks_immutable
  before update or delete on comm.acks
  for each row execute function comm.guard_acks_immutable();

-- =============================================================================
-- 4. OS FATOS — o envelope leva o título e a audiência; o corpo mora no mural
-- =============================================================================

create or replace function comm.notice_payload(p comm.notices)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- ⚠️ SEM o corpo — de propósito: o envelope entrega o fato, não o mural
  -- inteiro (payload leve; quem quiser o texto lê no módulo, sob RLS).
  return jsonb_build_object(
    'noticeId',         p.id,
    'title',            p.title,
    'audience',         p.audience,
    'status',           p.status,
    'publishedAt',      p.published_at,
    'correctsNoticeId', p.corrects_notice_id,
    'correctsTitle',    p.corrects_title
  );
end;
$$;

comment on function comm.notice_payload(comm.notices) is
  'O envelope de um comunicado — AUTOSSUFICIENTE e SEM o corpo: o envelope entrega o fato, não o mural inteiro.';

create or replace function comm.on_notice_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform comm.emit_event(new.tenant_id, 'comm.notice.drafted', comm.notice_payload(new));
  return new;
end;
$$;

create trigger comm_notices_emit_created
  after insert on comm.notices
  for each row execute function comm.on_notice_created();

create or replace function comm.on_notice_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform comm.emit_event(
      new.tenant_id,
      case when new.status = 'published' then 'comm.notice.published'
           else 'comm.notice.archived' end,
      comm.notice_payload(new)
    );
  end if;
  return new;
end;
$$;

create trigger comm_notices_emit_changed
  after update on comm.notices
  for each row execute function comm.on_notice_changed();

create or replace function comm.on_ack_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
begin
  select title into v_title
    from comm.notices where id = new.notice_id and tenant_id = new.tenant_id;

  perform comm.emit_event(new.tenant_id, 'comm.notice.acked', jsonb_build_object(
    'noticeId',    new.notice_id,
    'noticeTitle', v_title,
    'memberId',    new.user_id,
    'ackedAt',     new.acked_at
  ));
  return new;
end;
$$;

create trigger comm_acks_emit
  after insert on comm.acks
  for each row execute function comm.on_ack_recorded();

-- =============================================================================
-- 5. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema comm                  from public, anon, authenticated;
revoke all on all tables    in schema comm from public, anon, authenticated;
revoke all on all functions in schema comm from public, anon, authenticated;

grant usage on schema comm to authenticated;

grant select, insert, update on comm.notices to authenticated;

-- ⭐ SÓ INSERT+SELECT: a ciência não se retira.
grant select, insert on comm.acks to authenticated;

grant execute on function comm.can_access(uuid) to authenticated;

-- `comm.emit_event` NÃO é concedida. `comm.notice_payload` é encanamento
-- dos gatilhos. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum envio. Nenhum agendamento. Nenhum anexo.
-- Nenhuma ciência por procuração. Nenhum objeto fora de `comm`. Nenhuma
-- leitura de schema alheio.
-- =============================================================================
