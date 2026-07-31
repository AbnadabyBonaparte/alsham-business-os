-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0061_vperf.sql
-- Módulo 46: Avaliação de Fornecedores. Schema `vperf`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md, módulo da
-- Fase 2 que completa a leitura do Domain Compras iniciada pelo `vendor`.
--
-- Taxonomia: Domain 📦 Compras — capacidade *Avaliação de fornecedores* (§5, a
-- linha de Compras, ao lado de *Fornecedores* e *Pedidos*). A Store o exibe na
-- galeria "Domínios Universais", na seção Compras.
-- Spec: docs/canon/MODULO-VPERF-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ O DIVERGE do `perf`, ASSINADO — a avaliação de fornecedor NÃO TEM CICLO
-- -----------------------------------------------------------------------------
-- Copiar sem pensar e divergir sem escrever são o mesmo erro (CLAUDE.md). O
-- `perf` (Módulo 36) é a avaliação de DESEMPENHO de gente, e ele tem um CICLO
-- (`perf.cycles`, `open → closed`) ao qual toda avaliação pertence — porque a
-- avaliação de RH acontece numa ÉPOCA (o trimestre, o ano). A pergunta foi
-- refeita para o fornecedor: a avaliação de um FORNECEDOR pertence a uma época?
-- NÃO. Ela é PONTUAL — o comprador avalia o fornecedor quando um recebimento
-- chega torto, quando uma cotação decepciona, quando um serviço supera. Não há
-- "ciclo de avaliação de fornecedores" a abrir e fechar; cada avaliação é um
-- ATO consumado, isolado, com data própria. A física correta é a da RONDA do
-- `sec` (`sec.patrols`: ato pontual SEM ciclo de vida), não a do `perf.cycles`.
--
-- ⭐ Consequência direta: `vperf` NÃO TEM tabela de ciclo, NÃO TEM coluna de
-- status e NÃO TEM `allowed_transition()`. Não existe "avaliação aberta" nem
-- "em andamento" — a avaliação ACONTECE e o registro nasce pronto, para sempre.
-- O que se MANTÉM do `perf` é a IDENTIDADE: avaliador × avaliado (aqui,
-- comprador × fornecedor), ato IMUTÁVEL, avaliador carimbado pelo SERVIDOR.
-- O que DIVERGE é a moldura temporal: o `perf` a tem (o ciclo), o `vperf` não.
--
-- -----------------------------------------------------------------------------
-- ⭐ A AVALIAÇÃO É FATO CONSUMADO — imutável em duas camadas (a física do perf/sec)
-- -----------------------------------------------------------------------------
-- Sem policy de UPDATE/DELETE em `vperf.appraisals` e, por trás, um gatilho
-- `before update or delete` que recusa até para o dono do banco. Corrigir uma
-- nota errada é registrar OUTRA avaliação — nunca rasurar a anterior.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA a nota 0–100 (a régua do MÉTODO, obrigatória — a avaliação SEM
--      número não é avaliação), o parecer TEXTO LIVRE obrigatório, e a origem
--      TEXTO LIVRE opcional ("recebimento", "cotação" — vocabulário de cada
--      compra) com o `source_ref` id solto (a linha que a motivou).
--   ❌ NÃO ENTRA ciclo/época de avaliação (é o `perf`, e é justamente o
--      DIVERGE), scorecard estruturado com pesos por critério (capacidade
--      futura), homologação formal (o `vendor` já declarou FORA), nem SLA
--      contratual (é o `ctr` genérico). `consumes` VAZIO (Lei 7).
-- =============================================================================

create schema if not exists vperf;

comment on schema vperf is
  'Módulo Avaliação de Fornecedores. Domain procurement (Compras) da Taxonomia. A avaliação PONTUAL e IMUTÁVEL do fornecedor pelo comprador — o DIVERGE do perf: mantém a identidade avaliador × avaliado e o ato consumado, mas NÃO tem ciclo/época (é a física do sec.patrols, não a do perf.cycles). Nota 0–100 obrigatória; parecer texto livre; origem texto livre + id solto opcional. Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — quadragésima sexta vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function vperf.emit_event(
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
  if p_event_type not like 'vperf.%' then
    raise exception 'vperf.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'vperf',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function vperf.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function vperf.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'vperf.appraisal.record');
$$;

-- =============================================================================
-- 2. APPRAISALS — ⭐ A AVALIAÇÃO: ATO PONTUAL, SEM CICLO, IMUTÁVEL DESDE O INSTANTE 1
-- -----------------------------------------------------------------------------
-- NENHUMA coluna de status. NENHUMA função allowed_transition. NENHUMA tabela
-- de ciclo. O registro nasce pronto — e nunca mais muda. O DIVERGE do perf: a
-- avaliação de fornecedor não pertence a uma época; é um carimbo isolado.
-- =============================================================================

create table vperf.appraisals (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references core.tenants (id) on delete cascade,
  -- ⭐ ID SOLTO ao fornecedor (vendor) — sem FK cruzada. O vínculo é o dado + o
  -- nome carimbado pela tela. O nome sobrevive ao redesenho do cadastro alheio.
  supplier_id   uuid        not null,
  supplier_name text        not null default '',
  -- ⭐ A régua do MÉTODO: 0–100, OBRIGATÓRIA. Uma avaliação sem número não é
  -- avaliação — é um bilhete. O CHECK é a física da nota, não vocabulário de casa.
  rating        int         not null check (rating >= 0 and rating <= 100),
  -- O parecer — OBRIGATÓRIO. Todo ato de avaliar carrega o porquê.
  summary       text        not null check (length(btrim(summary)) > 0),
  -- ⭐ A origem TEXTO LIVRE opcional ("recebimento", "cotação") + a linha que a
  -- motivou por ID SOLTO opcional. Nem enum de origem, nem FK cruzada.
  source_kind   text        not null default '',
  source_ref    uuid,
  -- ⭐ Carimbados pelo SERVIDOR no INSERT — a hora e o autor que o cliente
  -- mandar são descartados (o comprador que avaliou é auth.uid() do ato).
  appraiser_id  uuid        references auth.users (id) on delete set null,
  appraised_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  constraint vperf_appraisals_id_tenant unique (id, tenant_id)
);

create index vperf_appraisals_book_idx
  on vperf.appraisals (tenant_id, supplier_id, appraised_at desc);

alter table vperf.appraisals enable row level security;
alter table vperf.appraisals force row level security;

create policy vperf_appraisals_select on vperf.appraisals
  for select to authenticated
  using (vperf.can_access(tenant_id));

create policy vperf_appraisals_insert on vperf.appraisals
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'vperf.appraisal.record'));

-- ⛔ SEM policy de UPDATE e SEM policy de DELETE — a avaliação registrada é
-- fato consumado; não existe porta para reescrevê-la.

-- -----------------------------------------------------------------------------
-- 2.1 O carimbo é do servidor — o que o cliente mandar de autor/hora é descartado
-- -----------------------------------------------------------------------------

create or replace function vperf.guard_appraisal_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.appraiser_id := (select auth.uid());
  new.appraised_at := now();
  return new;
end;
$$;

create trigger vperf_appraisals_stamp
  before insert on vperf.appraisals
  for each row execute function vperf.guard_appraisal_insert();

-- -----------------------------------------------------------------------------
-- 2.2 ⭐ IMUTÁVEL — nem o dono do banco reescreve a avaliação registrada
-- -----------------------------------------------------------------------------

create or replace function vperf.guard_appraisal_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'a avaliação é fato consumado: não se edita nem se apaga — corrigir é registrar outra.'
    using errcode = '42501';
end;
$$;

create trigger vperf_appraisals_immutable
  before update or delete on vperf.appraisals
  for each row execute function vperf.guard_appraisal_immutable();

-- =============================================================================
-- 3. OS FATOS — payload autossuficiente (carrega a nota e o fornecedor; NÃO o parecer)
-- =============================================================================

create or replace function vperf.appraisal_payload(p vperf.appraisals)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'appraisalId',  p.id,
    'supplierId',   p.supplier_id,
    'supplierName', p.supplier_name,
    'rating',       p.rating,
    'sourceKind',   p.source_kind,
    'appraisedAt',  p.appraised_at
  );
$$;

comment on function vperf.appraisal_payload(vperf.appraisals) is
  'O envelope de uma avaliação de fornecedor — AUTOSSUFICIENTE, com a nota e o fornecedor (id solto + nome). Quem escuta não faz join. O parecer (summary) NÃO passeia no correio.';

create or replace function vperf.on_appraisal_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform vperf.emit_event(new.tenant_id, 'vperf.appraisal.recorded', vperf.appraisal_payload(new));
  return new;
end;
$$;

create trigger vperf_appraisals_emit_recorded
  after insert on vperf.appraisals
  for each row execute function vperf.on_appraisal_recorded();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema vperf                  from public, anon, authenticated;
revoke all on all tables    in schema vperf from public, anon, authenticated;
revoke all on all functions in schema vperf from public, anon, authenticated;

grant usage on schema vperf to authenticated;

-- ⛔ SÓ SELECT e INSERT: reescrever a avaliação não existe.
grant select, insert on vperf.appraisals to authenticated;

grant execute on function vperf.can_access(uuid) to authenticated;

-- `vperf.emit_event` NÃO é concedida. `vperf.appraisal_payload` é encanamento
-- do gatilho. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhuma tabela de ciclo (é o DIVERGE do perf). Nenhuma coluna de status.
-- Nenhum enum. Nenhum objeto fora de `vperf`. Nenhuma leitura de schema alheio.
-- `consumes` VAZIO (Lei 7).
-- =============================================================================
