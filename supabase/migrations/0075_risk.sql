-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0075_risk.sql
-- Módulo 60: Riscos do projeto. Schema `risk`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §26, na
-- Onda Treze (Fase 2 — FECHA o Domain PMO & Projetos, o MAIOR do mapa: com esta
-- onda o PMO tem as 10 capacidades). Nasce sob `domain_key='pmo'`.
--
-- Taxonomia: Domain 📋 PMO & Projetos — capacidade *Riscos* (§5).
-- Spec: docs/canon/MODULO-RISK-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ A RÉGUA 1–5 É FÍSICA DO MÉTODO — CHECK argumentado
-- -----------------------------------------------------------------------------
-- Probabilidade e impacto são a régua 1–5 clássica da gestão de riscos. Não é
-- vocabulário de casa (que seria texto livre): é a ESCALA do método, e por isso
-- mora numa CHECK constraint, como a nota 0–100 do `vperf` e a régua 0–10 do
-- `nps`. Fora de 1..5 (ou fracionário) não é "outro jeito de medir risco" — é
-- dado inválido, e o banco recusa.
--
-- A SEVERIDADE (probabilidade × impacto) NÃO é coluna: é leitura. Ordenar por
-- severidade é `orderRisks()` no pacote; congelar o produto numa coluna faria o
-- banco carregar uma decisão que é só apresentação.
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ A FÍSICA NOVA DO CICLO — mitigated REABRE, closed é TERMINAL
-- -----------------------------------------------------------------------------
-- Copiar sem pensar e divergir sem escrever são o mesmo erro (CLAUDE.md). O
-- risco nasce `open`, pode virar `mitigated`, e termina em `closed`. Aqui está o
-- estado que nenhum módulo anterior teve: `mitigated` VAI E VOLTA — um risco
-- mitigado REABRE (`mitigated → open`) quando a mitigação para de funcionar,
-- porque é o MESMO risco, não um novo. Mas `closed` é TERMINAL: um risco que
-- passou está encerrado, e um risco que recorre é registro NOVO.
--
-- É o DIVERGE assinado do `scrum`/`proj`, cujos estados não-iniciais são TODOS
-- terminais (o sprint fechado não reabre; o projeto concluído/cancelado não
-- reabre). O `lifecycle.test.ts` lê o `0068` (o módulo Projetos) e assina o
-- contraste: lá nenhum fim reabre; aqui `mitigated` reabre e só `closed` é terminal.
--
-- ⭐ Ao REABRIR (`mitigated → open`), o carimbo de mitigação é LIMPO — a
-- mitigação deixou de valer, e mentir que ela continua em vigor seria pior do
-- que não ter carimbo (a lição do `care`/`scrum`, que limpam o carimbo ao
-- reabrir).
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA descrição em TEXTO LIVRE (o que é um "risco" é de cada casa),
--      probabilidade/impacto na régua 1–5 e o plano de mitigação (texto,
--      opcional). Vínculo ao projeto por ID SOLTO + nome carimbado.
--   ❌ NÃO ENTRA matriz/heatmap de risco (leitura, camada de apresentação),
--      pontuação automática / IA, simulação de Monte Carlo, categoria de risco
--      congelada em enum.
-- =============================================================================

create schema if not exists risk;

comment on schema risk is
  'Módulo Riscos do projeto. Domain pmo (PMO & Projetos) da Taxonomia. O risco nasce open, pode virar mitigated e termina em closed. FÍSICA NOVA: mitigated REABRE (mitigated → open, o mesmo risco), closed é TERMINAL (o DIVERGE do scrum/proj). Probabilidade e impacto na régua 1–5 (CHECK argumentado). Severidade é leitura, não coluna. Vínculo ao proj por id solto. Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA
-- =============================================================================

create or replace function risk.emit_event(
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
  if p_event_type not like 'risk.%' then
    raise exception 'risk.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'risk',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function risk.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function risk.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'risk.entry.manage');
$$;

create or replace function risk.touch_updated_at()
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
-- 2. ENTRIES — o registro de riscos
-- =============================================================================

create table risk.entries (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references core.tenants (id) on delete cascade,
  -- ⭐ O projeto por ID SOLTO — o risk não conhece o schema do módulo Projetos.
  project_id      uuid        not null,
  project_name    text        not null default '',
  -- ⭐ Descrição em TEXTO LIVRE, obrigatória: risco sem descrição não é risco.
  description     text        not null check (length(btrim(description)) > 0),
  -- ⭐ A régua 1–5: física do método (precedente vperf 0–100, nps 0–10).
  probability     int         not null check (probability between 1 and 5),
  impact          int         not null check (impact between 1 and 5),
  -- Plano de mitigação: OPCIONAL (texto).
  mitigation_plan text        not null default '',
  status          text        not null default 'open'
                  check (status in ('open', 'mitigated', 'closed')),
  mitigated_at    timestamptz,
  mitigated_by    uuid        references auth.users (id) on delete set null,
  closed_at       timestamptz,
  closed_by       uuid        references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  created_by      uuid        references auth.users (id) on delete set null,
  updated_at      timestamptz not null default now(),
  constraint risk_entries_id_tenant unique (id, tenant_id),
  -- ⭐⭐ mitigated ⇔ tem carimbo de mitigação. Ao REABRIR, o gatilho LIMPA o
  -- carimbo, então open volta a não ter carimbo — coerente com esta regra.
  constraint risk_entries_mitigate_coherent check (
    (status = 'mitigated' and mitigated_at is not null)
    or
    (status <> 'mitigated' and mitigated_at is null)
  ),
  -- ⭐ closed ⇔ tem carimbo de fechamento.
  constraint risk_entries_close_coherent check (
    (status = 'closed' and closed_at is not null)
    or
    (status <> 'closed' and closed_at is null)
  )
);

create index risk_entries_open_idx
  on risk.entries (tenant_id, created_at desc)
  where status in ('open', 'mitigated');

create index risk_entries_project_idx
  on risk.entries (tenant_id, project_id);

create trigger risk_entries_touch
  before update on risk.entries
  for each row execute function risk.touch_updated_at();

alter table risk.entries enable row level security;
alter table risk.entries force row level security;

create policy risk_entries_select on risk.entries
  for select to authenticated
  using (risk.can_access(tenant_id));

create policy risk_entries_insert on risk.entries
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'risk.entry.manage'));

create policy risk_entries_update on risk.entries
  for update to authenticated
  using (risk.can_access(tenant_id))
  with check (risk.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Um registro de riscos se MANTÉM: risco
-- encerrado é história do projeto.

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre OPEN, o autor carimbado pelo servidor
-- -----------------------------------------------------------------------------

create or replace function risk.guard_entry_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'open' then
    raise exception 'o risco nasce aberto — mitigar, reabrir e encerrar são decisões à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger risk_entries_stamp
  before insert on risk.entries
  for each row execute function risk.guard_entry_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/risk
-- -----------------------------------------------------------------------------
-- ⭐⭐ open→mitigated (mitigar), open→closed (encerrar sem mitigar),
-- mitigated→closed (encerrar mitigado), e o DIVERGE: mitigated→open (REABRIR — o
-- mesmo risco volta). `closed` é TERMINAL: o que recorre é risco novo.

create or replace function risk.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('open',       'mitigated'),
    ('open',       'closed'),
    ('mitigated',  'closed'),
    ('mitigated',  'open')
  );
$$;

comment on function risk.allowed_transition(text, text) is
  'Ciclo de vida do risco. Espelho de ALLOWED_TRANSITIONS em @alsham/risk — há teste que lê este arquivo e compara. FÍSICA NOVA: mitigated REABRE (mitigated → open, o mesmo risco), closed é TERMINAL (o DIVERGE assinado do scrum/proj, cujos fins não reabrem).';

create or replace function risk.guard_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not risk.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida do risco: o risco encerrado não reabre',
      old.status, new.status
      using errcode = '22023';
  end if;

  if not core.has_permission(new.tenant_id, 'risk.entry.manage') then
    raise exception 'mover o risco exige a permissão risk.entry.manage'
      using errcode = '42501';
  end if;

  -- Mitigar: carimba quem/quando pelo servidor.
  if new.status = 'mitigated' then
    new.mitigated_at := now();
    new.mitigated_by := (select auth.uid());
  end if;

  -- ⭐⭐ Reabrir (mitigated → open): LIMPA o carimbo de mitigação. A mitigação
  -- deixou de valer; mantê-lo mentiria que ela ainda está em vigor.
  if new.status = 'open' then
    new.mitigated_at := null;
    new.mitigated_by := null;
  end if;

  -- Encerrar: carimba o fechamento (sem razão obrigatória — um risco que passou
  -- só se fecha; o foco do módulo é a mecânica da REABERTURA).
  if new.status = 'closed' then
    new.closed_at := now();
    new.closed_by := (select auth.uid());
  end if;

  return new;
end;
$$;

create trigger risk_entries_guard_status
  before update of status on risk.entries
  for each row execute function risk.guard_status_transition();

-- ⭐ O conteúdo (descrição/régua/plano/projeto) CONGELA quando o risco encerra:
-- um risco fechado é história. Editar em open/mitigated é livre.
create or replace function risk.guard_content_frozen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'closed'
     and (new.description is distinct from old.description
          or new.probability is distinct from old.probability
          or new.impact is distinct from old.impact
          or new.mitigation_plan is distinct from old.mitigation_plan
          or new.project_id is distinct from old.project_id
          or new.project_name is distinct from old.project_name) then
    raise exception 'o risco já foi encerrado: descrição, régua, plano e projeto não mudam mais'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger risk_entries_content_frozen
  before update on risk.entries
  for each row execute function risk.guard_content_frozen();

-- =============================================================================
-- 3. PAYLOAD + EVENTOS
-- =============================================================================

create or replace function risk.entry_payload(p_entry_id uuid, p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_entry risk.entries;
begin
  select * into v_entry
    from risk.entries
   where id = p_entry_id and tenant_id = p_tenant_id;

  if not found then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'projectId',      v_entry.project_id,
    'projectName',    v_entry.project_name,
    'description',    v_entry.description,
    'probability',    v_entry.probability,
    'impact',         v_entry.impact,
    'mitigationPlan', v_entry.mitigation_plan,
    'status',         v_entry.status,
    'mitigatedAt',    v_entry.mitigated_at,
    'closedAt',       v_entry.closed_at
  );
end;
$$;

comment on function risk.entry_payload(uuid, uuid) is
  'Envelope AUTOSSUFICIENTE do risco. Quem escuta não faz join.';

create or replace function risk.on_entry_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform risk.emit_event(
    new.tenant_id,
    'risk.entry.registered',
    risk.entry_payload(new.id, new.tenant_id)
  );
  return new;
end;
$$;

create trigger risk_entries_emit_registered
  after insert on risk.entries
  for each row execute function risk.on_entry_registered();

create or replace function risk.on_entry_changed()
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
                when 'mitigated' then 'risk.entry.mitigated'
                -- ⭐⭐ new.status = 'open' aqui só ocorre na REABERTURA (o
                -- nascimento é INSERT, não UPDATE).
                when 'open'      then 'risk.entry.reopened'
                when 'closed'    then 'risk.entry.closed'
                else null
              end;
    if v_type is not null then
      perform risk.emit_event(new.tenant_id, v_type, risk.entry_payload(new.id, new.tenant_id));
    end if;
  end if;

  return new;
end;
$$;

create trigger risk_entries_emit_changed
  after update of status on risk.entries
  for each row execute function risk.on_entry_changed();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função —
-- função nasce ABERTA a PUBLIC, e o grant abaixo seria decoração sem isto.
-- =============================================================================

revoke all on schema risk                  from public, anon, authenticated;
revoke all on all tables    in schema risk from public, anon, authenticated;
revoke all on all functions in schema risk from public, anon, authenticated;

grant usage on schema risk to authenticated;

grant select, insert, update on risk.entries to authenticated;

grant execute on function risk.can_access(uuid) to authenticated;

-- `risk.emit_event` NÃO é concedida: ninguém emite evento à mão.
-- `risk.entry_payload` NÃO é concedida: é encanamento dos gatilhos.
-- `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum enum de tipo/categoria de risco. Nenhuma coluna de
-- severidade (é leitura). Nenhum nome de cliente. Nenhum objeto fora de `risk`.
-- Nenhuma leitura de schema alheio. `consumes` VAZIO.
-- =============================================================================
