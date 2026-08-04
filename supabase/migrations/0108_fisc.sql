-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0108_fisc.sql
-- Módulo 85: Fiscalização. Schema `fisc`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §35,
-- depois do `0107_bid.sql`. Onda Governo — capacidade 8 de 8 do Vertical 🏛.
--
-- Taxonomia: Vertical 🏛 Governo — capacidade *Fiscalização* (§6).
-- Spec: docs/canon/MODULO-FISC-SPEC.md
-- Decisões: docs/canon/ONDA-GOVERNO-DECISOES.md (capacidade #8)
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ A DECISÃO DE DESENHO — e por que este módulo É a física do `sec`
-- -----------------------------------------------------------------------------
-- A fiscalização municipal trabalha AO CONTRÁRIO do `occ` (Ocorrências):
--
--   • O `occ` PRESSUPÕE que o alvo já existe em outro lugar (o ativo do `mnt`,
--     o tenant do `care`); ele NÃO carrega um cadastro de alvos próprio. A
--     ocorrência é um fato solto que se apura em cadeia.
--
--   • A fiscalização mantém um ROL de estabelecimentos/imóveis sob jurisdição
--     que precisam ser VISTORIADOS periodicamente. Isso é ROSTER + LIVRO DE
--     CAMPO — a física EXATA do `sec` (Segurança/Rondas): posto/alvo + livro
--     de ronda imutável, re-perguntada para a fiscalização pública.
--
-- Consequência direta na física — e é a mesma do `sec`:
--
--   1. `fisc.targets`     = o alvo fiscalizável. Como `sec.checkpoints`: nome
--      TEXTO LIVRE, ciclo `active ↔ archived` (o alvo é o ESTABELECIMENTO, e
--      um alvo reativado é o MESMO alvo — obrigá-lo a nascer de novo partiria
--      o histórico de vistorias em dois; física do `sec`/`mall`).
--
--   2. `fisc.inspections` = a vistoria. Como `sec.patrols`: **NÃO TEM COLUNA
--      DE STATUS**, não tem ciclo de vida, não tem função de transição — a
--      vistoria ACONTECE e o registro nasce pronto, para sempre. É ATO PONTUAL
--      IMUTÁVEL, carimbado pelo SERVIDOR (`inspected_at`=now(),
--      `inspected_by`=auth.uid()). Depois de inserida, nem o dono do banco a
--      reescreve (a mesma física do `occ`/`sec`) — corrigir é registrar outra
--      vistoria.
--
-- -----------------------------------------------------------------------------
-- ⛔ O AUTO DE INFRAÇÃO É FORA (Lei 3) — a vistoria só CONSTATA
-- -----------------------------------------------------------------------------
-- O auto de infração (a penalidade com força de lei: multa, prazo de defesa,
-- contraditório) é ato de império do Estado — integra-se, não se constrói
-- (o precedente NF-e/SPED/eSocial/TISS). Este módulo NÃO cria nenhuma tabela
-- de auto/multa/penalidade. A vistoria carrega só o `finding` (o que se
-- constatou, texto livre, pode ser vazio). Construir a penalidade aqui exporia
-- o cliente a autuação e roubaria a fronteira da Lei 3.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outro município/órgão de outro porte usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA o alvo TEXTO LIVRE (desenho do tenant) e o achado da vistoria
--      TEXTO LIVRE opcional ("dentro das normas", "alvará vencido").
--   ❌ NÃO ENTRA o auto de infração (Lei 3), enum de natureza do alvo/órgão
--      fiscalizador (texto livre, dado do tenant), o processo administrativo
--      que a autuação abre (é o `proc`, o protocolo público). `consumes` VAZIO
--      (Lei 7).
-- =============================================================================

create schema if not exists fisc;

comment on schema fisc is
  'Módulo Fiscalização — Vertical government da Taxonomia. É a física do sec (roster + livro imutável) aplicada à fiscalização municipal: o alvo fiscalizável (texto livre, volta do arquivo) e a vistoria — ato pontual imutável carimbado pelo servidor. A vistoria CONSTATA; o auto de infração é FORA (Lei 3). Não cria objeto em core nem lê schema alheio.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — o cinto confere o prefixo `fisc.%`. É lei.
-- =============================================================================

create or replace function fisc.emit_event(
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
  if p_event_type not like 'fisc.%' then
    raise exception 'fisc.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'fisc',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function fisc.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function fisc.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'fisc.target.manage')
      or core.has_permission(p_tenant_id, 'fisc.inspection.record');
$$;

create or replace function fisc.touch_updated_at()
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
-- 2. TARGETS — os alvos fiscalizáveis, o rol sob jurisdição (desenho do tenant)
-- =============================================================================

create table fisc.targets (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references core.tenants (id) on delete cascade,
  -- ⭐ TEXTO LIVRE — o vocabulário de cada órgão ("Padaria da Praça, Lote 12").
  name        text        not null check (length(btrim(name)) > 0),
  status      text        not null default 'active'
              check (status in ('active', 'archived')),
  created_at  timestamptz not null default now(),
  created_by  uuid        references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  constraint fisc_targets_id_tenant unique (id, tenant_id)
);

create index fisc_targets_roster_idx
  on fisc.targets (tenant_id, status, name);

create trigger fisc_targets_touch
  before update on fisc.targets
  for each row execute function fisc.touch_updated_at();

alter table fisc.targets enable row level security;
alter table fisc.targets force row level security;

create policy fisc_targets_select on fisc.targets
  for select to authenticated
  using (fisc.can_access(tenant_id));

create policy fisc_targets_insert on fisc.targets
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'fisc.target.manage'));

-- ⚠️ USING = can_access (não target.manage): assim quem só vistoria (só
-- inspection.record) ALCANÇA a linha e bate no gatilho, que RECUSA com erro —
-- em vez de a RLS filtrar a linha e o UPDATE afetar 0 linhas EM SILÊNCIO. É o
-- padrão do sec/mall (a decisão vive no gatilho, não na policy).
create policy fisc_targets_update on fisc.targets
  for update to authenticated
  using (fisc.can_access(tenant_id))
  with check (fisc.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. O alvo desativado é arquivo, não apagado.

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre ATIVO
-- -----------------------------------------------------------------------------

create or replace function fisc.guard_target_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'active' then
    raise exception 'o alvo fiscalizável nasce ativo — arquivar é decisão à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger fisc_targets_stamp
  before insert on fisc.targets
  for each row execute function fisc.guard_target_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de TARGET_TRANSITIONS em @alsham/fisc
-- -----------------------------------------------------------------------------
-- ⭐ active ↔ archived — o alvo volta do arquivo (física do sec/mall: o alvo é
-- o ESTABELECIMENTO, não a vistoria; o mesmo alvo reativado é o mesmo alvo).

create or replace function fisc.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('active',   'archived'),
    ('archived', 'active')
  );
$$;

comment on function fisc.allowed_transition(text, text) is
  'Ciclo de vida do ALVO (target). Espelho de TARGET_TRANSITIONS em @alsham/fisc. active ↔ archived: o alvo volta do arquivo. A VISTORIA (fisc.inspections) não tem esta função — não tem ciclo de vida nenhum.';

create or replace function fisc.guard_target_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not fisc.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida do alvo fiscalizável', old.status, new.status
      using errcode = '22023';
  end if;

  -- ⭐ Arquivar/reativar um alvo é DESENHO do rol — exige fisc.target.manage
  -- (quem só vistoria, com fisc.inspection.record, não mexe no cadastro).
  if not core.has_permission(new.tenant_id, 'fisc.target.manage') then
    raise exception 'arquivar ou reativar um alvo exige a permissão fisc.target.manage'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger fisc_targets_guard_status
  before update of status on fisc.targets
  for each row execute function fisc.guard_target_transition();

-- -----------------------------------------------------------------------------
-- 2.3 OS FATOS — o alvo entrou no rol
-- -----------------------------------------------------------------------------

create or replace function fisc.target_payload(t fisc.targets)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return jsonb_build_object(
    'targetId', t.id,
    'name',     t.name,
    'status',   t.status
  );
end;
$$;

comment on function fisc.target_payload(fisc.targets) is
  'O envelope de um alvo fiscalizável — leva o nome carimbado. Quem escuta não faz join.';

create or replace function fisc.on_target_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform fisc.emit_event(new.tenant_id, 'fisc.target.registered', fisc.target_payload(new));
  return new;
end;
$$;

create trigger fisc_targets_emit_registered
  after insert on fisc.targets
  for each row execute function fisc.on_target_registered();

-- =============================================================================
-- 3. INSPECTIONS — ⭐⭐ A VISTORIA: ATO PONTUAL, SEM CICLO, IMUTÁVEL DESDE O INSTANTE 1
-- -----------------------------------------------------------------------------
-- NENHUMA coluna de status. NENHUMA função allowed_transition. O registro
-- nasce pronto — e nunca mais muda. O cliente não tem NENHUMA porta de UPDATE
-- nem DELETE (nem policy, nem grant); e mesmo assim o gatilho abaixo recusa a
-- reescrita até para o dono do banco — a mesma física do sec/occ.
-- ⛔ Sem coluna de auto de infração/multa/penalidade — a vistoria só CONSTATA
-- (Lei 3). O `finding` é o que se constatou, texto livre, pode ser vazio.
-- =============================================================================

create table fisc.inspections (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references core.tenants (id) on delete cascade,
  target_id     uuid        not null,
  -- ⭐ O carimbo do FATO — sempre do servidor, nunca do formulário.
  inspected_at  timestamptz not null default now(),
  inspected_by  uuid        references auth.users (id) on delete set null,
  finding       text        not null default '',
  constraint fisc_inspections_target_fk
    foreign key (target_id, tenant_id)
    references fisc.targets (id, tenant_id)
    on delete restrict
);

create index fisc_inspections_book_idx
  on fisc.inspections (tenant_id, target_id, inspected_at desc);

alter table fisc.inspections enable row level security;
alter table fisc.inspections force row level security;

create policy fisc_inspections_select on fisc.inspections
  for select to authenticated
  using (fisc.can_access(tenant_id));

create policy fisc_inspections_insert on fisc.inspections
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'fisc.inspection.record'));

-- ⛔ SEM policy de UPDATE e SEM policy de DELETE — a vistoria registrada é fato
-- consumado; não existe porta para reescrevê-la.

-- -----------------------------------------------------------------------------
-- 3.1 O carimbo é do servidor — o que o cliente mandar de hora é descartado
-- -----------------------------------------------------------------------------

create or replace function fisc.guard_inspection_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.inspected_at := now();
  new.inspected_by := (select auth.uid());
  return new;
end;
$$;

create trigger fisc_inspections_stamp
  before insert on fisc.inspections
  for each row execute function fisc.guard_inspection_insert();

-- -----------------------------------------------------------------------------
-- 3.2 ⭐⭐ IMUTÁVEL — nem o dono do banco reescreve a vistoria registrada
-- -----------------------------------------------------------------------------

create or replace function fisc.guard_inspection_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'a vistoria é ato pontual consumado: não se edita nem se apaga. Registre outra vistoria.'
    using errcode = '42501';
end;
$$;

create trigger fisc_inspections_immutable
  before update or delete on fisc.inspections
  for each row execute function fisc.guard_inspection_immutable();

-- -----------------------------------------------------------------------------
-- 3.3 OS FATOS — o envelope leva o alvo pelo NOME carimbado
-- -----------------------------------------------------------------------------

create or replace function fisc.inspection_payload(i fisc.inspections)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_target_name text;
begin
  select name into v_target_name from fisc.targets where id = i.target_id;

  return jsonb_build_object(
    'inspectionId', i.id,
    'targetId',     i.target_id,
    'targetName',   v_target_name,
    'inspectedAt',  i.inspected_at,
    'finding',      i.finding
  );
end;
$$;

comment on function fisc.inspection_payload(fisc.inspections) is
  'O envelope de uma vistoria — AUTOSSUFICIENTE, com o alvo pelo NOME carimbado. Quem escuta não faz join.';

create or replace function fisc.on_inspection_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform fisc.emit_event(new.tenant_id, 'fisc.inspection.recorded', fisc.inspection_payload(new));
  return new;
end;
$$;

create trigger fisc_inspections_emit_recorded
  after insert on fisc.inspections
  for each row execute function fisc.on_inspection_recorded();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema fisc                  from public, anon, authenticated;
revoke all on all tables    in schema fisc from public, anon, authenticated;
revoke all on all functions in schema fisc from public, anon, authenticated;

grant usage on schema fisc to authenticated;

grant select, insert, update on fisc.targets to authenticated;

-- ⛔ SÓ SELECT e INSERT na vistoria: reescrever não existe.
grant select, insert on fisc.inspections to authenticated;

grant execute on function fisc.can_access(uuid) to authenticated;

-- `fisc.emit_event` NÃO é concedida. `fisc.target_payload` e
-- `fisc.inspection_payload` são encanamento do gatilho. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhuma tabela de auto de infração/penalidade (é integração, Lei 3).
-- Nenhum enum. Nenhuma coluna de status na vistoria. Nenhum objeto fora de
-- `fisc`. Nenhuma leitura de schema alheio. `consumes` VAZIO (Lei 7).
-- =============================================================================
