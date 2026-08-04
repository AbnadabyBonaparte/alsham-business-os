-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0109_accred.sql
-- Módulo 94: Credenciamento & Check-in. Schema `accred`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md,
-- depois do `0108_fisc.sql`. Onda Eventos — capacidades 2 (Credenciamento) e
-- 7 (Check-in) de 8 do Vertical 🎪 Eventos.
--
-- Taxonomia: Vertical 🎪 Eventos — capacidades *Credenciamento* e *Check-in*
-- (§6, "Ingressos · Credenciamento · Programação/line-up · Fornecedores de
-- evento · Patrocínios · Afiliados · Check-in · Pós-evento").
-- Spec: docs/canon/MODULO-ACCRED-SPEC.md
-- Decisões: docs/canon/ONDA-EVENTOS-DECISOES.md (capacidades #2 e #7)
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ UM SCHEMA, DUAS CAPACIDADES — o ciclo credencial → presença
-- -----------------------------------------------------------------------------
-- É a física do `train` (Módulo 35) re-perguntada para o portão de um evento:
-- lá o par é inscrição → presença; aqui é CREDENCIAL → CHECK-IN. Como o
-- `train` faz da inscrição um cadastro que vira presença carimbada, este
-- módulo faz da credencial um cadastro que vira check-in carimbado — e por
-- isso as duas capacidades cabem num schema só.
--
--   1. `accred.credentials` = a credencial emitida para um evento. Como o
--      roster do `train`/`fisc`: identidade em TEXTO LIVRE (nome do portador,
--      tipo de credencial — participante/imprensa/staff/palestrante —, nível
--      de acesso), ciclo `active ↔ revoked` (a credencial REVOGADA volta —
--      um crachá bloqueado por engano é o MESMO crachá reinstaurado; física
--      do `catalog`/`vendor`, com os nomes do domínio: `active`/`revoked`).
--
--   2. `accred.checkins` = a chegada. Como as `train.attendance`/`fisc.
--      inspections`/`vis`: a credencial é validada no portão e a presença é
--      ATO PONTUAL IMUTÁVEL, carimbado pelo SERVIDOR (`checked_in_at`=now(),
--      `checked_in_by`=auth.uid()). **NÃO TEM COLUNA DE STATUS**, não tem
--      ciclo de vida — o check-in ACONTECE e o registro nasce pronto, para
--      sempre. Depois de inserido, nem o dono do banco o reescreve (a física
--      do `vis`/`occ`) — corrigir é registrar OUTRO check-in apontando o dia.
--
-- -----------------------------------------------------------------------------
-- ⭐ O DIVERGE ASSINADO DO `train`: A CREDENCIAL VOLTA; A CHEGADA É TERMINAL
-- -----------------------------------------------------------------------------
-- No `train` a inscrição vai de `attended` a `completed` — a presença ganha
-- um terceiro estado (o aproveitamento). Aqui NÃO: o check-in é o EVENTO DE
-- PRESENÇA do `vis` — a passagem pelo portão, um fato sem sequência. Quem
-- volta amanhã faz OUTRO check-in; não existe "concluir o check-in". A
-- credencial, essa sim, tem ciclo — mas `active ↔ revoked`, não a máquina de
-- estados do evento.
--
-- ⚠️ CHECK-OUT FORA NESTA ONDA — e a ausência é decisão, não esquecimento.
-- O `vis` (portaria) modela entrada E saída porque a permanência importa (uma
-- pessoa dentro do prédio). No portão de um evento, a chegada é o fato que se
-- vende: a lotação, o comparecimento, o fluxo. A saída não tem valor próprio
-- aqui — e um par entrada/saída pediria carimbo, coerência de estado e uma
-- máquina que o ato pontual imutável não precisa. Um único check-in basta;
-- se um dia a saída importar (controle de reentrada), é OUTRO check-in.
--
-- -----------------------------------------------------------------------------
-- ⭐ O EVENTO É ID SOLTO — sem FK para o módulo `evt`
-- -----------------------------------------------------------------------------
-- `event_id` aponta o evento do módulo `evt` (Módulo 11) por ID SOLTO: sem FK
-- cruzada, sem ler o schema alheio (a Lei do Lego). O `evt` DE PROPÓSITO
-- rejeita credenciamento no schema dele (há teste no `evt` que o prova) — o
-- credenciamento é ofício do vertical, e mora aqui. A única FK é INTRA-schema
-- (check-in → credencial).
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outro evento de outro porte usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA tipo de credencial e nível de acesso TEXTO LIVRE — um congresso
--      acadêmico ("participante/palestrante/organização") e um festival
--      ("pista/camarote/backstage") desenham o próprio vocabulário sem uma
--      linha diferente.
--   ❌ NÃO ENTRA enum de tipo/nível, ingresso/pagamento (é Lei 3 +
--      canta-siriema, FORA), QR/crachá/impressão (integração), lista de
--      afiliados (canta-siriema), check-out/reentrada (declarado FORA).
--      `consumes` VAZIO (Lei 7).
-- =============================================================================

create schema if not exists accred;

comment on schema accred is
  'Módulo Credenciamento & Check-in — Vertical events da Taxonomia. Um schema, duas capacidades: a credencial emitida para um evento (id solto ao evt; tipo/nível texto livre; active ↔ revoked, a credencial volta) e o check-in — ato pontual imutável carimbado pelo servidor, validado contra a credencial ATIVA (a física do vis/train). Sem check-out nesta onda. Não cria objeto em core nem lê schema alheio.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — o cinto confere o prefixo `accred.%`. É lei.
-- =============================================================================

create or replace function accred.emit_event(
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
  if p_event_type not like 'accred.%' then
    raise exception 'accred.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'accred',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function accred.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function accred.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'accred.credential.manage')
      or core.has_permission(p_tenant_id, 'accred.checkin.record');
$$;

create or replace function accred.touch_updated_at()
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
-- 2. CREDENTIALS — a credencial emitida para um evento (o cadastro revogável)
-- -----------------------------------------------------------------------------
-- ⭐ `active ↔ revoked` — a credencial volta: um crachá revogado por engano é
-- o MESMO crachá reinstaurado (a física do catalog/vendor, com os nomes do
-- domínio). `event_id` é ID SOLTO ao evento do módulo evt.
-- =============================================================================

create table accred.credentials (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references core.tenants (id) on delete cascade,
  -- ⭐ ID SOLTO — o evento do módulo evt, sem FK cruzada nem leitura de schema.
  event_id        uuid        not null,
  -- ⭐ TEXTO LIVRE — o portador e o vocabulário de cada evento.
  holder_name     text        not null check (length(btrim(holder_name)) > 0),
  credential_type text        not null check (length(btrim(credential_type)) > 0),
  -- Nível de acesso OPCIONAL, texto livre ("pista", "backstage", "vip").
  access_level    text        not null default '',
  status          text        not null default 'active'
                  check (status in ('active', 'revoked')),
  created_at      timestamptz not null default now(),
  created_by      uuid        references auth.users (id) on delete set null,
  updated_at      timestamptz not null default now(),
  constraint accred_credentials_id_tenant unique (id, tenant_id)
);

create index accred_credentials_event_idx
  on accred.credentials (tenant_id, event_id, status, holder_name);

create trigger accred_credentials_touch
  before update on accred.credentials
  for each row execute function accred.touch_updated_at();

alter table accred.credentials enable row level security;
alter table accred.credentials force row level security;

create policy accred_credentials_select on accred.credentials
  for select to authenticated
  using (accred.can_access(tenant_id));

create policy accred_credentials_insert on accred.credentials
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'accred.credential.manage'));

-- ⚠️ USING = can_access (não credential.manage): assim quem só faz check-in
-- (só checkin.record) ALCANÇA a linha e bate no gatilho, que RECUSA com erro —
-- em vez de a RLS filtrar a linha e o UPDATE afetar 0 linhas EM SILÊNCIO. É o
-- padrão do fisc/sec (a decisão vive no gatilho, não na policy).
create policy accred_credentials_update on accred.credentials
  for update to authenticated
  using (accred.can_access(tenant_id))
  with check (accred.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Credencial revogada é arquivo, não apagada
-- — os check-ins dela contam a história e apontam a linha.

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre ATIVA
-- -----------------------------------------------------------------------------

create or replace function accred.guard_credential_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'active' then
    raise exception 'a credencial nasce ativa — revogar é decisão à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger accred_credentials_stamp
  before insert on accred.credentials
  for each row execute function accred.guard_credential_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/accred
-- -----------------------------------------------------------------------------
-- ⭐ active ↔ revoked — a credencial volta do bloqueio (a física do
-- catalog/vendor: a credencial é o crachá do portador; o mesmo crachá
-- reinstaurado é o mesmo crachá). O CHECK-IN (accred.checkins) não tem esta
-- função — não tem ciclo de vida nenhum.

create or replace function accred.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('active',  'revoked'),
    ('revoked', 'active')
  );
$$;

comment on function accred.allowed_transition(text, text) is
  'Ciclo de vida da CREDENCIAL. Espelho de ALLOWED_TRANSITIONS em @alsham/accred. active ↔ revoked: a credencial volta do bloqueio. O CHECK-IN (accred.checkins) não tem esta função — é ato pontual imutável, sem ciclo.';

create or replace function accred.guard_credential_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not accred.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida da credencial', old.status, new.status
      using errcode = '22023';
  end if;

  -- ⭐ Revogar/reativar uma credencial é ATO DO CADASTRO — exige
  -- accred.credential.manage (quem só faz check-in, com accred.checkin.record,
  -- não bloqueia nem libera crachá).
  if not core.has_permission(new.tenant_id, 'accred.credential.manage') then
    raise exception 'revogar ou reativar uma credencial exige a permissão accred.credential.manage'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger accred_credentials_guard_status
  before update of status on accred.credentials
  for each row execute function accred.guard_credential_transition();

-- -----------------------------------------------------------------------------
-- 2.3 OS FATOS — a credencial foi emitida
-- -----------------------------------------------------------------------------

create or replace function accred.credential_payload(c accred.credentials)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return jsonb_build_object(
    'credentialId',   c.id,
    'eventId',        c.event_id,
    'holderName',     c.holder_name,
    'credentialType', c.credential_type,
    'accessLevel',    c.access_level,
    'status',         c.status
  );
end;
$$;

comment on function accred.credential_payload(accred.credentials) is
  'O envelope de uma credencial — AUTOSSUFICIENTE, com o evento por id solto e o portador pelo nome. Quem escuta não faz join.';

create or replace function accred.on_credential_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform accred.emit_event(new.tenant_id, 'accred.credential.registered', accred.credential_payload(new));
  return new;
end;
$$;

create trigger accred_credentials_emit_registered
  after insert on accred.credentials
  for each row execute function accred.on_credential_registered();

-- =============================================================================
-- 3. CHECKINS — ⭐⭐ A CHEGADA: ATO PONTUAL, SEM CICLO, IMUTÁVEL DESDE O INSTANTE 1
-- -----------------------------------------------------------------------------
-- NENHUMA coluna de status. NENHUMA função allowed_transition. O registro
-- nasce pronto — e nunca mais muda. O cliente não tem NENHUMA porta de UPDATE
-- nem DELETE (nem policy, nem grant); e mesmo assim o gatilho abaixo recusa a
-- reescrita até para o dono do banco — a mesma física do vis/fisc/occ.
-- FK INTRA-schema: o check-in é de uma credencial DESTE módulo.
-- =============================================================================

create table accred.checkins (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references core.tenants (id) on delete cascade,
  credential_id  uuid        not null,
  -- ⭐ O carimbo do FATO — sempre do servidor, nunca do formulário.
  checked_in_at  timestamptz not null default now(),
  checked_in_by  uuid        references auth.users (id) on delete set null,
  note           text        not null default '',
  constraint accred_checkins_credential_fk
    foreign key (credential_id, tenant_id)
    references accred.credentials (id, tenant_id)
    on delete restrict
);

create index accred_checkins_book_idx
  on accred.checkins (tenant_id, credential_id, checked_in_at desc);

alter table accred.checkins enable row level security;
alter table accred.checkins force row level security;

create policy accred_checkins_select on accred.checkins
  for select to authenticated
  using (accred.can_access(tenant_id));

create policy accred_checkins_insert on accred.checkins
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'accred.checkin.record'));

-- ⛔ SEM policy de UPDATE e SEM policy de DELETE — o check-in registrado é fato
-- consumado; não existe porta para reescrevê-lo.

-- -----------------------------------------------------------------------------
-- 3.1 O portão: só credencial ATIVA passa; o carimbo é do servidor
-- -----------------------------------------------------------------------------

create or replace function accred.guard_checkin_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status
    from accred.credentials
   where id = new.credential_id and tenant_id = new.tenant_id;

  if v_status is distinct from 'active' then
    raise exception 'check-in só com credencial ATIVA (esta está %): validar a credencial no portão é o próprio ato', coalesce(v_status, 'inexistente')
      using errcode = '22023';
  end if;

  -- ⭐ O carimbo é do servidor — a hora e o autor que o cliente mandar são
  -- descartados (hora digitada é livro que mente).
  new.checked_in_at := now();
  new.checked_in_by := (select auth.uid());
  return new;
end;
$$;

create trigger accred_checkins_stamp
  before insert on accred.checkins
  for each row execute function accred.guard_checkin_insert();

-- -----------------------------------------------------------------------------
-- 3.2 ⭐⭐ IMUTÁVEL — nem o dono do banco reescreve o check-in registrado
-- -----------------------------------------------------------------------------

create or replace function accred.guard_checkin_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'o check-in é ato pontual consumado: não se edita nem se apaga. Registre outro check-in.'
    using errcode = '42501';
end;
$$;

create trigger accred_checkins_immutable
  before update or delete on accred.checkins
  for each row execute function accred.guard_checkin_immutable();

-- -----------------------------------------------------------------------------
-- 3.3 OS FATOS — o envelope leva a credencial pelo id e o portador pelo NOME
-- -----------------------------------------------------------------------------

create or replace function accred.checkin_payload(k accred.checkins)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_holder text;
  v_event  uuid;
begin
  select holder_name, event_id into v_holder, v_event
    from accred.credentials where id = k.credential_id;

  return jsonb_build_object(
    'checkinId',    k.id,
    'credentialId', k.credential_id,
    'eventId',      v_event,
    'holderName',   v_holder,
    'checkedInAt',  k.checked_in_at,
    'note',         k.note
  );
end;
$$;

comment on function accred.checkin_payload(accred.checkins) is
  'O envelope de um check-in — AUTOSSUFICIENTE, com a credencial pelo id, o evento por id solto e o portador pelo NOME. Quem escuta não faz join.';

create or replace function accred.on_checkin_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform accred.emit_event(new.tenant_id, 'accred.checkin.recorded', accred.checkin_payload(new));
  return new;
end;
$$;

create trigger accred_checkins_emit_recorded
  after insert on accred.checkins
  for each row execute function accred.on_checkin_recorded();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema accred                  from public, anon, authenticated;
revoke all on all tables    in schema accred from public, anon, authenticated;
revoke all on all functions in schema accred from public, anon, authenticated;

grant usage on schema accred to authenticated;

grant select, insert, update on accred.credentials to authenticated;

-- ⛔ SÓ SELECT e INSERT no check-in: reescrever não existe.
grant select, insert on accred.checkins to authenticated;

grant execute on function accred.can_access(uuid) to authenticated;

-- `accred.emit_event` NÃO é concedida. `accred.credential_payload` e
-- `accred.checkin_payload` são encanamento dos gatilhos. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum ingresso/pagamento (Lei 3 + canta-siriema, FORA). Nenhum enum de
-- tipo/nível. Nenhuma coluna de status no check-in. Nenhum check-out nesta
-- onda. Nenhum objeto fora de `accred`. Nenhuma leitura de schema alheio.
-- `consumes` VAZIO (Lei 7).
-- =============================================================================
