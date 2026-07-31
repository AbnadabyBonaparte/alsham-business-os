-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0064_sop.sql
-- Módulo 49: S&OP / Rodadas de Consenso. Schema `sop`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §24, o
-- segundo módulo da Onda Onze (Fase 2 — o Domain Supply Chain). Nasce ao lado
-- do Módulo 48 (Planejamento de Demanda) sob `domain_key='supply-chain'` —
-- território SEPARADO de Compras (Taxonomia §5).
--
-- Taxonomia: Domain 🔗 Supply Chain — capacidade *S&OP* (§5). A Store o exibe na
-- galeria "Domínios Universais", na seção Supply Chain.
-- Spec: docs/canon/MODULO-SOP-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ NÃO É O PLANO DE NOVO — É A GOVERNANÇA SOBRE O PLANO (o DIVERGE assinado)
-- -----------------------------------------------------------------------------
-- Copiar sem pensar e divergir sem escrever são o mesmo erro (CLAUDE.md). O
-- Módulo 48 (Planejamento de Demanda) É o plano: linhas planejadas, publicar
-- congela as linhas. A rodada de S&OP NÃO refaz o plano — ela é a CAMADA DE
-- CONSENSO por cima dele. A rodada REFERENCIA o plano por ID SOLTO (`plan_id`,
-- sem FK) + nome carimbado (`plan_name`, o padrão do `deal`): a governança não
-- conhece o schema do plano, não lê tabela alheia e não o importa. Por isso
-- este arquivo NÃO menciona o schema do plano em lugar nenhum — o vínculo é
-- solto, e um teste confere que a palavra do outro schema não aparece aqui.
--
-- A rodada REUSA a física do documento que congela ao decidir: nasce `draft`,
-- APROVAR CONGELA a rodada (`draft→approved`, TERMINAL), e cancelar exige razão
-- (`draft→cancelled`, TERMINAL). A próxima rodada é rodada nova.
--
-- -----------------------------------------------------------------------------
-- ⭐ POR QUE `sop.round.approve` É PERMISSÃO SEPARADA DE QUEM DESENHA O PLANO
-- -----------------------------------------------------------------------------
-- Este é o ponto do módulo. Quem RASCUNHA a rodada (juntar áreas, montar a
-- pauta) é ato de operação — `sop.round.manage`. Quem APROVA o consenso é OUTRO
-- papel, tipicamente mais sênior: aprovar a rodada de S&OP é o carimbo de
-- governança que fecha o alinhamento entre vendas, produção e finanças. O
-- consenso é REGISTRADO POR GENTE, não calculado — e a assinatura de quem
-- fecha o consenso não pode ser a mesma mão que só desenha a demanda. Fundir as
-- duas permissões apagaria justamente a separação de poderes que a rodada
-- existe para representar. Por isso `sop.round.approve` é gate PRÓPRIO no
-- gatilho de transição, e o carimbo de quem/quando aprovou é do SERVIDOR.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA o período em TEXTO LIVRE ("Q1 2027", "Ciclo Março/2027") e o vínculo
--      SOLTO ao plano (id + nome carimbado). Toda empresa que roda S&OP tem
--      período de ciclo e um plano de referência.
--   ❌ NÃO ENTRA reconciliação automática de múltiplas áreas (vendas × produção
--      × finanças) — isso consumiria eventos de outros módulos por handler real
--      (Lei 7 — não construído). Aqui o consenso é REGISTRADO por gente.
--   ❌ NÃO ENTRA FK ao plano — o vínculo é ID SOLTO: a rodada não conhece o
--      schema de ninguém.
-- =============================================================================

create schema if not exists sop;

comment on schema sop is
  'Módulo S&OP / Rodadas de Consenso. Domain supply-chain (Supply Chain) da Taxonomia — separado de Compras. NÃO refaz o plano de demanda: é a GOVERNANÇA sobre ele. A rodada referencia o plano por id SOLTO + nome carimbado (sem FK). Nasce draft, APROVAR (draft→approved) CONGELA e é TERMINAL — o consenso é registrado por GENTE, não calculado. sop.round.approve é permissão SEPARADA de sop.round.manage (aprovar é papel mais sênior do que desenhar). Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — quadragésima nona vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function sop.emit_event(
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
  if p_event_type not like 'sop.%' then
    raise exception 'sop.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'sop',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function sop.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

-- ⭐ can_access = OR das DUAS permissões: quem só APROVA também precisa alcançar
-- a rodada (a decisão de cada transição vive no gatilho, §3.1). Se a RLS só
-- deixasse passar `manage`, o aprovador cairia num UPDATE que afeta 0 linhas em
-- silêncio, sem nunca chegar ao gatilho que o autoriza.
create or replace function sop.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'sop.round.manage')
      or core.has_permission(p_tenant_id, 'sop.round.approve');
$$;

create or replace function sop.touch_updated_at()
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
-- 2. ROUNDS — a rodada de consenso (cabeçalho + decisão; SEM linhas)
-- -----------------------------------------------------------------------------
-- ⭐ Sem tabela de linhas, de propósito (o DIVERGE do plano): a rodada é um
-- cabeçalho e uma DECISÃO de consenso — o conteúdo detalhado (as linhas) vive
-- no plano referenciado por id solto, não se copia para cá.
-- =============================================================================

create table sop.rounds (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references core.tenants (id) on delete cascade,
  -- ⭐ Período em TEXTO LIVRE — o ciclo é dado do tenant, jamais enum.
  period        text        not null check (length(btrim(period)) > 0),
  -- ⭐ O PLANO REFERENCIADO — ID SOLTO (sem FK): a governança não conhece o
  -- schema do plano. O nome é carimbado pela tela (o padrão do `deal`).
  plan_id       uuid,
  plan_name     text        not null default '',
  title         text        not null default '',
  status        text        not null default 'draft'
                check (status in ('draft', 'approved', 'cancelled')),
  cancel_reason text        not null default '',
  -- ⭐ Carimbo do consenso: quem/quando aprovou, sempre do SERVIDOR (§3.1).
  approved_at   timestamptz,
  approved_by   uuid        references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  created_by    uuid        references auth.users (id) on delete set null,
  updated_at    timestamptz not null default now(),
  constraint sop_rounds_id_tenant unique (id, tenant_id),
  -- ⭐ O estado e o carimbo do consenso contam a MESMA história, ou um mente:
  -- approved ⇔ tem carimbo de quando. Fora de approved, não há carimbo.
  constraint sop_rounds_approve_coherent check (
    (status = 'approved' and approved_at is not null)
    or
    (status <> 'approved' and approved_at is null)
  )
);

create index sop_rounds_draft_idx
  on sop.rounds (tenant_id, created_at desc)
  where status = 'draft';

create trigger sop_rounds_touch
  before update on sop.rounds
  for each row execute function sop.touch_updated_at();

alter table sop.rounds enable row level security;
alter table sop.rounds force row level security;

create policy sop_rounds_select on sop.rounds
  for select to authenticated
  using (sop.can_access(tenant_id));

create policy sop_rounds_insert on sop.rounds
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'sop.round.manage'));

-- ⚠️ USING = can_access (não só manage): assim quem só APROVA alcança a linha e
-- bate no gatilho, que decide — em vez de a RLS filtrar e o UPDATE afetar 0
-- linhas em silêncio. A decisão de cada transição vive no gatilho (§3.1).
create policy sop_rounds_update on sop.rounds
  for update to authenticated
  using (sop.can_access(tenant_id))
  with check (sop.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Rodada decidida é história de governança.

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre RASCUNHO, o autor carimbado pelo servidor
-- -----------------------------------------------------------------------------

create or replace function sop.guard_round_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'draft' then
    raise exception 'a rodada nasce em rascunho — aprovar é decisão à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger sop_rounds_stamp
  before insert on sop.rounds
  for each row execute function sop.guard_round_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/sop
-- -----------------------------------------------------------------------------
-- ⭐ draft→approved (aprovar o consenso), draft→cancelled (abandonar a rodada).
-- approved e cancelled são TERMINAIS. O DIVERGE do plano: a rodada tem gate de
-- APROVAÇÃO próprio (sop.round.approve) — o plano só tem quem desenha.

create or replace function sop.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('draft', 'approved'),
    ('draft', 'cancelled')
  );
$$;

comment on function sop.allowed_transition(text, text) is
  'Ciclo de vida da rodada de consenso. Espelho de ALLOWED_TRANSITIONS em @alsham/sop — há teste que lê este arquivo e compara. approved e cancelled são TERMINAIS: a próxima rodada é rodada nova. Aprovar é gate próprio (sop.round.approve), papel mais sênior do que desenhar.';

-- =============================================================================
-- 3. O PORTEIRO DO ESTADO — e o carimbo do consenso
-- =============================================================================

create or replace function sop.guard_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not sop.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida da rodada: a próxima rodada é rodada nova',
      old.status, new.status
      using errcode = '22023';
  end if;

  -- ⭐ APROVAR é o carimbo de GOVERNANÇA: exige a permissão SEPARADA
  -- sop.round.approve (papel mais sênior do que quem desenha a rodada), e o
  -- carimbo de quem/quando é do SERVIDOR — a tela não escolhe autor nem hora.
  if new.status = 'approved' then
    if not core.has_permission(new.tenant_id, 'sop.round.approve') then
      raise exception 'aprovar o consenso exige a permissão sop.round.approve'
        using errcode = '42501';
    end if;
    new.approved_at := now();
    new.approved_by := (select auth.uid());
  end if;

  -- Cancelar (abandonar a rodada) exige razão — e é a ação de quem gere.
  if new.status = 'cancelled' then
    if not core.has_permission(new.tenant_id, 'sop.round.manage') then
      raise exception 'cancelar a rodada exige a permissão sop.round.manage'
        using errcode = '42501';
    end if;
    if length(btrim(new.cancel_reason)) = 0 then
      raise exception 'cancelar a rodada exige uma razão'
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

create trigger sop_rounds_guard_status
  before update of status on sop.rounds
  for each row execute function sop.guard_status_transition();

-- ⭐ E o conteúdo (período, título, e o vínculo com o plano) CONGELA quando a
-- rodada sai do rascunho: aprovar/cancelar fixa a identidade da rodada. O
-- status muda por caminho próprio (§3); aqui barra-se a mudança de identidade.
create or replace function sop.guard_content_frozen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'draft'
     and (new.period is distinct from old.period
          or new.title is distinct from old.title
          or new.plan_id is distinct from old.plan_id
          or new.plan_name is distinct from old.plan_name) then
    raise exception 'a rodada já foi decidida (%): período, título e o plano vinculado não mudam mais', old.status
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger sop_rounds_content_frozen
  before update on sop.rounds
  for each row execute function sop.guard_content_frozen();

-- =============================================================================
-- 4. PAYLOAD + EVENTOS — envelope AUTOSSUFICIENTE
-- -----------------------------------------------------------------------------
-- ⭐ O envelope carrega o VÍNCULO SOLTO (id + nome do plano), nunca as linhas do
-- plano — quem escuta não faz join, e a governança não copia o conteúdo alheio.
-- =============================================================================

create or replace function sop.round_payload(p_round_id uuid, p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_round sop.rounds;
begin
  select * into v_round
    from sop.rounds
   where id = p_round_id and tenant_id = p_tenant_id;

  if not found then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'period',       v_round.period,
    'title',        v_round.title,
    'planId',       v_round.plan_id,
    'planName',     v_round.plan_name,
    'status',       v_round.status,
    'approvedAt',   v_round.approved_at,
    'cancelReason', v_round.cancel_reason
  );
end;
$$;

comment on function sop.round_payload(uuid, uuid) is
  'Envelope AUTOSSUFICIENTE da rodada — período, título, o vínculo SOLTO com o plano (id + nome) e o carimbo do consenso. Nunca as linhas do plano: a governança não copia conteúdo alheio.';

create or replace function sop.on_round_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform sop.emit_event(
    new.tenant_id,
    'sop.round.registered',
    sop.round_payload(new.id, new.tenant_id)
  );
  return new;
end;
$$;

create trigger sop_rounds_emit_registered
  after insert on sop.rounds
  for each row execute function sop.on_round_registered();

create or replace function sop.on_round_changed()
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
                when 'approved'  then 'sop.round.approved'
                when 'cancelled' then 'sop.round.cancelled'
                else null
              end;
    if v_type is not null then
      perform sop.emit_event(new.tenant_id, v_type, sop.round_payload(new.id, new.tenant_id));
    end if;
  end if;

  return new;
end;
$$;

create trigger sop_rounds_emit_changed
  after update of status on sop.rounds
  for each row execute function sop.on_round_changed();

-- =============================================================================
-- 5. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema sop                  from public, anon, authenticated;
revoke all on all tables    in schema sop from public, anon, authenticated;
revoke all on all functions in schema sop from public, anon, authenticated;

grant usage on schema sop to authenticated;

grant select, insert, update on sop.rounds to authenticated;

grant execute on function sop.can_access(uuid) to authenticated;

-- `sop.emit_event` NÃO é concedida: ninguém emite evento à mão.
-- `sop.round_payload` NÃO é concedida: é encanamento dos gatilhos.
-- `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhuma tabela de linhas. Nenhum nome de cliente. Nenhum
-- objeto fora de `sop`. Nenhuma leitura de schema alheio (vínculo por id solto).
-- `consumes` VAZIO.
-- =============================================================================
