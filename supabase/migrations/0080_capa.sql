-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0080_capa.sql
-- Módulo 65: Ações Corretivas e Preventivas (CAPA). Schema `capa`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §27, o
-- TERCEIRO módulo da Onda Quatorze (Fase 2). Domain 🧪 Qualidade.
-- Nasce sob `domain_key='quality'`.
--
-- Taxonomia: Domain 🧪 Qualidade — capacidade *CAPA* (§5).
-- Spec: docs/canon/MODULO-CAPA-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ A FÍSICA — o que faz a CAPA NÃO ser um `sched.milestone` genérico
-- -----------------------------------------------------------------------------
-- CAPA = Corrective And Preventive Action. Uma ação que se PLANEJA, se EXECUTA
-- e — o que a define — se VERIFICA: alguém confirma que a ação funcionou. Um
-- marco de cronograma (`sched`) só é "feito"; uma ação corretiva só está fechada
-- quando FOI VERIFICADA que resolveu.
--
-- ⭐ O TIPO é CHECK, não texto do tenant: `corrective` × `preventive` é a FÍSICA
-- do MÉTODO CAPA (a norma o define), não vocabulário de uma casa — a lição do
-- `mnt` (corretiva/preventiva) e do `nps` (0-10). Corretiva nasce de um desvio
-- já ocorrido; preventiva evita um que ainda não ocorreu.
--
-- ⭐ O CICLO É `open → verified → closed`, e ESCOLHI as TRÊS etapas (não o
-- `open → closed` direto), e escrevo por quê: **sem passar por `verified`, não
-- fecha.** É exatamente a VERIFICAÇÃO — a nota de quem confirmou que a ação
-- pegou — que separa este módulo de um marco genérico. Permitir fechar direto
-- reduziria a CAPA a um "feito" sem prova, que é o que a norma proíbe. Os três
-- fins: `verified` e `closed` são carimbados pelo servidor; `closed` é TERMINAL
-- (a física do proj). Não há "reabrir" — uma ação que volta é ação nova.
--
-- ⭐ O plano é EDITÁVEL enquanto `open` (ajustar responsável/prazo é rotina);
-- ao ser VERIFICADO, congela — a partir dali só o fechamento. A verificação
-- carimba QUEM verificou pelo servidor (o digitado é descartado).
--
-- ANTI-VIÉS: descrição/responsável TEXTO LIVRE; prazo é data. Vínculo OPCIONAL
-- ao `nc` (Módulo 63) por ID SOLTO — a ação pode nascer de uma NC (corretiva),
-- ou ser preventiva sem NC nenhuma. ❌ NÃO ENTRA: eficácia medida por indicador
-- (é o `goal`), anexo de evidência (Storage do Core, NÃO CONSTRUÍDA), workflow
-- de aprovação multinível (é configuração do tenant). `consumes` VAZIO.
-- =============================================================================

create schema if not exists capa;

comment on schema capa is
  'Módulo Ações Corretivas e Preventivas (CAPA). Domain quality da Taxonomia. O tipo corrective/preventive é CHECK (física do método). O ciclo open → verified → closed: a VERIFICAÇÃO (quem confirmou que a ação funcionou) é o que a separa de um marco genérico — sem verified, não fecha. closed terminal. Vínculo ao nc por id solto. Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — sexagésima quinta vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function capa.emit_event(
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
  if p_event_type not like 'capa.%' then
    raise exception 'capa.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'capa',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function capa.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function capa.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'capa.action.manage')
      or core.has_permission(p_tenant_id, 'capa.action.decide');
$$;

create or replace function capa.touch_updated_at()
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
-- 2. ACTIONS — a ação corretiva/preventiva
-- =============================================================================

create table capa.actions (
  id                uuid        primary key default gen_random_uuid(),
  tenant_id         uuid        not null references core.tenants (id) on delete cascade,
  -- ⭐ CHECK, não texto: a física do método CAPA.
  action_type       text        not null check (action_type in ('corrective', 'preventive')),
  description       text        not null check (length(btrim(description)) > 0),
  responsible       text        not null check (length(btrim(responsible)) > 0),
  due_date          date,
  -- ⭐ Vínculo OPCIONAL ao nc (Módulo 63) por ID SOLTO — sem FK cross-schema.
  nc_entry_id       uuid,
  status            text        not null default 'open'
                    check (status in ('open', 'verified', 'closed')),
  -- ⭐ A VERIFICAÇÃO: a nota de quem confirmou que a ação funcionou, e o carimbo.
  verification_note text        not null default '',
  verified_at       timestamptz,
  verified_by       uuid        references auth.users (id) on delete set null,
  closed_at         timestamptz,
  closed_by         uuid        references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  created_by        uuid        references auth.users (id) on delete set null,
  updated_at        timestamptz not null default now(),
  constraint capa_actions_id_tenant unique (id, tenant_id),
  -- Verificada/fechada tem carimbo de verificação E nota; aberta não tem nenhum.
  constraint capa_actions_verified_coherent check (
    (status in ('verified', 'closed') and verified_at is not null and length(btrim(verification_note)) > 0)
    or (status = 'open' and verified_at is null)
  ),
  constraint capa_actions_closed_coherent check (
    (status = 'closed' and closed_at is not null)
    or (status <> 'closed' and closed_at is null)
  )
);

create index capa_actions_board_idx
  on capa.actions (tenant_id, status, due_date);

create trigger capa_actions_touch
  before update on capa.actions
  for each row execute function capa.touch_updated_at();

alter table capa.actions enable row level security;
alter table capa.actions force row level security;

create policy capa_actions_select on capa.actions
  for select to authenticated
  using (capa.can_access(tenant_id));

create policy capa_actions_insert on capa.actions
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'capa.action.manage'));

create policy capa_actions_update on capa.actions
  for update to authenticated
  using (capa.can_access(tenant_id))
  with check (capa.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE: a ação é história (fechar é status terminal).

create or replace function capa.guard_action_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'open' then
    raise exception 'a ação nasce aberta — verificar e fechar são atos à parte'
      using errcode = '22023';
  end if;
  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger capa_actions_stamp
  before insert on capa.actions
  for each row execute function capa.guard_action_insert();

-- -----------------------------------------------------------------------------
-- 2.1 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/capa
-- -----------------------------------------------------------------------------
-- ⭐ open → verified → closed. Sem open → closed direto: sem verificação, não
-- fecha (é o que faz a CAPA não ser um marco genérico).

create or replace function capa.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('open',     'verified'),
    ('verified', 'closed')
  );
$$;

comment on function capa.allowed_transition(text, text) is
  'Ciclo de vida da ação. Espelho de ALLOWED_TRANSITIONS em @alsham/capa. open → verified → closed: SEM verified, não fecha — a verificação é o que separa a CAPA de um marco genérico. closed terminal.';

-- O gatilho da vida da ação: o plano edita-se enquanto open; ao verificar,
-- congela; verificar exige a nota E carimba QUEM (o servidor decide, não a tela).
create or replace function capa.guard_action_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'closed' then
    raise exception 'ação fechada é terminal: nada nela se edita. Uma ação que volta é ação nova.'
      using errcode = '42501';
  end if;

  -- Transição de status
  if new.status is distinct from old.status then
    if not capa.allowed_transition(old.status, new.status) then
      raise exception 'transição % → % não existe no ciclo de vida da ação', old.status, new.status
        using errcode = '22023';
    end if;

    if not core.has_permission(new.tenant_id, 'capa.action.decide') then
      raise exception 'verificar ou fechar uma ação exige a permissão capa.action.decide'
        using errcode = '42501';
    end if;

    -- Numa transição, o conteúdo do plano NÃO muda junto: só o ato.
    if new.action_type  is distinct from old.action_type
       or new.description is distinct from old.description
       or new.responsible is distinct from old.responsible
       or new.due_date    is distinct from old.due_date
       or new.nc_entry_id is distinct from old.nc_entry_id then
      raise exception 'a transição de status não edita o plano — faça uma coisa de cada vez'
        using errcode = '22023';
    end if;

    if new.status = 'verified' then
      if new.verification_note is null or length(btrim(new.verification_note)) = 0 then
        raise exception 'verificar exige a nota: quem confirmou que a ação funcionou'
          using errcode = '22023';
      end if;
      new.verification_note := btrim(new.verification_note);
      new.verified_at := now();
      new.verified_by := (select auth.uid());  -- ⭐ o servidor carimba; o digitado morre
    elsif new.status = 'closed' then
      new.closed_at := now();
      new.closed_by := (select auth.uid());
    end if;

    return new;
  end if;

  -- Sem transição: só edita o plano, e só enquanto open.
  if old.status <> 'open' then
    raise exception 'ação verificada está congelada: só o fechamento a move'
      using errcode = '42501';
  end if;

  if not core.has_permission(new.tenant_id, 'capa.action.manage') then
    raise exception 'editar a ação exige a permissão capa.action.manage'
      using errcode = '42501';
  end if;

  -- O carimbo de verificação/fechamento não se forja por UPDATE de plano.
  if new.verification_note is distinct from old.verification_note
     or new.verified_at is distinct from old.verified_at
     or new.verified_by is distinct from old.verified_by
     or new.closed_at   is distinct from old.closed_at
     or new.closed_by   is distinct from old.closed_by then
    raise exception 'o carimbo de verificação/fechamento não se edita à mão'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger capa_actions_guard_update
  before update on capa.actions
  for each row execute function capa.guard_action_update();

-- =============================================================================
-- 3. PAYLOAD + FATOS
-- =============================================================================

create or replace function capa.action_payload(p capa.actions)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'actionId',         p.id,
    'actionType',       p.action_type,
    'description',      p.description,
    'responsible',      p.responsible,
    'dueDate',          p.due_date,
    'ncEntryId',        p.nc_entry_id,
    'status',           p.status,
    'verificationNote', p.verification_note
  );
$$;

comment on function capa.action_payload(capa.actions) is
  'O envelope de uma ação — AUTOSSUFICIENTE, com o nc por id solto. Quem escuta não faz join.';

create or replace function capa.on_action_opened()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform capa.emit_event(new.tenant_id, 'capa.action.opened', capa.action_payload(new));
  return new;
end;
$$;

create trigger capa_actions_emit_opened
  after insert on capa.actions
  for each row execute function capa.on_action_opened();

create or replace function capa.on_action_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform capa.emit_event(
      new.tenant_id,
      case when new.status = 'verified' then 'capa.action.verified'
           else 'capa.action.closed' end,
      capa.action_payload(new)
    );
  end if;
  return new;
end;
$$;

create trigger capa_actions_emit_changed
  after update of status on capa.actions
  for each row execute function capa.on_action_changed();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema capa                  from public, anon, authenticated;
revoke all on all tables    in schema capa from public, anon, authenticated;
revoke all on all functions in schema capa from public, anon, authenticated;

grant usage on schema capa to authenticated;

grant select, insert, update on capa.actions to authenticated;

grant execute on function capa.can_access(uuid) to authenticated;

-- `capa.emit_event` NÃO é concedida. `capa.action_payload` é encanamento dos
-- gatilhos. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. O tipo é CHECK (física do método), o resto é texto livre.
-- Nenhum anexo. Nenhum objeto fora de `capa`. Nenhuma leitura de schema alheio
-- (o vínculo ao nc é id solto). `consumes` VAZIO.
-- =============================================================================
