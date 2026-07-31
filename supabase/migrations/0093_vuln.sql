-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0093_vuln.sql
-- Módulo 78: Gestão de Vulnerabilidades. Schema `vuln`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §32, o
-- quarto módulo da Onda Dezenove (Fase 3). Nasce sob `domain_key='infosec'`
-- (Segurança da Informação).
--
-- Taxonomia: Domain 🔐 Segurança da Informação — capacidade *Gestão de
-- vulnerabilidades* (§5).
-- Spec: docs/canon/MODULO-VULN-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ O RECORTE — a vulnerabilidade DO TENANT, não da plataforma
-- -----------------------------------------------------------------------------
-- Metade do Domain Segurança da Informação é a ALSHAM cuidando da PRÓPRIA infra
-- (IAM = o RBAC do Core; Cofre = o Vault da infra; SIEM/Backup = operação da
-- plataforma) — e por isso fica FORA (declarado na spec do domínio). O que sobra
-- de GENUÍNO pro TENANT gerenciar dentro do produto: as vulnerabilidades
-- encontradas nos SISTEMAS DELE, com severidade e status de remediação.
--
-- ⭐ A IDENTIDADE É A DO `nc`/`capa` — fato constatado + ação de remediação:
-- a vulnerabilidade é um DESVIO constatado (como a Não Conformidade), e fechar
-- exige a NOTA de remediação (quem corrigiu/verificou) — o `nc` não fecha sem
-- verificar, e este não fecha sem a evidência da correção.
--
-- ⭐ A SEVERIDADE 1–5 É CHECK ARGUMENTADO — física do método (precedente
-- `risk`/`vperf`/`nps`). Não é vocabulário de casa; é a escala do risco técnico.
--
-- ⭐⭐ AS DUAS RESPOSTAS TERMINAIS, e o DIVERGE assinado: `remediated` (corrigi-a)
-- e `accepted_risk` (decidi conviver com ela — o risco aceito, comum em
-- segurança quando o custo de corrigir supera o do risco). Ambas exigem a
-- justificativa escrita e são TERMINAIS. Uma vulnerabilidade que reaparece é
-- registro NOVO (a física do `nc`/`proj`).
--
-- ⛔ FORA: scanner automático/integração CVE (é integração/Engine); CVSS
-- calculado por fórmula (motor futuro — aqui a severidade é ato de gente).
-- Vínculo opcional ao `secincident` por id solto. `consumes` VAZIO.
-- =============================================================================

create schema if not exists vuln;

comment on schema vuln is
  'Módulo Gestão de Vulnerabilidades. Domain infosec da Taxonomia. A vulnerabilidade DOS SISTEMAS DO TENANT (IAM/Cofre/SIEM/Backup da plataforma ficam FORA). A identidade do nc/capa (fato constatado + remediação): severidade 1–5 CHECK, open → in_progress → remediated/accepted_risk (as duas respostas terminais, com justificativa). Vínculo opcional ao secincident por id solto. Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA
-- =============================================================================

create or replace function vuln.emit_event(
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
  if p_event_type not like 'vuln.%' then
    raise exception 'vuln.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'vuln',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function vuln.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function vuln.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'vuln.finding.manage');
$$;

create or replace function vuln.touch_updated_at()
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
-- 2. FINDINGS — o registro de vulnerabilidades
-- =============================================================================

create table vuln.findings (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid        not null references core.tenants (id) on delete cascade,
  title            text        not null check (length(btrim(title)) > 0),
  description      text        not null check (length(btrim(description)) > 0),
  affected_system  text        not null default '',
  -- ⭐ Severidade 1–5 CHECK (física do método).
  severity         int         not null check (severity between 1 and 5),
  remediation_plan text        not null default '',
  -- ⭐ Vínculo OPCIONAL ao incidente de segurança (id solto ao secincident).
  incident_id      uuid,
  status           text        not null default 'open'
                   check (status in ('open', 'in_progress', 'remediated', 'accepted_risk')),
  -- ⭐ A resposta escrita ao encerrar (nota de remediação OU justificativa do
  -- risco aceito). Obrigatória nos dois fins.
  resolution       text        not null default '',
  resolved_at      timestamptz,
  resolved_by      uuid        references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  created_by       uuid        references auth.users (id) on delete set null,
  updated_at       timestamptz not null default now(),
  constraint vuln_findings_id_tenant unique (id, tenant_id),
  -- ⭐ Encerrada (remediated/accepted_risk) ⇒ tem resposta e carimbo.
  constraint vuln_findings_closure_coherent check (
    (status in ('remediated', 'accepted_risk') and resolved_at is not null and length(btrim(resolution)) > 0)
    or (status in ('open', 'in_progress') and resolved_at is null)
  )
);

create index vuln_findings_open_idx
  on vuln.findings (tenant_id, severity desc, created_at desc)
  where status in ('open', 'in_progress');

create trigger vuln_findings_touch
  before update on vuln.findings
  for each row execute function vuln.touch_updated_at();

alter table vuln.findings enable row level security;
alter table vuln.findings force row level security;

create policy vuln_findings_select on vuln.findings
  for select to authenticated
  using (vuln.can_access(tenant_id));

create policy vuln_findings_insert on vuln.findings
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'vuln.finding.manage'));

create policy vuln_findings_update on vuln.findings
  for update to authenticated
  using (vuln.can_access(tenant_id))
  with check (vuln.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Registro de vulnerabilidade é história.

create or replace function vuln.guard_finding_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'open' then
    raise exception 'a vulnerabilidade nasce aberta — tratar e encerrar são decisões à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger vuln_findings_stamp
  before insert on vuln.findings
  for each row execute function vuln.guard_finding_insert();

-- ⭐ open→in_progress, in_progress→open (reavaliar), open→accepted_risk,
-- in_progress→remediated, in_progress→accepted_risk. Terminais: remediated,
-- accepted_risk (a vulnerabilidade que reaparece é registro novo).
create or replace function vuln.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('open',        'in_progress'),
    ('in_progress', 'open'),
    ('open',        'accepted_risk'),
    ('in_progress', 'remediated'),
    ('in_progress', 'accepted_risk')
  );
$$;

comment on function vuln.allowed_transition(text, text) is
  'Ciclo de vida da vulnerabilidade. Espelho de ALLOWED_TRANSITIONS em @alsham/vuln. remediated E accepted_risk são TERMINAIS (as duas respostas, com justificativa). in_progress volta a open (reavaliar).';

create or replace function vuln.guard_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not vuln.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo da vulnerabilidade: a que reaparece é registro novo',
      old.status, new.status
      using errcode = '22023';
  end if;

  if not core.has_permission(new.tenant_id, 'vuln.finding.manage') then
    raise exception 'mover a vulnerabilidade exige a permissão vuln.finding.manage'
      using errcode = '42501';
  end if;

  if new.status in ('remediated', 'accepted_risk') then
    if length(btrim(new.resolution)) = 0 then
      raise exception 'encerrar a vulnerabilidade exige a resposta escrita (remediação ou justificativa do risco aceito)'
        using errcode = '22023';
    end if;
    new.resolved_at := now();
    new.resolved_by := (select auth.uid());
  end if;

  -- Reabrir para in_progress→open limpa o carimbo (nunca chegou a fim).
  if new.status in ('open', 'in_progress') then
    new.resolved_at := null;
    new.resolved_by := null;
  end if;

  return new;
end;
$$;

create trigger vuln_findings_guard_status
  before update of status on vuln.findings
  for each row execute function vuln.guard_status_transition();

-- ⭐ O conteúdo CONGELA nos fins.
create or replace function vuln.guard_content_frozen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status in ('remediated', 'accepted_risk')
     and (new.title is distinct from old.title
          or new.description is distinct from old.description
          or new.affected_system is distinct from old.affected_system
          or new.severity is distinct from old.severity
          or new.remediation_plan is distinct from old.remediation_plan
          or new.incident_id is distinct from old.incident_id
          or new.resolution is distinct from old.resolution) then
    raise exception 'a vulnerabilidade já foi encerrada: nada nela muda mais'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger vuln_findings_content_frozen
  before update on vuln.findings
  for each row execute function vuln.guard_content_frozen();

-- =============================================================================
-- 3. PAYLOAD + EVENTOS
-- =============================================================================

create or replace function vuln.finding_payload(p_finding_id uuid, p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_f vuln.findings;
begin
  select * into v_f from vuln.findings where id = p_finding_id and tenant_id = p_tenant_id;
  if not found then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'findingId',      v_f.id,
    'title',          v_f.title,
    'affectedSystem', v_f.affected_system,
    'severity',       v_f.severity,
    'incidentId',     v_f.incident_id,
    'status',         v_f.status,
    'resolvedAt',     v_f.resolved_at
  );
end;
$$;

comment on function vuln.finding_payload(uuid, uuid) is
  'Envelope AUTOSSUFICIENTE da vulnerabilidade. Quem escuta não faz join.';

create or replace function vuln.on_finding_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform vuln.emit_event(new.tenant_id, 'vuln.finding.registered', vuln.finding_payload(new.id, new.tenant_id));
  return new;
end;
$$;

create trigger vuln_findings_emit_registered
  after insert on vuln.findings
  for each row execute function vuln.on_finding_registered();

create or replace function vuln.on_finding_changed()
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
                when 'in_progress'   then 'vuln.finding.progressed'
                when 'remediated'    then 'vuln.finding.remediated'
                when 'accepted_risk' then 'vuln.finding.accepted'
                when 'open'          then 'vuln.finding.reopened'
                else null
              end;
    if v_type is not null then
      perform vuln.emit_event(new.tenant_id, v_type, vuln.finding_payload(new.id, new.tenant_id));
    end if;
  end if;
  return new;
end;
$$;

create trigger vuln_findings_emit_changed
  after update of status on vuln.findings
  for each row execute function vuln.on_finding_changed();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema vuln                  from public, anon, authenticated;
revoke all on all tables    in schema vuln from public, anon, authenticated;
revoke all on all functions in schema vuln from public, anon, authenticated;

grant usage on schema vuln to authenticated;

grant select, insert, update on vuln.findings to authenticated;

grant execute on function vuln.can_access(uuid) to authenticated;

-- `vuln.emit_event` e `vuln.finding_payload` NÃO são concedidas. `anon` nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Severidade CHECK (não enum de casa). Duas respostas
-- terminais com justificativa. Nenhum objeto fora de `vuln`. Nenhuma leitura de
-- schema alheio (incidente por id solto). `consumes` VAZIO.
-- =============================================================================
