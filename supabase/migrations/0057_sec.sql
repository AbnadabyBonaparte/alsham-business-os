-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0057_sec.sql
-- Módulo 42: Segurança — Rondas. Schema `sec`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §22,
-- depois do `0056` (se houver) ou do `0053_mall.sql`. ⭐⭐ A ÚLTIMA PEÇA da
-- campanha das 6 Ondas — 42/42.
--
-- Taxonomia: Vertical 🛍 Shopping Centers — capacidade *Segurança* (§6).
-- Spec: docs/canon/MODULO-SEC-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ A DECISÃO DE DESENHO — e por que este módulo NÃO reescreve o `occ`
-- -----------------------------------------------------------------------------
-- Um shopping tem DOIS fatos de segurança, e são coisas diferentes:
--
--   1. O INCIDENTE — o furto, a briga, o princípio de incêndio. Isso JÁ É
--      uma Ocorrência (`occ`, Módulo 16, que já existe): fato consumado que
--      nasce imutável, com gravidade dada pelo tenant e encerramento com
--      desfecho escrito. Recriar essa tabela aqui seria a Lei do
--      Reaproveitamento quebrada duas vezes — uma vez pela duplicação, outra
--      pela física reinventada pior.
--
--   2. A RONDA — o vigia passou pelo posto às 14h32. Isso é OUTRA coisa: não
--      é um fato que se apura, é um CHECKPOINT de rotina. Não tem gravidade,
--      não tem desfecho, não tem ciclo de vida — é um CARIMBO PONTUAL. É
--      *isso*, e só isso, que este módulo constrói.
--
-- ⭐ Consequência direta na física: `sec.patrols` **NÃO TEM COLUNA DE
-- STATUS**. Não existe "ronda aberta" nem "ronda em andamento" — a ronda
-- ACONTECE e o registro nasce pronto, para sempre. Enquanto o `occ` tem
-- ciclo (`open → closed`, com desfecho), a ronda não tem ciclo NENHUM: é
-- ato pontual, imutável desde o primeiro instante. Há teste de pacote que
-- lê as duas migrations e EXIGE o contraste: o `occ` com lifecycle, o `sec`
-- sem — quem "uniformizar" qualquer lado reprova.
--
-- -----------------------------------------------------------------------------
-- ⭐ O POSTO (checkpoint) TEM ciclo — `active ↔ archived`, física do `mall`/`spc`
-- -----------------------------------------------------------------------------
-- O POSTO DE VERIFICAÇÃO é desenho do tenant (texto livre — "portaria sul",
-- "doca de carga", "estacionamento G2"): volta do arquivo, porque um posto
-- desativado por reforma que reabre é o MESMO posto — obrigá-lo a nascer de
-- novo partiria o histórico de rondas em dois. A física de quem tem ciclo é
-- do POSTO (o lugar), nunca da RONDA (o ato).
--
-- -----------------------------------------------------------------------------
-- ⭐ A RONDA É CARIMBADA PELO SERVIDOR
-- -----------------------------------------------------------------------------
-- `passed_at` e `passed_by` são sempre `now()`/`auth.uid()` no INSERT — a
-- hora que o cliente mandar é descartada (hora digitada é livro que mente,
-- a mesma lição do `vis`). Depois de inserida, a ronda é IMUTÁVEL: nem o
-- dono do banco a reescreve (a mesma física do `occ`/`crm`) — corrigir é
-- registrar outra ronda.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA o posto TEXTO LIVRE (desenho do tenant) e a nota da ronda TEXTO
--      LIVRE opcional ("tudo normal", "portão B travado").
--   ❌ NÃO ENTRA o incidente (é `occ`, que já existe — Sol Único), integração
--      com câmera/alarme/QR/catraca (declarado FORA), escala do vigia (é o
--      `shift`, que já existe), credenciamento de prestador (vertical à
--      parte). `consumes` VAZIO (Lei 7).
-- =============================================================================

create schema if not exists sec;

comment on schema sec is
  'Módulo Segurança — Rondas. Vertical shopping-centers da Taxonomia. NÃO reescreve o occ: incidente já é Ocorrência. Este módulo é só a ronda — o percurso verificado, ato pontual imutável, sem ciclo de vida. O posto (checkpoint) tem ciclo active ↔ archived (física do mall/spc); a ronda não tem ciclo nenhum. Não cria objeto em core nem lê schema alheio.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — quadragésima segunda vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function sec.emit_event(
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
  if p_event_type not like 'sec.%' then
    raise exception 'sec.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'sec',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function sec.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function sec.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'sec.checkpoint.manage')
      or core.has_permission(p_tenant_id, 'sec.patrol.record');
$$;

create or replace function sec.touch_updated_at()
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
-- 2. CHECKPOINTS — os postos de verificação, desenho do tenant
-- =============================================================================

create table sec.checkpoints (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references core.tenants (id) on delete cascade,
  -- ⭐ TEXTO LIVRE — o vocabulário de cada praça ("portaria sul", "doca 3").
  name        text        not null check (length(btrim(name)) > 0),
  status      text        not null default 'active'
              check (status in ('active', 'archived')),
  created_at  timestamptz not null default now(),
  created_by  uuid        references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  constraint sec_checkpoints_id_tenant unique (id, tenant_id)
);

create index sec_checkpoints_map_idx
  on sec.checkpoints (tenant_id, status, name);

create trigger sec_checkpoints_touch
  before update on sec.checkpoints
  for each row execute function sec.touch_updated_at();

alter table sec.checkpoints enable row level security;
alter table sec.checkpoints force row level security;

create policy sec_checkpoints_select on sec.checkpoints
  for select to authenticated
  using (sec.can_access(tenant_id));

create policy sec_checkpoints_insert on sec.checkpoints
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'sec.checkpoint.manage'));

-- ⚠️ USING = can_access (não checkpoint.manage): assim o Beta (só patrol.record)
-- ALCANÇA a linha e bate no gatilho, que RECUSA com erro — em vez de a RLS
-- filtrar a linha e o UPDATE afetar 0 linhas EM SILÊNCIO. É o padrão do mall
-- (a decisão vive no gatilho, não na policy).
create policy sec_checkpoints_update on sec.checkpoints
  for update to authenticated
  using (sec.can_access(tenant_id))
  with check (sec.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. O posto desativado é arquivo, não apagado.

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre ATIVO
-- -----------------------------------------------------------------------------

create or replace function sec.guard_checkpoint_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'active' then
    raise exception 'o posto de verificação nasce ativo — arquivar é decisão à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger sec_checkpoints_stamp
  before insert on sec.checkpoints
  for each row execute function sec.guard_checkpoint_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de CHECKPOINT_TRANSITIONS em @alsham/sec
-- -----------------------------------------------------------------------------
-- ⭐ active ↔ archived — o posto volta do arquivo (física do mall/spc: um
-- posto é o LUGAR, não o fato; o mesmo posto reaberto é o mesmo posto).

create or replace function sec.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('active',   'archived'),
    ('archived', 'active')
  );
$$;

comment on function sec.allowed_transition(text, text) is
  'Ciclo de vida do POSTO (checkpoint). Espelho de CHECKPOINT_TRANSITIONS em @alsham/sec. active ↔ archived: o posto volta do arquivo. A RONDA (sec.patrols) não tem esta função — não tem ciclo de vida nenhum.';

create or replace function sec.guard_checkpoint_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not sec.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida do posto de verificação', old.status, new.status
      using errcode = '22023';
  end if;

  -- ⭐ Arquivar/reabrir um posto é DESENHO — exige sec.checkpoint.manage
  -- (quem só ronda, com sec.patrol.record, não redesenha o mapa do mall).
  if not core.has_permission(new.tenant_id, 'sec.checkpoint.manage') then
    raise exception 'arquivar ou reabrir um posto exige a permissão sec.checkpoint.manage'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger sec_checkpoints_guard_status
  before update of status on sec.checkpoints
  for each row execute function sec.guard_checkpoint_transition();

-- =============================================================================
-- 3. PATROLS — ⭐⭐ A RONDA: ATO PONTUAL, SEM CICLO, IMUTÁVEL DESDE O INSTANTE 1
-- -----------------------------------------------------------------------------
-- NENHUMA coluna de status. NENHUMA função allowed_transition. O registro
-- nasce pronto — e nunca mais muda. O cliente não tem NENHUMA porta de
-- UPDATE nem DELETE (nem policy, nem grant); e mesmo assim o gatilho abaixo
-- recusa a reescrita até para o dono do banco — a mesma física do occ.
-- =============================================================================

create table sec.patrols (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references core.tenants (id) on delete cascade,
  checkpoint_id uuid        not null,
  -- ⭐ O carimbo do FATO — sempre do servidor, nunca do formulário.
  passed_at     timestamptz not null default now(),
  passed_by     uuid        references auth.users (id) on delete set null,
  note          text        not null default '',
  constraint sec_patrols_checkpoint_fk
    foreign key (checkpoint_id, tenant_id)
    references sec.checkpoints (id, tenant_id)
    on delete restrict
);

create index sec_patrols_book_idx
  on sec.patrols (tenant_id, checkpoint_id, passed_at desc);

alter table sec.patrols enable row level security;
alter table sec.patrols force row level security;

create policy sec_patrols_select on sec.patrols
  for select to authenticated
  using (sec.can_access(tenant_id));

create policy sec_patrols_insert on sec.patrols
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'sec.patrol.record'));

-- ⛔ SEM policy de UPDATE e SEM policy de DELETE — a ronda registrada é fato
-- consumado; não existe porta para reescrevê-la.

-- -----------------------------------------------------------------------------
-- 3.1 O carimbo é do servidor — o que o cliente mandar de hora é descartado
-- -----------------------------------------------------------------------------

create or replace function sec.guard_patrol_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.passed_at := now();
  new.passed_by := (select auth.uid());
  return new;
end;
$$;

create trigger sec_patrols_stamp
  before insert on sec.patrols
  for each row execute function sec.guard_patrol_insert();

-- -----------------------------------------------------------------------------
-- 3.2 ⭐⭐ IMUTÁVEL — nem o dono do banco reescreve a ronda registrada
-- -----------------------------------------------------------------------------

create or replace function sec.guard_patrol_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'a ronda é ato pontual consumado: não se edita nem se apaga. Registre outra passagem.'
    using errcode = '42501';
end;
$$;

create trigger sec_patrols_immutable
  before update or delete on sec.patrols
  for each row execute function sec.guard_patrol_immutable();

-- =============================================================================
-- 4. OS FATOS — o envelope leva o posto pelo NOME carimbado
-- =============================================================================

create or replace function sec.patrol_payload(p sec.patrols)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_checkpoint_name text;
begin
  select name into v_checkpoint_name from sec.checkpoints where id = p.checkpoint_id;

  return jsonb_build_object(
    'patrolId',       p.id,
    'checkpointId',   p.checkpoint_id,
    'checkpointName', v_checkpoint_name,
    'passedAt',       p.passed_at,
    'note',           p.note
  );
end;
$$;

comment on function sec.patrol_payload(sec.patrols) is
  'O envelope de uma ronda — AUTOSSUFICIENTE, com o posto pelo NOME carimbado. Quem escuta não faz join.';

create or replace function sec.on_patrol_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform sec.emit_event(new.tenant_id, 'sec.patrol.recorded', sec.patrol_payload(new));
  return new;
end;
$$;

create trigger sec_patrols_emit_recorded
  after insert on sec.patrols
  for each row execute function sec.on_patrol_recorded();

-- =============================================================================
-- 5. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema sec                  from public, anon, authenticated;
revoke all on all tables    in schema sec from public, anon, authenticated;
revoke all on all functions in schema sec from public, anon, authenticated;

grant usage on schema sec to authenticated;

grant select, insert, update on sec.checkpoints to authenticated;

-- ⛔ SÓ SELECT e INSERT na ronda: reescrever não existe.
grant select, insert on sec.patrols to authenticated;

grant execute on function sec.can_access(uuid) to authenticated;

-- `sec.emit_event` NÃO é concedida. `sec.patrol_payload` é encanamento do
-- gatilho. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhuma tabela de incidente (é occ, Sol Único). Nenhum enum. Nenhuma
-- coluna de status na ronda. Nenhum objeto fora de `sec`. Nenhuma leitura de
-- schema alheio. `consumes` VAZIO (Lei 7). ⭐⭐ 42/42 — a campanha das 6
-- Ondas está completa.
-- =============================================================================
