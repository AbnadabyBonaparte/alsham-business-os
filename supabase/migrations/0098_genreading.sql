-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0098_genreading.sql
-- Módulo 83: Monitoramento de Geração. Schema `genreading`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §33, o
-- TERCEIRO módulo da Onda Vinte (Fase 3 — o Vertical ☀️ ENERGIA). Nasce sob
-- `vertical_key='energy'` (confirmado na store-taxonomy).
--
-- Taxonomia: Vertical ☀️ Energia (§6) — capacidade *Monitoramento de geração*.
-- Spec: docs/canon/MODULO-GENREADING-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ REAPROVEITA A IDENTIDADE DO `esg` — a leitura periódica IMUTÁVEL
-- -----------------------------------------------------------------------------
-- Copiar sem pensar e divergir sem escrever são o mesmo erro (CLAUDE.md). A
-- pergunta foi feita: o que é uma leitura de geração? É EXATAMENTE a mesma
-- física da leitura ambiental do `esg` (Módulo 67), do `pcost` (Módulo 57) e do
-- `timesheet` (Módulo 61): um FATO CONSUMADO — a usina gerou tantos kWh num
-- período, e o registro nasce pronto, para sempre. NÃO tem coluna de status,
-- não tem ciclo de vida, não tem transição, não tem `updated_at`. Não existe
-- "leitura aberta" nem "em andamento" — a medição ACONTECE e vira linha.
-- Corrigir é registrar OUTRA leitura (com nota), nunca reescrever.
--
-- ⭐ A imutabilidade é em DUAS camadas desde o instante 1 (a lição da Onda Dez):
-- o cliente não tem porta de UPDATE nem DELETE (nem policy, nem grant); e o
-- gatilho da §2.2 recusa a reescrita até para o dono do banco.
--
-- -----------------------------------------------------------------------------
-- ⭐ O DIVERGE ASSINADO — genreading × esg: a USINA é OBRIGATÓRIA
-- -----------------------------------------------------------------------------
-- O que se MANTÉM do `esg`: leitura imutável, `quantity >= 0` (zero é leitura
-- REAL — uma usina gera zero à noite, e recusar isso mentiria sobre o período;
-- negativo é infísico — não se gera -3 kWh), unidade TEXTO LIVRE (kWh/MWh — o
-- tenant escolhe), data de referência obrigatória, carimbo do servidor. O que
-- DIVERGE: no `esg` a fonte é OPCIONAL (`source_id` pode ser nulo — uma emissão
-- pode não ter obra de origem); aqui a USINA é OBRIGATÓRIA (`plant_id NOT
-- NULL`), porque não existe geração no ar — toda geração é DE UMA usina. O
-- vínculo continua por ID SOLTO (sem FK cruzada), com o nome carimbado pela tela.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA a usina por ID SOLTO ao `plant` (OBRIGATÓRIA) + nome carimbado; a
--      energia gerada (`generated_kwh` >= 0); a unidade TEXTO LIVRE; a data de
--      referência (obrigatória); a nota TEXTO LIVRE opcional.
--   ❌ NÃO ENTRA cálculo de performance ratio (geração real ÷ esperada — seria
--      MOTOR DE CÁLCULO, capacidade futura, DECLARADA FORA); alerta de queda de
--      geração (motor futuro); telemetria em tempo real do inversor (integração
--      de equipamento, futuro). `consumes` VAZIO.
--
-- 🔴 O `genreading` NÃO LÊ o `plant`: a usina é referenciada por ID SOLTO, SEM
-- FK cruzada e SEM uma linha que toque schema alheio — a Lei do Lego.
-- =============================================================================

create schema if not exists genreading;

comment on schema genreading is
  'Módulo Monitoramento de Geração. Vertical energy (Energia) da Taxonomia. O livro de leituras de geração: cada leitura é ATO IMUTÁVEL (a física do esg/pcost/timesheet), sem ciclo, sem status. generated_kwh >= 0 (zero é leitura real — a usina gera zero à noite; o MANTIDO do esg). Unidade TEXTO LIVRE. O DIVERGE do esg: a usina é OBRIGATÓRIA (plant_id NOT NULL — não há geração sem usina), por id solto (sem FK cruzada). Performance ratio e alerta de queda ficam FORA (motor futuro). Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — a única porta do módulo para o mundo. É lei.
-- =============================================================================

create or replace function genreading.emit_event(
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
  if p_event_type not like 'genreading.%' then
    raise exception 'genreading.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'genreading',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function genreading.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function genreading.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'genreading.reading.record');
$$;

-- =============================================================================
-- 2. READINGS — ⭐⭐ A LEITURA DE GERAÇÃO: ATO IMUTÁVEL, SEM CICLO, SEM TRAVE
-- -----------------------------------------------------------------------------
-- NENHUMA coluna de status. NENHUMA allowed_transition. NENHUM updated_at. O
-- registro nasce pronto — e nunca mais muda. O cliente não tem NENHUMA porta de
-- UPDATE nem DELETE (nem policy, nem grant); e mesmo assim o gatilho da §2.2
-- recusa a reescrita até para o dono do banco — a física do esg/occ.
-- =============================================================================

create table genreading.readings (
  id            uuid          primary key default gen_random_uuid(),
  tenant_id     uuid          not null references core.tenants (id) on delete cascade,
  -- ⭐ A usina por ID SOLTO ao plant — OBRIGATÓRIA (o DIVERGE do esg): não há
  -- geração no ar, toda geração é DE UMA usina. SEM FK cruzada (Lei do Lego).
  plant_id      uuid          not null,
  -- O nome da usina carimbado pela TELA — sobrevive ao redesenho do cadastro.
  plant_name    text          not null default '',
  -- ⭐ A energia gerada. generated_kwh >= 0: zero é leitura real (à noite a
  -- usina gera zero); negativo é infísico (o MANTIDO do esg — não se gera -3 kWh).
  generated_kwh numeric(20,4) not null check (generated_kwh >= 0),
  -- ⭐ A unidade em TEXTO LIVRE — o tenant escolhe (kWh, MWh). Não vazia.
  unit          text          not null default 'kWh' check (length(btrim(unit)) > 0),
  -- A data de referência da leitura — o período. Obrigatória.
  reference_on  date          not null,
  note          text          not null default '',
  -- ⭐ Os carimbos do FATO — sempre do servidor, nunca do formulário.
  recorded_at   timestamptz   not null default now(),
  recorded_by   uuid          references auth.users (id) on delete set null,
  created_at    timestamptz   not null default now(),
  constraint genreading_readings_id_tenant unique (id, tenant_id)
);

create index genreading_readings_book_idx
  on genreading.readings (tenant_id, reference_on desc, created_at desc);
create index genreading_readings_by_plant_idx
  on genreading.readings (tenant_id, plant_id, reference_on desc);

alter table genreading.readings enable row level security;
alter table genreading.readings force row level security;

create policy genreading_readings_select on genreading.readings
  for select to authenticated
  using (genreading.can_access(tenant_id));

create policy genreading_readings_insert on genreading.readings
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'genreading.reading.record'));

-- ⛔ SEM policy de UPDATE e SEM policy de DELETE — a leitura é fato consumado.

-- -----------------------------------------------------------------------------
-- 2.1 O carimbo é do servidor — o que o cliente mandar de quem/quando é descartado
-- -----------------------------------------------------------------------------

create or replace function genreading.guard_reading_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.recorded_at := now();
  new.recorded_by := (select auth.uid());
  return new;
end;
$$;

create trigger genreading_readings_stamp
  before insert on genreading.readings
  for each row execute function genreading.guard_reading_insert();

-- -----------------------------------------------------------------------------
-- 2.2 ⭐⭐ IMUTÁVEL — nem o dono do banco reescreve a leitura registrada
-- -----------------------------------------------------------------------------

create or replace function genreading.guard_reading_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'a leitura de geração é fato consumado: não se edita nem se apaga. Corrigir é registrar outra, com nota.'
    using errcode = '42501';
end;
$$;

create trigger genreading_readings_immutable
  before update or delete on genreading.readings
  for each row execute function genreading.guard_reading_immutable();

-- =============================================================================
-- 3. OS FATOS — payload AUTOSSUFICIENTE (a usina pelo nome carimbado, id solto)
-- -----------------------------------------------------------------------------
-- ⛔ A nota TEXTO LIVRE NÃO passeia pelo correio (a cautela do esg/vis): o
-- envelope carrega a usina, a geração e o período, nunca o texto livre.
-- =============================================================================

create or replace function genreading.reading_payload(p genreading.readings)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'readingId',    p.id,
    'plantId',      p.plant_id,
    'plantName',    p.plant_name,
    'generatedKwh', p.generated_kwh,
    'unit',         p.unit,
    'referenceOn',  p.reference_on
  );
$$;

comment on function genreading.reading_payload(genreading.readings) is
  'O envelope de uma leitura de geração — AUTOSSUFICIENTE, com a usina pelo NOME carimbado (id solto). Sem a nota texto livre. Quem escuta não faz join.';

create or replace function genreading.on_reading_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform genreading.emit_event(new.tenant_id, 'genreading.reading.recorded', genreading.reading_payload(new));
  return new;
end;
$$;

create trigger genreading_readings_emit_recorded
  after insert on genreading.readings
  for each row execute function genreading.on_reading_recorded();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema genreading                  from public, anon, authenticated;
revoke all on all tables    in schema genreading from public, anon, authenticated;
revoke all on all functions in schema genreading from public, anon, authenticated;

grant usage on schema genreading to authenticated;

-- ⛔ SÓ SELECT e INSERT: reescrever/apagar não existe (a leitura é fato).
grant select, insert on genreading.readings to authenticated;

grant execute on function genreading.can_access(uuid) to authenticated;

-- `genreading.emit_event` NÃO é concedida. `genreading.reading_payload` é
-- encanamento do gatilho. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhuma coluna de status. Nenhuma allowed_transition. Nenhum
-- updated_at. Nenhum performance ratio / alerta (motor futuro, FORA). Nenhum
-- objeto fora de `genreading`. Nenhuma leitura de schema alheio (a usina por id
-- solto). `consumes` VAZIO.
-- =============================================================================
