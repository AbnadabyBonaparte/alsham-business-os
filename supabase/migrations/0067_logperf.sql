-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0067_logperf.sql
-- Módulo 52: Performance Logística. Schema `logperf`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md, o quinto
-- módulo da Onda Onze (Fase 2 — o Domain Supply Chain). Nasce sob
-- `domain_key='supply-chain'` — território SEPARADO de Compras (Taxonomia §5:
-- "Supply Chain — separado de Compras").
--
-- Taxonomia: Domain 🔗 Supply Chain — capacidade *Performance logística* (§5, a
-- última da linha de Supply Chain, ao lado de *Abastecimento*). A Store o exibe
-- na galeria "Domínios Universais", na seção Supply Chain.
-- Spec: docs/canon/MODULO-LOGPERF-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ A IDENTIDADE É A DO `vperf` — RE-PERGUNTADA — E O DIVERGE ASSINADO
-- -----------------------------------------------------------------------------
-- Copiar sem pensar e divergir sem escrever são o mesmo erro (CLAUDE.md). A
-- performance logística REUSA a física do `vperf` (Módulo 46): avaliação
-- PONTUAL (sem ciclo — a física do `sec.patrols`, não a do `perf.cycles`), nota
-- 0–100 OBRIGATÓRIA (a régua do MÉTODO, CHECK argumentado), parecer texto livre
-- obrigatório, ato IMUTÁVEL em DUAS camadas (sem policy de UPDATE/DELETE e um
-- gatilho que recusa até para o dono do banco), e o avaliador carimbado pelo
-- SERVIDOR (`auth.uid()` no INSERT).
--
-- ⭐ O DIVERGE do `vperf`: o AVALIADO. O `vperf` avalia um FORNECEDOR
-- (`supplier_id` obrigatório, id solto ao `vendor` + `supplier_name`). Aqui o
-- avaliado é uma ROTA / TRANSPORTADORA / CENTRO DE DISTRIBUIÇÃO em TEXTO LIVRE
-- (`subject`, obrigatório) — porque a unidade avaliada na logística não é um
-- cadastro único: hoje é "Rota SP→RJ", amanhã é "Transportadora X", depois é o
-- CD do interior. Congelar isso num id de fornecedor faria o produto mentir
-- sobre o que se mede. O vínculo com um centro de distribuição, QUANDO existe, é
-- um ID SOLTO OPCIONAL (`dc_center_id`, nullable, SEM FK) — pode apontar para o
-- centro (dc) por id solto, ou ficar nulo, porque uma perna de transporte nem
-- sempre tem um CD cadastrado. O contraste `logperf × vperf` (o avaliado é
-- texto livre + id solto opcional, não um fornecedor obrigatório) é assinado no
-- `lifecycle.test.ts`.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA a nota 0–100 (a régua do MÉTODO, obrigatória — a avaliação SEM
--      número não é avaliação), o parecer TEXTO LIVRE obrigatório, o avaliado em
--      TEXTO LIVRE ("Rota SP→RJ", "Transportadora do Sul", "CD Interior" —
--      vocabulário de cada operação) e o vínculo OPCIONAL a um centro por id
--      solto (nullable, sem FK).
--   ❌ NÃO ENTRA ciclo/época de avaliação (é o `perf`), scorecard estruturado
--      com pesos por critério (capacidade futura), KPIs calculados de OTIF/lead
--      time (precisariam de handler real consumindo eventos de entrega —
--      capacidade futura declarada), nem FK cruzada. `consumes` VAZIO (Lei 7).
-- =============================================================================

create schema if not exists logperf;

comment on schema logperf is
  'Módulo Performance Logística. Domain supply-chain (Supply Chain) da Taxonomia — separado de Compras. A avaliação PONTUAL e IMUTÁVEL da performance logística — o REUSO do vperf: mantém a identidade avaliador × avaliado, o ato consumado e a nota 0–100 obrigatória, SEM ciclo (a física do sec.patrols). O DIVERGE do vperf: o avaliado é uma rota/transportadora/CD em TEXTO LIVRE (subject), não um fornecedor; o vínculo com um centro (dc) é id solto OPCIONAL (nullable, sem FK). Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA
-- =============================================================================

create or replace function logperf.emit_event(
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
  if p_event_type not like 'logperf.%' then
    raise exception 'logperf.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'logperf',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function logperf.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function logperf.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'logperf.appraisal.record');
$$;

-- =============================================================================
-- 2. APPRAISALS — ⭐ A AVALIAÇÃO: ATO PONTUAL, SEM CICLO, IMUTÁVEL DESDE O INSTANTE 1
-- -----------------------------------------------------------------------------
-- NENHUMA coluna de status. NENHUMA função allowed_transition. NENHUMA tabela
-- de ciclo. O registro nasce pronto — e nunca mais muda (o REUSO do vperf). O
-- DIVERGE do vperf: o avaliado é TEXTO LIVRE (subject), não um fornecedor.
-- =============================================================================

create table logperf.appraisals (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references core.tenants (id) on delete cascade,
  -- ⭐ O AVALIADO em TEXTO LIVRE — o DIVERGE do vperf. A rota/transportadora/CD
  -- que se avalia não é um cadastro único: é vocabulário de cada operação.
  subject       text        not null check (length(btrim(subject)) > 0),
  -- ⭐ O vínculo OPCIONAL a um centro de distribuição por ID SOLTO — nullable,
  -- SEM FK. Pode apontar para o centro (dc) por id solto, ou ficar nulo, porque
  -- uma perna de transporte nem sempre tem um CD cadastrado.
  dc_center_id  uuid,
  -- ⭐ A régua do MÉTODO: 0–100, OBRIGATÓRIA. Uma avaliação sem número não é
  -- avaliação — é um bilhete. O CHECK é a física da nota, não vocabulário de casa.
  rating        int         not null check (rating >= 0 and rating <= 100),
  -- O parecer — OBRIGATÓRIO. Todo ato de avaliar carrega o porquê.
  summary       text        not null check (length(btrim(summary)) > 0),
  -- A data a que a avaliação se refere (o mês/período medido), OPCIONAL — texto
  -- do cliente, distinta do carimbo do servidor de QUANDO se registrou.
  assessed_on   date,
  -- ⭐ Carimbados pelo SERVIDOR no INSERT — a hora e o autor que o cliente
  -- mandar são descartados (o avaliador é auth.uid() do ato).
  appraiser_id  uuid        references auth.users (id) on delete set null,
  appraised_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  constraint logperf_appraisals_id_tenant unique (id, tenant_id)
);

create index logperf_appraisals_book_idx
  on logperf.appraisals (tenant_id, appraised_at desc);

alter table logperf.appraisals enable row level security;
alter table logperf.appraisals force row level security;

create policy logperf_appraisals_select on logperf.appraisals
  for select to authenticated
  using (logperf.can_access(tenant_id));

create policy logperf_appraisals_insert on logperf.appraisals
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'logperf.appraisal.record'));

-- ⛔ SEM policy de UPDATE e SEM policy de DELETE — a avaliação registrada é
-- fato consumado; não existe porta para reescrevê-la.

-- -----------------------------------------------------------------------------
-- 2.1 O carimbo é do servidor — o que o cliente mandar de autor/hora é descartado
-- -----------------------------------------------------------------------------

create or replace function logperf.guard_appraisal_insert()
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

create trigger logperf_appraisals_stamp
  before insert on logperf.appraisals
  for each row execute function logperf.guard_appraisal_insert();

-- -----------------------------------------------------------------------------
-- 2.2 ⭐ IMUTÁVEL — nem o dono do banco reescreve a avaliação registrada
-- -----------------------------------------------------------------------------

create or replace function logperf.guard_appraisal_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'a avaliação é fato consumado: não se edita nem se apaga — corrigir é registrar outra.'
    using errcode = '42501';
end;
$$;

create trigger logperf_appraisals_immutable
  before update or delete on logperf.appraisals
  for each row execute function logperf.guard_appraisal_immutable();

-- =============================================================================
-- 3. OS FATOS — payload autossuficiente (carrega o avaliado e a nota; NÃO o parecer)
-- =============================================================================

create or replace function logperf.appraisal_payload(p logperf.appraisals)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'appraisalId', p.id,
    'subject',     p.subject,
    'dcCenterId',  p.dc_center_id,
    'rating',      p.rating,
    'assessedOn',  p.assessed_on
  );
$$;

comment on function logperf.appraisal_payload(logperf.appraisals) is
  'O envelope de uma avaliação de performance logística — AUTOSSUFICIENTE, com o avaliado (subject + id solto opcional do centro) e a nota. Quem escuta não faz join. O parecer (summary) NÃO passeia no correio.';

create or replace function logperf.on_appraisal_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform logperf.emit_event(new.tenant_id, 'logperf.appraisal.recorded', logperf.appraisal_payload(new));
  return new;
end;
$$;

create trigger logperf_appraisals_emit_recorded
  after insert on logperf.appraisals
  for each row execute function logperf.on_appraisal_recorded();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema logperf                  from public, anon, authenticated;
revoke all on all tables    in schema logperf from public, anon, authenticated;
revoke all on all functions in schema logperf from public, anon, authenticated;

grant usage on schema logperf to authenticated;

-- ⛔ SÓ SELECT e INSERT: reescrever a avaliação não existe.
grant select, insert on logperf.appraisals to authenticated;

grant execute on function logperf.can_access(uuid) to authenticated;

-- `logperf.emit_event` NÃO é concedida. `logperf.appraisal_payload` é encanamento
-- do gatilho. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhuma tabela de ciclo (é o REUSO do vperf, sem época). Nenhuma coluna
-- de status. Nenhum enum. Nenhuma FK cruzada. Nenhum objeto fora de `logperf`.
-- Nenhuma leitura de schema alheio. `consumes` VAZIO (Lei 7).
-- =============================================================================
