-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0106_ombuds.sql
-- Módulo 86: Ouvidoria. Schema `ombuds`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md, o segundo
-- módulo da Onda Governo (Fase 3). Nasce sob `vertical_key='government'`.
--
-- Taxonomia: Vertical 🏛 Governo — capacidade *Ouvidoria* (§6).
-- Spec: docs/canon/MODULO-OMBUDS-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ A FÍSICA CENTRAL — O ANONIMATO, REAPROVEITADO DO `whistle` DE PROPÓSITO
-- -----------------------------------------------------------------------------
-- A Ouvidoria (Lei 13.460) é o canal do CIDADÃO com o órgão PÚBLICO. A física
-- do anonimato é EXATAMENTE a do `whistle` (Módulo 77, Canal de Denúncias), e
-- reaproveitá-la é lícito — o precedente `spc → shift`/`fund`: duplicar física é
-- correto quando o ESCOPO diverge e cada decisão é RE-PERGUNTADA e reescrita.
--
-- ⭐⭐ SE A MANIFESTAÇÃO É ANÔNIMA, O SISTEMA NUNCA REGISTRA QUEM SE MANIFESTOU.
-- Não é "não mostra" — é NÃO GRAVA. O cidadão está autenticado (é um membro do
-- tenant), mas o gatilho DESCARTA `auth.uid()` quando `is_anonymous`, e a coluna
-- `reporter_id` fica NULL para sempre. Guardar quem se manifestou anonimamente e
-- só "esconder na tela" seria uma bomba: um vazamento, uma ordem judicial, um
-- servidor curioso — e a proteção que a lei (e a decência) exigem teria sido uma
-- mentira. A única forma de nunca vazar é NUNCA TER. Há teste que prova.
--
-- ⭐ O PROTOCOLO PÚBLICO é o carimbo do servidor que o cidadão anônimo cita para
-- ACOMPANHAR a manifestação — a identidade pública que substitui o `reporter_id`
-- que a lei do anonimato apagou. A consulta pública por protocolo é integração
-- FUTURA via API com chave (padrão `nps`/Forja) — ⛔ `anon` NÃO ganha grant aqui.
--
-- -----------------------------------------------------------------------------
-- ⭐ O DIVERGE DO `whistle` (RE-PERGUNTADO E ASSINADO)
-- -----------------------------------------------------------------------------
-- 1. ESCOPO: `whistle` é GRC — colaborador → má-conduta interna (comitê de
--    ética). `ombuds` é VERTICAL Governo — cidadão → órgão público (Lei 13.460,
--    a ouvidoria da Administração). A física é a mesma; o mundo é outro.
-- 2. TIPO DE MANIFESTAÇÃO: um CHECK das 5 naturezas clássicas da Lei 13.460
--    (reclamação/denúncia/sugestão/elogio/informação). É FÍSICA DO MÉTODO — a
--    lição do `nps` (0–10) e do `mnt` (corretiva/preventiva) —, NÃO vocabulário
--    de casa. O `whistle` não tem esse eixo; a Ouvidoria classifica por natureza.
-- 3. PROTOCOLO: o `whistle` não tem — o denunciante identificado reencontra a
--    própria pela RLS. A Ouvidoria precisa que o cidadão ANÔNIMO acompanhe, e
--    para o anônimo não há `reporter_id` a casar; logo, um protocolo público.
-- 4. NOMES DO CICLO ADAPTADOS: o `whistle` vai `open → under_review →
--    resolved/dismissed`. A Ouvidoria vai `received → under_review →
--    answered/dismissed` — a manifestação é RECEBIDA (protocolada) e RESPONDIDA
--    (Lei 13.460 fala em "resposta"). A forma da máquina é idêntica; os nomes
--    falam a língua do domínio. Adaptação consciente, não cópia cega.
--
-- ⭐ O relato CONGELA no registro (fato consumado); só o TRATAMENTO anda:
-- received → under_review → answered/dismissed, terminais, com resposta escrita.
--
-- ⛔ FORA: anexo/evidência (Storage do Core, não construído); notificação ao
-- cidadão (Engine de Notificações); consulta pública anônima por protocolo
-- (integração futura via API com chave — `anon` não encosta). `consumes` VAZIO.
-- =============================================================================

create schema if not exists ombuds;

comment on schema ombuds is
  'Módulo Ouvidoria (Lei 13.460). Vertical government da Taxonomia. A manifestação nasce imutável (a física do whistle/occ); o tratamento anda (received → under_review → answered/dismissed). ⭐⭐ ANONIMATO reaproveitado do whistle: se is_anonymous, o gatilho DESCARTA auth.uid() e reporter_id fica NULL para sempre — nunca se grava quem se manifestou. ⭐ Protocolo público carimbado pelo servidor para acompanhamento anônimo. Confidencialidade na RLS (só manifestation.handle lê tudo). Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA
-- =============================================================================

create or replace function ombuds.emit_event(
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
  if p_event_type not like 'ombuds.%' then
    raise exception 'ombuds.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'ombuds',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function ombuds.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

-- Quem TRATA (a ouvidoria): lê tudo, move o status, responde.
create or replace function ombuds.can_handle(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'ombuds.manifestation.handle');
$$;

create or replace function ombuds.touch_updated_at()
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
-- 2. MANIFESTATIONS — o livro de manifestações do cidadão
-- =============================================================================

create table ombuds.manifestations (
  id                 uuid        primary key default gen_random_uuid(),
  tenant_id          uuid        not null references core.tenants (id) on delete cascade,
  -- ⭐ O protocolo público — carimbo do servidor, a identidade que o cidadão
  -- anônimo cita para acompanhar. Nasce vazio; o gatilho preenche.
  protocol           text        not null default '',
  -- ⭐ A natureza da Lei 13.460 — FÍSICA DO MÉTODO (as 5 clássicas), não
  -- vocabulário de casa. É um CHECK, não texto livre, porque a Lei 13.460 define
  -- o rol; a lição é a do nps (0–10) e do mnt (corretiva/preventiva).
  manifestation_type text        not null
                     check (manifestation_type in
                       ('complaint', 'report', 'suggestion', 'compliment', 'information')),
  subject            text        not null check (length(btrim(subject)) > 0),
  description        text        not null check (length(btrim(description)) > 0),
  is_anonymous       boolean     not null default false,
  -- ⭐⭐ O cidadão — NULL para sempre quando anônimo (o gatilho descarta).
  reporter_id        uuid        references auth.users (id) on delete set null,
  status             text        not null default 'received'
                     check (status in ('received', 'under_review', 'answered', 'dismissed')),
  -- A resposta escrita — obrigatória ao encerrar (answered/dismissed).
  response           text        not null default '',
  answered_at        timestamptz,
  answered_by        uuid        references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint ombuds_manifestations_id_tenant unique (id, tenant_id),
  -- ⭐ O protocolo é único DENTRO do tenant (a identidade pública não colide).
  constraint ombuds_manifestations_protocol_tenant unique (tenant_id, protocol),
  -- ⭐⭐ A LEI DO ANONIMATO NA CONSTRAINT: anônima ⇒ sem cidadão. Além do
  -- gatilho, a própria tabela recusa uma manifestação anônima COM reporter.
  constraint ombuds_manifestations_anon_has_no_reporter check (
    not is_anonymous or reporter_id is null
  ),
  -- Encerrada (answered/dismissed) ⇒ tem resposta escrita e carimbo.
  constraint ombuds_manifestations_closure_coherent check (
    (status in ('answered', 'dismissed') and answered_at is not null and length(btrim(response)) > 0)
    or (status in ('received', 'under_review') and answered_at is null)
  )
);

create index ombuds_manifestations_queue_idx
  on ombuds.manifestations (tenant_id, status, created_at desc);

create trigger ombuds_manifestations_touch
  before update on ombuds.manifestations
  for each row execute function ombuds.touch_updated_at();

alter table ombuds.manifestations enable row level security;
alter table ombuds.manifestations force row level security;

-- ⭐ SELECT: a ouvidoria (handle) vê TUDO; o cidadão NÃO-anônimo vê a PRÓPRIA.
-- A anônima não casa com ninguém (reporter_id null) — nem o autor a reencontra
-- pela RLS; ele acompanha pelo protocolo público (integração futura via API).
create policy ombuds_manifestations_select on ombuds.manifestations
  for select to authenticated
  using (
    ombuds.can_handle(tenant_id)
    or reporter_id = (select auth.uid())
  );

-- ⭐ INSERT: qualquer um com submit pode se manifestar.
create policy ombuds_manifestations_insert on ombuds.manifestations
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'ombuds.manifestation.submit'));

-- ⭐ UPDATE: só a ouvidoria (handle) trata.
create policy ombuds_manifestations_update on ombuds.manifestations
  for update to authenticated
  using (ombuds.can_handle(tenant_id))
  with check (ombuds.can_handle(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Manifestação é registro eterno.

-- -----------------------------------------------------------------------------
-- 2.1 ⭐⭐ O NASCIMENTO: o anonimato DESCARTA a identidade, no servidor; e o
--     protocolo público é CARIMBADO pelo servidor (o valor do formulário morre).
-- -----------------------------------------------------------------------------

create or replace function ombuds.guard_manifestation_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'received' then
    raise exception 'a manifestação nasce recebida — tratar é decisão à parte'
      using errcode = '22023';
  end if;

  -- ⭐⭐ A LEI: anônima NÃO grava o cidadão (descarta auth.uid()); com
  -- identidade, o servidor carimba (o valor mentido no formulário é descartado).
  if new.is_anonymous then
    new.reporter_id := null;
  else
    new.reporter_id := (select auth.uid());
  end if;

  -- ⭐ O protocolo público é do SERVIDOR — o que veio no formulário é ignorado.
  -- Formato humano e único no tenant (a constraint confere): OUV-<ano>-<hex>.
  new.protocol := 'OUV-' || to_char(now(), 'YYYY') || '-'
                  || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  new.response := '';
  new.answered_at := null;
  new.answered_by := null;
  return new;
end;
$$;

create trigger ombuds_manifestations_stamp
  before insert on ombuds.manifestations
  for each row execute function ombuds.guard_manifestation_insert();

-- -----------------------------------------------------------------------------
-- 2.2 O relato CONGELA; só o tratamento anda
-- -----------------------------------------------------------------------------

create or replace function ombuds.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('received',     'under_review'),
    ('received',     'dismissed'),
    ('under_review', 'answered'),
    ('under_review', 'dismissed')
  );
$$;

comment on function ombuds.allowed_transition(text, text) is
  'Ciclo de vida da manifestação. Espelho de ALLOWED_TRANSITIONS em @alsham/ombuds. answered/dismissed são TERMINAIS, com resposta escrita obrigatória. Nomes adaptados do whistle (received/answered) para a língua da Lei 13.460.';

create or replace function ombuds.guard_manifestation_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- ⭐ A manifestação é fato consumado: nada do conteúdo muda depois de registrado.
  if new.subject is distinct from old.subject
     or new.description is distinct from old.description
     or new.manifestation_type is distinct from old.manifestation_type
     or new.is_anonymous is distinct from old.is_anonymous
     or new.reporter_id is distinct from old.reporter_id
     or new.protocol is distinct from old.protocol then
    raise exception 'a manifestação é fato consumado: o relato não se reescreve. O tratamento vai no status/resposta.'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if not ombuds.allowed_transition(old.status, new.status) then
      raise exception 'transição % → % não existe no ciclo da manifestação', old.status, new.status
        using errcode = '22023';
    end if;

    if not core.has_permission(new.tenant_id, 'ombuds.manifestation.handle') then
      raise exception 'tratar a manifestação exige a permissão ombuds.manifestation.handle'
        using errcode = '42501';
    end if;

    if new.status in ('answered', 'dismissed') then
      if length(btrim(new.response)) = 0 then
        raise exception 'encerrar a manifestação exige a resposta escrita'
          using errcode = '22023';
      end if;
      new.answered_at := now();
      new.answered_by := (select auth.uid());
    end if;
  end if;

  return new;
end;
$$;

create trigger ombuds_manifestations_guard_update
  before update on ombuds.manifestations
  for each row execute function ombuds.guard_manifestation_update();

-- =============================================================================
-- 3. PAYLOAD + EVENTOS
-- ⚠️ O relato e a identidade NUNCA passeiam no envelope — o fato carrega só o
-- que é seguro (tipo, status, se é anônima, o protocolo público), nunca o texto
-- da manifestação nem o cidadão.
-- =============================================================================

create or replace function ombuds.manifestation_payload(m ombuds.manifestations)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'manifestationId',   m.id,
    'protocol',          m.protocol,
    'manifestationType', m.manifestation_type,
    'isAnonymous',       m.is_anonymous,
    'status',            m.status
  );
$$;

comment on function ombuds.manifestation_payload(ombuds.manifestations) is
  'Envelope de uma manifestação — SÓ metadado seguro (tipo/status/anônima/protocolo público). NUNCA o relato (subject/description) nem o cidadão (reporter).';

create or replace function ombuds.on_manifestation_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform ombuds.emit_event(new.tenant_id, 'ombuds.manifestation.registered', ombuds.manifestation_payload(new));
  return new;
end;
$$;

create trigger ombuds_manifestations_emit_registered
  after insert on ombuds.manifestations
  for each row execute function ombuds.on_manifestation_registered();

create or replace function ombuds.on_manifestation_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform ombuds.emit_event(
      new.tenant_id,
      case new.status
        when 'under_review' then 'ombuds.manifestation.reviewed'
        when 'answered'     then 'ombuds.manifestation.answered'
        when 'dismissed'    then 'ombuds.manifestation.dismissed'
        else 'ombuds.manifestation.reviewed'
      end,
      ombuds.manifestation_payload(new)
    );
  end if;
  return new;
end;
$$;

create trigger ombuds_manifestations_emit_changed
  after update of status on ombuds.manifestations
  for each row execute function ombuds.on_manifestation_changed();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema ombuds                  from public, anon, authenticated;
revoke all on all tables    in schema ombuds from public, anon, authenticated;
revoke all on all functions in schema ombuds from public, anon, authenticated;

grant usage on schema ombuds to authenticated;

grant select, insert, update on ombuds.manifestations to authenticated;

grant execute on function ombuds.can_handle(uuid) to authenticated;

-- `ombuds.emit_event` e `ombuds.manifestation_payload` NÃO são concedidas.
-- ⛔ `anon` nada — a consulta pública por protocolo é integração futura via API.

-- =============================================================================
-- FIM. ⭐⭐ Anônima nunca grava o cidadão (gatilho + constraint). O protocolo
-- público é carimbado pelo servidor. O relato não passeia no envelope. Nenhum
-- objeto fora de `ombuds`. Nenhuma leitura de schema alheio. `consumes` VAZIO.
-- =============================================================================
