-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0081_iso.sql
-- Módulo 66: Requisitos ISO. Schema `iso`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §27, o
-- QUARTO e ÚLTIMO módulo da Onda Quatorze (Fase 2). Domain 🧪 Qualidade.
-- Nasce sob `domain_key='quality'`. ⭐ Com ele, a Qualidade tem 4 módulos
-- próprios (nc·audit·capa·iso) — as outras 3 capacidades (Indicadores,
-- Documentos, Procedimentos) já são o `goal`/`pol` e ficam DECLARADAS FORA.
--
-- Taxonomia: Domain 🧪 Qualidade — capacidade *ISO* (§5).
-- Spec: docs/canon/MODULO-ISO-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ A FÍSICA — o DIVERGE de TODOS os módulos com ciclo de vida
-- -----------------------------------------------------------------------------
-- Os módulos desta onda até aqui têm um CICLO com fim (nc: open→closed; audit e
-- capa: fins terminais). O requisito ISO NÃO tem ciclo de vida terminal: ele é
-- uma AVALIAÇÃO que MUDA a cada auditoria. Hoje a cláusula 8.5.1 está conforme;
-- na auditoria que vem pode virar não conforme; num escopo diferente, não se
-- aplica. Então a conformidade é um estado **MUTÁVEL** — `compliant` ×
-- `non_compliant` × `not_applicable` —, e não uma máquina de estados com
-- transições fixas: qualquer um vai para qualquer um, quantas vezes for preciso.
--
-- ⭐ Copiar sem pensar e divergir sem escrever são o mesmo erro (CLAUDE.md): a
-- pergunta "isto tem ciclo de vida?" foi refeita, e a resposta é NÃO. Não há
-- `allowed_transition` de conformidade: reavaliar é UPDATE honesto.
--
-- ⭐ A NORMA é DADO DO TENANT, jamais lista fechada: `clause_reference` é TEXTO
-- LIVRE ("ISO 9001:2015 — 8.5.1", "ISO 14001 — 6.1.2", "IATF 16949 — 8.3"). Cada
-- empresa certifica a norma que quiser; congelar as normas num enum faria o
-- produto envelhecer com a edição da norma.
--
-- ⭐ `active ↔ archived` (a física do `vendor`/`dc`/`pfolio`): uma cláusula que
-- SAI de escopo quando a versão da norma muda é arquivada — e VOLTA se voltar ao
-- escopo. É a MESMA cláusula (não um fim terminal): arquivar é metadado
-- reversível. Cláusula arquivada não se reavalia (fora de escopo não tem
-- conformidade a medir).
--
-- ⛔ FORA (declarado): anexo de evidência documental (Storage & Arquivos é do
-- Core, NÃO CONSTRUÍDA); vínculo AUTOMÁTICO com `audit`/`nc` (cruzar na tela — o
-- módulo não conhece módulo). `consumes` VAZIO.
-- =============================================================================

create schema if not exists iso;

comment on schema iso is
  'Módulo Requisitos ISO. Domain quality da Taxonomia. A referência da norma/cláusula é TEXTO LIVRE (dado do tenant). A conformidade (compliant/non_compliant/not_applicable) é MUTÁVEL — avaliação que muda a cada auditoria, NÃO um ciclo de vida terminal. active ↔ archived para cláusulas que saem de escopo (a física do vendor/dc/pfolio). Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — sexagésima sexta vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function iso.emit_event(
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
  if p_event_type not like 'iso.%' then
    raise exception 'iso.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'iso',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function iso.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function iso.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'iso.requirement.manage');
$$;

create or replace function iso.touch_updated_at()
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
-- 2. REQUIREMENTS — o requisito da norma (conformidade MUTÁVEL; active ↔ archived)
-- =============================================================================

create table iso.requirements (
  id                uuid        primary key default gen_random_uuid(),
  tenant_id         uuid        not null references core.tenants (id) on delete cascade,
  -- ⭐ A norma/cláusula em TEXTO LIVRE — dado do tenant, nunca lista fechada.
  clause_reference  text        not null check (length(btrim(clause_reference)) > 0),
  description       text        not null check (length(btrim(description)) > 0),
  -- ⭐⭐ MUTÁVEL, sem default: quem registra DECLARA a avaliação atual (Lei 7 —
  -- nada de estado inventado). Muda a cada auditoria.
  compliance        text        not null
                    check (compliance in ('compliant', 'non_compliant', 'not_applicable')),
  -- ⭐ O ciclo REVERSÍVEL active ↔ archived (a física do vendor/dc/pfolio).
  status            text        not null default 'active'
                    check (status in ('active', 'archived')),
  created_at        timestamptz not null default now(),
  created_by        uuid        references auth.users (id) on delete set null,
  updated_at        timestamptz not null default now(),
  constraint iso_requirements_id_tenant unique (id, tenant_id)
);

create index iso_requirements_book_idx
  on iso.requirements (tenant_id, status, compliance, clause_reference);

create trigger iso_requirements_touch
  before update on iso.requirements
  for each row execute function iso.touch_updated_at();

alter table iso.requirements enable row level security;
alter table iso.requirements force row level security;

create policy iso_requirements_select on iso.requirements
  for select to authenticated
  using (iso.can_access(tenant_id));

create policy iso_requirements_insert on iso.requirements
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'iso.requirement.manage'));

create policy iso_requirements_update on iso.requirements
  for update to authenticated
  using (iso.can_access(tenant_id))
  with check (iso.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE: cláusula fora de escopo é arquivada, não apagada.

create or replace function iso.guard_requirement_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'active' then
    raise exception 'o requisito nasce ativo — arquivar é decisão à parte'
      using errcode = '22023';
  end if;
  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger iso_requirements_stamp
  before insert on iso.requirements
  for each row execute function iso.guard_requirement_insert();

-- -----------------------------------------------------------------------------
-- 2.1 O ciclo de arquivamento — espelho de ARCHIVE_TRANSITIONS em @alsham/iso
-- -----------------------------------------------------------------------------
-- ⭐ active ↔ archived (reversível). ⚠️ NÃO existe allowed_transition de
-- CONFORMIDADE: a conformidade é MUTÁVEL, não uma máquina de estados.

create or replace function iso.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('active',   'archived'),
    ('archived', 'active')
  );
$$;

comment on function iso.allowed_transition(text, text) is
  'Ciclo de ARQUIVAMENTO do requisito (não da conformidade). Espelho de ARCHIVE_TRANSITIONS em @alsham/iso. active ↔ archived: a cláusula que sai de escopo é arquivada e VOLTA. A CONFORMIDADE não tem transições fixas — é mutável.';

create or replace function iso.guard_requirement_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Transição de arquivamento
  if new.status is distinct from old.status then
    if not iso.allowed_transition(old.status, new.status) then
      raise exception 'transição de arquivamento % → % não existe', old.status, new.status
        using errcode = '22023';
    end if;
    if not core.has_permission(new.tenant_id, 'iso.requirement.manage') then
      raise exception 'arquivar ou reabrir um requisito exige a permissão iso.requirement.manage'
        using errcode = '42501';
    end if;
  end if;

  -- ⛔ Cláusula arquivada não se reavalia: fora de escopo não tem conformidade a
  -- medir. Só o restore (status → active) a move.
  if old.status = 'archived'
     and new.compliance is distinct from old.compliance then
    raise exception 'requisito arquivado não se reavalia — reabra primeiro (fora de escopo não tem conformidade a medir)'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger iso_requirements_guard_update
  before update on iso.requirements
  for each row execute function iso.guard_requirement_update();

-- =============================================================================
-- 3. PAYLOAD + FATOS
-- =============================================================================

create or replace function iso.requirement_payload(p iso.requirements)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'requirementId',   p.id,
    'clauseReference', p.clause_reference,
    'description',     p.description,
    'compliance',      p.compliance,
    'status',          p.status
  );
$$;

comment on function iso.requirement_payload(iso.requirements) is
  'O envelope de um requisito — AUTOSSUFICIENTE. Quem escuta não faz join.';

create or replace function iso.on_requirement_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform iso.emit_event(new.tenant_id, 'iso.requirement.registered', iso.requirement_payload(new));
  return new;
end;
$$;

create trigger iso_requirements_emit_registered
  after insert on iso.requirements
  for each row execute function iso.on_requirement_registered();

-- ⭐ A REAVALIAÇÃO é um fato: quando a conformidade muda, sai `assessed`.
create or replace function iso.on_requirement_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.compliance is distinct from old.compliance then
    perform iso.emit_event(new.tenant_id, 'iso.requirement.assessed', iso.requirement_payload(new));
  end if;

  if new.status is distinct from old.status then
    perform iso.emit_event(
      new.tenant_id,
      case when new.status = 'archived' then 'iso.requirement.archived'
           else 'iso.requirement.restored' end,
      iso.requirement_payload(new)
    );
  end if;

  return new;
end;
$$;

create trigger iso_requirements_emit_changed
  after update on iso.requirements
  for each row execute function iso.on_requirement_changed();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema iso                  from public, anon, authenticated;
revoke all on all tables    in schema iso from public, anon, authenticated;
revoke all on all functions in schema iso from public, anon, authenticated;

grant usage on schema iso to authenticated;

grant select, insert, update on iso.requirements to authenticated;

grant execute on function iso.can_access(uuid) to authenticated;

-- `iso.emit_event` NÃO é concedida. `iso.requirement_payload` é encanamento dos
-- gatilhos. `anon` não recebe nada.

-- =============================================================================
-- FIM. ⭐ O ÚLTIMO da Onda Quatorze. A conformidade é MUTÁVEL (não um ciclo);
-- a norma é texto livre; active ↔ archived. Nenhum INSERT. Nenhum anexo. Nenhum
-- vínculo automático com audit/nc (cruzar na tela). Nenhum objeto fora de `iso`.
-- Nenhuma leitura de schema alheio. `consumes` VAZIO.
-- =============================================================================
