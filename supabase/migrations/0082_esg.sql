-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0082_esg.sql
-- Módulo 67: Métricas Ambientais (ESG). Schema `esg`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §28, na
-- Onda Quinze (Fase 2 — ABRE o Domain ESG & Sustentabilidade), a primeira peça
-- de um território novo. Nasce sob `domain_key='esg'`. Próxima livre: 0083.
--
-- Taxonomia: Domain 🌱 ESG & Sustentabilidade (§5) — capacidades *Inventário de
-- carbono*, *Gestão de resíduos*, *Consumo de água* e *Consumo de energia*.
-- Spec: docs/canon/MODULO-ESG-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ A DECISÃO DE CANON — UM MÓDULO, NÃO QUATRO (a disciplina da Onda Quatorze)
-- -----------------------------------------------------------------------------
-- O Domain ESG tem 6 capacidades. Investigadas uma a uma, com a mesma régua
-- anti-duplicação da Onda Quatorze ("outra empresa usaria isso exatamente
-- assim?"), a fila honesta é:
--
--   · *Indicadores ESG*   → JÁ É o `goal` (Domain BI, Módulo 23), uma meta com
--                            categoria "ESG". Zero módulo novo. DECLARADO FORA.
--   · *Relatórios ESG*    → JÁ É o `pol` (Módulo 37), documento versionado que
--                            publica e CONGELA — um relatório é exatamente isso.
--                            Zero módulo novo. DECLARADO FORA.
--   · *Inventário de carbono* ┐
--   · *Gestão de resíduos*    │  na FÍSICA, A MESMA COISA: uma leitura
--   · *Consumo de água*       │  periódica de uma métrica ambiental —
--   · *Consumo de energia*    ┘  QUANTIDADE + UNIDADE + PERÍODO.
--
-- Construir 4 schemas quase idênticos seria a DUPLICAÇÃO que a Lei do
-- Reaproveitamento proíbe — dentro da própria onda. A resposta correta é UM
-- módulo só: `esg.readings`, com o TIPO da métrica num CHECK
-- (`carbon`/`water`/`energy`/`waste` — as quatro dimensões clássicas de
-- rastreamento ESG/GHG Protocol). É FÍSICA DO MÉTODO, não vocabulário de casa:
-- uma pegada só existe nessas dimensões, e o produto não procura a palavra
-- "carbono" — um tenant em espanhol registra `carbon`/`water`/`energy`/`waste`
-- igual. Não é `create type ... enum` (que seria vocabulário fechado do
-- produto): é um CHECK sobre as quatro dimensões do método, como o
-- `corrective`/`preventive` do `capa` e o `0..10` do `nps`.
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ O QUE ESTE MÓDULO É — O LIVRO DE LEITURAS AMBIENTAIS, ATO IMUTÁVEL
-- -----------------------------------------------------------------------------
-- Cada leitura é um FATO CONSUMADO: mediu-se tanto de uma métrica, num período,
-- e o registro nasce pronto — para sempre. É a MESMA física do `pcost` (o livro
-- de custos), do `timesheet` (o livro de horas) e do `recv`/`occ`/`sec` (o ato
-- pontual imutável): NÃO TEM coluna de status, não tem ciclo de vida, não tem
-- transição. Não existe "leitura aberta" nem "leitura em andamento" — a medição
-- ACONTECE e vira linha. Corrigir é registrar OUTRA leitura (com nota), nunca
-- reescrever.
--
-- ⭐ Consequência direta: `esg.readings` **NÃO TEM `allowed_transition`** e
-- **NÃO TEM `updated_at`** (não há o que tocar num fato que não muda). O cliente
-- não tem NENHUMA porta de UPDATE nem DELETE (nem policy, nem grant); e mesmo
-- assim o gatilho da §2.2 recusa a reescrita até para o dono do banco — a mesma
-- física do `pcost`/`recv`/`occ`, a lição paga da Onda Dez desde o instante 1.
--
-- -----------------------------------------------------------------------------
-- ⭐ A RÉGUA DA QUANTIDADE — quantity >= 0 (o DIVERGE consciente do pcost e do
--    timesheet, assinado)
-- -----------------------------------------------------------------------------
-- Copiar sem pensar e divergir sem escrever são o mesmo erro (CLAUDE.md). A
-- pergunta foi feita contra os dois vizinhos imutáveis:
--   · O `pcost` (Módulo 57) mede DINHEIRO: `amount_cents <> 0`, sinal LIVRE —
--     um estorno é uma linha negativa REAL (o dinheiro voltou).
--   · O `timesheet` (Módulo 61) mede HORAS: `hours > 0` estrito — zero é linha
--     muda, negativo não é trabalho.
--   · O `esg` mede uma GRANDEZA FÍSICA AMBIENTAL: `quantity >= 0`. Zero é uma
--     leitura REAL e reportável (zero resíduo ao aterro no mês é a própria meta
--     ESG — recusá-la mentiria sobre o período); negativo é INFÍSICO (não se
--     emite -3 tCO2e nem se consome -10 m³ de água). A compensação/crédito de
--     carbono é OUTRO conceito (capacidade *Créditos de compensação* do Domain
--     Energia, Taxonomia §5), não um número negativo aqui. Correção de uma
--     leitura errada é OUTRA leitura, com nota — o livro guarda as duas.
-- O teste do pacote lê as três migrations e assina o contraste
-- (dinheiro<>0 · horas>0 · grandeza física>=0).
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA o TIPO da métrica (CHECK das quatro dimensões); a QUANTIDADE
--      (>= 0); a UNIDADE em TEXTO LIVRE (o tenant escolhe: tCO2e, m³, kWh, kg —
--      cada setor mede diferente, e congelar "toneladas" numa coluna
--      envelheceria o produto, a lição do canal do `crm`); a DATA DE REFERÊNCIA
--      (`reference_on`, obrigatória — leitura sem período não se reporta); a
--      nota TEXTO LIVRE opcional; e uma FONTE opcional por ID SOLTO
--      (`source_id` + `source_name` carimbado pela tela — emissão por obra, por
--      unidade: vínculo genérico, sem FK, sem saber a que módulo aponta).
--   ❌ NÃO ENTRA cálculo de pegada por fórmula/fator de emissão (seria MOTOR DE
--      CÁLCULO — capacidade futura, declarada NÃO CONSTRUÍDA); certificação/
--      auditoria de terceira parte (é o `audit`, Módulo 64, por id solto se
--      quiser cruzar); indicador/meta ESG (é o `goal`); relatório ESG (é o
--      `pol`). `consumes` VAZIO.
--
-- 🔴 O `esg` NÃO LÊ nenhum outro schema: a fonte é referenciada por ID SOLTO,
-- SEM FK cruzada e SEM uma linha que toque schema alheio — a Lei do Lego. Não
-- há referência a schema alheio em lugar nenhum deste arquivo.
-- =============================================================================

create schema if not exists esg;

comment on schema esg is
  'Módulo Métricas Ambientais (ESG). Domain esg (ESG & Sustentabilidade) da Taxonomia. UM módulo para as quatro capacidades de medição (carbono/água/energia/resíduo), unificadas por metric_type num CHECK — na física são a mesma leitura periódica. Cada leitura é ATO IMUTÁVEL, sem ciclo de vida, sem status. quantity >= 0 (o DIVERGE do pcost<>0 e do timesheet>0). Indicadores ESG são o goal; Relatórios ESG são o pol (ambos DECLARADOS FORA). A fonte é referenciada por ID SOLTO (source_id) + source_name carimbado pela tela. Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — a única porta do módulo para o mundo. É lei.
-- =============================================================================

create or replace function esg.emit_event(
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
  if p_event_type not like 'esg.%' then
    raise exception 'esg.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'esg',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function esg.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function esg.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'esg.reading.record');
$$;

-- =============================================================================
-- 2. READINGS — ⭐⭐ A LEITURA: ATO IMUTÁVEL, SEM CICLO, SEM TRAVE
-- -----------------------------------------------------------------------------
-- NENHUMA coluna de status. NENHUMA função allowed_transition. NENHUM
-- updated_at. O registro nasce pronto — e nunca mais muda. O cliente não tem
-- NENHUMA porta de UPDATE nem DELETE (nem policy, nem grant); e mesmo assim o
-- gatilho da §2.2 recusa a reescrita até para o dono do banco — física do occ.
-- =============================================================================

create table esg.readings (
  id           uuid          primary key default gen_random_uuid(),
  tenant_id    uuid          not null references core.tenants (id) on delete cascade,
  -- ⭐ O TIPO da métrica — CHECK das quatro dimensões clássicas do método
  -- (ESG/GHG Protocol). NÃO é enum do produto: é a física do rastreamento. Um
  -- módulo, quatro capacidades — a decisão de canon do cabeçalho.
  metric_type  text          not null
                 check (metric_type in ('carbon', 'water', 'energy', 'waste')),
  -- ⭐ A quantidade medida. quantity >= 0: zero é leitura real (zero resíduo é
  -- reportável); negativo é infísico (o DIVERGE do pcost<>0 e do timesheet>0).
  quantity     numeric(20,4) not null check (quantity >= 0),
  -- ⭐ A unidade em TEXTO LIVRE — o tenant escolhe (tCO2e, m³, kWh, kg). Não
  -- vazia. Congelar "toneladas" numa coluna envelheceria o produto.
  unit         text          not null check (length(btrim(unit)) > 0),
  -- A data de referência da leitura — o período. Obrigatória: leitura sem
  -- período não se reporta.
  reference_on date          not null,
  -- ⭐ A FONTE por ID SOLTO, OPCIONAL — emissão por obra, por unidade. Vínculo
  -- genérico: sem FK, sem saber a que módulo aponta (Lei do Lego).
  source_id    uuid,
  -- O nome da fonte carimbado pela TELA — sobrevive ao redesenho do cadastro.
  source_name  text          not null default '',
  note         text          not null default '',
  -- ⭐ Os carimbos do FATO — sempre do servidor, nunca do formulário.
  recorded_at  timestamptz   not null default now(),
  recorded_by  uuid          references auth.users (id) on delete set null,
  created_at   timestamptz   not null default now(),
  constraint esg_readings_id_tenant unique (id, tenant_id)
);

create index esg_readings_book_idx
  on esg.readings (tenant_id, reference_on desc, created_at desc);
create index esg_readings_by_metric_idx
  on esg.readings (tenant_id, metric_type, reference_on desc);

alter table esg.readings enable row level security;
alter table esg.readings force row level security;

create policy esg_readings_select on esg.readings
  for select to authenticated
  using (esg.can_access(tenant_id));

create policy esg_readings_insert on esg.readings
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'esg.reading.record'));

-- ⛔ SEM policy de UPDATE e SEM policy de DELETE — a leitura é fato consumado;
-- não existe porta para reescrevê-la.

-- -----------------------------------------------------------------------------
-- 2.1 O carimbo é do servidor — o que o cliente mandar de quem/quando é descartado
-- -----------------------------------------------------------------------------

create or replace function esg.guard_reading_insert()
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

create trigger esg_readings_stamp
  before insert on esg.readings
  for each row execute function esg.guard_reading_insert();

-- -----------------------------------------------------------------------------
-- 2.2 ⭐⭐ IMUTÁVEL — nem o dono do banco reescreve a leitura registrada
-- -----------------------------------------------------------------------------

create or replace function esg.guard_reading_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'a leitura ambiental é fato consumado: não se edita nem se apaga. Corrigir é registrar outra, com nota.'
    using errcode = '42501';
end;
$$;

create trigger esg_readings_immutable
  before update or delete on esg.readings
  for each row execute function esg.guard_reading_immutable();

-- =============================================================================
-- 3. OS FATOS — payload AUTOSSUFICIENTE (a fonte pelo nome carimbado, id solto)
-- -----------------------------------------------------------------------------
-- ⛔ A nota TEXTO LIVRE NÃO passeia pelo correio (a cautela do vis/comm): o
-- envelope carrega a métrica, a grandeza e o período, nunca o texto livre.
-- =============================================================================

create or replace function esg.reading_payload(p esg.readings)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'readingId',   p.id,
    'metricType',  p.metric_type,
    'quantity',    p.quantity,
    'unit',        p.unit,
    'referenceOn', p.reference_on,
    'sourceId',    p.source_id,
    'sourceName',  p.source_name
  );
$$;

comment on function esg.reading_payload(esg.readings) is
  'O envelope de uma leitura — AUTOSSUFICIENTE, com a fonte pelo NOME carimbado (id solto). Sem a nota texto livre. Quem escuta não faz join.';

create or replace function esg.on_reading_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform esg.emit_event(new.tenant_id, 'esg.reading.recorded', esg.reading_payload(new));
  return new;
end;
$$;

create trigger esg_readings_emit_recorded
  after insert on esg.readings
  for each row execute function esg.on_reading_recorded();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- Função nasce ABERTA a PUBLIC no PostgreSQL — o revoke abaixo apaga isso, e o
-- grant logo em seguida concede só o que é do cliente.
-- =============================================================================

revoke all on schema esg                  from public, anon, authenticated;
revoke all on all tables    in schema esg from public, anon, authenticated;
revoke all on all functions in schema esg from public, anon, authenticated;

grant usage on schema esg to authenticated;

-- ⛔ SÓ SELECT e INSERT: reescrever/apagar não existe (a leitura é fato).
grant select, insert on esg.readings to authenticated;

grant execute on function esg.can_access(uuid) to authenticated;

-- `esg.emit_event` NÃO é concedida: ninguém emite evento à mão.
-- `esg.reading_payload` é encanamento do gatilho. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhuma coluna de status. Nenhuma allowed_transition. Nenhum
-- updated_at. Nenhum cálculo de pegada/fator de emissão (motor futuro, FORA).
-- Nenhum indicador (é o goal) nem relatório (é o pol). Nenhum objeto fora de
-- `esg`. Nenhuma leitura de schema alheio (a fonte por id solto). `consumes`
-- VAZIO (Lei 7).
-- =============================================================================
